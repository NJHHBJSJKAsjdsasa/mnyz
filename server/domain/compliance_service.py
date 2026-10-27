"""Relationship fees, fines, seizures and the compliance fund (01 §5.3, 02 §12.5).

``bribe_enabled`` is false by default: the endpoint rejects any bribe until a
council motion turns it on. When on, the bribe is capped at ``2 × base_fee`` and
an audit can convert it into a fine that goes to the compliance fund.
"""

from __future__ import annotations

from decimal import Decimal

from ..infra.errors import Forbidden, InvalidArgument, NotFound, Unprocessable
from ..repo import banks as bank_repo
from ..repo import currency as currency_repo
from . import currency_service
from .currency_service import Move, q4

MAX_BRIBE_MULTIPLE = Decimal(2)
MIN_AUDIT = 0.03
MAX_AUDIT = 0.85
SEIZE_APPROVALS = 2


def bribe_enabled(conn) -> bool:
    policy = currency_repo.active_policy(conn)
    return bool(policy and policy["bribe_enabled"])


def pay_bribe(
    conn,
    *,
    actor: dict,
    officer_actor_id: str,
    currency_code: str,
    bribe_amount: Decimal,
    base_fee_q1: Decimal,
    audited: bool = False,
    suspicious_flags: int = 0,
    idem_key: str | None = None,
) -> dict:
    if not bribe_enabled(conn):
        raise Forbidden("关系费当前关闭（bribe_enabled=false）")
    officer = bank_repo.officer(conn, currency_service.as_uuid(officer_actor_id))
    if officer is None or officer["status"] != "active":
        raise Unprocessable("柜员不可受理关系费")

    currency = currency_repo.currency(conn, currency_code)
    if currency is None:
        raise InvalidArgument("未知货币")
    base_fee_q1 = q4(base_fee_q1)
    bribe_q1 = q4(bribe_amount * Decimal(currency["base_value"]))
    if bribe_q1 <= 0:
        raise InvalidArgument("关系费必须大于 0")
    if bribe_q1 > MAX_BRIBE_MULTIPLE * base_fee_q1:
        raise InvalidArgument("关系费不得超过基础手续费的 2 倍")

    audit_probability = min(MAX_AUDIT, MIN_AUDIT + suspicious_flags * 0.05)
    value = q4(bribe_amount)
    tx = currency_service.post(
        conn,
        kind="bribe",
        moves=[
            Move(actor["id"], currency_code, -value),
            Move(officer_actor_id, currency_code, value),
        ],
        ref_type="bank_officer",
        ref_id=officer_actor_id,
        idem_key=idem_key,
        memo=f"relationship fee, base_fee_q1={base_fee_q1}",
    )
    event = bank_repo.insert_bribe(
        conn,
        player_actor_id=actor["id"],
        officer_actor_id=officer_actor_id,
        currency_code=currency_code,
        amount_src=value,
        base_fee_q1=base_fee_q1,
        bribe_q1=bribe_q1,
        audit_probability=audit_probability,
        status="audited" if audited else "accepted",
    )
    return {
        "id": str(event["id"]),
        "status": event["status"],
        "bribe_q1": str(bribe_q1),
        "audit_probability": audit_probability,
        "tx_id": tx["tx_id"],
    }


def fine(
    conn,
    *,
    actor_id: str,
    currency_code: str,
    amount: Decimal,
    ref_type: str = "bribe",
    ref_id: str | None = None,
    idem_key: str | None = None,
) -> dict:
    """Player fine -> compliance fund. Never drives the player negative."""
    value = q4(amount)
    if value <= 0:
        raise InvalidArgument("罚款金额必须大于 0")
    pot = bank_repo.compliance_fund(conn, currency_code, for_update=True)
    fund_actor = currency_service.system_actor(conn, "compliance_fund")
    tx = currency_service.post(
        conn,
        kind="fine",
        moves=[
            Move(actor_id, currency_code, -value),
            Move(fund_actor["id"], currency_code, value),
        ],
        ref_type=ref_type,
        ref_id=ref_id,
        idem_key=idem_key,
        memo="compliance fine",
    )
    balance = bank_repo.adjust_compliance_fund(conn, str(pot["id"]), value)
    bank_repo.insert_compliance_entry(
        conn, fund_id=str(pot["id"]), kind="fine", amount=value, ref_type=ref_type, ref_id=ref_id
    )
    return {"fund_balance": str(balance), "amount": str(value), "tx_id": tx["tx_id"]}


def seize_officer(
    conn,
    *,
    officer_actor_id: str,
    approvals: list[str],
    idem_key: str | None = None,
) -> dict:
    """Freeze an officer, move their balance to the compliance fund.

    Two distinct approvers are required (02 §12.5 双人复核).
    """
    approvers = {str(x) for x in approvals if x}
    if len(approvers) < SEIZE_APPROVALS:
        raise Forbidden("冻结/追缴需要两名复核人")
    officer_key = currency_service.as_uuid(officer_actor_id)
    officer = bank_repo.officer(conn, officer_key, for_update=True)
    if officer is None:
        raise NotFound("柜员不存在")
    if officer["status"] == "dismissed":
        raise Unprocessable("该柜员已被移除")

    accounts = currency_repo.balances(conn, officer_key)
    pot = bank_repo.compliance_fund(conn, "cc1", for_update=True)
    fund_actor = currency_service.system_actor(conn, "compliance_fund")
    moved: list[dict] = []
    for row in accounts:
        amount = Decimal(row["balance"])
        if amount <= 0:
            continue
        currency_repo.freeze_balance(conn, officer_key, row["currency_code"])
        tx = currency_service.post(
            conn,
            kind="seize",
            moves=[
                Move(officer_key, row["currency_code"], -amount),
                Move(fund_actor["id"], row["currency_code"], amount),
            ],
            ref_type="bank_officer",
            ref_id=officer_key,
            idem_key=f"{idem_key}:{row['currency_code']}" if idem_key else None,
            memo=f"seize {len(approvers)} approvals",
        )
        if row["currency_code"] == "cc1":
            bank_repo.adjust_compliance_fund(conn, str(pot["id"]), amount)
        bank_repo.insert_compliance_entry(
            conn, fund_id=str(pot["id"]), kind="recovery", amount=amount,
            ref_type="bank_officer", ref_id=officer_key,
        )
        moved.append({"currency_code": row["currency_code"], "amount": str(amount), "tx_id": tx["tx_id"]})

    bank_repo.set_officer_status(conn, str(officer["id"]), "dismissed")
    currency_repo.set_actor_status(conn, officer_key, "closed")
    conn.execute(
        "UPDATE bribe_events SET frozen_at = now() WHERE officer_actor_id = %s AND frozen_at IS NULL",
        (officer_key,),
    )
    return {"officer_actor_id": officer_key, "moved": moved, "approvals": sorted(approvers)}


def fund_balance(conn, currency_code: str = "cc1") -> dict:
    pot = bank_repo.compliance_fund(conn, currency_code)
    entries = conn.execute(
        """
        SELECT kind, COALESCE(SUM(amount), 0) AS total
          FROM compliance_fund_entries WHERE fund_id = %s GROUP BY kind
        """,
        (str(pot["id"]),),
    ).fetchall()
    return {
        "currency_code": currency_code,
        "balance": str(Decimal(pot["balance"])),
        "by_kind": {row["kind"]: str(Decimal(row["total"])) for row in entries},
    }

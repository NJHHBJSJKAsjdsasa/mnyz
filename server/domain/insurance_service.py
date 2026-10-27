"""Deposit insurance fund and claims (02 §5.3, §12.3).

The fund is a shared pot with two seats for the central bank and two for CCMC;
a payout needs three of the four. Per-actor cover is capped at 10,000 Q1
equivalent, so the cap must be converted into the claim's currency first.
"""

from __future__ import annotations

from decimal import Decimal

from ..infra.errors import Forbidden, InvalidArgument, NotFound, Unprocessable
from ..repo import banks as bank_repo
from ..repo import currency as currency_repo
from . import currency_service
from .currency_service import Move, q4

SEATS = ("cb:1", "cb:2", "ccmc:1", "ccmc:2")
REQUIRED_APPROVALS = 3


def fund(conn, currency_code: str = "cc1") -> dict:
    row = bank_repo.insurance_fund(conn, currency_code)
    return {
        "currency_code": row["currency_code"],
        "balance": str(Decimal(row["balance"])),
        "per_actor_cap_q1_equiv": str(Decimal(row["per_actor_cap_q1_equiv"])),
    }


def collect_premium(
    conn, *, bank_id: str, currency_code: str, amount: Decimal, idem_key: str | None = None
) -> dict:
    """Bank pays a premium into the fund (10-30bp/year of insured deposits)."""
    bank = bank_repo.by_id(conn, currency_service.as_uuid(bank_id))
    if bank is None:
        raise NotFound("银行不存在")
    value = q4(amount)
    if value <= 0:
        raise InvalidArgument("保费必须大于 0")

    pot = bank_repo.insurance_fund(conn, currency_code, for_update=True)
    fund_actor = currency_service.system_actor(conn, "insurance_fund")
    tx = currency_service.post(
        conn,
        kind="insurance_premium",
        moves=[
            Move(str(bank["actor_id"]), currency_code, -value),
            Move(fund_actor["id"], currency_code, value),
        ],
        ref_type="bank",
        ref_id=str(bank["id"]),
        idem_key=idem_key,
        memo="deposit insurance premium",
    )
    balance = bank_repo.adjust_insurance_fund(conn, str(pot["id"]), value)
    return {
        "fund_balance": str(balance),
        "paid": str(value),
        "tx_id": tx["tx_id"],
    }


def file_claim(
    conn, *, actor: dict, bank_id: str, currency_code: str, amount: Decimal
) -> dict:
    bank = bank_repo.by_id(conn, currency_service.as_uuid(bank_id))
    if bank is None:
        raise NotFound("银行不存在")
    value = q4(amount)
    if value <= 0:
        raise InvalidArgument("理赔金额必须大于 0")

    currency = currency_repo.currency(conn, currency_code)
    if currency is None:
        raise InvalidArgument("未知货币")
    base_value = Decimal(currency["base_value"])
    pot = bank_repo.insurance_fund(conn, currency_code, for_update=True)
    cap_q1 = Decimal(pot["per_actor_cap_q1_equiv"])
    cap_in_currency = q4(cap_q1 / base_value)
    covered = min(value, cap_in_currency)

    outstanding = conn.execute(
        """
        SELECT COALESCE(SUM(cap_applied), 0) AS total FROM deposit_insurance_claims
         WHERE actor_id = %s AND fund_id = %s AND status IN ('pending','approved','paid')
        """,
        (actor["id"], str(pot["id"])),
    ).fetchone()
    remaining = max(cap_in_currency - Decimal(outstanding["total"]), Decimal(0))
    if remaining <= 0:
        raise Unprocessable("该账户的存款保险额度已用尽")
    covered = min(covered, remaining)

    claim = bank_repo.insert_claim(
        conn,
        fund_id=str(pot["id"]),
        bank_id=str(bank["id"]),
        actor_id=actor["id"],
        claim_amount=value,
        cap_applied=covered,
    )
    return {
        "id": str(claim["id"]),
        "claim_amount": str(value),
        "cap_applied": str(covered),
        "cap_q1_equiv": str(cap_q1),
        "status": claim["status"],
    }


def decide(conn, *, claim_id: str, approver: str, approve: bool = True) -> dict:
    if approver not in SEATS:
        raise Forbidden("只有央行/CCMC 四席可以裁决理赔")
    claim = bank_repo.claim(conn, currency_service.as_uuid(claim_id), for_update=True)
    if claim is None:
        raise NotFound("理赔申请不存在")
    if claim["status"] not in ("pending", "approved"):
        raise Unprocessable("该理赔已结案")

    approvals = [str(x) for x in (claim["approvals"] or [])]
    if not approve:
        updated = bank_repo.update_claim(conn, str(claim["id"]), approvals=approvals, status="rejected")
        return {"id": str(claim["id"]), "status": updated["status"], "approvals": approvals}

    if approver not in approvals:
        approvals.append(approver)
    status = "approved" if len(approvals) >= REQUIRED_APPROVALS else "pending"
    updated = bank_repo.update_claim(conn, str(claim["id"]), approvals=approvals, status=status)
    return {
        "id": str(claim["id"]),
        "status": updated["status"],
        "approvals": approvals,
        "required": REQUIRED_APPROVALS,
    }


def pay(conn, *, claim_id: str, idem_key: str | None = None) -> dict:
    claim = bank_repo.claim(conn, currency_service.as_uuid(claim_id), for_update=True)
    if claim is None:
        raise NotFound("理赔申请不存在")
    if claim["status"] != "approved":
        raise Unprocessable("理赔尚未获得 3/4 批准")
    amount = Decimal(claim["cap_applied"])
    if amount <= 0:
        raise Unprocessable("赔付金额为 0")

    pot_row = conn.execute(
        "SELECT currency_code FROM deposit_insurance_fund WHERE id = %s", (str(claim["fund_id"]),)
    ).fetchone()
    code = pot_row["currency_code"]
    pot = bank_repo.insurance_fund(conn, code, for_update=True)
    fund_actor = currency_service.system_actor(conn, "insurance_fund")
    tx = currency_service.post(
        conn,
        kind="insurance_payout",
        moves=[
            Move(fund_actor["id"], code, -amount),
            Move(str(claim["actor_id"]), code, amount),
        ],
        ref_type="insurance_claim",
        ref_id=str(claim["id"]),
        idem_key=idem_key,
        memo="deposit insurance payout",
    )
    balance = bank_repo.adjust_insurance_fund(conn, str(pot["id"]), -amount)
    if balance is None:
        raise Unprocessable("存款保险基金不足，需央行临时流动性并追认")
    bank_repo.update_claim(conn, str(claim["id"]), approvals=[str(x) for x in claim["approvals"]], status="paid")
    return {
        "id": str(claim["id"]),
        "paid": str(amount),
        "fund_balance": str(balance),
        "status": "paid",
        "tx_id": tx["tx_id"],
    }

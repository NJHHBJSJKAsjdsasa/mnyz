"""Investor protection fund: claims, review and payouts (T-23, 05 §11).

The fund is not a new account — it is ``insurance_fund``, which already receives
20 % of every stock fee through the 0119 revenue split. What was missing was a
way to *spend* it.

Same backstop shape as deposit insurance (02 §8): a small-investor cap, an
operator decision recorded in ``audit_log``, and money that only ever moves one
way — from the fund to the claimant.

Deliberate limits:

* file-time validation rejects nonsense (amount ≤ 0, unknown kind, a second open
  claim) but not "you probably deserve nothing" — that is the reviewer's call;
* paying is capped, approving is not: a 500 000 claim is recorded in full and paid
  up to ``MAX_PAYOUT``, so the case stays auditable and the fund stays solvent;
* an empty fund is not an error. The claim becomes ``partial`` with whatever was
  left (possibly 0) and the shortfall is visible in ``claim.claimed - paid``.
"""

from __future__ import annotations

from decimal import Decimal

from ..infra.context import request_id
from ..infra.errors import AlreadyClaimed, Forbidden, InvalidArgument, NotFound, Unprocessable
from ..infra.serialize import ts
from ..repo import audit as audit_repo
from ..repo import currency as currency_repo
from . import currency_service
from .currency_service import Move, q4

KINDS = ("firm_default", "settlement_failure", "fraud")

#: Per-claim ceiling, in the claim currency (cc4). Same order of magnitude as the
#: deposit-insurance cap: enough to matter to one investor, not enough to matter
#: to the fund.
MAX_PAYOUT = Decimal("10000")

#: Filing ceiling — a claim above this is almost certainly a bookkeeping error
#: rather than a protected loss.
MAX_CLAIM = Decimal("1000000")

DEFAULT_CURRENCY = "cc4"


def fund(conn) -> dict:
    actor = currency_service.system_actor(conn, "insurance_fund")
    rows = currency_repo.balances(conn, str(actor["id"]))
    balances = {
        row["currency_code"]: str(Decimal(row["balance"]))
        for row in rows
    }
    return {
        "actor_id": str(actor["id"]),
        "balances": balances,
        "payout_cap": str(q4(MAX_PAYOUT)),
        "currency_code": DEFAULT_CURRENCY,
    }


def summary(conn) -> dict:
    row = conn.execute(
        """
        SELECT COUNT(*) FILTER (WHERE status = 'pending') AS pending,
               COUNT(*) FILTER (WHERE status IN ('approved','partial')) AS decided,
               COALESCE(SUM(paid_amount), 0) AS paid
          FROM investor_protection_claims
        """
    ).fetchone()
    return {
        "pending": int(row["pending"]),
        "decided": int(row["decided"]),
        "paid_total": str(q4(Decimal(row["paid"]))),
    }


def file_claim(
    conn,
    *,
    actor_id: str,
    kind: str,
    amount: Decimal,
    reason: str,
    currency_code: str = DEFAULT_CURRENCY,
    ref_type: str | None = None,
    ref_id: str | None = None,
) -> dict:
    if kind not in KINDS:
        raise InvalidArgument(f"未知理赔类型：{kind}（可选 {', '.join(KINDS)}）")
    value = q4(amount)
    if value <= 0:
        raise InvalidArgument("理赔金额必须大于 0")
    if value > MAX_CLAIM:
        raise InvalidArgument(f"理赔金额不能超过 {MAX_CLAIM}")
    if not (reason or "").strip():
        raise InvalidArgument("理赔必须写明理由")
    if open_claim(conn, actor_id) is not None:
        raise AlreadyClaimed("已有一笔待审核的理赔申请")

    row = conn.execute(
        """
        INSERT INTO investor_protection_claims
               (claimant_actor_id, kind, currency_code, claimed_amount, reason, ref_type, ref_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING id, claimant_actor_id, kind, currency_code, claimed_amount, paid_amount,
                  status, reason, ref_type, ref_id, reviewed_by, review_note, tx_id,
                  created_at, decided_at
        """,
        (actor_id, kind, currency_code, value, reason.strip(), ref_type, ref_id),
    ).fetchone()
    return _payload(row)


def decide(
    conn,
    *,
    claim_id: str,
    approve: bool,
    reviewer: str,
    note: str = "",
) -> dict:
    claim = claim_row(conn, claim_id, for_update=True)
    if claim is None:
        raise NotFound("理赔申请不存在")
    if claim["status"] != "pending":
        raise Unprocessable(f"该申请已是 {claim['status']} 状态")

    if not approve:
        row = conn.execute(
            "UPDATE investor_protection_claims "
            "SET status = 'rejected', reviewed_by = %s, review_note = %s, decided_at = now() "
            "WHERE id = %s RETURNING id, status, claimed_amount, paid_amount, decided_at",
            (reviewer, note, claim_id),
        ).fetchone()
        audit_repo.write(
            conn,
            audit_repo.AuditEvent(
                action="protection.reject",
                actor=reviewer,
                target=claim_id,
                after={"note": note},
                request_id=request_id(),
            ),
        )
        return {**_payload(claim), "status": row["status"], "paid": "0.0000",
                "decided_at": ts(row["decided_at"])}

    code = str(claim["currency_code"])
    fund_actor = currency_service.system_actor(conn, "insurance_fund")
    fund_balance = _balance(conn, str(fund_actor["id"]), code)
    payout = min(q4(Decimal(claim["claimed_amount"])), MAX_PAYOUT, fund_balance)
    payout = max(payout, Decimal(0))

    tx_id = None
    status = "rejected"
    if payout > 0:
        tx = currency_service.post(
            conn,
            kind="investor_protection",
            moves=[
                Move(str(fund_actor["id"]), code, -payout),
                Move(str(claim["claimant_actor_id"]), code, payout),
            ],
            ref_type="investor_protection_claim",
            ref_id=claim_id,
            memo=f"{claim['kind']} compensation",
        )
        tx_id = tx["tx_id"]
        status = "approved" if payout >= q4(Decimal(claim["claimed_amount"])) else "partial"
    row = conn.execute(
        "UPDATE investor_protection_claims "
        "SET status = %s, paid_amount = %s, reviewed_by = %s, review_note = %s, "
        "    tx_id = %s, decided_at = now() "
        "WHERE id = %s "
        "RETURNING id, status, claimed_amount, paid_amount, decided_at",
        (status, payout, reviewer, note, tx_id, claim_id),
    ).fetchone()
    audit_repo.write(
        conn,
        audit_repo.AuditEvent(
            action="protection.pay",
            actor=reviewer,
            target=claim_id,
            after={"paid": str(payout), "status": status, "tx_id": tx_id, "note": note},
            request_id=request_id(),
        ),
    )
    return {
        **_payload(claim),
        "status": row["status"],
        "paid": str(q4(Decimal(row["paid_amount"]))),
        "tx_id": tx_id,
        "decided_at": ts(row["decided_at"]),
    }


def claims(
    conn,
    *,
    actor_id: str | None = None,
    status: str | None = None,
    limit: int = 50,
) -> dict:
    where: list[str] = []
    params: list = []
    if actor_id:
        where.append("c.claimant_actor_id = %s")
        params.append(actor_id)
    if status:
        where.append("c.status = %s")
        params.append(status)
    sql = (
        "SELECT c.id, c.claimant_actor_id, c.kind, c.currency_code, c.claimed_amount, "
        "       c.paid_amount, c.status, c.reason, c.ref_type, c.ref_id, c.reviewed_by, "
        "       c.review_note, c.tx_id, c.created_at, c.decided_at, a.code AS actor_code "
        "  FROM investor_protection_claims c "
        "  JOIN economic_actors a ON a.id = c.claimant_actor_id"
    )
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY c.created_at DESC LIMIT %s"
    params.append(max(1, min(limit, 200)))
    rows = conn.execute(sql, tuple(params)).fetchall()
    return {
        "claims": [
            {**_payload(row), "actor_code": row["actor_code"] or ""}
            for row in rows
        ]
    }


def open_claim(conn, actor_id: str) -> dict | None:
    return conn.execute(
        "SELECT id, status FROM investor_protection_claims "
        "WHERE claimant_actor_id = %s AND status = 'pending'",
        (actor_id,),
    ).fetchone()


def claim_row(conn, claim_id: str, for_update: bool = False) -> dict | None:
    sql = (
        "SELECT id, claimant_actor_id, kind, currency_code, claimed_amount, paid_amount, "
        "       status, reason, ref_type, ref_id, reviewed_by, review_note, tx_id, "
        "       created_at, decided_at "
        "FROM investor_protection_claims WHERE id = %s"
    )
    if for_update:
        sql += " FOR UPDATE"
    return conn.execute(sql, (claim_id,)).fetchone()


def require_actor(conn, player_actor: dict | None) -> str:
    if player_actor is None:
        raise Forbidden("需要经济主体才能申请理赔")
    return str(player_actor["id"])


# ----------------------------------------------------------------- internals


def _balance(conn, actor_id: str, code: str) -> Decimal:
    row = currency_repo.account(conn, actor_id, code)
    return Decimal(row["balance"]) if row else Decimal(0)


def _payload(row: dict) -> dict:
    return {
        "claim_id": str(row["id"]),
        "claimant_actor_id": str(row["claimant_actor_id"]),
        "kind": row["kind"],
        "currency_code": row["currency_code"],
        "claimed_amount": str(q4(Decimal(row["claimed_amount"]))),
        "paid_amount": str(q4(Decimal(row["paid_amount"]))),
        "status": row["status"],
        "reason": row["reason"],
        "ref_type": row["ref_type"],
        "ref_id": row["ref_id"],
        "reviewed_by": row["reviewed_by"],
        "review_note": row["review_note"],
        "tx_id": str(row["tx_id"]) if row["tx_id"] else None,
        "created_at": ts(row["created_at"]),
        "decided_at": ts(row["decided_at"]),
    }

"""Commercial licences: apply → CCMC review → active (03 §3).

The table and the read endpoint already existed; what was missing is the two
verbs that make the licence mean something. Design choices worth stating:

* **Applying is free and idempotent.** A pending application is returned as-is
  instead of creating a second row — the table's ``UNIQUE(actor_id, kind,
  status)`` would reject it anyway, and a 409 on a double-clicked button is bad
  UX. Real money moves only when the reviewer approves.
* **The reviewer charges the first month.** Approval debits
  ``monthly_fee`` in the licence's own currency into treasury, then again every
  ``TERM_DAYS`` via ``renew_due`` (T-15b). A licence that cannot pay is suspended
  rather than revoked: the holder keeps the record and can top up to restore it
  (TASK-BACKLOG T-15b).
* **Capital requirements are checked, not held.** 03 §3 asks for "Q5 资本金" —
  this implementation treats it as a balance floor at approval time rather than
  escrowing it, because a frozen deposit would break the bank module's own
  reserve maths.

The fee table is a starting point (03 only fixes the currency tier, not the
amount); every number lives in ``LICENCES`` so balancing is a one-line change.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from ..infra.clock import now
from ..infra.serialize import ts
from ..infra.errors import AlreadyClaimed, InsufficientFunds, InvalidArgument, NotFound, Unprocessable
from ..repo import companies as company_repo
from ..repo import currency as currency_repo
from . import currency_service
from .currency_service import Move, q4

#: The fee is *monthly*, so the paid-through date is 30 days, not a year: before
#: T-15b the licence charged one month and granted 365 days, which made the
#: renewal job meaningless.
TERM_DAYS = 30

#: kind → (currency, monthly fee, minimum free balance at approval).
LICENCES: dict[str, dict] = {
    "cross_region_trade": {"currency": "cc3", "monthly_fee": Decimal("200"), "min_capital": Decimal("0")},
    "property_broker": {"currency": "cc4", "monthly_fee": Decimal("100"), "min_capital": Decimal("0")},
    "port": {"currency": "cc5", "monthly_fee": Decimal("800"), "min_capital": Decimal("5000")},
    "securities_firm": {"currency": "cc5", "monthly_fee": Decimal("500"), "min_capital": Decimal("20000")},
    "bank": {"currency": "cc5", "monthly_fee": Decimal("500"), "min_capital": Decimal("50000")},
    "exchange": {"currency": "cc6", "monthly_fee": Decimal("2000"), "min_capital": Decimal("50000")},
}


def apply(conn, actor: dict, kind: str) -> dict:
    spec = _spec(kind)
    actor_id = str(actor["id"])

    active = company_repo.active_license(conn, actor_id, kind)
    if active is not None:
        raise AlreadyClaimed(f"已持有 {kind} 许可")

    pending = company_repo.pending_license(conn, actor_id, kind)
    if pending is not None:
        return {**_payload(pending), "reused": True}

    row = company_repo.issue_license(
        conn,
        actor_id=actor_id,
        kind=kind,
        fee_currency=spec["currency"],
        monthly_fee=spec["monthly_fee"],
        reviewed_by="",
        expires_at=None,
        status="pending",
    )
    return {**_payload(row), "reused": False}


def decide(conn, *, license_id: str, approve: bool, reviewer: str, note: str = "") -> dict:
    row = company_repo.license_by_id(conn, license_id)
    if row is None:
        raise NotFound("许可申请不存在")
    if row["status"] != "pending":
        raise AlreadyClaimed(f"该申请已是 {row['status']} 状态")

    if not approve:
        decided = company_repo.decide_license(
            conn, license_id, status="revoked", reviewed_by=reviewer, expires_at=None
        )
        return {**_payload(decided), "charged": "0", "note": note}

    spec = _spec(row["kind"])
    actor_id = str(row["actor_id"])
    fee = Decimal(row["monthly_fee"])
    account = currency_repo.account(conn, actor_id, row["fee_currency"])
    balance = Decimal(account["balance"]) if account else Decimal(0)
    if balance < spec["min_capital"]:
        raise Unprocessable(
            f"{row['kind']} 许可要求 {row['fee_currency']} 余额 ≥ {spec['min_capital']}，当前 {balance}"
        )
    if balance < fee:
        raise InsufficientFunds(row["fee_currency"], float(fee))

    treasury = currency_service.system_actor(conn, currency_service.TREASURY)
    currency_service.post(
        conn,
        kind="licence_fee",
        moves=[
            Move(actor_id, row["fee_currency"], -fee),
            Move(treasury["id"], row["fee_currency"], fee),
        ],
        ref_type="commerce_license",
        ref_id=license_id,
        memo=f"{row['kind']} licence, first month",
    )

    decided = company_repo.decide_license(
        conn,
        license_id,
        status="active",
        reviewed_by=reviewer,
        expires_at=now() + timedelta(days=TERM_DAYS),
    )
    return {**_payload(decided), "charged": str(fee), "note": note}


def renew_due(conn) -> dict:
    """Charge the monthly fee for every licence whose term ended (03 §3).

    Insufficient balance suspends instead of revoking: revocation is a CCMC
    decision, and a player who is one sale away from the fee should not lose the
    licence over a timing miss.
    """
    renewed = suspended = 0
    charged = Decimal(0)
    treasury = currency_service.system_actor(conn, currency_service.TREASURY)
    for row in company_repo.due_licenses(conn):
        fee = Decimal(row["monthly_fee"])
        actor_id = str(row["actor_id"])
        if fee > 0:
            account = currency_repo.account(conn, actor_id, row["fee_currency"])
            balance = Decimal(account["balance"]) if account else Decimal(0)
            if balance < fee:
                company_repo.set_license_status(conn, str(row["id"]), "suspended")
                suspended += 1
                continue
            currency_service.post(
                conn,
                kind="licence_fee",
                moves=[
                    Move(actor_id, row["fee_currency"], -fee),
                    Move(treasury["id"], row["fee_currency"], fee),
                ],
                ref_type="commerce_license",
                ref_id=str(row["id"]),
                memo=f"{row['kind']} licence renewal",
            )
            charged += fee
        company_repo.extend_license(
            conn,
            str(row["id"]),
            expires_at=max(now(), row["expires_at"]) + timedelta(days=TERM_DAYS),
        )
        renewed += 1
    return {"renewed": renewed, "suspended": suspended, "charged": str(q4(charged))}


def pending(conn, limit: int = 100) -> dict:
    rows = company_repo.pending_licenses(conn, limit)
    return {
        "licenses": [
            {**_payload(row), "actor_id": str(row["actor_id"]), "reviewed_by": ""} for row in rows
        ]
    }


def catalogue() -> dict:
    return {
        "licences": [
            {
                "kind": kind,
                "currency": spec["currency"],
                "monthly_fee": str(spec["monthly_fee"]),
                "min_capital": str(spec["min_capital"]),
                "term_days": TERM_DAYS,
            }
            for kind, spec in LICENCES.items()
        ]
    }


# ----------------------------------------------------------------- internals


def _spec(kind: str) -> dict:
    spec = LICENCES.get(kind)
    if spec is None:
        raise InvalidArgument(f"未知许可类型：{kind}（可选 {', '.join(sorted(LICENCES))}）")
    return spec


def _payload(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "kind": row["kind"],
        "status": row["status"],
        "fee_currency": row["fee_currency"],
        "monthly_fee": str(row["monthly_fee"]),
        "reviewed_by": row.get("reviewed_by") or "",
        "expires_at": ts(row.get("expires_at")),
    }

"""Ledger reversals: the supported way to undo money (T-32, 12 §5).

01 §2 makes the ledger append-only, so "undo" can never mean editing or deleting
a row. It means posting the exact mirror of the original transaction, tagged with
``reversal_of``, and letting the pair speak for itself.

Design choices worth stating:

* **The mirror is computed from the entries, not re-derived from the business
  call.** Replaying ``stock_service.buy`` with a minus sign would re-run a dozen
  guards against a world that has since moved; negating the recorded deltas is
  both simpler and provably balanced.
* **Insufficient funds refuses the reversal.** If the recipient already spent
  the money there is nothing to claw back, and forcing a negative balance would
  corrupt the invariant the whole economy rests on. The operator gets a 409 and
  must top the account up first — that is the honest answer, not a silent
  write-off.
* **A transaction may be reversed exactly once**, enforced by a partial unique
  index. Redo is therefore "reverse the reversal", which is a normal operation:
  the second mirror restores the original effect.
* **State is derived, never stored.** ``currency_tx.reversal_of`` tells you the
  edges; the current effect of a transaction is the parity of its descendants
  (even → stands, odd → undone). A cached ``reversed`` boolean would drift the
  moment a redo happened.
* Every reversal is also written to ``audit_log``: the ledger explains *what*
  moved, the audit row explains *who* decided it.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from ..infra.context import request_id
from ..infra.errors import InvalidArgument, NotFound, Unprocessable
from ..infra.serialize import ts
from ..repo import audit as audit_repo
from ..repo import currency as currency_repo
from . import currency_service
from .currency_service import Move, q4

SYSTEM_ACTOR_CODES = {
    "treasury", "burn", "cb", "market", "bank_equity", "officer_pool",
    "insurance_fund", "compliance_fund", "escrow",
}


def reverse(conn, *, tx_id: str, reason: str, actor: str) -> dict:
    """Post the mirror of ``tx_id``; returns the reversal transaction."""
    reason = (reason or "").strip()
    if not reason:
        raise InvalidArgument("冲正必须写明原因")
    if len(reason) > 500:
        raise InvalidArgument("冲正原因不能超过 500 字")

    original = currency_repo.transaction(conn, tx_id, for_update=True)
    if original is None:
        raise NotFound("交易不存在")
    if currency_repo.reversal_child(conn, tx_id) is not None:
        raise Unprocessable("该交易已冲正；要恢复原效果，请冲正那条冲正分录")

    entries = currency_repo.entries_for(conn, tx_id)
    if not entries:
        raise Unprocessable("该交易没有分录，无法冲正")

    moves = [
        Move(str(entry["actor_id"]), entry["currency_code"], -Decimal(entry["delta"]))
        for entry in entries
    ]
    # Exchange transactions are balanced in Q1 equivalents, not per currency; the
    # mirror of one is balanced under exactly the same rule, so detect rather
    # than guess from ``kind``.
    per_currency: dict[str, Decimal] = {}
    for entry in entries:
        code = entry["currency_code"]
        per_currency[code] = per_currency.get(code, Decimal(0)) + Decimal(entry["delta"])
    balanced_in_q1 = any(abs(total) > currency_service.Q4 for total in per_currency.values())

    result = currency_service.post(
        conn,
        kind="reversal",
        moves=moves,
        ref_type="currency_ledger_transaction",
        ref_id=str(original["id"]),
        idem_key=f"reversal:{original['id']}",
        memo=f"冲正 {original['kind']}：{reason}",
        balanced_in_q1=balanced_in_q1,
        reversal_of=str(original["id"]),
        reversal_reason=reason,
    )

    payload = {
        "tx_id": result["tx_id"],
        "reversal_of": str(original["id"]),
        "original_kind": original["kind"],
        "replayed": bool(result.get("replayed")),
        "reason": reason,
        "entries": _entries(result["entries"]),
        # Reversing a reversal restores the transaction below it.
        "restores": str(original["reversal_of"]) if original["reversal_of"] else None,
    }
    audit_repo.write(
        conn,
        audit_repo.AuditEvent(
            action="ledger.reverse",
            actor=actor,
            target=str(original["id"]),
            after={
                "reversal_tx_id": result["tx_id"],
                "reason": reason,
                "restores": payload["restores"],
            },
            request_id=request_id(),
        ),
    )
    return payload


def detail(conn, tx_id: str) -> dict:
    row = currency_repo.transaction(conn, tx_id)
    if row is None:
        raise NotFound("交易不存在")
    entries = currency_repo.entries_for(conn, tx_id)
    child = currency_repo.reversal_child(conn, tx_id)
    ancestors = currency_repo.reversal_chain(conn, tx_id)
    depth = currency_repo.reversal_descendants(conn, tx_id)
    return {
        **_payload(row),
        "entries": _entries(entries),
        "reversal_tx_id": str(child["id"]) if child else None,
        "reversal_reason": row.get("reversal_reason") or "",
        "ancestors": [
            {
                "tx_id": str(item["id"]),
                "kind": item["kind"],
                "memo": item["memo"],
                "created_at": ts(item["created_at"]),
                "depth": int(item["depth"]),
            }
            for item in ancestors
        ],
        # Parity of the mirror chain: 0 = the posting still stands, 1 = undone,
        # 2 = undone then redone, and so on.
        "net_effect": "reverted" if depth % 2 else "applied",
        "chain_depth": depth,
    }


def recent(
    conn,
    *,
    kind: str | None = None,
    actor_id: str | None = None,
    ref_type: str | None = None,
    ref_id: str | None = None,
    since: datetime | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    rows = currency_repo.list_transactions(
        conn,
        kind=kind,
        actor_id=actor_id,
        ref_type=ref_type,
        ref_id=ref_id,
        since=since,
        limit=limit,
        offset=offset,
    )
    return {
        "transactions": [
            {
                "tx_id": str(row["id"]),
                "kind": row["kind"],
                "ref_type": row["ref_type"],
                "ref_id": row["ref_id"],
                "memo": row["memo"],
                "reversal_of": str(row["reversal_of"]) if row["reversal_of"] else None,
                "reversed_by": str(row["reversed_by"]) if row["reversed_by"] else None,
                "entry_count": int(row["entry_count"]),
                "created_at": ts(row["created_at"]),
            }
            for row in rows
        ],
        "limit": limit,
        "offset": offset,
    }


# ----------------------------------------------------------------- internals


def _entries(entries: list[dict]) -> list[dict]:
    return [
        {
            "actor_id": str(entry["actor_id"]),
            "actor_code": entry.get("actor_code") or "",
            "currency_code": entry["currency_code"],
            "delta": str(q4(Decimal(entry["delta"]))),
            "balance_after": str(q4(Decimal(entry["balance_after"]))),
            "system": (entry.get("actor_code") or "") in SYSTEM_ACTOR_CODES,
        }
        for entry in entries
    ]


def _payload(row: dict) -> dict:
    return {
        "tx_id": str(row["id"]),
        "kind": row["kind"],
        "ref_type": row["ref_type"],
        "ref_id": row["ref_id"],
        "memo": row["memo"],
        "reversal_of": str(row["reversal_of"]) if row["reversal_of"] else None,
        "created_at": ts(row["created_at"]),
    }

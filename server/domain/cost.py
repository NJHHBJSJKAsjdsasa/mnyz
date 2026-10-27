"""Charge a resource cost through the ledger (all sinks share this helper)."""

from __future__ import annotations

from .ledger import TxRef, post_transaction


def charge(conn, player_id: str, costs: dict, kind: str, ref_type: str, ref_id: str):
    deltas = {code: -int(amount) for code, amount in costs.items() if int(amount) > 0}
    if not deltas:
        return None
    return post_transaction(conn, player_id, deltas, TxRef(kind=kind, ref_type=ref_type, ref_id=ref_id))

"""Double-entry ledger: the only code allowed to move money.

Every transaction writes one player entry and one system entry per resource, so
``SUM(delta)`` over a transaction is always zero. Entries are immutable.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Mapping
from uuid import uuid4

from ..infra.errors import InsufficientFunds
from ..repo import ledger as ledger_repo
from ..repo import wallets as wallet_repo

SYSTEM_ACCOUNT_BY_KIND = {
    "collect": "loot",
    "scan": "loot",
    "scan_cost": "sink",
    "surface_sample": "loot",
    "sector_unlock": "sink",
    "ship_upgrade": "sink",
    "refit": "sink",
    "overclock": "sink",
    "hull_repair": "sink",
    "tech_unlock": "sink",
    "station_build": "sink",
    "station_module": "sink",
    "fleet_recruit": "sink",
    "station_claim": "loot",
    "fleet_claim": "loot",
    "planet_claim": "sink",
    "planet_build": "sink",
    "world_claim": "sink",
    "siege_declare": "sink",
    "wreck_salvage": "loot",
    "fleet_yield": "loot",
    "station_yield": "loot",
    "craft_out": "loot",
    "combat_loot": "loot",
    "planet_yield": "loot",
    "contract_reward": "quest",
    "task_reward": "quest",
    "codex_reward": "quest",
    "npc_trade": "market",
    "sector_apply": "sink",
    "sector_refund": "sink",
    "council_application": "sink",
    "trade_buy": "market",
    "trade_sell": "market",
    "siege_loot": "escrow",
    "migration": "migration",
    "correction": "sink",
}


@dataclass(frozen=True)
class TxRef:
    """Business reference for a transaction; ``idem_key`` dedupes retries."""

    kind: str
    ref_type: str | None = None
    ref_id: str | None = None
    idem_key: str | None = None


def system_account_for(kind: str) -> str:
    return SYSTEM_ACCOUNT_BY_KIND.get(kind, "sink")


def post_transaction(conn, player_id: str, deltas: Mapping[str, Decimal], ref: TxRef) -> dict:
    """Apply ``deltas`` to one player atomically. Caller must hold the player lock."""
    if ref.idem_key:
        existing = ledger_repo.find_transaction_by_idempotency(conn, ref.idem_key)
        if existing:
            return {
                "id": str(existing["id"]),
                "entries": ledger_repo.entries_for(conn, existing["id"]),
                "replayed": True,
            }

    tx_id = str(uuid4())
    ledger_repo.insert_transaction(
        conn,
        ledger_repo.NewTransaction(
            id=tx_id,
            player_id=player_id,
            kind=ref.kind,
            ref_type=ref.ref_type,
            ref_id=ref.ref_id,
            idem_key=ref.idem_key,
        ),
    )
    system_code = system_account_for(ref.kind)
    for code in sorted(deltas):
        delta = Decimal(deltas[code])
        if delta == 0:
            continue
        _apply_delta(conn, tx_id, player_id, system_code, code, delta)

    return {"id": tx_id, "entries": ledger_repo.entries_for(conn, tx_id), "replayed": False}


def _apply_delta(conn, tx_id: str, player_id: str, system_code: str, code: str, delta: Decimal) -> None:
    balance_after = wallet_repo.adjust(conn, player_id, code, delta)
    if balance_after is None:
        raise InsufficientFunds(code, float(-delta))
    ledger_repo.insert_entry(
        conn,
        ledger_repo.NewEntry(
            tx_id=tx_id,
            resource_code=code,
            delta=delta,
            balance_after=balance_after,
            wallet_id=player_id,
        ),
    )
    system_after = ledger_repo.system_balance(conn, system_code, code) - delta
    ledger_repo.insert_entry(
        conn,
        ledger_repo.NewEntry(
            tx_id=tx_id,
            resource_code=code,
            delta=-delta,
            balance_after=system_after,
            system_code=system_code,
        ),
    )


def balances_after(entries: list[dict], player_id: str) -> dict[str, Decimal]:
    """Convenience for API responses: resource → new player balance."""
    result: dict[str, Decimal] = {}
    for entry in entries:
        if str(entry.get("wallet_id") or "") == str(player_id):
            result[entry["resource_code"]] = Decimal(entry["balance_after"])
    return result

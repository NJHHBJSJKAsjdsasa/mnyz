"""Scan transaction: cooldown → fuel cost → deterministic yield → codex."""

from __future__ import annotations

from ..infra.clock import ms_until
from ..repo import codex as codex_repo
from ..repo import outbox as outbox_repo
from ..repo import players as player_repo
from ..repo import scans as scan_repo
from ..repo import sectors as sector_repo
from ..repo import ships as ship_repo
from ..repo import wallets as wallet_repo
from . import contract_service, cooldown, planet as planet_domain
from .ledger import TxRef, post_transaction
from .scan import roll_scan, scan_cooldown_seconds, scan_cost
from .sector import sector_of


def perform_scan(conn, player: dict, planet_key: str, config: dict) -> dict:
    planet = planet_domain.resolve_planet(conn, player, planet_key)
    modules = ship_repo.modules(conn, player["id"])
    array = modules.get("scanArray", {"level": 0, "overclock": 0})
    tech = ship_repo.tech_levels(conn, player["id"])
    cooldown_seconds = scan_cooldown_seconds(
        int(array["level"]),
        int(array["overclock"]),
        int(tech.get("survey", 0)),
        max(1, int(config.get("scan_cooldown_base_ms", 480000)) // 1000),
        max(1, int(config.get("scan_cooldown_floor_ms", 30000)) // 1000),
    )
    ready_at = cooldown.claim(conn, player["id"], f"scan:{planet_key.lower()}", cooldown_seconds)

    cost = scan_cost(int(array["level"]))
    cost_tx = post_transaction(
        conn,
        player["id"],
        {"deuterium": -cost},
        TxRef(kind="scan_cost", ref_type="planet", ref_id=planet_key.lower()),
    )
    scans = scan_repo.record(conn, player["id"], planet_key)
    licensed = sector_repo.is_unlocked(conn, player["id"], _sector_key(planet))
    outcome = roll_scan(planet_key, planet["planet_type"], scans, 1.2 if licensed else 1.0)

    yield_tx = None
    if outcome.yields:
        yield_tx = post_transaction(
            conn,
            player["id"],
            outcome.yields,
            TxRef(kind="scan", ref_type="planet", ref_id=planet_key.lower()),
        )
    _record_codex(conn, player["id"], planet_key, planet)
    metrics = ["scans", "relicScans"] if outcome.kind == "relic" else ["scans"]
    contract_service.advance(conn, player["id"], metrics)
    version = player_repo.bump_state(conn, player["id"])
    outbox_repo.add(
        conn,
        aggregate_type="player",
        aggregate_id=player["id"],
        event_type="planet.scanned",
        payload={"planet_key": planet_key, "kind": outcome.kind, "yield": outcome.yields},
    )
    balances = wallet_repo.balances(conn, player["id"])
    touched = {"deuterium", *outcome.yields}
    return {
        "kind": outcome.kind,
        "title": outcome.title,
        "detail": outcome.detail,
        "yield": outcome.yields,
        "cost": {"deuterium": cost},
        "cooldown": {"ready_in_ms": ms_until(ready_at)},
        "planet": planet_domain.public_payload(planet),
        "balances": {code: int(balances.get(code, 0)) for code in touched},
        "tx_id": (yield_tx or cost_tx)["id"],
        "scans": scans,
        "state_version": version,
    }


def _record_codex(conn, player_id: str, planet_key: str, planet: dict) -> None:
    codex_repo.add_many(conn, player_id, "planet", [planet_key.lower()])
    codex_repo.add_many(conn, player_id, "element", planet["elements"][:3])


def _sector_key(planet: dict) -> str:
    return sector_of(f"{planet['x']},{planet['y']},{planet['z']}")["key"]

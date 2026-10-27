"""Player planet modifications (M5.5): claim, build, deposits, materialize."""

from __future__ import annotations

from ..infra.errors import AlreadyClaimed, NotFound, Unprocessable
from ..repo import colony as colony_repo
from ..repo import outbox as outbox_repo
from ..repo import players as player_repo
from ..repo import reference as reference_repo
from ..repo import wallets as wallet_repo
from . import planet as planet_domain
from .cost import charge
from .ledger import TxRef, post_transaction

MAX_CLAIMS = 10
MAX_STRUCTURES = 6
CLAIM_COST = {"antimatter": 500}
DEPOSIT_RATE = 0.10


def view(conn, player: dict, planet_key: str) -> dict:
    planet = planet_domain.resolve_planet(conn, player, planet_key)
    claimed = colony_repo.claimed(conn, player["id"], planet_key)
    return {
        "planet": planet_domain.public_payload(planet),
        "colony": {
            "claimed": claimed,
            "claims_used": colony_repo.claim_count(conn, player["id"]),
            "structures": [
                {"code": row["structure_code"], "level": int(row["level"])}
                for row in colony_repo.structures(conn, player["id"], planet_key)
            ],
            "deposits": [
                {"resource_code": row["resource_code"], "amount": int(row["amount"])}
                for row in colony_repo.deposits(conn, player["id"], planet_key)
            ],
        },
    }


def claim(conn, player: dict, planet_key: str) -> dict:
    planet = planet_domain.resolve_planet(conn, player, planet_key)
    if colony_repo.claimed(conn, player["id"], planet_key):
        raise AlreadyClaimed("该行星已归属你")
    if colony_repo.claim_count(conn, player["id"]) >= MAX_CLAIMS:
        raise Unprocessable(f"最多改造 {MAX_CLAIMS} 颗行星")
    tx = charge(conn, player["id"], CLAIM_COST, "planet_claim", "planet", planet_key)
    if not colony_repo.claim(conn, player["id"], planet_key):
        raise AlreadyClaimed("该行星已归属你")
    colony_repo.audit(conn, player["id"], planet_key, "claim", None, {"name": planet["name"]})
    colony_repo.event(conn, planet_key, "planet.claimed", {"player_id": player["id"]})
    version = _finish(conn, player["id"], "planet.claimed", planet_key)
    return {
        "planet_key": planet_key,
        "cost": CLAIM_COST,
        "tx_id": tx["id"] if tx else None,
        "state_version": version,
    }


def build(conn, player: dict, planet_key: str, structure_code: str) -> dict:
    planet_domain.resolve_planet(conn, player, planet_key)
    if not colony_repo.claimed(conn, player["id"], planet_key):
        raise Unprocessable("请先改造该行星")
    definition = reference_repo.structure_definition(conn, structure_code, "planet")
    if definition is None:
        raise NotFound("行星建筑不存在")
    existing = {row["structure_code"]: int(row["level"]) for row in colony_repo.structures(conn, player["id"], planet_key)}
    if structure_code not in existing and len(existing) >= MAX_STRUCTURES:
        raise Unprocessable(f"每颗行星最多 {MAX_STRUCTURES} 种建筑")
    level = existing.get(structure_code, 0)
    if level >= int(definition["max_level"]):
        raise Unprocessable("建筑已达最高等级")
    cost = {
        code: max(1, int(float(amount) * (float(definition["cost_curve"].get("growth", 1.5)) ** level)))
        for code, amount in definition["cost_curve"].get("base", {}).items()
    }
    tx = charge(conn, player["id"], cost, "planet_build", "planet", f"{planet_key}:{structure_code}")
    colony_repo.upsert_structure(conn, player["id"], planet_key, structure_code, level + 1)
    colony_repo.audit(
        conn, player["id"], planet_key, "build", {"level": level}, {"structure": structure_code, "level": level + 1}
    )
    version = _finish(conn, player["id"], "planet.built", planet_key)
    return {
        "planet_key": planet_key,
        "structure_code": structure_code,
        "level": level + 1,
        "cost": cost,
        "tx_id": tx["id"] if tx else None,
        "state_version": version,
    }


def claim_deposits(conn, player: dict, planet_key: str) -> dict:
    planet_domain.resolve_planet(conn, player, planet_key)
    rows = colony_repo.deposits(conn, player["id"], planet_key)
    yield_map = {row["resource_code"]: int(row["amount"]) for row in rows if int(row["amount"]) > 0}
    if not yield_map:
        raise Unprocessable("没有可领取的沉积")
    tx = post_transaction(
        conn, player["id"], yield_map, TxRef("planet_yield", "planet", planet_key)
    )
    colony_repo.clear_deposits(conn, player["id"], planet_key)
    version = _finish(conn, player["id"], "planet.deposits", planet_key)
    balances = wallet_repo.balances(conn, player["id"])
    return {
        "yield": yield_map,
        "balances": {code: int(balances.get(code, 0)) for code in yield_map},
        "tx_id": tx["id"],
        "state_version": version,
    }


def add_collect_deposits(conn, player_id: str, planet_key: str, gains: dict) -> None:
    if not colony_repo.claimed(conn, player_id, planet_key):
        return
    for code, amount in gains.items():
        deposit = max(1, int(amount * DEPOSIT_RATE)) if amount > 0 else 0
        if deposit:
            colony_repo.add_deposit(conn, player_id, planet_key, code, deposit)


def _finish(conn, player_id: str, event_type: str, planet_key: str) -> int:
    version = player_repo.bump_state(conn, player_id)
    outbox_repo.add(
        conn,
        aggregate_type="player",
        aggregate_id=player_id,
        event_type=event_type,
        payload={"planet_key": planet_key},
    )
    return version

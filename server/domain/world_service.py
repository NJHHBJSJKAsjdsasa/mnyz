"""Shared planets and asynchronous sieges (M6.5)."""

from __future__ import annotations

from datetime import timedelta

from ..infra.clock import db_now, ms_until
from ..infra.errors import AlreadyClaimed, Cooldown, NotFound, Unprocessable
from ..repo import cutover as cutover_repo
from ..repo import outbox as outbox_repo
from ..repo import players as player_repo
from ..repo import ships as ship_repo
from ..repo import wallets as wallet_repo
from ..repo import world as world_repo
from . import planet as planet_domain
from .cost import charge
from .ledger import TxRef, post_transaction
from .rng import hash_text

CLAIM_COST = {"antimatter": 1000}
DECLARE_COST = {"antimatter": 2000}
SIEGE_TTL_HOURS = 12
DECLARE_COOLDOWN_HOURS = 72
LEVEL_PROTECTION = 5


def view(conn, player: dict, planet_key: str) -> dict:
    planet_domain.resolve_planet(conn, player, planet_key)
    row = world_repo.ensure(conn, planet_key)
    siege = world_repo.open_siege(conn, planet_key)
    owner_id = str(row["owner_player_id"]) if row["owner_player_id"] else None
    owner = player_repo.get(conn, owner_id) if owner_id else None
    return {
        "planet_key": planet_key,
        "owner_player_id": owner_id,
        "owner_name": owner["display_name"] if owner else None,
        "is_owner": owner_id == str(player["id"]),
        "shield_until": row["shield_until"],
        "defense_power": int(row["defense_power"]),
        "level": int(row["level"]),
        "siege": str(siege["id"]) if siege else None,
    }


def claim(conn, player: dict, planet_key: str) -> dict:
    planet_domain.resolve_planet(conn, player, planet_key)
    row = world_repo.ensure(conn, planet_key)
    if row["owner_player_id"]:
        raise AlreadyClaimed("该行星已有归属")
    tx = charge(conn, player["id"], CLAIM_COST, "world_claim", "planet", planet_key)
    if not world_repo.claim(conn, planet_key, player["id"], None):
        raise AlreadyClaimed("该行星已被抢走")
    world_repo.add_history(conn, planet_key, player["id"])
    version = _finish(conn, player["id"], "world.claimed", planet_key)
    return {
        "planet_key": planet_key,
        "cost": CLAIM_COST,
        "tx_id": tx["id"] if tx else None,
        "state_version": version,
    }


def declare(conn, player: dict, planet_key: str) -> dict:
    planet_domain.resolve_planet(conn, player, planet_key)
    row = world_repo.lock(conn, planet_key)
    if row is None or not row["owner_player_id"]:
        raise Unprocessable("该行星尚无人占领")
    if str(row["owner_player_id"]) == str(player["id"]):
        raise Unprocessable("不能对自己的行星宣战")
    if world_repo.open_siege(conn, planet_key):
        raise AlreadyClaimed("该行星已有进行中的攻城")
    if row["shield_until"] and row["shield_until"] > db_now(conn):
        raise Unprocessable("护盾期内无法宣战")

    ship = ship_repo.flagship(conn, player["id"])
    attacker_level = int(ship["level"]) if ship else 1
    if int(row["level"]) - attacker_level >= LEVEL_PROTECTION:
        raise Unprocessable("目标行星等级过高，受等级差保护")
    last = world_repo.last_declared(conn, player["id"], planet_key)
    if last:
        ready = last + timedelta(hours=DECLARE_COOLDOWN_HOURS)
        if ready > db_now(conn):
            raise Cooldown(ms_until(ready))

    power = _power(conn, player["id"])
    defender_power = int(row["defense_power"]) + 100
    seed = hash_text(f"{planet_key.lower()}|{player['id']}|siege")
    tx = charge(conn, player["id"], DECLARE_COST, "siege_declare", "planet", planet_key)
    siege = world_repo.create_siege(
        conn, planet_key, player["id"], str(row["owner_player_id"]), power, defender_power, seed
    )
    world_repo.add_participant(conn, str(siege["id"]), player["id"], power)
    version = _finish(conn, player["id"], "siege.declared", planet_key)
    return {
        "siege_id": str(siege["id"]),
        "planet_key": planet_key,
        "resolve_at": siege["resolve_at"],
        "cost": DECLARE_COST,
        "tx_id": tx["id"] if tx else None,
        "state_version": version,
    }


def detail(conn, player: dict, siege_id: str) -> dict:
    siege = world_repo.siege_detail(conn, siege_id)
    if siege is None:
        raise NotFound("攻城不存在")
    return {
        "id": str(siege["id"]),
        "planet_key": siege["planet_key"],
        "status": siege["status"],
        "outcome": siege["outcome"],
        "resolve_at": siege["resolve_at"],
        "attacker_power": int(siege["attacker_power"]),
        "defender_power": int(siege["defender_power"]),
        "participants": [
            {
                "player_id": str(row["player_id"]),
                "fleet_power": int(row["fleet_power"]),
                "joined_at": row["joined_at"],
            }
            for row in siege["participants"]
        ],
    }


def join(conn, player: dict, siege_id: str) -> dict:
    siege = world_repo.get_siege(conn, siege_id, for_update=True)
    if siege is None:
        raise NotFound("攻城不存在")
    if siege["status"] != "locked":
        raise Unprocessable("攻城已结束")
    if world_repo.has_participant(conn, siege_id, player["id"]):
        raise AlreadyClaimed("你已参与这场攻城")
    power = _power(conn, player["id"])
    total = world_repo.add_participant(conn, siege_id, player["id"], power)
    world_repo.update_attacker_power(conn, siege_id, int(siege["attacker_power"]) + power)
    version = _finish(conn, player["id"], "siege.joined", siege_id)
    return {"siege_id": siege_id, "participants_power": total, "state_version": version}


def resolve_due(conn) -> dict:
    resolved = 0
    for siege in world_repo.due_sieges(conn):
        attack = int(siege["attacker_power"])
        defense = max(1, int(siege["defender_power"]))
        won = attack / (attack + defense) > 0.5
        planet_key = siege["planet_key"]
        saga_id = str(siege["id"])
        if won:
            cutover_repo.start_step(conn, saga_id, "transfer_ownership")
            world_repo.transfer(conn, planet_key, str(siege["attacker_player_id"]), None)
            cutover_repo.finish_step(conn, saga_id, "transfer_ownership", True)
            cutover_repo.start_step(conn, saga_id, "escrow_loot")
            world_repo.add_escrow(
                conn, str(siege["id"]), str(siege["attacker_player_id"]), {"quantumAlloy": 50}
            )
            cutover_repo.finish_step(conn, saga_id, "escrow_loot", True)
        cutover_repo.start_step(conn, saga_id, "close_siege")
        world_repo.resolve(
            conn,
            saga_id,
            "attacker_won" if won else "defender_held",
            str(siege["attacker_player_id"]) if won else None,
            planet_key,
        )
        cutover_repo.finish_step(conn, saga_id, "close_siege", True)
        resolved += 1
    return {"resolved": resolved}


def claim_loot(conn, player: dict) -> dict:
    rows = world_repo.escrow_for_player(conn, player["id"])
    if not rows:
        raise Unprocessable("没有待领取的战利品")
    total: dict[str, int] = {}
    for row in rows:
        for code, amount in (row["payload"] or {}).items():
            total[code] = total.get(code, 0) + int(amount)
    tx = post_transaction(conn, player["id"], total, TxRef("siege_loot", "siege", str(rows[0]["siege_id"])))
    for row in rows:
        world_repo.release_escrow(conn, int(row["id"]))
    version = _finish(conn, player["id"], "siege.loot", "")
    balances = wallet_repo.balances(conn, player["id"])
    return {
        "yield": total,
        "balances": {code: int(balances.get(code, 0)) for code in total},
        "tx_id": tx["id"],
        "state_version": version,
    }


def _power(conn, player_id: str) -> int:
    ship = ship_repo.flagship(conn, player_id)
    level = int(ship["level"]) if ship else 1
    modules = ship_repo.modules(conn, player_id)
    weapon = int(modules.get("weaponArray", {"level": 0})["level"])
    fleets = world_repo.fleet_count(conn, player_id)
    return 100 + level * 10 + weapon * 20 + fleets * 50


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

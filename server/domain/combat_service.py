"""Deterministic PvE combat (M6) and wreck salvage."""

from __future__ import annotations

from ..infra.clock import db_now
from ..infra.errors import NotFound, Unprocessable
from ..repo import assets as asset_repo
from ..repo import combat as combat_repo
from ..repo import outbox as outbox_repo
from ..repo import players as player_repo
from ..repo import ships as ship_repo
from ..repo import wallets as wallet_repo
from . import cooldown, contract_service, faction_service, planet as planet_domain
from .ledger import TxRef, post_transaction
from .rng import SeededRandom, hash_text

SALVAGE_COOLDOWN_SECONDS = 300


def start(conn, player: dict, planet_key: str) -> dict:
    planet = planet_domain.resolve_planet(conn, player, planet_key)
    flags = ship_repo.flags(conn, player["id"]) or {"hull": 100}
    modules = ship_repo.modules(conn, player["id"])
    weapon = int(modules.get("weaponArray", {"level": 0})["level"])
    shield_level = int(modules.get("shieldMatrix", {"level": 0})["level"])
    hp = _round(40 + int(flags["hull"]) * 0.6)
    shield = 4 + 3 * shield_level
    seed = hash_text(f"{planet_key.lower()}|{player['id']}|combat")
    rng = SeededRandom(seed)
    scale = 0.6 + rng.next() * 0.6
    enemy_hp = max(20, _round(hp * scale))
    escorts = [
        {"name": row["name"], "hp": 30, "hp_max": 30, "shield": 0, "shield_max": 0, "firepower": 8}
        for row in asset_repo.fleet(conn, player["id"])
        if row["task"] == "idle"
    ][:2]
    session = combat_repo.create(
        conn,
        player["id"],
        planet_key,
        seed,
        {"hp": hp, "shield": shield},
        {"hp": enemy_hp, "shield": max(1, shield // 2)},
        escorts,
    )
    version = _finish(conn, player["id"], "combat.started", {"session_id": str(session["id"])})
    return {
        "session": _session_payload(session),
        "planet": planet_domain.public_payload(planet),
        "firepower": 6 + 4 * weapon,
        "state_version": version,
    }


def act(conn, player: dict, session_id: str, action: str) -> dict:
    if action not in {"fire", "shield", "evade", "flee"}:
        raise Unprocessable("动作必须是 fire/shield/evade/flee")
    session = combat_repo.get(conn, player["id"], session_id, for_update=True)
    if session is None:
        raise NotFound("战斗不存在")
    if session["status"] != "active":
        raise Unprocessable("战斗已结束")
    if session["expires_at"] <= db_now(conn):
        raise Unprocessable("战斗已超时")

    flags = ship_repo.flags(conn, player["id"]) or {"hull": 100}
    modules = ship_repo.modules(conn, player["id"])
    weapon = int(modules.get("weaponArray", {"level": 0})["level"])
    shield_level = int(modules.get("shieldMatrix", {"level": 0})["level"])
    firepower = 6 + 4 * weapon
    base_shield = 4 + 3 * shield_level
    rng = SeededRandom(int(session["seed"]) + int(session["turn_no"]) * 7919)

    state = {
        "status": "active",
        "turn_no": int(session["turn_no"]) + 1,
        "player_hp": int(session["player_hp"]),
        "player_shield": int(session["player_shield"]),
        "enemy_hp": int(session["enemy_hp"]),
        "enemy_shield": int(session["enemy_shield"]),
        "escorts": list(session.get("escorts") or []),
    }
    log = []
    damage = 0
    if action == "flee":
        state["status"] = "fled"
        log.append({"kind": "flee"})
    elif action == "shield":
        state["player_shield"] = base_shield
        log.append({"kind": "shield", "shield": base_shield})
    elif action == "fire":
        escort_power = sum(int(escort["firepower"]) for escort in state["escorts"] if int(escort["hp"]) > 0)
        damage = max(1, _round((firepower + escort_power) * (0.8 + rng.next() * 0.4)))
        absorbed = min(state["enemy_shield"], damage)
        state["enemy_shield"] -= absorbed
        state["enemy_hp"] = max(0, state["enemy_hp"] - (damage - absorbed))
        log.append({"kind": "fire", "damage": damage, "absorbed": absorbed, "escorts": bool(escort_power)})

    if state["status"] == "active" and state["enemy_hp"] > 0:
        mitigation = 0.5 if action == "evade" else 1.0
        if session.get("mode") == "challenge" and session.get("enemy_power"):
            enemy_power = int(session["enemy_power"])
        else:
            enemy_power = max(4, _round(6 + int(session["seed"]) % 17))
        raw = max(1, _round(enemy_power * (0.8 + rng.next() * 0.4) * mitigation))
        alive = [escort for escort in state["escorts"] if int(escort["hp"]) > 0]
        if alive and rng.next() < 0.35:
            target = alive[0]
            absorbed = min(int(target["shield"]), raw)
            target["shield"] = int(target["shield"]) - absorbed
            target["hp"] = max(0, int(target["hp"]) - (raw - absorbed))
            log.append({"kind": "escort_hit", "name": target["name"], "damage": raw, "absorbed": absorbed})
        else:
            absorbed = min(state["player_shield"], raw)
            state["player_shield"] -= absorbed
            state["player_hp"] = max(0, state["player_hp"] - (raw - absorbed))
            log.append({"kind": "enemy", "damage": raw, "absorbed": absorbed})

    if state["enemy_hp"] <= 0:
        state["status"] = "won"
    elif state["player_hp"] <= 0:
        state["status"] = "lost"

    combat_repo.save(conn, session_id, state)
    combat_repo.add_turn(conn, session_id, state["turn_no"], action, damage, log)
    loot = None
    if session.get("mode") != "challenge":
        if state["status"] == "won":
            loot = _loot(conn, player["id"], session_id, session["planet_key"])
            contract_service.advance(conn, player["id"], ["kills"])
            faction_service.record_kill(conn, player, session["planet_key"])
        elif state["status"] == "lost":
            ship_repo.set_hull(conn, player["id"], max(0, int(flags["hull"]) - 20))
            combat_repo.add_wreck(conn, player["id"], session["planet_key"], 1)
    version = _finish(conn, player["id"], "combat.turn", {"session_id": session_id, "status": state["status"]})
    state["loot"] = loot
    state["state_version"] = version
    state["log"] = log
    state["mode"] = session.get("mode", "pve")
    return state


def view(conn, player: dict, session_id: str) -> dict:
    session = combat_repo.get(conn, player["id"], session_id)
    if session is None:
        raise NotFound("战斗不存在")
    return _session_payload(session)


def active(conn, player: dict) -> list[dict]:
    return [_session_payload(row) for row in combat_repo.active(conn, player["id"])]


def wrecks(conn, player: dict) -> list[dict]:
    return [
        {"planet_key": row["planet_key"], "tier": int(row["tier"]), "created_at": row["created_at"]}
        for row in combat_repo.list_wrecks(conn, player["id"])
    ]


def salvage(conn, player: dict, planet_key: str) -> dict:
    ready = cooldown.claim(conn, player["id"], f"salvage:{planet_key.lower()}", SALVAGE_COOLDOWN_SECONDS)
    wreck = combat_repo.take_wreck(conn, player["id"], planet_key)
    if wreck is None:
        raise NotFound("该行星没有残骸")
    tier = int(wreck["tier"])
    gains = {"quantumAlloy": 3 * tier, "plasmaCell": 2 * tier, "exoticCrystal": tier}
    tx = post_transaction(
        conn, player["id"], gains, TxRef("wreck_salvage", "planet", planet_key.lower())
    )
    version = _finish(conn, player["id"], "wreck.salvaged", {"planet_key": planet_key})
    balances = wallet_repo.balances(conn, player["id"])
    return {
        "yield": gains,
        "cooldown": {"ready_in_ms": cooldown.ready_in_ms(ready)},
        "balances": {code: int(balances.get(code, 0)) for code in gains},
        "tx_id": tx["id"],
        "state_version": version,
    }


def _loot(conn, player_id: str, session_id: str, planet_key: str) -> dict:
    loot = {"quantumAlloy": 4, "plasmaCell": 2, "exoticCrystal": 1}
    tx = post_transaction(conn, player_id, loot, TxRef("combat_loot", "combat", session_id))
    combat_repo.add_loot(conn, session_id, player_id, tx["id"], loot)
    return loot


def _session_payload(session: dict) -> dict:
    return {
        "id": str(session["id"]),
        "planet_key": session["planet_key"],
        "mode": session.get("mode", "pve"),
        "status": session["status"],
        "turn_no": int(session["turn_no"]),
        "player_hp": int(session["player_hp"]),
        "player_shield": int(session["player_shield"]),
        "enemy_hp": int(session["enemy_hp"]),
        "enemy_shield": int(session["enemy_shield"]),
        "escorts": list(session.get("escorts") or []),
        "expires_at": session["expires_at"],
    }


def _round(value: float) -> int:
    return int(value + 0.5) if value >= 0 else -int(-value + 0.5)


def _finish(conn, player_id: str, event_type: str, payload: dict) -> int:
    version = player_repo.bump_state(conn, player_id)
    outbox_repo.add(
        conn,
        aggregate_type="player",
        aggregate_id=player_id,
        event_type=event_type,
        payload=payload,
    )
    return version

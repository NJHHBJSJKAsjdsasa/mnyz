"""Server-issued challenge codes and challenge combat sessions."""

from __future__ import annotations

import secrets

from ..infra.errors import NotFound, Unprocessable
from ..repo import challenges as challenge_repo
from ..repo import combat as combat_repo
from ..repo import outbox as outbox_repo
from ..repo import players as player_repo
from ..repo import ships as ship_repo
from . import combat_service as combat_domain
from .rng import hash_text


def create(conn, player: dict) -> dict:
    snapshot = _snapshot(conn, player)
    code = "ATL1-" + secrets.token_urlsafe(12)
    challenge_repo.create(conn, code, player["id"], snapshot)
    version = player_repo.bump_state(conn, player["id"])
    outbox_repo.add(
        conn,
        aggregate_type="player",
        aggregate_id=player["id"],
        event_type="challenge.created",
        payload={"code": code},
    )
    return {"code": code, "snapshot": snapshot, "state_version": version}


def info(conn, code: str) -> dict:
    row = challenge_repo.get(conn, code)
    if row is None:
        raise NotFound("挑战码不存在")
    if row["expires_at"] <= _now(conn):
        raise NotFound("挑战码已过期")
    return {
        "code": row["code"],
        "owner_player_id": str(row["owner_player_id"]),
        "snapshot": row["payload"],
        "uses": int(row["uses"]),
        "expires_at": row["expires_at"],
    }


def fight(conn, player: dict, code: str) -> dict:
    row = challenge_repo.get(conn, code)
    if row is None or row["expires_at"] <= _now(conn):
        raise NotFound("挑战码不存在或已过期")
    if not challenge_repo.use(conn, code):
        raise Unprocessable("挑战码已失效")
    snapshot = row["payload"]
    flags = ship_repo.flags(conn, player["id"]) or {"hull": 100}
    modules = ship_repo.modules(conn, player["id"])
    weapon = int(modules.get("weaponArray", {"level": 0})["level"])
    shield_level = int(modules.get("shieldMatrix", {"level": 0})["level"])
    hp = _round(40 + int(flags["hull"]) * 0.6)
    shield = 4 + 3 * shield_level
    enemy_hp = max(20, _round(40 + int(snapshot.get("hull", 100)) * 0.6))
    enemy_shield = 4 + 3 * int(snapshot.get("shield_level", 0))
    enemy_power = max(4, 6 + 4 * int(snapshot.get("weapon_level", 0)))
    session = combat_repo.create(
        conn,
        player["id"],
        f"challenge:{code}",
        hash_text(f"challenge|{code}|{player['id']}"),
        {"hp": hp, "shield": shield},
        {"hp": enemy_hp, "shield": enemy_shield},
        [],
        mode="challenge",
        challenge_code=code,
        enemy_power=enemy_power,
    )
    version = player_repo.bump_state(conn, player["id"])
    outbox_repo.add(
        conn,
        aggregate_type="player",
        aggregate_id=player["id"],
        event_type="challenge.started",
        payload={"code": code, "session_id": str(session["id"])},
    )
    return {
        "session": combat_domain._session_payload(session),
        "challenge": snapshot,
        "firepower": 6 + 4 * weapon,
        "state_version": version,
    }


def _snapshot(conn, player: dict) -> dict:
    ship = ship_repo.flagship(conn, player["id"])
    modules = ship_repo.modules(conn, player["id"])
    flags = ship_repo.flags(conn, player["id"]) or {"hull": 100}
    return {
        "name": player["display_name"][:12],
        "level": int(ship["level"]) if ship else 1,
        "hull": int(flags["hull"]),
        "weapon_level": int(modules.get("weaponArray", {"level": 0})["level"]),
        "shield_level": int(modules.get("shieldMatrix", {"level": 0})["level"]),
    }


def _now(conn):
    from ..infra.clock import db_now

    return db_now(conn)


def _round(value: float) -> int:
    return int(value + 0.5) if value >= 0 else -int(-value + 0.5)

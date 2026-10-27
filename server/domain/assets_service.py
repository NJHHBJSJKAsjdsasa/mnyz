"""Stations, fleets and leaderboard (M5)."""

from __future__ import annotations

from ..infra.clock import db_now
from ..infra.errors import NotFound, Unprocessable
from ..repo import assets as asset_repo
from ..repo import outbox as outbox_repo
from ..repo import players as player_repo
from ..repo import reference as reference_repo
from ..repo import wallets as wallet_repo
from . import planet as planet_domain
from .cost import charge
from .settlement import settle_offline

STATION_BUILD_COST = {"quantumAlloy": 600, "plasmaCell": 150}
FLEET_BUILD_COST = {"quantumAlloy": 120, "plasmaCell": 40}


def assets_view(conn, player: dict) -> dict:
    settle_offline(conn, player["id"])
    stations = []
    for row in asset_repo.stations(conn, player["id"]):
        stations.append(
            {
                "id": str(row["id"]),
                "planet_key": row["planet_key"],
                "planet_name": row["planet_name"],
                "stored": row["stored"] or {},
                "last_tick_at": row["last_tick_at"],
                "modules": asset_repo.station_modules(conn, str(row["id"])),
            }
        )
    return {"stations": stations, "fleet": asset_repo.fleet(conn, player["id"])}


def build_station(conn, player: dict, planet_key: str) -> dict:
    planet = planet_domain.resolve_planet(conn, player, planet_key)
    tx = charge(conn, player["id"], STATION_BUILD_COST, "station_build", "station", planet_key)
    try:
        with conn.transaction():
            station = asset_repo.create_station(
                conn,
                player["id"],
                planet_key,
                planet["name"],
                int(planet["x"]),
                int(planet["y"]),
            )
    except Exception as exc:  # noqa: BLE001 - trigger raises P0001 at 3 stations
        if "station_limit" in str(exc):
            raise Unprocessable("最多拥有 3 座空间站") from exc
        raise
    version = _finish(conn, player["id"], "station.built", {"station_id": str(station["id"])})
    return {
        "station": {"id": str(station["id"]), "planet_key": station["planet_key"]},
        "cost": STATION_BUILD_COST,
        "tx_id": tx["id"] if tx else None,
        "state_version": version,
    }


def add_station_module(conn, player: dict, station_id: str, module_code: str) -> dict:
    station = asset_repo.lock_station(conn, player["id"], station_id)
    if station is None:
        raise NotFound("空间站不存在")
    definition = reference_repo.structure_definition(conn, module_code, "station")
    if definition is None:
        raise NotFound("空间站模块不存在")
    level = asset_repo.station_modules(conn, station_id).get(module_code, 0)
    if level >= int(definition["max_level"]):
        raise Unprocessable("模块已达最高等级")
    cost = _structure_cost(definition["cost_curve"], level + 1)
    tx = charge(conn, player["id"], cost, "station_module", "station", station_id)
    asset_repo.upsert_station_module(conn, station_id, module_code, level + 1)
    version = _finish(conn, player["id"], "station.module", {"station_id": station_id, "module": module_code})
    return {
        "station_id": station_id,
        "module": module_code,
        "level": level + 1,
        "cost": cost,
        "tx_id": tx["id"] if tx else None,
        "state_version": version,
    }


def claim_station(conn, player: dict, station_id: str) -> dict:
    settle_offline(conn, player["id"])
    station = asset_repo.lock_station(conn, player["id"], station_id)
    if station is None:
        raise NotFound("空间站不存在")
    stored = {code: int(amount) for code, amount in (station["stored"] or {}).items() if int(amount) > 0}
    if not stored:
        raise Unprocessable("没有可领取的产出")
    from .ledger import TxRef, post_transaction

    tx = post_transaction(
        conn, player["id"], stored, TxRef(kind="station_claim", ref_type="station", ref_id=station_id)
    )
    asset_repo.update_station(conn, station_id, {}, db_now(conn))
    version = _finish(conn, player["id"], "station.claimed", {"station_id": station_id, "yield": stored})
    balances = wallet_repo.balances(conn, player["id"])
    return {
        "yield": stored,
        "balances": {code: int(balances.get(code, 0)) for code in stored},
        "tx_id": tx["id"],
        "state_version": version,
    }


def recruit_fleet(conn, player: dict, name: str) -> dict:
    tx = charge(conn, player["id"], FLEET_BUILD_COST, "fleet_recruit", "fleet", name)
    try:
        with conn.transaction():
            ship = asset_repo.create_fleet(conn, player["id"], name or "未命名舰队")
    except Exception as exc:  # noqa: BLE001
        if "fleet_limit" in str(exc):
            raise Unprocessable("最多拥有 3 支舰队") from exc
        raise
    version = _finish(conn, player["id"], "fleet.recruited", {"fleet_id": str(ship["id"])})
    return {
        "fleet": {"id": str(ship["id"]), "name": ship["name"], "task": ship["task"]},
        "cost": FLEET_BUILD_COST,
        "tx_id": tx["id"] if tx else None,
        "state_version": version,
    }


def set_fleet_task(conn, player: dict, fleet_id: str, task: str) -> dict:
    if task not in {"idle", "mine", "survey", "trade"}:
        raise Unprocessable("任务必须是 idle/mine/survey/trade")
    settle_offline(conn, player["id"])
    ship = asset_repo.lock_fleet(conn, player["id"], fleet_id)
    if ship is None:
        raise NotFound("舰队不存在")
    asset_repo.update_fleet(conn, fleet_id, task, ship["stored"] or {}, db_now(conn))
    version = _finish(conn, player["id"], "fleet.task", {"fleet_id": fleet_id, "task": task})
    return {"fleet_id": fleet_id, "task": task, "state_version": version}


def claim_fleet(conn, player: dict, fleet_id: str) -> dict:
    settle_offline(conn, player["id"])
    ship = asset_repo.lock_fleet(conn, player["id"], fleet_id)
    if ship is None:
        raise NotFound("舰队不存在")
    stored = {code: int(amount) for code, amount in (ship["stored"] or {}).items() if int(amount) > 0}
    if not stored:
        raise Unprocessable("没有可领取的产出")
    from .ledger import TxRef, post_transaction

    tx = post_transaction(
        conn, player["id"], stored, TxRef(kind="fleet_claim", ref_type="fleet", ref_id=fleet_id)
    )
    asset_repo.update_fleet(conn, fleet_id, ship["task"], {}, db_now(conn))
    version = _finish(conn, player["id"], "fleet.claimed", {"fleet_id": fleet_id, "yield": stored})
    balances = wallet_repo.balances(conn, player["id"])
    return {
        "yield": stored,
        "balances": {code: int(balances.get(code, 0)) for code in stored},
        "tx_id": tx["id"],
        "state_version": version,
    }


def leaderboard(conn, player: dict, limit: int = 50) -> list[dict]:
    from ..infra.context import cache

    key = f"lb:{player['universe_id']}:{limit}"
    cached = cache().get_json(key)
    if cached is not None:
        return cached
    rows = player_repo.leaderboard(conn, player["universe_id"], limit)
    cache().set_json(key, rows, 15)
    return rows


def _structure_cost(curve: dict, target_level: int) -> dict[str, int]:
    base = curve.get("base", {})
    growth = float(curve.get("growth", 1.5))
    return {
        code: max(1, int(float(amount) * (growth ** (target_level - 1))))
        for code, amount in base.items()
    }


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

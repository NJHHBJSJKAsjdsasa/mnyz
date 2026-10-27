"""Offline settlement for stations (15 min) and fleets (30 min).

Yields accumulate in ``stored`` only; claiming moves them to the ledger. The
cap is applied by advancing ``last_tick_at`` to *now* when ticks overflow, which
drops the excess instead of paying it later (docs/server/06 §3.2).
"""

from __future__ import annotations

import math
from datetime import timedelta

from ..infra.clock import db_now
from ..repo import assets as asset_repo
from ..repo import players as player_repo

STATION_TICK_SECONDS = 900
STATION_CAP = 16
FLEET_TICK_SECONDS = 1800
FLEET_CAP = 12


def settle_offline(conn, player_id: str) -> dict:
    player = player_repo.lock(conn, player_id)
    if player is None:
        return {"settled_at": None, "stations": 0, "fleet": 0}
    moment = db_now(conn)
    stations = _settle_stations(conn, player_id, moment)
    fleet = _settle_fleet(conn, player_id, moment)
    player_repo.set_settled(conn, player_id, moment)
    return {"settled_at": moment, "stations": stations, "fleet": fleet}


def _settle_stations(conn, player_id: str, moment) -> int:
    settled = 0
    for station in asset_repo.stations_for_update(conn, player_id):
        ticks = int((moment - station["last_tick_at"]).total_seconds() // STATION_TICK_SECONDS)
        applied = min(ticks, STATION_CAP)
        if applied <= 0:
            continue
        modules = asset_repo.station_modules(conn, str(station["id"]))
        production = int(modules.get("production_bay", 0))
        stored = dict(station["stored"] or {})
        stored["antimatter"] = int(stored.get("antimatter", 0)) + applied * (2 + int(3 * math.sqrt(production)))
        stored["deuterium"] = int(stored.get("deuterium", 0)) + applied * max(1, production // 2)
        last = moment if ticks > STATION_CAP else station["last_tick_at"] + timedelta(seconds=applied * STATION_TICK_SECONDS)
        asset_repo.update_station(conn, str(station["id"]), stored, last)
        settled += 1
    return settled


def _settle_fleet(conn, player_id: str, moment) -> int:
    settled = 0
    yields = {
        "mine": {"antimatter": 3, "deuterium": 1},
        "survey": {"exoticCrystal": 1, "nebulaDust": 1},
        "trade": {"antimatter": 6},
    }
    for ship in asset_repo.fleet_for_update(conn, player_id):
        task = ship["task"]
        if task == "idle":
            continue
        ticks = int((moment - ship["last_tick_at"]).total_seconds() // FLEET_TICK_SECONDS)
        applied = min(ticks, FLEET_CAP)
        if applied <= 0:
            continue
        stored = dict(ship["stored"] or {})
        for code, amount in yields.get(task, {}).items():
            stored[code] = int(stored.get(code, 0)) + applied * amount
        last = moment if ticks > FLEET_CAP else ship["last_tick_at"] + timedelta(seconds=applied * FLEET_TICK_SECONDS)
        asset_repo.update_fleet(conn, str(ship["id"]), task, stored, last)
        settled += 1
    return settled

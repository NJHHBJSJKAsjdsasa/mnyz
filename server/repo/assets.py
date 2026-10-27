"""Stations, fleet and contract projections used by /state."""

from __future__ import annotations

import json


def stations_for_update(conn, player_id: str) -> list[dict]:
    return conn.execute(
        """
        SELECT id, planet_key, planet_name, last_tick_at, stored
          FROM stations WHERE player_id = %s ORDER BY created_at FOR UPDATE
        """,
        (player_id,),
    ).fetchall()


def fleet_for_update(conn, player_id: str) -> list[dict]:
    return conn.execute(
        """
        SELECT id, name, task, last_tick_at, stored
          FROM fleet_ships WHERE player_id = %s ORDER BY created_at FOR UPDATE
        """,
        (player_id,),
    ).fetchall()


def stations(conn, player_id: str) -> list[dict]:
    return conn.execute(
        """
        SELECT id, planet_key, planet_name, stored, last_tick_at
          FROM stations WHERE player_id = %s ORDER BY created_at
        """,
        (player_id,),
    ).fetchall()


def fleet(conn, player_id: str) -> list[dict]:
    return conn.execute(
        "SELECT id, name, task, last_tick_at, stored FROM fleet_ships WHERE player_id = %s ORDER BY created_at",
        (player_id,),
    ).fetchall()


def create_station(conn, player_id: str, planet_key: str, planet_name: str, x: int, y: int) -> dict:
    return conn.execute(
        """
        INSERT INTO stations (player_id, planet_key, planet_name, coordinates)
        VALUES (%s, %s, %s, POINT(%s, %s))
        RETURNING id, planet_key, planet_name, last_tick_at, stored
        """,
        (player_id, planet_key.lower(), planet_name[:64], x, y),
    ).fetchone()


def lock_station(conn, player_id: str, station_id: str) -> dict | None:
    return conn.execute(
        """
        SELECT id, planet_key, planet_name, last_tick_at, stored
          FROM stations WHERE id = %s AND player_id = %s FOR UPDATE
        """,
        (station_id, player_id),
    ).fetchone()


def station_modules(conn, station_id: str) -> dict[str, int]:
    rows = conn.execute(
        "SELECT module_code, level FROM station_modules WHERE station_id = %s", (station_id,)
    ).fetchall()
    return {row["module_code"]: int(row["level"]) for row in rows}


def upsert_station_module(conn, station_id: str, module_code: str, level: int) -> None:
    conn.execute(
        """
        INSERT INTO station_modules (station_id, module_code, level) VALUES (%s, %s, %s)
        ON CONFLICT (station_id, module_code)
        DO UPDATE SET level = EXCLUDED.level, updated_at = now()
        """,
        (station_id, module_code, level),
    )


def update_station(conn, station_id: str, stored: dict, last_tick) -> None:
    conn.execute(
        "UPDATE stations SET stored = %s::jsonb, last_tick_at = %s WHERE id = %s",
        (json.dumps(stored, sort_keys=True), last_tick, station_id),
    )


def create_fleet(conn, player_id: str, name: str) -> dict:
    return conn.execute(
        """
        INSERT INTO fleet_ships (player_id, name) VALUES (%s, %s)
        RETURNING id, name, task, last_tick_at, stored
        """,
        (player_id, name[:48]),
    ).fetchone()


def lock_fleet(conn, player_id: str, fleet_id: str) -> dict | None:
    return conn.execute(
        """
        SELECT id, name, task, last_tick_at, stored
          FROM fleet_ships WHERE id = %s AND player_id = %s FOR UPDATE
        """,
        (fleet_id, player_id),
    ).fetchone()


def update_fleet(conn, fleet_id: str, task: str, stored: dict, last_tick) -> None:
    conn.execute(
        "UPDATE fleet_ships SET task = %s, stored = %s::jsonb, last_tick_at = %s WHERE id = %s",
        (task, json.dumps(stored, sort_keys=True), last_tick, fleet_id),
    )


def contracts_for_day(conn, player_id: str, game_day) -> list[dict]:
    return conn.execute(
        """
        SELECT id, template_code, metric, target, progress, status, taken_by,
               expires_at, reward_multiplier, game_day
          FROM contracts WHERE player_id = %s AND game_day = %s
         ORDER BY id
        """,
        (player_id, game_day),
    ).fetchall()

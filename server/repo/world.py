"""Shared-world planets, sieges, ownership history and loot escrow."""

from __future__ import annotations

import json


def ensure(conn, planet_key: str) -> dict:
    conn.execute(
        "INSERT INTO world_planets (planet_key) VALUES (%s) ON CONFLICT (planet_key) DO NOTHING",
        (planet_key.lower(),),
    )
    return conn.execute(
        """
        SELECT planet_key, owner_player_id, owner_alliance_id, claimed_at, shield_until,
               defense_power, level
          FROM world_planets WHERE planet_key = %s
        """,
        (planet_key.lower(),),
    ).fetchone()


def lock(conn, planet_key: str) -> dict | None:
    return conn.execute(
        """
        SELECT planet_key, owner_player_id, owner_alliance_id, claimed_at, shield_until,
               defense_power, level
          FROM world_planets WHERE planet_key = %s FOR UPDATE
        """,
        (planet_key.lower(),),
    ).fetchone()


def claim(conn, planet_key: str, player_id: str, alliance_id: str | None) -> bool:
    row = conn.execute(
        """
        UPDATE world_planets
           SET owner_player_id = %s, owner_alliance_id = %s, claimed_at = now(),
               shield_until = now() + interval '24 hours', updated_at = now()
         WHERE planet_key = %s AND owner_player_id IS NULL
        RETURNING planet_key
        """,
        (player_id, alliance_id, planet_key.lower()),
    ).fetchone()
    return bool(row)


def transfer(conn, planet_key: str, player_id: str, alliance_id: str | None) -> None:
    conn.execute(
        """
        UPDATE world_planets
           SET owner_player_id = %s, owner_alliance_id = %s, claimed_at = now(),
               shield_until = now() + interval '24 hours', updated_at = now()
         WHERE planet_key = %s
        """,
        (player_id, alliance_id, planet_key.lower()),
    )


def close_history(conn, planet_key: str, reason: str) -> None:
    conn.execute(
        """
        UPDATE planet_ownership_history SET lost_at = now(), reason = %s
         WHERE planet_key = %s AND lost_at IS NULL
        """,
        (reason, planet_key.lower()),
    )


def add_history(conn, planet_key: str, owner_player_id: str) -> None:
    conn.execute(
        """
        INSERT INTO planet_ownership_history (planet_key, owner_player_id)
        VALUES (%s, %s)
        """,
        (planet_key.lower(), owner_player_id),
    )


def last_declared(conn, attacker_id: str, planet_key: str):
    row = conn.execute(
        """
        SELECT max(declared_at) AS last_at FROM sieges
         WHERE attacker_player_id = %s AND planet_key = %s
        """,
        (attacker_id, planet_key.lower()),
    ).fetchone()
    return row["last_at"] if row else None


def fleet_count(conn, player_id: str) -> int:
    row = conn.execute(
        "SELECT count(*) AS n FROM fleet_ships WHERE player_id = %s AND task <> 'idle'",
        (player_id,),
    ).fetchone()
    return int(row["n"])


def create_siege(conn, planet_key: str, attacker_id: str, defender_id: str | None,
                 attacker_power: int, defender_power: int, seed: int) -> dict:
    return conn.execute(
        """
        INSERT INTO sieges
               (planet_key, attacker_player_id, defender_player_id, resolve_at,
                attacker_power, defender_power, seed)
        VALUES (%s, %s, %s, now() + interval '12 hours', %s, %s, %s)
        RETURNING id, planet_key, resolve_at, status, seed
        """,
        (planet_key.lower(), attacker_id, defender_id, attacker_power, defender_power, seed),
    ).fetchone()


def has_participant(conn, siege_id: str, player_id: str) -> bool:
    row = conn.execute(
        "SELECT 1 AS hit FROM siege_participants WHERE siege_id = %s AND player_id = %s",
        (siege_id, player_id),
    ).fetchone()
    return bool(row)


def add_participant(conn, siege_id: str, player_id: str, power: int) -> int:
    conn.execute(
        """
        INSERT INTO siege_participants (siege_id, player_id, fleet_power)
        VALUES (%s, %s, %s)
        ON CONFLICT (siege_id, player_id)
        DO UPDATE SET fleet_power = EXCLUDED.fleet_power
        """,
        (siege_id, player_id, power),
    )
    row = conn.execute(
        "SELECT COALESCE(SUM(fleet_power), 0) AS total FROM siege_participants WHERE siege_id = %s",
        (siege_id,),
    ).fetchone()
    return int(row["total"])


def get_siege(conn, siege_id: str, for_update: bool = False) -> dict | None:
    suffix = " FOR UPDATE" if for_update else ""
    return conn.execute(
        f"""
        SELECT id, planet_key, attacker_player_id, defender_player_id, declared_at,
               resolve_at, attacker_power, defender_power, seed, status, outcome
          FROM sieges WHERE id = %s{suffix}
        """,
        (siege_id,),
    ).fetchone()


def siege_detail(conn, siege_id: str) -> dict | None:
    siege = get_siege(conn, siege_id)
    if siege is None:
        return None
    participants = conn.execute(
        """
        SELECT player_id, fleet_power, joined_at
          FROM siege_participants WHERE siege_id = %s ORDER BY joined_at
        """,
        (siege_id,),
    ).fetchall()
    return {**siege, "participants": participants}


def open_siege(conn, planet_key: str) -> dict | None:
    return conn.execute(
        """
        SELECT id FROM sieges WHERE planet_key = %s AND status = 'locked' LIMIT 1
        """,
        (planet_key.lower(),),
    ).fetchone()


def due_sieges(conn, limit: int = 20) -> list[dict]:
    return conn.execute(
        """
        SELECT id, planet_key, attacker_player_id, defender_player_id,
               attacker_power, defender_power, seed
          FROM sieges WHERE status = 'locked' AND resolve_at <= now()
         ORDER BY resolve_at LIMIT %s FOR UPDATE SKIP LOCKED
        """,
        (limit,),
    ).fetchall()


def update_attacker_power(conn, siege_id: str, power: int) -> None:
    conn.execute("UPDATE sieges SET attacker_power = %s WHERE id = %s", (power, siege_id))


def resolve(conn, siege_id: str, outcome: str, winner_id: str | None, planet_key: str) -> None:
    conn.execute(
        "UPDATE sieges SET status = 'resolved', outcome = %s WHERE id = %s",
        (outcome, siege_id),
    )
    if winner_id:
        close_history(conn, planet_key, "conquered")
        add_history(conn, planet_key, winner_id)


def add_escrow(conn, siege_id: str, player_id: str, payload: dict) -> None:
    conn.execute(
        """
        INSERT INTO loot_escrow (siege_id, player_id, payload) VALUES (%s, %s, %s::jsonb)
        """,
        (siege_id, player_id, json.dumps(payload)),
    )


def escrow_for_player(conn, player_id: str) -> list[dict]:
    return conn.execute(
        """
        SELECT id, siege_id, payload FROM loot_escrow
         WHERE player_id = %s AND released_at IS NULL ORDER BY id FOR UPDATE
        """,
        (player_id,),
    ).fetchall()


def release_escrow(conn, escrow_id: int) -> None:
    conn.execute("UPDATE loot_escrow SET released_at = now() WHERE id = %s", (escrow_id,))

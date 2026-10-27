"""Combat sessions and replayable turns."""

from __future__ import annotations

import json


def create(
    conn,
    player_id: str,
    planet_key: str,
    seed: int,
    player: dict,
    enemy: dict,
    escorts: list,
    mode: str = "pve",
    challenge_code: str | None = None,
    enemy_power: int | None = None,
) -> dict:
    return conn.execute(
        """
        INSERT INTO combat_sessions
               (player_id, planet_key, mode, seed, player_hp, player_shield,
                enemy_hp, enemy_shield, escorts, challenge_code, enemy_power)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s)
        RETURNING id, planet_key, mode, seed, status, turn_no, player_hp, player_shield,
                  enemy_hp, enemy_shield, escorts, challenge_code, enemy_power, expires_at
        """,
        (
            player_id,
            planet_key.lower(),
            mode,
            seed,
            player["hp"],
            player["shield"],
            enemy["hp"],
            enemy["shield"],
            json.dumps(escorts),
            challenge_code,
            enemy_power,
        ),
    ).fetchone()


def get(conn, player_id: str, session_id: str, for_update: bool = False) -> dict | None:
    suffix = " FOR UPDATE" if for_update else ""
    return conn.execute(
        f"""
        SELECT id, player_id, planet_key, mode, seed, status, turn_no, player_hp, player_shield,
               enemy_hp, enemy_shield, escorts, challenge_code, enemy_power, expires_at
          FROM combat_sessions WHERE id = %s AND player_id = %s{suffix}
        """,
        (session_id, player_id),
    ).fetchone()


def save(conn, session_id: str, state: dict) -> None:
    conn.execute(
        """
        UPDATE combat_sessions
           SET status = %s, turn_no = %s, player_hp = %s, player_shield = %s,
               enemy_hp = %s, enemy_shield = %s, escorts = %s::jsonb, updated_at = now()
         WHERE id = %s
        """,
        (
            state["status"],
            state["turn_no"],
            state["player_hp"],
            state["player_shield"],
            state["enemy_hp"],
            state["enemy_shield"],
            json.dumps(state.get("escorts", [])),
            session_id,
        ),
    )


def add_turn(conn, session_id: str, turn_no: int, action: str, damage: int, log: list) -> None:
    conn.execute(
        """
        INSERT INTO combat_turns (session_id, turn_no, action, damage, log)
        VALUES (%s, %s, %s, %s, %s::jsonb)
        ON CONFLICT (session_id, turn_no) DO NOTHING
        """,
        (session_id, turn_no, action, damage, json.dumps(log, default=str)),
    )


def add_loot(conn, session_id: str, player_id: str, tx_id: str, payload: dict) -> None:
    conn.execute(
        """
        INSERT INTO combat_loot (session_id, player_id, tx_id, payload)
        VALUES (%s, %s, %s, %s::jsonb)
        ON CONFLICT (session_id) DO NOTHING
        """,
        (session_id, player_id, tx_id, json.dumps(payload)),
    )


def add_wreck(conn, player_id: str, planet_key: str, tier: int = 1) -> None:
    conn.execute(
        """
        INSERT INTO wrecks (player_id, planet_key, tier) VALUES (%s, %s, %s)
        ON CONFLICT (player_id, planet_key) DO NOTHING
        """,
        (player_id, planet_key.lower(), tier),
    )


def take_wreck(conn, player_id: str, planet_key: str) -> dict | None:
    return conn.execute(
        """
        DELETE FROM wrecks WHERE player_id = %s AND planet_key = %s
        RETURNING planet_key, tier
        """,
        (player_id, planet_key.lower()),
    ).fetchone()


def list_wrecks(conn, player_id: str) -> list[dict]:
    return conn.execute(
        "SELECT planet_key, tier, created_at FROM wrecks WHERE player_id = %s ORDER BY created_at DESC",
        (player_id,),
    ).fetchall()


def active(conn, player_id: str) -> list[dict]:
    return conn.execute(
        """
        SELECT id, planet_key, status, turn_no, player_hp, enemy_hp, expires_at
          FROM combat_sessions WHERE player_id = %s AND status = 'active'
         ORDER BY created_at DESC LIMIT 20
        """,
        (player_id,),
    ).fetchall()

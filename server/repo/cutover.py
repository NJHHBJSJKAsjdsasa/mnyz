"""Feature flags, per-player overrides, shadow snapshots and saga steps."""

from __future__ import annotations

import json


def flags(conn) -> list[dict]:
    return conn.execute(
        "SELECT name, enabled, mode, rollout_pct FROM feature_flags ORDER BY name"
    ).fetchall()


def overrides(conn, player_id: str) -> dict[str, str]:
    rows = conn.execute(
        """
        SELECT flag_key, mode FROM player_flag_overrides
         WHERE player_id = %s AND expires_at > now()
        """,
        (player_id,),
    ).fetchall()
    return {row["flag_key"]: row["mode"] for row in rows}


def set_flag(conn, name: str, mode: str, rollout_pct: int, updated_by: str | None = None) -> None:
    conn.execute(
        """
        INSERT INTO feature_flags (name, enabled, mode, rollout_pct, updated_by)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (name) DO UPDATE SET enabled = EXCLUDED.enabled, mode = EXCLUDED.mode,
          rollout_pct = EXCLUDED.rollout_pct, updated_by = EXCLUDED.updated_by, updated_at = now()
        """,
        (name, mode != "local", mode, rollout_pct, updated_by),
    )


def set_override(conn, player_id: str, flag_key: str, mode: str, hours: int = 24) -> None:
    conn.execute(
        """
        INSERT INTO player_flag_overrides (player_id, flag_key, mode, expires_at)
        VALUES (%s, %s, %s, now() + (%s || ' hours')::interval)
        ON CONFLICT (player_id, flag_key)
        DO UPDATE SET mode = EXCLUDED.mode, expires_at = EXCLUDED.expires_at
        """,
        (player_id, flag_key, mode, hours),
    )


def save_shadow(conn, player_id: str, payload: dict, size_bytes: int, state_version: int) -> None:
    conn.execute(
        """
        INSERT INTO player_shadow_state (player_id, payload, size_bytes, state_version)
        VALUES (%s, %s::jsonb, %s, %s)
        ON CONFLICT (player_id) DO UPDATE SET payload = EXCLUDED.payload,
          size_bytes = EXCLUDED.size_bytes, state_version = EXCLUDED.state_version, updated_at = now()
        """,
        (player_id, json.dumps(payload, sort_keys=True), size_bytes, state_version),
    )


def shadow(conn, player_id: str) -> dict | None:
    return conn.execute(
        "SELECT payload, size_bytes, state_version, updated_at FROM player_shadow_state WHERE player_id = %s",
        (player_id,),
    ).fetchone()


def saga_step(conn, saga_id: str, step: str) -> dict | None:
    return conn.execute(
        "SELECT status, attempts FROM saga_steps WHERE saga_id = %s AND step = %s",
        (saga_id, step),
    ).fetchone()


def start_step(conn, saga_id: str, step: str) -> None:
    conn.execute(
        """
        INSERT INTO saga_steps (saga_id, step, status) VALUES (%s, %s, 'pending')
        ON CONFLICT (saga_id, step) DO UPDATE SET attempts = saga_steps.attempts + 1, updated_at = now()
        """,
        (saga_id, step),
    )


def finish_step(conn, saga_id: str, step: str, ok: bool, error: str | None = None) -> None:
    conn.execute(
        """
        UPDATE saga_steps SET status = %s, last_error = %s, updated_at = now()
         WHERE saga_id = %s AND step = %s
        """,
        ("done" if ok else "failed", error, saga_id, step),
    )

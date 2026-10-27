"""Daily surface-sample counters (three per planet per game day)."""

from __future__ import annotations

DAILY_SAMPLES = 3


def use(conn, player_id: str, planet_key: str, game_day) -> int | None:
    """Consume one sample; ``None`` means the daily limit is reached."""
    row = conn.execute(
        """
        INSERT INTO surface_samples (player_id, planet_key, game_day, used)
        VALUES (%s, %s, %s, 1)
        ON CONFLICT (player_id, planet_key, game_day)
        DO UPDATE SET used = surface_samples.used + 1
        WHERE surface_samples.used < %s
        RETURNING used
        """,
        (player_id, planet_key.lower(), game_day, DAILY_SAMPLES),
    ).fetchone()
    return int(row["used"]) if row else None


def used(conn, player_id: str, planet_key: str, game_day) -> int:
    row = conn.execute(
        "SELECT used FROM surface_samples WHERE player_id = %s AND planet_key = %s AND game_day = %s",
        (player_id, planet_key.lower(), game_day),
    ).fetchone()
    return int(row["used"]) if row else 0

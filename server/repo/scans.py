"""Per-player, per-planet scan history."""

from __future__ import annotations


def record(conn, player_id: str, planet_key: str) -> int:
    """Increment the scan count and return the new value (1-based)."""
    row = conn.execute(
        """
        INSERT INTO planet_scans (player_id, planet_key, scans, last_at, bonus_uses)
        VALUES (%s, %s, 1, now(), 0)
        ON CONFLICT (player_id, planet_key)
        DO UPDATE SET scans = planet_scans.scans + 1, last_at = now(), bonus_uses = 0
        RETURNING scans
        """,
        (player_id, planet_key.lower()),
    ).fetchone()
    return int(row["scans"])


def get(conn, player_id: str, planet_key: str) -> dict | None:
    return conn.execute(
        """
        SELECT planet_key, scans, last_at, bonus_kind, bonus_uses
          FROM planet_scans WHERE player_id = %s AND planet_key = %s
        """,
        (player_id, planet_key.lower()),
    ).fetchone()

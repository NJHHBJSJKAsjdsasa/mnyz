"""Player-local day/week boundaries, computed by PostgreSQL.

Using the database clock avoids app/DB drift and keeps the daily reset at the
player's local midnight (docs/server/06 §1.3).
"""

from __future__ import annotations


def game_day(conn, timezone: str):
    row = conn.execute("SELECT (now() AT TIME ZONE %s)::date AS day", (timezone,)).fetchone()
    return row["day"]


def week_key(conn, timezone: str) -> str:
    row = conn.execute(
        "SELECT to_char(date_trunc('week', now() AT TIME ZONE %s), 'IYYY-IW') AS week",
        (timezone,),
    ).fetchone()
    return row["week"]

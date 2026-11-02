"""Exploration milestones (T-62): the server-side "how far have I gone" panel.

Why this replaces ``DailyChallenges.getCurrentStats()``
------------------------------------------------------
The client derived galaxies/systems/planets by walking every ``_atlasArchive*``
blob in ``localStorage`` and counting bits in planet bitmaps. Three problems:

1. **It cannot be trusted** — the same code path that renders the panel also
   decides the number, so the number is whatever the browser says it is.
2. **It duplicated ``/tasks``** — two "today's progress" widgets with different
   reset rules (local midnight vs UTC) and different rewards (none vs tasks).
3. **It scanned all storage on every render**, which is why the panel felt slow
   on a long-lived profile.

The split from here on:

* **Milestones (this module)** — cumulative, never resets, pays nothing. It is a
  scoreboard: galaxies = distinct sectors, systems = distinct coordinate triples,
  planets = distinct keys. Targets scale with account age so a new player is not
  asked for a veteran's numbers.
* **Daily tasks (``/tasks``)** — reset daily on the server clock, pay rewards.

``day_number`` is account age in days, not "days since the client first ran":
the latter is a number the player controls by clearing storage.
"""

from __future__ import annotations

import math

from ..infra.clock import now

BASE_GOALS = {"galaxies": 1, "systems": 3, "planets": 10}


def record_visit(conn, player_id: str, planet_key: str, coords: str, sector_key: str) -> bool:
    """Idempotent: returns True when this is a new planet for the player."""
    row = conn.execute(
        """
        INSERT INTO planet_visits (player_id, planet_key, coords, sector_key)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (player_id, planet_key) DO NOTHING
        RETURNING planet_key
        """,
        (player_id, planet_key, coords, sector_key),
    ).fetchone()
    return row is not None


def milestone(conn, player: dict) -> dict:
    counts = conn.execute(
        """
        SELECT count(*) AS planets,
               count(DISTINCT coords) AS systems,
               count(DISTINCT sector_key) AS galaxies
          FROM planet_visits WHERE player_id = %s
        """,
        (player["id"],),
    ).fetchone()

    day_number = day_number_for(conn, player["id"])
    multiplier = 1.1 ** (day_number - 1)
    challenges = []
    for metric, base in BASE_GOALS.items():
        current = int(counts[metric])
        target = max(1, math.ceil(day_number * base * multiplier))
        challenges.append(
            {"type": metric, "current": current, "target": target, "completed": current >= target}
        )

    return {
        "day_number": day_number,
        "challenges": challenges,
        "day_completed": all(item["completed"] for item in challenges),
        "note": "里程碑不发奖励；奖励在 /tasks",
    }


def day_number_for(conn, player_id: str) -> int:
    row = conn.execute(
        "SELECT a.created_at FROM accounts a JOIN players p ON p.account_id = a.id WHERE p.id = %s",
        (player_id,),
    ).fetchone()
    if row is None or row["created_at"] is None:
        return 1
    return max(1, (now() - row["created_at"]).days + 1)

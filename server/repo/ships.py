"""Flagship, installed modules and per-player scalar flags."""

from __future__ import annotations

from . import players


def create_default(conn, player_id: str) -> dict:
    ship = conn.execute(
        """
        INSERT INTO ships (player_id, level, ship_type, is_flagship)
        VALUES (%s, 1, 'explorer', true)
        ON CONFLICT (player_id) WHERE is_flagship DO NOTHING
        RETURNING id, player_id, level, ship_type, appearance, is_flagship
        """,
        (player_id,),
    ).fetchone()
    return ship or flagship(conn, player_id)


def flagship(conn, player_id: str) -> dict | None:
    return conn.execute(
        """
        SELECT id, player_id, level, ship_type, appearance, is_flagship
          FROM ships WHERE player_id = %s AND is_flagship
        """,
        (player_id,),
    ).fetchone()


def modules(conn, player_id: str) -> dict[str, dict]:
    rows = conn.execute(
        """
        SELECT m.module_code, m.level, m.overclock
          FROM ship_modules m
          JOIN ships s ON s.id = m.ship_id
         WHERE s.player_id = %s AND s.is_flagship
        """,
        (player_id,),
    ).fetchall()
    return {row["module_code"]: row for row in rows}


def ensure_flags(conn, player_id: str) -> dict:
    # `player_flags` belongs to the platform module — delegate instead of writing it here.
    return players.ensure_flags(conn, player_id)


def flags(conn, player_id: str) -> dict | None:
    return players.flags(conn, player_id)


def set_level(conn, player_id: str, level: int) -> None:
    conn.execute(
        "UPDATE ships SET level = %s, updated_at = now() WHERE player_id = %s AND is_flagship",
        (level, player_id),
    )


def upsert_module(conn, player_id: str, module_code: str, level: int, overclock: int) -> None:
    ship = flagship(conn, player_id)
    if ship is None:
        raise ValueError("flagship missing")
    conn.execute(
        """
        INSERT INTO ship_modules (ship_id, module_code, level, overclock)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (ship_id, module_code)
        DO UPDATE SET level = EXCLUDED.level, overclock = EXCLUDED.overclock, updated_at = now()
        """,
        (ship["id"], module_code, level, overclock),
    )


def set_hull(conn, player_id: str, hull: int) -> None:
    players.set_hull(conn, player_id, hull)


def add_vouchers(conn, player_id: str, amount: int) -> None:
    players.add_vouchers(conn, player_id, amount)


def tech_levels(conn, player_id: str) -> dict[str, int]:
    rows = conn.execute(
        """
        SELECT t.branch, count(*) AS n
          FROM player_tech pt JOIN tech_nodes t ON t.code = pt.node_code
         WHERE pt.player_id = %s
         GROUP BY t.branch
        """,
        (player_id,),
    ).fetchall()
    return {row["branch"]: int(row["n"]) for row in rows}


def sectors(conn, player_id: str) -> list[str]:
    rows = conn.execute(
        "SELECT sector_key FROM sector_licenses WHERE player_id = %s", (player_id,)
    ).fetchall()
    return [row["sector_key"] for row in rows]


def alliance_size(conn, player_id: str) -> int:
    row = conn.execute(
        """
        SELECT count(*) AS n
          FROM alliance_members mine
          JOIN alliance_members peers ON peers.alliance_id = mine.alliance_id
         WHERE mine.player_id = %s
        """,
        (player_id,),
    ).fetchone()
    return int(row["n"]) if row else 0


def codex_counts(conn, player_id: str) -> dict[str, int]:
    rows = conn.execute(
        "SELECT kind, count(*) AS n FROM codex_entries WHERE player_id = %s GROUP BY kind",
        (player_id,),
    ).fetchall()
    counts = {"planet": 0, "element": 0, "lifeform": 0}
    for row in rows:
        counts[row["kind"]] = int(row["n"])
    return counts

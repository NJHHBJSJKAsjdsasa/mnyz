"""NPC residents and faction reference data."""

from __future__ import annotations


def factions(conn) -> list[dict]:
    return conn.execute(
        "SELECT code, name, description, color FROM factions ORDER BY code"
    ).fetchall()


def residents(conn, universe_id: str) -> list[dict]:
    return conn.execute(
        "SELECT id, code, name, callsign, trait FROM npc_residents WHERE universe_id = %s ORDER BY code",
        (universe_id,),
    ).fetchall()


def ensure_resident(conn, universe_id: str, code: str, name: str, callsign: str, trait: str) -> None:
    conn.execute(
        """
        INSERT INTO npc_residents (universe_id, code, name, callsign, trait)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (universe_id, code) DO NOTHING
        """,
        (universe_id, code, name, callsign, trait),
    )


def get(conn, universe_id: str, resident_id: str) -> dict | None:
    return conn.execute(
        "SELECT id, code, name, callsign, trait FROM npc_residents WHERE universe_id = %s AND id = %s",
        (universe_id, resident_id),
    ).fetchone()


def meet(conn, player_id: str, resident_id: str) -> dict:
    return conn.execute(
        """
        INSERT INTO npc_relations (player_id, resident_id, favor, trades, last_met_at)
        VALUES (%s, %s, 0, 0, now())
        ON CONFLICT (player_id, resident_id)
        DO UPDATE SET last_met_at = now()
        RETURNING favor, trades, last_met_at
        """,
        (player_id, resident_id),
    ).fetchone()


def record_trade(conn, player_id: str, resident_id: str) -> dict:
    return conn.execute(
        """
        INSERT INTO npc_relations (player_id, resident_id, favor, trades, last_met_at)
        VALUES (%s, %s, 1, 1, now())
        ON CONFLICT (player_id, resident_id)
        DO UPDATE SET favor = LEAST(10, npc_relations.favor + 1),
                      trades = npc_relations.trades + 1,
                      last_met_at = now()
        RETURNING favor, trades
        """,
        (player_id, resident_id),
    ).fetchone()


def faction_reps(conn, player_id: str) -> dict[str, int]:
    rows = conn.execute(
        "SELECT sector_key, rep FROM faction_reputation WHERE player_id = %s", (player_id,)
    ).fetchall()
    return {row["sector_key"]: int(row["rep"]) for row in rows}


def add_faction_rep(conn, player_id: str, sector_key: str, delta: int) -> int:
    row = conn.execute(
        """
        INSERT INTO faction_reputation (player_id, sector_key, rep)
        VALUES (%s, %s, GREATEST(-10, LEAST(10, %s)))
        ON CONFLICT (player_id, sector_key)
        DO UPDATE SET rep = GREATEST(-10, LEAST(10, faction_reputation.rep + %s)),
                      updated_at = now()
        RETURNING rep
        """,
        (player_id, sector_key, delta, delta),
    ).fetchone()
    return int(row["rep"])


def relations(conn, player_id: str) -> dict[str, dict]:
    rows = conn.execute(
        "SELECT resident_id, favor, trades, last_met_at FROM npc_relations WHERE player_id = %s",
        (player_id,),
    ).fetchall()
    return {str(row["resident_id"]): row for row in rows}

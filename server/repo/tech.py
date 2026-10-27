"""Unlocked tech nodes."""

from __future__ import annotations


def unlocked(conn, player_id: str) -> set[str]:
    rows = conn.execute(
        "SELECT node_code FROM player_tech WHERE player_id = %s", (player_id,)
    ).fetchall()
    return {row["node_code"] for row in rows}


def insert(conn, player_id: str, node_code: str) -> bool:
    row = conn.execute(
        """
        INSERT INTO player_tech (player_id, node_code) VALUES (%s, %s)
        ON CONFLICT (player_id, node_code) DO NOTHING
        RETURNING node_code
        """,
        (player_id, node_code),
    ).fetchone()
    return bool(row)


def node(conn, node_code: str) -> dict | None:
    return conn.execute(
        "SELECT code, branch, tier, name, requires, cost FROM tech_nodes WHERE code = %s",
        (node_code,),
    ).fetchone()

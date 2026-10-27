"""Alliances and membership (max 5 enforced by a DB trigger)."""

from __future__ import annotations


def create(conn, name: str, leader_id: str) -> dict:
    alliance = conn.execute(
        "INSERT INTO alliances (name) VALUES (%s) RETURNING id, name, created_at", (name,)
    ).fetchone()
    add_member(conn, str(alliance["id"]), leader_id, "leader")
    return alliance


def by_name(conn, name: str) -> dict | None:
    return conn.execute("SELECT id, name FROM alliances WHERE name = %s", (name,)).fetchone()


def mine(conn, player_id: str) -> dict | None:
    return conn.execute(
        """
        SELECT a.id, a.name, m.role, m.joined_at
          FROM alliance_members m JOIN alliances a ON a.id = m.alliance_id
         WHERE m.player_id = %s
        """,
        (player_id,),
    ).fetchone()


def members(conn, alliance_id: str) -> list[dict]:
    return conn.execute(
        """
        SELECT m.player_id, m.role, m.joined_at, p.display_name
          FROM alliance_members m JOIN players p ON p.id = m.player_id
         WHERE m.alliance_id = %s ORDER BY m.joined_at
        """,
        (alliance_id,),
    ).fetchall()


def add_member(conn, alliance_id: str, player_id: str, role: str = "member") -> bool:
    row = conn.execute(
        """
        INSERT INTO alliance_members (alliance_id, player_id, role) VALUES (%s, %s, %s)
        ON CONFLICT DO NOTHING RETURNING player_id
        """,
        (alliance_id, player_id, role),
    ).fetchone()
    return bool(row)


def create_invite(conn, alliance_id: str, code: str, hours: int = 24) -> dict:
    return conn.execute(
        """
        INSERT INTO alliance_invites (code, alliance_id, expires_at)
        VALUES (%s, %s, now() + (%s || ' hours')::interval)
        RETURNING code, alliance_id, expires_at
        """,
        (code, alliance_id, hours),
    ).fetchone()


def find_invite(conn, code: str) -> dict | None:
    return conn.execute(
        """
        SELECT code, alliance_id, expires_at, used_at FROM alliance_invites WHERE code = %s
        """,
        (code,),
    ).fetchone()


def use_invite(conn, code: str) -> bool:
    row = conn.execute(
        """
        UPDATE alliance_invites SET used_at = now()
         WHERE code = %s AND used_at IS NULL AND expires_at > now()
        RETURNING code
        """,
        (code,),
    ).fetchone()
    return bool(row)


def leave(conn, player_id: str) -> int:
    rows = conn.execute(
        "DELETE FROM alliance_members WHERE player_id = %s RETURNING alliance_id", (player_id,)
    ).fetchall()
    return len(rows)

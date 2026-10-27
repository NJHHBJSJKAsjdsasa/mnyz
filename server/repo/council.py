"""Cosmic council seats, motions and votes."""

from __future__ import annotations

import json


def ensure_seat(conn, seat_no: int, name: str, faction_code: str | None, is_ai: bool, focus: str) -> None:
    conn.execute(
        """
        INSERT INTO council_seats (seat_no, name, faction_code, is_ai, focus)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (seat_no) DO NOTHING
        """,
        (seat_no, name, faction_code, is_ai, focus),
    )


def seats(conn) -> list[dict]:
    return conn.execute(
        """
        SELECT s.seat_no, s.name, s.faction_code, s.is_ai, s.player_id, s.joined_at, s.focus,
               p.display_name AS player_name
          FROM council_seats s
          LEFT JOIN players p ON p.id = s.player_id
         ORDER BY s.seat_no
        """
    ).fetchall()


def seat_for_player(conn, player_id: str) -> dict | None:
    return conn.execute(
        "SELECT seat_no, name FROM council_seats WHERE player_id = %s", (player_id,)
    ).fetchone()


def assign_player(conn, seat_no: int, player_id: str) -> bool:
    row = conn.execute(
        """
        UPDATE council_seats
           SET player_id = %s, joined_at = now(), name = '玩家议员'
         WHERE seat_no = %s AND is_ai = false AND player_id IS NULL
        RETURNING seat_no
        """,
        (player_id, seat_no),
    ).fetchone()
    return bool(row)


def vacate_player(conn, player_id: str) -> bool:
    row = conn.execute(
        """
        UPDATE council_seats
           SET player_id = NULL, joined_at = NULL, name = '开放席位'
         WHERE player_id = %s AND is_ai = false
        RETURNING seat_no
        """,
        (player_id,),
    ).fetchone()
    return bool(row)


def create_motion(conn, kind: str, player_id: str, sector_key: str | None, cost: dict, minutes: int = 2) -> dict:
    return conn.execute(
        """
        INSERT INTO council_motions (kind, player_id, sector_key, cost, closes_at)
        VALUES (%s, %s, %s, %s::jsonb, now() + (%s || ' minutes')::interval)
        RETURNING id, kind, player_id, sector_key, cost, status, created_at, closes_at
        """,
        (kind, player_id, sector_key, json.dumps(cost), minutes),
    ).fetchone()


def get_motion(conn, motion_id: str, for_update: bool = False) -> dict | None:
    suffix = " FOR UPDATE" if for_update else ""
    return conn.execute(
        f"""
        SELECT id, kind, player_id, sector_key, cost, status, created_at, closes_at,
               decided_at, outcome_reason
          FROM council_motions WHERE id = %s{suffix}
        """,
        (motion_id,),
    ).fetchone()


def open_motion_for(conn, player_id: str, kind: str, sector_key: str | None = None) -> dict | None:
    if sector_key is None:
        return conn.execute(
            "SELECT id FROM council_motions WHERE player_id = %s AND kind = %s AND status = 'open'",
            (player_id, kind),
        ).fetchone()
    return conn.execute(
        """
        SELECT id FROM council_motions
         WHERE player_id = %s AND kind = %s AND sector_key = %s AND status = 'open'
        """,
        (player_id, kind, sector_key),
    ).fetchone()


def add_vote(conn, motion_id: str, seat_no: int, vote: str, reason: str) -> bool:
    row = conn.execute(
        """
        INSERT INTO council_votes (motion_id, seat_no, vote, reason)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (motion_id, seat_no) DO UPDATE
          SET vote = EXCLUDED.vote, reason = EXCLUDED.reason, voted_at = now()
        RETURNING seat_no
        """,
        (motion_id, seat_no, vote, reason),
    ).fetchone()
    return bool(row)


def votes(conn, motion_id: str) -> list[dict]:
    return conn.execute(
        """
        SELECT v.seat_no, v.vote, v.reason, v.voted_at, s.name, s.is_ai
          FROM council_votes v JOIN council_seats s ON s.seat_no = v.seat_no
         WHERE v.motion_id = %s ORDER BY v.seat_no
        """,
        (motion_id,),
    ).fetchall()


def vote_count(conn, motion_id: str) -> int:
    row = conn.execute(
        "SELECT count(*) AS n FROM council_votes WHERE motion_id = %s", (motion_id,)
    ).fetchone()
    return int(row["n"])


def due_motions(conn) -> list[dict]:
    return conn.execute(
        """
        SELECT id, kind, player_id, sector_key, cost, status, closes_at
          FROM council_motions
         WHERE status = 'open' AND closes_at <= now()
         ORDER BY closes_at
         FOR UPDATE
        """
    ).fetchall()


def finish(conn, motion_id: str, status: str, reason: str) -> None:
    conn.execute(
        """
        UPDATE council_motions
           SET status = %s, decided_at = now(), outcome_reason = %s
         WHERE id = %s
        """,
        (status, reason, motion_id),
    )


def recent(conn, player_id: str, limit: int = 12) -> list[dict]:
    return conn.execute(
        """
        SELECT id, kind, player_id, sector_key, cost, status, created_at, closes_at,
               decided_at, outcome_reason
          FROM council_motions
         WHERE player_id = %s OR status <> 'open'
         ORDER BY created_at DESC
         LIMIT %s
        """,
        (player_id, limit),
    ).fetchall()

"""Refresh-token chain. Tokens are ``<session_id>.<secret>`` so lookup is O(1)."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class NewSession:
    id: str
    account_id: str
    player_id: str | None
    refresh_hash: str
    rotated_from: str | None = None
    user_agent: str = ""
    ip: str | None = None


def create(conn, spec: NewSession) -> dict:
    return conn.execute(
        """
        INSERT INTO sessions (id, account_id, player_id, refresh_hash, rotated_from, user_agent, ip, last_used_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, now())
        RETURNING id, account_id, player_id, refresh_hash, rotated_from, revoked_at, created_at
        """,
        (
            spec.id,
            spec.account_id,
            spec.player_id,
            spec.refresh_hash,
            spec.rotated_from,
            (spec.user_agent or "")[:256],
            spec.ip,
        ),
    ).fetchone()


def by_id(conn, session_id: str) -> dict | None:
    return conn.execute(
        """
        SELECT id, account_id, player_id, refresh_hash, rotated_from, user_agent,
               last_used_at, revoked_at, revoke_reason
          FROM sessions WHERE id = %s
        """,
        (session_id,),
    ).fetchone()


def rotate(conn, session_id: str) -> bool:
    """Conditionally revoke an unused session; ``False`` means another tab won."""
    row = conn.execute(
        """
        UPDATE sessions SET revoked_at = now(), revoke_reason = 'rotated', last_used_at = now()
         WHERE id = %s AND revoked_at IS NULL RETURNING id
        """,
        (session_id,),
    ).fetchone()
    return bool(row)


def revoke(conn, session_id: str, reason: str) -> None:
    conn.execute(
        """
        UPDATE sessions SET revoked_at = now(), revoke_reason = %s
         WHERE id = %s AND revoked_at IS NULL
        """,
        (reason, session_id),
    )


def revoke_all(conn, account_id: str, reason: str) -> int:
    rows = conn.execute(
        """
        UPDATE sessions SET revoked_at = now(), revoke_reason = %s
         WHERE account_id = %s AND revoked_at IS NULL
        RETURNING id
        """,
        (reason, account_id),
    ).fetchall()
    return len(rows)


def touch(conn, session_id: str) -> None:
    conn.execute("UPDATE sessions SET last_used_at = now() WHERE id = %s", (session_id,))


def has_rotated_chain(conn, account_id: str) -> bool:
    """A revoked session from this account means the token was already used."""
    row = conn.execute(
        """
        SELECT 1 AS hit FROM sessions
         WHERE account_id = %s AND revoked_at IS NOT NULL AND revoke_reason = 'rotated'
         LIMIT 1
        """,
        (account_id,),
    ).fetchone()
    return bool(row)

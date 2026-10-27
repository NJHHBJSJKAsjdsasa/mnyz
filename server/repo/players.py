"""Player aggregate rows; every write path locks this row first."""

from __future__ import annotations


def create(
    conn,
    *,
    account_id: str,
    universe_id: str,
    display_name: str = "舰长",
    timezone: str = "Asia/Shanghai",
) -> dict:
    return conn.execute(
        """
        INSERT INTO players (account_id, universe_id, display_name, timezone)
        VALUES (%s, %s, %s, %s)
        RETURNING id, account_id, universe_id, slot, display_name, timezone,
                  state_version, last_settled_at, last_seen_at, locked_reason
        """,
        (account_id, universe_id, display_name, timezone),
    ).fetchone()


def get(conn, player_id: str) -> dict | None:
    return conn.execute(
        """
        SELECT id, account_id, universe_id, slot, display_name, timezone,
               state_version, last_settled_at, last_seen_at, locked_reason
          FROM players WHERE id = %s
        """,
        (player_id,),
    ).fetchone()


def lock(conn, player_id: str) -> dict | None:
    return conn.execute(
        """
        SELECT id, account_id, universe_id, slot, display_name, timezone,
               state_version, last_settled_at, last_seen_at, locked_reason
          FROM players WHERE id = %s FOR UPDATE
        """,
        (player_id,),
    ).fetchone()


def by_account(conn, account_id: str, universe_id: str | None = None) -> dict | None:
    if universe_id:
        return conn.execute(
            "SELECT * FROM players WHERE account_id = %s AND universe_id = %s ORDER BY slot LIMIT 1",
            (account_id, universe_id),
        ).fetchone()
    return conn.execute(
        "SELECT * FROM players WHERE account_id = %s ORDER BY created_at LIMIT 1", (account_id,)
    ).fetchone()


def bump_state(conn, player_id: str) -> int:
    row = conn.execute(
        "UPDATE players SET state_version = state_version + 1, last_seen_at = now() WHERE id = %s RETURNING state_version",
        (player_id,),
    ).fetchone()
    return int(row["state_version"])


def touch(conn, player_id: str) -> None:
    conn.execute("UPDATE players SET last_seen_at = now() WHERE id = %s", (player_id,))


def set_settled(conn, player_id: str, at) -> None:
    conn.execute("UPDATE players SET last_settled_at = %s WHERE id = %s", (at, player_id))


def leaderboard(conn, universe_id, limit: int = 50) -> list[dict]:
    rows = conn.execute(
        """
        SELECT p.id, p.display_name, s.level AS ship_level,
               COALESCE(w.balance, 0) AS antimatter
          FROM players p
          JOIN ships s ON s.player_id = p.id AND s.is_flagship
          LEFT JOIN wallets w ON w.player_id = p.id AND w.resource_code = 'antimatter'
         WHERE p.universe_id = %s
         ORDER BY s.level DESC, COALESCE(w.balance, 0) DESC
         LIMIT %s
        """,
        (universe_id, limit),
    ).fetchall()
    return [
        {
            "player_id": str(row["id"]),
            "name": row["display_name"],
            "ship_level": int(row["ship_level"]),
            "antimatter": int(row["antimatter"]),
        }
        for row in rows
    ]


def identity(conn, player_id: str) -> dict | None:
    """Player plus the account fields needed to validate a token."""
    return conn.execute(
        """
        SELECT p.id, p.account_id, p.universe_id, p.slot, p.display_name, p.timezone,
               p.state_version, p.last_settled_at, p.last_seen_at, p.locked_reason,
               a.status AS account_status, a.role AS account_role,
               a.token_version, a.locked_until
          FROM players p JOIN accounts a ON a.id = p.account_id
         WHERE p.id = %s
        """,
        (player_id,),
    ).fetchone()

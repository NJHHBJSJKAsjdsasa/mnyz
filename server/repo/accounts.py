"""Account rows. Password hashing happens in the domain layer."""

from __future__ import annotations

_COLUMNS = (
    "id, email, password_hash, email_verified_at, status, role, failed_logins, "
    "locked_until, token_version, created_at, updated_at"
)


def create(
    conn,
    *,
    email: str | None,
    password_hash: str | None,
    status: str = "guest",
    role: str = "player",
) -> dict:
    return conn.execute(
        f"""
        INSERT INTO accounts (email, password_hash, status, role)
        VALUES (%s, %s, %s, %s)
        RETURNING {_COLUMNS}
        """,
        (email, password_hash, status, role),
    ).fetchone()


def by_email(conn, email: str) -> dict | None:
    return conn.execute(f"SELECT {_COLUMNS} FROM accounts WHERE email = %s", (email,)).fetchone()


def by_id(conn, account_id: str) -> dict | None:
    return conn.execute(f"SELECT {_COLUMNS} FROM accounts WHERE id = %s", (account_id,)).fetchone()


def set_password(conn, account_id: str, password_hash: str) -> None:
    conn.execute(
        """
        UPDATE accounts
           SET password_hash = %s, token_version = token_version + 1, updated_at = now()
         WHERE id = %s
        """,
        (password_hash, account_id),
    )


def bump_token_version(conn, account_id: str) -> None:
    conn.execute(
        "UPDATE accounts SET token_version = token_version + 1, updated_at = now() WHERE id = %s",
        (account_id,),
    )


def record_failure(conn, account_id: str, *, threshold: int = 5, lock_seconds: int = 900) -> dict:
    row = conn.execute(
        """
        UPDATE accounts
           SET failed_logins = failed_logins + 1,
               locked_until = CASE WHEN failed_logins + 1 >= %s THEN now() + make_interval(secs => %s)
                                   ELSE locked_until END,
               updated_at = now()
         WHERE id = %s
        RETURNING failed_logins, locked_until
        """,
        (threshold, lock_seconds, account_id),
    ).fetchone()
    return row


def reset_failures(conn, account_id: str) -> None:
    conn.execute(
        "UPDATE accounts SET failed_logins = 0, locked_until = NULL, updated_at = now() WHERE id = %s",
        (account_id,),
    )


def set_status(conn, account_id: str, status: str) -> None:
    conn.execute(
        "UPDATE accounts SET status = %s, updated_at = now() WHERE id = %s", (status, account_id)
    )


def bind_device(conn, device_hash: str, account_id: str, player_id: str) -> None:
    conn.execute(
        """
        INSERT INTO guest_devices (device_hash, account_id, player_id)
        VALUES (%s, %s, %s)
        ON CONFLICT (device_hash) DO NOTHING
        """,
        (device_hash, account_id, player_id),
    )


def by_device(conn, device_hash: str) -> dict | None:
    return conn.execute(
        """
        SELECT p.id AS player_id, p.display_name, p.timezone, p.state_version,
               p.account_id, a.status, a.token_version
          FROM guest_devices d
          JOIN players p ON p.id = d.player_id
          JOIN accounts a ON a.id = d.account_id
         WHERE d.device_hash = %s
        """,
        (device_hash,),
    ).fetchone()

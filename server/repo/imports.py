"""One-time local-save import records."""

from __future__ import annotations

import json


def claim(conn, player_id: str, account_id: str, payload_hash: str, keys_count: int) -> bool:
    row = conn.execute(
        """
        INSERT INTO local_save_imports (player_id, account_id, payload_hash, keys_count)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (player_id) DO NOTHING
        RETURNING player_id
        """,
        (player_id, account_id, payload_hash, keys_count),
    ).fetchone()
    return bool(row)


def finish(conn, player_id: str, imported: dict) -> None:
    conn.execute(
        "UPDATE local_save_imports SET imported = %s::jsonb WHERE player_id = %s",
        (json.dumps(imported, ensure_ascii=False), player_id),
    )


def get(conn, player_id: str) -> dict | None:
    return conn.execute(
        "SELECT payload_hash, keys_count, imported, created_at FROM local_save_imports WHERE player_id = %s",
        (player_id,),
    ).fetchone()

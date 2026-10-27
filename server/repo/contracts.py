"""Daily contracts: generation snapshots, acceptance, progress and claims."""

from __future__ import annotations

import json


def for_day(conn, player_id: str, game_day) -> list[dict]:
    return conn.execute(
        """
        SELECT id, template_code, metric, target, progress, status, taken_by,
               target_distance, reward_multiplier, reward, accepted_at, expires_at,
               game_day
          FROM contracts WHERE player_id = %s AND game_day = %s
         ORDER BY id
        """,
        (player_id, game_day),
    ).fetchall()


def templates(conn) -> dict[str, dict]:
    rows = conn.execute(
        "SELECT code, name, metric, requires_module, reward_formula FROM contract_templates"
    ).fetchall()
    return {
        row["code"]: {
            "code": row["code"],
            "name": row["name"],
            "metric": row["metric"],
            "requires_module": row["requires_module"],
            "reward_formula": row["reward_formula"],
        }
        for row in rows
    }


def insert_many(conn, player_id: str, game_day, rows: list[dict]) -> None:
    for row in rows:
        conn.execute(
            """
            INSERT INTO contracts
                   (player_id, id, template_code, metric, target, progress, status,
                    game_day, reward, target_distance, reward_multiplier, taken_by)
            VALUES (%s, %s, %s, %s, %s, 0, 'open', %s, %s::jsonb, %s, 1, %s)
            ON CONFLICT (player_id, id) DO NOTHING
            """,
            (
                player_id,
                row["id"],
                row["template_code"],
                row["metric"],
                row["target"],
                game_day,
                json.dumps(row["reward"], sort_keys=True),
                row.get("target_distance", 0),
                row.get("taken_by"),
            ),
        )


def get(conn, player_id: str, contract_id: str, for_update: bool = False) -> dict | None:
    suffix = " FOR UPDATE" if for_update else ""
    return conn.execute(
        f"""
        SELECT id, template_code, metric, target, progress, status, taken_by,
               target_distance, reward_multiplier, reward, accepted_at, expires_at,
               game_day
          FROM contracts WHERE player_id = %s AND id = %s{suffix}
        """,
        (player_id, contract_id),
    ).fetchone()


def accept(conn, player_id: str, contract_id: str) -> dict | None:
    return conn.execute(
        """
        UPDATE contracts
           SET status = 'accepted', accepted_at = now(),
               expires_at = now() + interval '12 hours'
         WHERE player_id = %s AND id = %s AND status = 'open' AND taken_by IS NULL
        RETURNING id, expires_at
        """,
        (player_id, contract_id),
    ).fetchone()


def claim(conn, player_id: str, contract_id: str) -> dict | None:
    return conn.execute(
        """
        UPDATE contracts SET status = 'claimed'
         WHERE player_id = %s AND id = %s AND status = 'accepted'
        RETURNING id, template_code, reward
        """,
        (player_id, contract_id),
    ).fetchone()


def advance(conn, player_id: str, metrics: list[str]) -> dict | None:
    """Advance at most one accepted contract matching any of ``metrics``."""
    return conn.execute(
        """
        UPDATE contracts
           SET progress = LEAST(target, progress + 1)
         WHERE (player_id, id) = (
             SELECT player_id, id FROM contracts
              WHERE player_id = %s AND status = 'accepted'
                AND metric = ANY(%s) AND expires_at > now() AND progress < target
              ORDER BY accepted_at
              LIMIT 1
              FOR UPDATE
         )
        RETURNING id, metric, progress, target
        """,
        (player_id, metrics),
    ).fetchone()


def expire(conn) -> int:
    rows = conn.execute(
        """
        UPDATE contracts SET status = 'expired'
         WHERE status = 'accepted' AND expires_at <= now()
        RETURNING id
        """
    ).fetchall()
    return len(rows)

"""Daily task definitions and per-player rows."""

from __future__ import annotations


def ensure_day(conn, player_id: str, game_day) -> None:
    conn.execute(
        """
        INSERT INTO player_tasks (player_id, task_code, game_day, target)
        SELECT %s, code, %s, target FROM task_definitions
        ON CONFLICT (player_id, task_code, game_day) DO NOTHING
        """,
        (player_id, game_day),
    )


def list_for(conn, player_id: str, game_day) -> list[dict]:
    return conn.execute(
        """
        SELECT d.code, d.title, d.description, d.metric, d.target, d.reward,
               p.progress, p.status
          FROM task_definitions d
          JOIN player_tasks p
            ON p.task_code = d.code AND p.player_id = %s AND p.game_day = %s
         ORDER BY d.sort, d.code
        """,
        (player_id, game_day),
    ).fetchall()


def advance(conn, player_id: str, game_day, metric: str, amount: int) -> int:
    if amount <= 0:
        return 0
    rows = conn.execute(
        """
        UPDATE player_tasks p
           SET progress = LEAST(p.target, p.progress + %s), updated_at = now()
          FROM task_definitions d
         WHERE p.player_id = %s AND p.game_day = %s AND p.status = 'open'
           AND d.code = p.task_code AND d.metric = %s
        RETURNING p.task_code
        """,
        (amount, player_id, game_day, metric),
    ).fetchall()
    return len(rows)


def claim(conn, player_id: str, game_day, code: str) -> dict | None:
    return conn.execute(
        """
        UPDATE player_tasks p
           SET status = 'claimed', updated_at = now()
          FROM task_definitions d
         WHERE p.player_id = %s AND p.game_day = %s AND p.task_code = %s
           AND d.code = p.task_code AND p.status = 'open' AND p.progress >= p.target
        RETURNING d.reward, d.title
        """,
        (player_id, game_day, code),
    ).fetchone()

"""Daily tasks: ensure today's rows, advance progress and claim rewards."""

from __future__ import annotations

from ..infra.errors import AlreadyClaimed, Unprocessable
from ..repo import calendar as calendar_repo
from ..repo import outbox as outbox_repo
from ..repo import players as player_repo
from ..repo import tasks as task_repo
from ..repo import wallets as wallet_repo
from .ledger import TxRef, post_transaction


def list_today(conn, player: dict) -> list[dict]:
    day = calendar_repo.game_day(conn, player["timezone"])
    task_repo.ensure_day(conn, player["id"], day)
    return [
        {
            "code": row["code"],
            "title": row["title"],
            "description": row["description"],
            "metric": row["metric"],
            "target": int(row["target"]),
            "progress": int(row["progress"]),
            "status": row["status"],
            "reward": row["reward"],
        }
        for row in task_repo.list_for(conn, player["id"], day)
    ]


def advance(conn, player: dict, metric: str, amount: int) -> None:
    day = calendar_repo.game_day(conn, player["timezone"])
    task_repo.ensure_day(conn, player["id"], day)
    task_repo.advance(conn, player["id"], day, metric, amount)


def claim(conn, player: dict, code: str) -> dict:
    day = calendar_repo.game_day(conn, player["timezone"])
    row = task_repo.claim(conn, player["id"], day, code)
    if row is None:
        current = {item["code"]: item for item in list_today(conn, player)}.get(code)
        if current and current["status"] == "claimed":
            raise AlreadyClaimed("该任务奖励已领取")
        raise Unprocessable("任务尚未完成")
    reward = {key: int(value) for key, value in (row["reward"] or {}).items()}
    tx = post_transaction(
        conn, player["id"], reward, TxRef("task_reward", "task", code)
    )
    version = player_repo.bump_state(conn, player["id"])
    outbox_repo.add(
        conn,
        aggregate_type="player",
        aggregate_id=player["id"],
        event_type="task.claimed",
        payload={"code": code},
    )
    balances = wallet_repo.balances(conn, player["id"])
    return {
        "code": code,
        "title": row["title"],
        "reward": reward,
        "balances": {key: int(balances.get(key, 0)) for key in reward},
        "tx_id": tx["id"],
        "state_version": version,
    }

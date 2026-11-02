"""Weekly goals: derived progress, one claimable reward (I1).

The goal is a *view*, not a counter. Every metric already exists server-side:

    planets  = codex planet entries (one per distinct planet type visited)
    modules  = sum of flagship module levels (overclock does not count)
    codex    = planets + elements + lifeforms

Targets scale with how long the player has been around (``base + step × weeks``),
which is why ``accounts.created_at`` is the clock anchor rather than "weeks since
the server started" — otherwise a day-one player would face week-40 targets.

Only the claim is stored (``weekly_claims``): progress can be recomputed at any
time, a paid reward cannot be un-paid.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from ..infra.clock import now
from ..infra.errors import AlreadyClaimed, Unprocessable
from ..repo import players as player_repo
from ..repo import ships as ship_repo
from .ledger import TxRef, balances_after, post_transaction

#: ``(metric, title, base target, extra per elapsed week)``
TASKS = (
    ("planets", "探索行星（累计）", 30, 8),
    ("modules", "改装总等级（累计）", 15, 5),
    ("codex", "图鉴条目（累计）", 10, 4),
)

REWARD: dict[str, Decimal] = {
    "exoticCrystal": Decimal(40),
    "nebulaDust": Decimal(30),
    "ancientRelic": Decimal(3),
    "dimensionalShard": Decimal(1),
}


def week_key(moment: datetime | None = None) -> str:
    """ISO-8601 week (``2026-W44``), UTC-based so it cannot differ per device."""
    moment = (moment or now()).astimezone(timezone.utc)
    iso = moment.isocalendar()
    return f"{iso.year}-W{iso.week:02d}"


def snapshot(conn, player: dict) -> dict:
    key = week_key()
    counts = ship_repo.codex_counts(conn, player["id"])
    modules = ship_repo.modules(conn, player["id"])
    progress = {
        "planets": int(counts["planet"]),
        "modules": sum(int(row["level"]) for row in modules.values()),
        "codex": int(counts["planet"]) + int(counts["element"]) + int(counts["lifeform"]),
    }
    weeks = _weeks_played(conn, player["id"])

    tasks = []
    for metric, title, base, step in TASKS:
        target = base + step * (weeks - 1)
        current = progress[metric]
        tasks.append(
            {
                "id": metric,
                "title": title,
                "current": current,
                "target": target,
                "done": current >= target,
            }
        )

    claimed = conn.execute(
        "SELECT 1 FROM weekly_claims WHERE player_id = %s AND week_key = %s",
        (player["id"], key),
    ).fetchone() is not None

    return {
        "week_key": key,
        "weeks_played": weeks,
        "tasks": tasks,
        "all_done": all(task["done"] for task in tasks),
        "claimed": claimed,
        "reward": {code: str(amount) for code, amount in REWARD.items()},
        "days_left": _days_left(),
    }


def claim(conn, player: dict) -> dict:
    locked = player_repo.lock(conn, player["id"])
    if locked is None:
        raise Unprocessable("玩家不存在")

    current = snapshot(conn, locked)
    if current["claimed"]:
        raise AlreadyClaimed("本周奖励已领取")
    if not current["all_done"]:
        pending = [task["id"] for task in current["tasks"] if not task["done"]]
        raise Unprocessable(f"目标未完成：{', '.join(pending)}")

    tx = post_transaction(
        conn,
        locked["id"],
        dict(REWARD),
        TxRef(kind="weekly_reward", ref_type="weekly", ref_id=current["week_key"]),
    )
    conn.execute(
        "INSERT INTO weekly_claims (player_id, week_key, tx_id) VALUES (%s, %s, %s)",
        (locked["id"], current["week_key"], tx["id"]),
    )
    version = player_repo.bump_state(conn, locked["id"])
    return {
        "week_key": current["week_key"],
        "gained": {code: str(amount) for code, amount in REWARD.items()},
        "balances": {code: str(value) for code, value in balances_after(tx["entries"], locked["id"]).items()},
        "tx_id": tx["id"],
        "state_version": version,
    }


# ----------------------------------------------------------------- internals


def _weeks_played(conn, player_id: str) -> int:
    row = conn.execute(
        "SELECT a.created_at FROM accounts a JOIN players p ON p.account_id = a.id WHERE p.id = %s",
        (player_id,),
    ).fetchone()
    if row is None or row["created_at"] is None:
        return 1
    days = max(0, (now() - row["created_at"]).days)
    return max(1, days // 7 + 1)


def _days_left() -> int:
    today = now().astimezone(timezone.utc).date()
    # ISO week: Monday = 0 … Sunday = 6, so the week ends on Sunday.
    return max(0, 6 - today.weekday())

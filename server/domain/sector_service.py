"""Sector license purchase: one-off antimatter fee, 20% gathering/scan bonus."""

from __future__ import annotations

import re

from ..infra.errors import AlreadyClaimed, InvalidArgument
from ..repo import outbox as outbox_repo
from ..repo import players as player_repo
from ..repo import sectors as sector_repo
from ..repo import wallets as wallet_repo
from . import task_service
from .ledger import TxRef, post_transaction

BASE_COST = 400
COST_STEP = 120
_SECTOR_KEY = re.compile(r"^([0-9])-([0-9])-([0-9])$")


def quote(conn, player: dict, sector_key: str) -> dict:
    if not _SECTOR_KEY.match(sector_key):
        raise InvalidArgument("星区键格式应为 x-y-z，各轴 0..9")
    if sector_repo.is_unlocked(conn, player["id"], sector_key):
        raise AlreadyClaimed("该星区已解锁")
    count = sector_repo.count(conn, player["id"])
    # No license cap: the universe has 10x10x10 sectors and every further
    # license simply costs more antimatter.
    return {"count": count, "cost": BASE_COST + count * COST_STEP}


def unlock(conn, player: dict, sector_key: str) -> dict:
    quoted = quote(conn, player, sector_key)
    count = int(quoted["count"])
    cost = int(quoted["cost"])
    tx = post_transaction(
        conn,
        player["id"],
        {"antimatter": -cost},
        TxRef(kind="sector_unlock", ref_type="sector", ref_id=sector_key),
    )
    if not sector_repo.insert(conn, player["id"], sector_key):
        raise AlreadyClaimed("该星区已解锁")
    task_service.advance(conn, player, "galaxiesVisited", 1)
    version = player_repo.bump_state(conn, player["id"])
    outbox_repo.add(
        conn,
        aggregate_type="player",
        aggregate_id=player["id"],
        event_type="sector.unlocked",
        payload={"sector_key": sector_key, "cost": cost},
    )
    balances = wallet_repo.balances(conn, player["id"])
    return {
        "sector_key": sector_key,
        "unlocked": count + 1,
        "cost": cost,
        "balances": {"antimatter": int(balances.get("antimatter", 0))},
        "tx_id": tx["id"],
        "state_version": version,
    }

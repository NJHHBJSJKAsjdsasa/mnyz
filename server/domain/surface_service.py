"""Surface sample transaction: daily quota → yield → ledger."""

from __future__ import annotations

from ..infra.errors import DailyLimit
from ..repo import calendar as calendar_repo
from ..repo import outbox as outbox_repo
from ..repo import players as player_repo
from ..repo import surface as surface_repo
from ..repo import wallets as wallet_repo
from . import planet as planet_domain
from .ledger import TxRef, post_transaction
from .surface import DAILY_SAMPLES, cell_value, sample_yield


def sample(conn, player: dict, planet_key: str, cell: int) -> dict:
    planet = planet_domain.resolve_planet(conn, player, planet_key)
    day = calendar_repo.game_day(conn, player["timezone"])
    used = surface_repo.use(conn, player["id"], planet_key, day)
    if used is None:
        raise DailyLimit("这颗行星今天已经取样 3 次")

    yields = sample_yield(planet_key, cell)
    tx = post_transaction(
        conn,
        player["id"],
        yields,
        TxRef(kind="surface_sample", ref_type="planet", ref_id=planet_key.lower()),
    )
    version = player_repo.bump_state(conn, player["id"])
    outbox_repo.add(
        conn,
        aggregate_type="player",
        aggregate_id=player["id"],
        event_type="planet.sampled",
        payload={"planet_key": planet_key, "cell": cell, "yield": yields},
    )
    balances = wallet_repo.balances(conn, player["id"])
    return {
        "yield": yields,
        "value": round(cell_value(planet_key, cell), 4),
        "remaining": DAILY_SAMPLES - used,
        "planet": planet_domain.public_payload(planet),
        "balances": {code: int(balances.get(code, 0)) for code in yields},
        "tx_id": tx["id"],
        "state_version": version,
    }

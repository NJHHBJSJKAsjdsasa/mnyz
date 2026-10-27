"""Collection transaction: settle → cooldown → compute → ledger → history.

The client only sends an intent (planet key + coordinates); every number that
ends up in the wallet is produced here (docs/server/09 §2).
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from ..infra.clock import ms_until
from ..infra.errors import ApiError, InvalidArgument, PlayerLocked
from ..repo import calendar as calendar_repo
from ..repo import collections as collection_repo
from ..repo import outbox as outbox_repo
from ..repo import players as player_repo
from ..repo import reference as reference_repo
from ..repo import ships as ship_repo
from ..repo import universes as universe_repo
from . import colony_service, contract_service, cooldown, planet as planet_domain, task_service
from .gathering import CollectContext, compute
from .ledger import TxRef, balances_after, post_transaction
from .rival import is_marked
from .sector import coordinates_from_key, sector_of
from .settlement import settle_offline
from .ship import stats


@dataclass(frozen=True)
class CollectIntent:
    planet_key: str
    coordinates: str


def collect(conn, player: dict, intent: CollectIntent, config: dict) -> dict:
    if coordinates_from_key(intent.planet_key) != intent.coordinates:
        raise InvalidArgument("coordinates 与 planet_key 不一致")

    settle_offline(conn, player["id"])
    locked = player_repo.lock(conn, player["id"])
    if locked is None:
        raise InvalidArgument("玩家不存在")
    if locked.get("locked_reason"):
        raise PlayerLocked(f"玩家已被冻结：{locked['locked_reason']}")

    planet = _resolve_planet(conn, locked, intent.planet_key)
    seconds = int(config.get("collect_cooldown_seconds", 900))
    ready_at = cooldown.claim(conn, locked["id"], f"collect:{intent.planet_key}", seconds)
    before = collection_repo.count_for(conn, locked["id"], intent.planet_key)
    ship_stats = stats(_ship_level(conn, locked["id"]))
    context = _context(conn, locked, intent, planet)
    result = compute(context, before, int(ship_stats["storage"]))

    deltas = {code: Decimal(amount) for code, amount in result.gains.items() if amount > 0}
    tx = post_transaction(
        conn,
        locked["id"],
        deltas,
        TxRef(kind="collect", ref_type="planet", ref_id=intent.planet_key),
    )
    collection_repo.insert(conn, locked["id"], intent.planet_key, tx["id"], result.gains)
    colony_service.add_collect_deposits(conn, locked["id"], intent.planet_key, result.gains)
    contract_service.advance(conn, locked["id"], ["collections"])
    task_service.advance(conn, locked, "antimatterCollected", int(result.gains.get("antimatter", 0)))
    task_service.advance(conn, locked, "planetsDiscovered", 1)
    version = player_repo.bump_state(conn, locked["id"])
    outbox_repo.add(
        conn,
        aggregate_type="player",
        aggregate_id=locked["id"],
        event_type="planet.collected",
        payload={"planet_key": intent.planet_key, "gained": result.gains, "tx_id": tx["id"]},
    )
    return {
        "gained": result.gains,
        "diminishing": round(result.diminishing, 4),
        "factors": {name: round(value, 4) for name, value in result.factors.items()},
        "planet": planet_domain.public_payload(planet),
        "cooldown": {"ready_in_ms": ms_until(ready_at)},
        "balances": {code: int(value) for code, value in balances_after(tx["entries"], locked["id"]).items()},
        "tx_id": tx["id"],
        "state_version": version,
    }


def _resolve_planet(conn, player: dict, planet_key: str) -> dict | None:
    try:
        return planet_domain.resolve_planet(conn, player, planet_key)
    except ApiError:
        # Old/renamed keys still collect with the coordinate fallback; the
        # response says which source was used.
        return None





def _ship_level(conn, player_id: str) -> int:
    ship = ship_repo.flagship(conn, player_id)
    return int(ship["level"]) if ship else 1


def _context(conn, player: dict, intent: CollectIntent, planet: dict | None) -> CollectContext:
    universe = universe_repo.by_id(conn, player["universe_id"])
    modules = ship_repo.modules(conn, player["id"])
    coil = modules.get("warpCoil", {"level": 0, "overclock": 0})
    flags = ship_repo.flags(conn, player["id"]) or {"hull": 100}
    sectors = ship_repo.sectors(conn, player["id"])
    tech = ship_repo.tech_levels(conn, player["id"])
    day = calendar_repo.game_day(conn, player["timezone"])
    week = calendar_repo.week_key(conn, player["timezone"])
    marked = is_marked(intent.planet_key, int(universe["seed"]) if universe else 0, week)
    return CollectContext(
        planet_key=intent.planet_key,
        coordinates=intent.coordinates,
        game_day=day.isoformat(),
        ship_level=_ship_level(conn, player["id"]),
        module_level=int(coil["level"]),
        module_overclock=int(coil["overclock"]),
        hull=int(flags["hull"]),
        sector_licensed=sector_of(intent.coordinates)["key"] in sectors,
        tech_mining_level=int(tech.get("mining", 0)),
        ally_size=ship_repo.alliance_size(conn, player["id"]),
        rival_marked=marked,
        base_resources=planet["resources"] if planet else None,
    )


def config_for(conn) -> dict:
    return reference_repo.game_config(conn)

"""Server-authoritative navigation: price here, debit there (11 §4.1).

Why this module exists
----------------------
Navigation used to be the last economic decision made in the browser: the page
computed the distance, multiplied by hull and tech, floored the three fuel
resources and wrote them back to localStorage. Client-side state is not
authority (docs/server/09 §2), so the same jump could be paid for with an edited
wallet, or not paid for at all.

Two-step protocol, on purpose
-----------------------------
``quote`` is free and repeatable: it prices a jump, stores the number and returns
a ``quote_id`` valid for 30 s. ``commit`` spends it exactly once. Splitting them
keeps the confirm dialog honest — the price the player sees is the price the
ledger charges, even if they sit on the dialog for a while (the TTL bounds that
window instead of letting a stale preview drift).

The fuel formula mirrors the 2.x client so a player cannot tell which side
computed it. The one deliberate difference: cosmic events no longer move the
price. ``CosmicEvents`` derives its multiplier from the local universe seed and
a six-hour window; the server has no equivalent table yet, so rather than invent
a second source of truth the event factor is applied only to the *displayed*
preview until a server-side event feed exists (see TASK-BACKLOG T-01).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal
from uuid import uuid4

from ..infra.clock import iso, now
from ..infra.errors import InvalidArgument, NotFound, PlayerLocked, QuoteExpired
from ..repo import players as player_repo
from ..repo import ships as ship_repo
from ..repo import travel as travel_repo
from ..repo import wallets as wallet_repo
from . import events
from .ledger import TxRef, balances_after, post_transaction
from .ship import stats

QUOTE_TTL_SECONDS = 30

#: Raw coordinate ceiling; the same bound the explore models enforce.
MAX_COORDINATE = 10_000_000

KINDS = ("galaxy", "system", "planet")

#: Fuel per unit of "distance class", before hull / tech / efficiency.
BASE_COST = {
    "galaxy": {"antimatter": 25, "element115": 20, "deuterium": 15},
    "system": {"antimatter": 8, "element115": 6, "deuterium": 10},
    "planet": {"antimatter": 2, "element115": 1, "deuterium": 3},
}

#: Long jumps are priced by raw distance, not by the short-hop base table.
LONG_JUMP_DISTANCE = 1000


@dataclass(frozen=True)
class TravelIntent:
    kind: str
    origin: tuple[int, int, int]
    target: tuple[int, int, int]


def quote(conn, player: dict, intent: TravelIntent) -> dict:
    if intent.kind not in KINDS:
        raise InvalidArgument("kind 必须是 galaxy / system / planet")
    _check_coordinates(intent.origin)
    _check_coordinates(intent.target)

    locked = _lock(conn, player)
    distance = _distance(intent.origin, intent.target)
    if distance <= 0:
        raise InvalidArgument("起点与终点相同")

    cost = _fuel_cost(conn, locked, intent.kind, distance)
    balances = wallet_repo.balances(conn, locked["id"])
    affordable = all(balances.get(code, Decimal(0)) >= amount for code, amount in cost.items())
    quoted = {code: str(amount) for code, amount in cost.items()}
    ship_stats = _ship_stats(conn, locked["id"])

    expires_at = now() + timedelta(seconds=QUOTE_TTL_SECONDS)
    quote_id = str(uuid4())
    travel_repo.insert_quote(
        conn,
        {
            "id": quote_id,
            "player_id": locked["id"],
            "kind": intent.kind,
            "from": intent.origin,
            "to": intent.target,
            "distance": Decimal(str(distance)),
            "cost": quoted,
            "affordable": affordable,
            "eta_seconds": _eta_seconds(distance, ship_stats),
            "expires_at": expires_at,
        },
    )
    return {
        "quote_id": quote_id,
        "kind": intent.kind,
        "distance": round(distance, 2),
        "cost": quoted,
        "affordable": affordable,
        "shortfall": {
            code: str(amount - balances.get(code, Decimal(0)))
            for code, amount in cost.items()
            if balances.get(code, Decimal(0)) < amount
        },
        "eta_seconds": _eta_seconds(distance, ship_stats),
        "expires_at": iso(expires_at),
        "expires_in_ms": QUOTE_TTL_SECONDS * 1000,
        "range": int(ship_stats["range"]),
        "in_range": distance <= float(ship_stats["range"]),
    }


def commit(conn, player: dict, quote_id: str) -> dict:
    locked = _lock(conn, player)
    row = travel_repo.lock_quote(conn, quote_id)
    if row is None or str(row["player_id"]) != str(locked["id"]):
        raise NotFound("报价不存在")

    # Replay: the same quote can never spend twice, but the caller still gets a
    # usable answer instead of an error (network retries must be harmless).
    if row["consumed_at"] is not None:
        existing = travel_repo.travel_of_quote(conn, quote_id)
        if existing is not None:
            return _payload(
                conn,
                locked["id"],
                existing,
                replayed=True,
                entries=[],
                state_version=int(locked["state_version"]),
            )
        raise QuoteExpired("该报价已被使用")

    if row["expires_at"] <= now():
        raise QuoteExpired("报价已过期，请重新报价")

    cost = {code: Decimal(str(amount)) for code, amount in (row["cost"] or {}).items()}
    distance = float(row["distance"])
    if distance > float(_ship_stats(conn, locked["id"])["range"]):
        raise InvalidArgument("超出当前航程，请先升级飞船")

    travel_id = str(uuid4())
    tx = post_transaction(
        conn,
        locked["id"],
        {code: -amount for code, amount in cost.items() if amount > 0},
        TxRef(kind="travel", ref_type="travel", ref_id=travel_id),
    )
    ship = ship_repo.flagship(conn, locked["id"])
    depart = now()
    row_log = travel_repo.insert_log(
        conn,
        {
            "id": travel_id,
            "player_id": locked["id"],
            "quote_id": quote_id,
            "ship_id": str(ship["id"]) if ship else None,
            "kind": row["kind"],
            "from": (int(row["from_x"]), int(row["from_y"]), int(row["from_z"])),
            "to": (int(row["to_x"]), int(row["to_y"]), int(row["to_z"])),
            "distance": row["distance"],
            "cost": {code: str(amount) for code, amount in cost.items()},
            "arrive_at": depart + timedelta(seconds=_eta_seconds(distance, _ship_stats(conn, locked["id"]))),
            "tx_id": tx["id"],
        },
    )
    travel_repo.consume_quote(conn, quote_id, travel_id)
    version = player_repo.bump_state(conn, locked["id"])
    # `insert_log` returns the travel_log row, which has no destination columns —
    # the coordinates live on the quote. Carry them across so `_payload` can report
    # the destination the player actually paid for.
    row_log = {**row_log, "to_x": row["to_x"], "to_y": row["to_y"], "to_z": row["to_z"]}
    events.publish(
        conn,
        type="travel.committed",
        aggregate=locked["id"],
        payload={
            "travel_id": travel_id,
            "kind": row["kind"],
            "distance": distance,
            "cost": {code: str(amount) for code, amount in cost.items()},
            "tx_id": tx["id"],
        },
    )
    return _payload(
        conn,
        locked["id"],
        row_log,
        replayed=False,
        entries=tx["entries"],
        state_version=version,
    )


def in_flight(conn, player_id: str) -> list[dict]:
    """Snapshot for ``GET /state``; arrival is recorded, not enforced."""
    return [
        {
            "travel_id": str(row["id"]),
            "kind": row["kind"],
            "from": {"x": int(row["from_x"]), "y": int(row["from_y"]), "z": int(row["from_z"])},
            "to": {"x": int(row["to_x"]), "y": int(row["to_y"]), "z": int(row["to_z"])},
            "distance": float(row["distance"]),
            "depart_at": iso(row["depart_at"]),
            "arrive_at": iso(row["arrive_at"]),
        }
        for row in travel_repo.in_flight(conn, player_id)
    ]


def recent(conn, player_id: str, limit: int = 20) -> dict:
    rows = travel_repo.recent(conn, player_id, limit)
    return {
        "travels": [
            {
                "travel_id": str(row["id"]),
                "kind": row["kind"],
                "distance": float(row["distance"]),
                "cost": row["cost"],
                "status": row["status"],
                "depart_at": iso(row["depart_at"]),
                "arrive_at": iso(row["arrive_at"]),
            }
            for row in rows
        ]
    }


# ----------------------------------------------------------------- internals


def _lock(conn, player: dict) -> dict:
    locked = player_repo.lock(conn, player["id"])
    if locked is None:
        raise InvalidArgument("玩家不存在")
    if locked.get("locked_reason"):
        raise PlayerLocked(f"玩家已被冻结：{locked['locked_reason']}")
    return locked


def _check_coordinates(point: tuple[int, int, int]) -> None:
    for value in point:
        if not 0 <= int(value) <= MAX_COORDINATE:
            raise InvalidArgument("坐标超出范围")


def _distance(origin: tuple[int, int, int], target: tuple[int, int, int]) -> float:
    return math.dist([int(v) for v in origin], [int(v) for v in target])


def _fuel_cost(conn, player: dict, kind: str, distance: float) -> dict[str, Decimal]:
    """Quoted fuel as Decimals — the ledger charges exactly these, to the unit."""
    hull = _hull(conn, player["id"])
    hull_factor = 1.5 - 0.005 * hull  # 1.0 pristine → 1.5 crippled
    tech = _travel_tech(conn, player["id"])
    tech_factor = 1 - min(0.2, 0.03 * tech)
    factor = hull_factor * tech_factor
    efficiency = float(_ship_stats(conn, player["id"])["efficiency"])

    if kind == "galaxy" and distance >= LONG_JUMP_DISTANCE:
        raw = {
            "antimatter": max(20, round((distance / 15000) * factor)),
            "element115": max(10, round((distance / 30000) * factor)),
            "deuterium": max(15, round((distance / 22000) * factor)),
        }
    else:
        multiplier = max(1.0, distance / 100)
        raw = {
            code: math.floor(base * multiplier * factor)
            for code, base in BASE_COST[kind].items()
        }

    return {
        code: Decimal(max(0, math.floor(amount / efficiency)))
        for code, amount in raw.items()
    }


def _eta_seconds(distance: float, ship_stats: dict) -> int:
    speed = max(1.0, 400.0 * float(ship_stats["efficiency"]))
    return max(1, int(math.ceil(distance / speed)))


def _hull(conn, player_id: str) -> int:
    flags = ship_repo.flags(conn, player_id) or {"hull": 100}
    return int(flags["hull"])


def _travel_tech(conn, player_id: str) -> int:
    return int(ship_repo.tech_levels(conn, player_id).get("travel", 0))


def _ship_stats(conn, player_id: str) -> dict:
    ship = ship_repo.flagship(conn, player_id)
    return stats(int(ship["level"]) if ship else 1)


def _payload(conn, player_id: str, row: dict, *, replayed: bool, entries: list, state_version: int | None = None) -> dict:
    balances = balances_after(entries, player_id) if entries else wallet_repo.balances(conn, player_id)
    payload = {
        "travel_id": str(row["id"]),
        "status": row["status"],
        # The destination as the server charged for it. The client used to keep its
        # own copy of what it had asked for; if the two ever drifted (a replayed
        # commit, a retried request) the page would navigate somewhere other than
        # what was paid for. This is also what a `/navigate` ticket must be checked
        # against (T-01b).
        "destination": {"x": int(row["to_x"]), "y": int(row["to_y"]), "z": int(row["to_z"])},
        "depart_at": iso(row["depart_at"]),
        "arrived_at": iso(row["arrive_at"]),
        "cost": row["cost"] or {},
        "balances": {code: str(value) for code, value in balances.items()},
        "replayed": replayed,
    }
    if state_version is not None:
        payload["state_version"] = state_version
    return payload

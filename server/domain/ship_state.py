"""``GET /ship`` — one screen of ship state plus the status list (11 §4.2).

The status ids are **not invented here**: they are the first four rows of the
vocabulary in ``docs/frontend-redesign/09-state-and-context.md`` §3.1, with the
same ids the front end already uses. The server decides *whether* a condition is
true; the client decides how it looks. Any panel that re-derives "hull < 50%" on
its own will eventually disagree with this function, which is exactly the class
of bug the shared vocabulary exists to prevent.

Severity mapping (09 §3):

``critical``  red, blocks normal play          → shield.offline
``degraded``  amber, playable but weakened     → hull.damaged
``caution``   blue, needs attention soon       → fuel.low / cargo.full
"""

from __future__ import annotations

from decimal import Decimal

from ..repo import combat as combat_repo
from ..repo import ships as ship_repo
from ..repo import wallets as wallet_repo
from .ship import stats

HULL_MAX = 100
CARGO_FULL_RATIO = Decimal("0.95")
HULL_DAMAGED_RATIO = 0.5


def view(conn, player: dict) -> dict:
    player_id = player["id"]
    ship = ship_repo.flagship(conn, player_id)
    modules = ship_repo.modules(conn, player_id)
    flags = ship_repo.flags(conn, player_id) or {"hull": HULL_MAX, "vouchers": 0}
    hull = int(flags["hull"])
    shield_max = 4 + 3 * int((modules.get("shieldMatrix") or {"level": 0})["level"])
    shield = _current_shield(conn, player_id, shield_max)
    balances = wallet_repo.balances(conn, player_id)
    ship_stats = stats(int(ship["level"]) if ship else 1)

    used = sum(int(value) for value in balances.values() if value > 0)
    cap = int(ship_stats["storage"])

    payload = {
        "id": str(ship["id"]) if ship else None,
        "level": int(ship["level"]) if ship else 0,
        "type": ship["ship_type"] if ship else None,
        "hull": hull,
        "hull_max": HULL_MAX,
        "shield": shield,
        "shield_max": shield_max,
        "stats": ship_stats,
        "modules": [
            {"code": row["module_code"], "level": int(row["level"]), "overclock": int(row["overclock"])}
            for row in modules.values()
        ],
        "cargo": {"used": used, "cap": cap},
        "fuel": _fuel(balances),
        "state_version": int(player["state_version"]),
    }
    payload["status"] = derive_statuses(payload)
    return payload


def derive_statuses(payload: dict) -> list[dict]:
    """Ordered worst-first, so the UI can render ``status[0]`` as the headline."""
    statuses: list[dict] = []

    if payload["shield_max"] > 0 and payload["shield"] <= 0:
        statuses.append({"id": "shield.offline", "severity": "critical", "payload": {"shield": 0}})

    hull, hull_max = payload["hull"], payload["hull_max"]
    if hull_max and hull / hull_max < HULL_DAMAGED_RATIO:
        pct = round(100 * hull / hull_max)
        statuses.append(
            {
                "id": "hull.damaged",
                "severity": "degraded",
                "payload": {"pct": pct, "hull": hull, "hull_max": hull_max},
            }
        )

    fuel = payload["fuel"]
    if not fuel["can_jump"]:
        # One id, two reasons: the vocabulary in 09 §3.1 has no ``fuel.empty``,
        # so an empty tank is ``fuel.low`` with ``reason`` set. Adding a fifth id
        # would mean two names for one fact.
        statuses.append(
            {
                "id": "fuel.low",
                "severity": "critical" if fuel["empty"] else "caution",
                "payload": {**fuel["balances"], "reason": "empty" if fuel["empty"] else "low"},
            }
        )

    cargo = payload["cargo"]
    if cargo["cap"] and Decimal(cargo["used"]) / Decimal(cargo["cap"]) >= CARGO_FULL_RATIO:
        statuses.append(
            {
                "id": "cargo.full",
                "severity": "caution",
                "payload": {"used": cargo["used"], "cap": cargo["cap"]},
            }
        )
    return statuses


# ----------------------------------------------------------------- internals


def _current_shield(conn, player_id: str, shield_max: int) -> int:
    """Shield is a battle resource: read the live session, else assume full."""
    sessions = combat_repo.active(conn, player_id)
    if not sessions:
        return shield_max
    return max(0, min(shield_max, int(sessions[0]["player_shield"])))


def _fuel(balances: dict[str, Decimal]) -> dict:
    """``can_jump`` = enough of all three fuels for one minimum viable jump.

    Thresholds are the long-jump floors in ``domain.travel`` (20 / 10 / 15) rather
    than the player's full range: a ship sitting exactly on the floors can still
    cross one short hop, and calling that "empty" would be wrong.
    """
    codes = ("antimatter", "element115", "deuterium")
    floors = {"antimatter": 20, "element115": 10, "deuterium": 15}
    values = {code: int(balances.get(code, Decimal(0))) for code in codes}
    can_jump = all(values[code] >= floors[code] for code in codes)
    empty = all(values[code] <= 0 for code in codes)
    return {"balances": values, "floors": floors, "can_jump": can_jump, "empty": empty}

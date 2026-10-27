"""Compose the ``GET /state`` payload from repo reads.

Every field is optional-tolerant: a brand-new player has no stations, fleet or
contracts yet, but the shape stays stable so the client can render immediately.
"""

from __future__ import annotations

from decimal import Decimal

from ..infra.clock import iso
from ..repo import assets as asset_repo
from ..repo import calendar as calendar_repo
from ..repo import reference as reference_repo
from ..repo import ships as ship_repo
from ..repo import wallets as wallet_repo
from . import cooldown
from .ship import stats


def compose(conn, player: dict) -> dict:
    balances = wallet_repo.balances(conn, player["id"])
    codes = reference_repo.resource_codes(conn)
    flags = ship_repo.flags(conn, player["id"]) or {"hull": 100, "vouchers": 0}
    day = calendar_repo.game_day(conn, player["timezone"])
    ship = _ship(conn, player["id"])
    return {
        "player": _player(player),
        "resources": _resources(codes, balances, int(ship["stats"].get("storage", 0))),
        "ship": ship,
        "progress": _progress(conn, player["id"]),
        "assets": {
            "stations": asset_repo.stations(conn, player["id"]),
            "fleet": asset_repo.fleet(conn, player["id"]),
            "hull": int(flags["hull"]),
            "vouchers": int(flags["vouchers"]),
        },
        "contracts": asset_repo.contracts_for_day(conn, player["id"], day),
        "cooldowns": cooldown.pending_ms(conn, player["id"]),
        "server_time": iso(),
        "game_day": day.isoformat(),
    }


def _player(player: dict) -> dict:
    return {
        "id": str(player["id"]),
        "display_name": player["display_name"],
        "timezone": player["timezone"],
        "state_version": int(player["state_version"]),
        "locked": bool(player.get("locked_reason")),
    }


def _resources(codes: list[str], balances: dict[str, Decimal], storage_cap: int) -> dict:
    payload = {code: _number(balances.get(code, Decimal(0))) for code in codes}
    payload["storage_cap"] = storage_cap
    return payload


def _number(value: Decimal) -> int | float:
    return int(value) if value == value.to_integral_value() else float(value)


def _ship(conn, player_id: str) -> dict:
    ship = ship_repo.flagship(conn, player_id)
    if not ship:
        return {"level": 0, "type": None, "modules": [], "stats": {}}
    ship_stats = stats(ship["level"])
    modules = [
        {"code": row["module_code"], "level": row["level"], "overclock": row["overclock"]}
        for row in ship_repo.modules(conn, player_id).values()
    ]
    return {
        "id": str(ship["id"]),
        "level": int(ship["level"]),
        "type": ship["ship_type"],
        "appearance": ship["appearance"],
        "stats": ship_stats,
        "modules": modules,
    }


def _progress(conn, player_id: str) -> dict:
    codex = ship_repo.codex_counts(conn, player_id)
    return {
        "planets": codex["planet"],
        "elements": codex["element"],
        "lifeforms": codex["lifeform"],
        "sectors": ship_repo.sectors(conn, player_id),
        "tech": ship_repo.tech_levels(conn, player_id),
    }

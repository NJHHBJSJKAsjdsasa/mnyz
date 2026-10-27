"""Faction reputation per sector (mirrors the frontend sector hash)."""

from __future__ import annotations

from ..repo import residents as resident_repo
from .rng import hash_text

FACTIONS = ["掠夺者", "巡逻队", "无主"]
SECTOR_SPAN = 1_000_000


def sector_key(planet_key: str) -> str:
    parts = (planet_key or "").split("_")
    coordinates = parts[1] if len(parts) >= 2 else ""
    axes = []
    for value in coordinates.split(",")[:3]:
        try:
            number = int(float(value.strip()))
        except ValueError:
            number = 0
        axes.append(max(0, min(9, number // SECTOR_SPAN)))
    return f"{axes[0]}-{axes[1]}-{axes[2]}"


def faction_of(sector: str) -> str:
    return FACTIONS[hash_text(f"faction|{sector}") % len(FACTIONS)]


def view(conn, player: dict) -> dict:
    return {
        "factions": [
            {
                "code": row["code"],
                "name": row["name"],
                "description": row["description"],
                "color": row["color"],
            }
            for row in resident_repo.factions(conn)
        ],
        "reputation": resident_repo.faction_reps(conn, player["id"]),
    }


def record_kill(conn, player: dict, planet_key: str) -> dict:
    sector = sector_key(planet_key)
    faction = faction_of(sector)
    delta = -1 if faction == "掠夺者" else 1 if faction == "巡逻队" else 0
    rep = resident_repo.add_faction_rep(conn, player["id"], sector, delta) if delta else 0
    return {"sector_key": sector, "faction": faction, "rep": rep}

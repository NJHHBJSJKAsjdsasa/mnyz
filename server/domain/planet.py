"""Authoritative planet identity: generated on the server, cached read-through.

The client sends a planet key (``planet_x,y,z_systemIndex_name``). The server
re-derives the name/elements from the universe seed and rejects keys that do
not match generation, so a modified client cannot farm a planet with arbitrary
elements (docs/server/09 §2).
"""

from __future__ import annotations

from dataclasses import dataclass

from pymodules.__planet_elements import MAX_PLANET_INDEX, planet_identity, planet_name

from ..infra.errors import InvalidArgument, NotFound
from ..repo import planet_cache, universes as universe_repo


@dataclass(frozen=True)
class PlanetKey:
    x: int
    y: int
    z: int
    system_index: int
    name: str

    def as_cache_key(self, canonical_name: str) -> dict:
        return {
            "x": self.x,
            "y": self.y,
            "z": self.z,
            "system_index": self.system_index,
            "planet_name": canonical_name,
        }


def parse_planet_key(planet_key: str) -> PlanetKey:
    parts = (planet_key or "").split("_", 3)
    if len(parts) != 4 or parts[0] != "planet":
        raise InvalidArgument("planet_key 格式应为 planet_x,y,z_system_name")
    try:
        coords = [int(value) for value in parts[1].split(",")]
        system_index = int(parts[2])
    except ValueError as exc:
        raise InvalidArgument("planet_key 坐标或系统编号不是整数") from exc
    if len(coords) != 3 or not all(0 <= value <= 10_000_000 for value in coords):
        raise InvalidArgument("planet_key 坐标越界")
    # Legacy galaxies can have tens of millions of systems; the cache column
    # is int4, so accept everything PostgreSQL can store.
    if not 0 <= system_index <= 2_000_000_000:
        raise InvalidArgument("planet_key 系统编号越界")
    if not parts[3]:
        raise InvalidArgument("planet_key 缺少行星名")
    return PlanetKey(coords[0], coords[1], coords[2], system_index, parts[3])


def build_planet_key(x: int, y: int, z: int, system_index: int, name: str) -> str:
    return f"planet_{x},{y},{z}_{system_index}_{name}"


def public_payload(planet: dict | None) -> dict:
    """Shape shared by collect/scan/surface responses."""
    if planet is None:
        return {"source": "fallback"}
    return {
        "name": planet["name"],
        "planet_type": planet["planet_type"],
        "elements": planet["elements"],
        "resources": planet["resources"],
        "source": "generated",
        "cached": bool(planet.get("cached")),
    }


def resolve_planet(conn, player: dict, planet_key: str) -> dict:
    key = parse_planet_key(planet_key)
    universe = universe_repo.by_id(conn, player["universe_id"])
    if universe is None:
        raise NotFound("玩家所属宇宙不存在")

    identity = planet_identity(
        int(universe["seed"]),
        key.x,
        key.y,
        key.z,
        key.system_index,
        _planet_index(universe, key),
    )
    if identity["name"].lower() != key.name.lower():
        raise NotFound("行星名与宇宙生成结果不一致")

    cache_universe = planet_cache.cache_universe_id(universe["id"])
    cache_key = key.as_cache_key(identity["name"])
    cached = planet_cache.get(conn, cache_universe, cache_key)
    if cached:
        return {**cached, "cached": True, "source": "generated"}

    data = {
        **identity,
        "x": key.x,
        "y": key.y,
        "z": key.z,
        "cache_universe_id": cache_universe,
        "source": "generated",
    }
    planet_cache.put(conn, cache_universe, cache_key, data)
    return {**data, "cached": False}


def _planet_index(universe: dict, key: PlanetKey) -> int:
    """Planet index is not in the key; recover it by matching the generated name."""
    for index in range(MAX_PLANET_INDEX + 1):
        candidate = planet_name(
            int(universe["seed"]), key.x, key.y, key.z, key.system_index, index
        )
        if candidate.lower() == key.name.lower():
            return index
    raise NotFound("该坐标下不存在这颗行星")

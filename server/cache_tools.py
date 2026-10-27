"""Backfill / inspect the PostgreSQL universe cache (docs/server/16 §6).

The legacy app writes ``internal_data/cache/atlas_cache.db`` plus optional JSON
files. This module imports them into ``universe_cache`` and verifies a sample
against the source, which is the acceptance gate for switching reads to PG.
"""

from __future__ import annotations

import json
import random
import sqlite3
from pathlib import Path

from pymodules.__atlas_pg_cache import PgCacheManager, current_universe_id

SAMPLE_CAP = 1000


def backfill(
    sqlite_path: str,
    json_dir: str,
    universe_id: str | None = None,
    sample_rate: float = 0.01,
) -> dict:
    manager = PgCacheManager()
    if not manager.enabled:
        raise RuntimeError("ATLAS_DATABASE_URL 未配置，无法回填")
    uid = universe_id or current_universe_id()
    imported = {"galaxies": 0, "systems": 0, "planets": 0}
    samples: list[tuple[str, dict, dict]] = []
    seen = 0

    for kind, key, data in _iter_sources(sqlite_path, json_dir):
        if _save(manager, uid, kind, key, data):
            imported[f"{kind}s" if kind != "galaxy" else "galaxies"] += 1
        seen += 1
        if len(samples) < SAMPLE_CAP:
            samples.append((kind, key, data))
        else:
            slot = random.randrange(seen)
            if slot < SAMPLE_CAP:
                samples[slot] = (kind, key, data)

    mismatches = _compare(manager, uid, samples)
    return {
        "universe_id": uid,
        "imported": imported,
        "sampled": len(samples),
        "mismatches": mismatches["count"],
        "mismatch_keys": mismatches["keys"],
    }


def inspect(universe_id: str | None = None) -> dict:
    manager = PgCacheManager()
    if not manager.enabled:
        raise RuntimeError("ATLAS_DATABASE_URL 未配置")
    uid = universe_id or current_universe_id()
    return {
        "universe_id": uid,
        "generator_version": manager.current_version(uid),
        "counts": manager.stats(uid),
        "ping": manager.ping(),
    }


def bump(universe_id: str | None = None) -> dict:
    manager = PgCacheManager()
    if not manager.enabled:
        raise RuntimeError("ATLAS_DATABASE_URL 未配置")
    uid = universe_id or current_universe_id()
    before = manager.current_version(uid)
    after = manager.bump_version(uid)
    return {"universe_id": uid, "before": before, "after": after}


def _iter_sources(sqlite_path: str, json_dir: str):
    yield from _iter_sqlite(sqlite_path)
    yield from _iter_json(json_dir)


def _iter_sqlite(path: str):
    file = Path(path)
    if not file.exists():
        return
    conn = sqlite3.connect(str(file))
    try:
        for x, y, z, raw in conn.execute("SELECT x, y, z, data FROM galaxies"):
            yield "galaxy", {"x": x, "y": y, "z": z}, json.loads(raw)
        for x, y, z, index, raw in conn.execute(
            "SELECT x, y, z, system_index, data FROM systems"
        ):
            yield "system", {"x": x, "y": y, "z": z, "system_index": index}, json.loads(raw)
        for x, y, z, index, name, raw in conn.execute(
            "SELECT x, y, z, system_index, planet_name, data FROM planets"
        ):
            yield "planet", {"x": x, "y": y, "z": z, "system_index": index, "planet_name": name}, json.loads(raw)
    finally:
        conn.close()


def _iter_json(directory: str):
    base = Path(directory)
    if not base.exists():
        return
    for kind, folder, parser in (
        ("galaxy", "galaxies", _parse_galaxy_name),
        ("system", "systems", _parse_system_name),
        ("planet", "planets", _parse_planet_name),
    ):
        for path in sorted((base / folder).glob("*.json")):
            key = parser(path.name)
            if key is None:
                continue
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            yield kind, key, data


def _parse_galaxy_name(name: str) -> dict | None:
    parts = name.removesuffix(".json").split("_")
    if len(parts) != 4 or parts[0] != "galaxy":
        return None
    return _coords(parts[1:4])


def _parse_system_name(name: str) -> dict | None:
    parts = name.removesuffix(".json").split("_")
    if len(parts) != 5 or parts[0] != "system":
        return None
    key = _coords(parts[1:4])
    return {**key, "system_index": int(parts[4])} if key else None


def _parse_planet_name(name: str) -> dict | None:
    parts = name.removesuffix(".json").split("_", 5)
    if len(parts) != 6 or parts[0] != "planet":
        return None
    key = _coords(parts[1:4])
    return {**key, "system_index": int(parts[4]), "planet_name": parts[5]} if key else None


def _coords(parts: list[str]) -> dict | None:
    try:
        x, y, z = (int(part) for part in parts)
    except ValueError:
        return None
    if not all(0 <= value <= 10_000_000 for value in (x, y, z)):
        return None
    return {"x": x, "y": y, "z": z}


def _save(manager: PgCacheManager, uid: str, kind: str, key: dict, data: dict) -> bool:
    if kind == "galaxy":
        return manager.save_galaxy(uid, key["x"], key["y"], key["z"], data)
    if kind == "system":
        return manager.save_system(uid, key["x"], key["y"], key["z"], key["system_index"], data)
    return manager.save_planet(
        uid, key["x"], key["y"], key["z"], key["system_index"], key["planet_name"], data
    )


def _compare(manager: PgCacheManager, uid: str, samples: list[tuple[str, dict, dict]]) -> dict:
    count = 0
    keys: list[dict] = []
    for kind, key, expected in samples:
        actual = _load(manager, uid, kind, key)
        if actual != expected:
            count += 1
            if len(keys) < 5:
                keys.append({"kind": kind, **key})
    return {"count": count, "keys": keys}


def _load(manager: PgCacheManager, uid: str, kind: str, key: dict):
    if kind == "galaxy":
        return manager.get_galaxy(uid, key["x"], key["y"], key["z"])
    if kind == "system":
        return manager.get_system(uid, key["x"], key["y"], key["z"], key["system_index"])
    return manager.get_planet(
        uid, key["x"], key["y"], key["z"], key["system_index"], key["planet_name"]
    )

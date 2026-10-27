"""Validate and import one legacy localStorage snapshot (docs/server/14 §M5).

Only recognized fields are imported; every write is ledgered/audited. The raw
26-key snapshot is not kept — the audit row stores the hash and what was
imported, while the client keeps its local copy until the domain is cut over.
"""

from __future__ import annotations

import hashlib
import json
from decimal import Decimal

from ..infra.errors import AlreadyClaimed, InvalidArgument
from ..repo import imports as import_repo
from ..repo import outbox as outbox_repo
from ..repo import players as player_repo
from ..repo import reference as reference_repo
from ..repo import sectors as sector_repo
from ..repo import ships as ship_repo
from ..repo import tech as tech_repo
from .ledger import TxRef, post_transaction

RESOURCE_MAP = {
    "a": "antimatter",
    "e": "element115",
    "d": "deuterium",
    "q": "quantumAlloy",
    "p": "plasmaCell",
    "n": "neuralCircuit",
    "ex": "exoticCrystal",
    "nd": "nebulaDust",
    "bh": "blackHoleFragment",
    "ar": "ancientRelic",
    "aa": "alienArtifact",
    "ds": "dimensionalShard",
}
MAX_RESOURCE = Decimal("1000000000")
MAX_SECTORS = 60


def import_snapshot(conn, player: dict, account_id: str, keys: dict, sha256: str | None) -> dict:
    if not isinstance(keys, dict) or not keys:
        raise InvalidArgument("keys 必须是非空对象")
    canonical = json.dumps(keys, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    if sha256 and sha256.lower() != digest:
        raise InvalidArgument("sha256 与快照内容不一致")
    if not import_repo.claim(conn, player["id"], account_id, digest, len(keys)):
        raise AlreadyClaimed("该角色已导入过本地存档")

    imported = {
        "resources": _import_resources(conn, player["id"], keys),
        "ship_level": _import_ship(conn, player["id"], keys),
        "modules": _import_modules(conn, player["id"], keys),
        "hull": _import_hull(conn, player["id"], keys),
        "sectors": _import_sectors(conn, player["id"], keys),
        "tech": _import_tech(conn, player["id"], keys),
    }
    import_repo.finish(conn, player["id"], imported)
    version = player_repo.bump_state(conn, player["id"])
    outbox_repo.add(
        conn,
        aggregate_type="player",
        aggregate_id=player["id"],
        event_type="migration.local_save",
        payload={"hash": digest, "keys": len(keys), "imported": imported},
    )
    return {"hash": digest, "keys": len(keys), "imported": imported, "state_version": version}


def _value(keys: dict, prefix: str) -> dict | None:
    for name, raw in keys.items():
        if name.startswith(prefix):
            try:
                parsed = json.loads(raw)
            except (TypeError, ValueError):
                return None
            return parsed if isinstance(parsed, dict) else None
    return None


def _resource_payload(keys: dict) -> dict | None:
    ship = _value(keys, "_atlasSpaceShip")
    if ship and isinstance(ship.get("r"), dict):
        return ship["r"]
    return None


def _import_resources(conn, player_id: str, keys: dict) -> dict:
    raw = _resource_payload(keys)
    if not raw:
        return {}
    deltas: dict[str, Decimal] = {}
    for short, code in RESOURCE_MAP.items():
        try:
            amount = Decimal(str(raw.get(short, 0)))
        except Exception:  # noqa: BLE001
            continue
        if amount <= 0:
            continue
        deltas[code] = min(amount, MAX_RESOURCE)
    if not deltas:
        return {}
    post_transaction(conn, player_id, deltas, TxRef("migration", "save_import", player_id))
    return {code: int(amount) for code, amount in deltas.items()}


def _import_ship(conn, player_id: str, keys: dict) -> int | None:
    ship = _value(keys, "_atlasSpaceShip")
    if not ship:
        return None
    level = int((ship.get("u") or {}).get("l", 1) or 1)
    level = max(1, min(999, level))
    ship_repo.set_level(conn, player_id, level)
    return level


def _import_modules(conn, player_id: str, keys: dict) -> dict:
    ship = _value(keys, "_atlasSpaceShip")
    modules = ((ship or {}).get("u") or {}).get("mds") or []
    imported: dict[str, int] = {}
    for item in modules:
        if not isinstance(item, dict):
            continue
        code, level = item.get("id"), item.get("level")
        if not isinstance(code, str) or not isinstance(level, (int, float)):
            continue
        if reference_repo.module_definition(conn, code) is None:
            continue
        level = max(0, min(999, int(level)))
        if level:
            ship_repo.upsert_module(conn, player_id, code, level, int(item.get("oc", 0) or 0))
            imported[code] = level
    return imported


def _import_hull(conn, player_id: str, keys: dict) -> int | None:
    hull = _value(keys, "_atlasHull")
    if not hull:
        return None
    value = max(0, min(100, int(hull.get("hull", 100) or 100)))
    ship_repo.set_hull(conn, player_id, value)
    return value


def _import_sectors(conn, player_id: str, keys: dict) -> list[str]:
    sectors = _value(keys, "_atlasSectors")
    unlocked = (sectors or {}).get("unlocked") or []
    imported: list[str] = []
    for key in unlocked[:MAX_SECTORS]:
        if isinstance(key, str) and sector_repo.insert(conn, player_id, key):
            imported.append(key)
    return imported


def _import_tech(conn, player_id: str, keys: dict) -> list[str]:
    tech = _value(keys, "_atlasTech")
    unlocked = (tech or {}).get("unlocked") or []
    imported: list[str] = []
    for code in unlocked:
        if not isinstance(code, str) or tech_repo.node(conn, code) is None:
            continue
        if tech_repo.insert(conn, player_id, code):
            imported.append(code)
    return imported

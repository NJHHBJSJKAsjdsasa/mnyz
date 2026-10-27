"""Feature-flag evaluation and shadow-state intake (docs/server/14 §1–2)."""

from __future__ import annotations

import hashlib
import json

from ..infra.errors import InvalidArgument
from ..repo import cutover as cutover_repo

MAX_SHADOW_BYTES = 256 * 1024


def evaluate(conn, player: dict) -> dict[str, dict]:
    overrides = cutover_repo.overrides(conn, player["id"])
    result: dict[str, dict] = {}
    for row in cutover_repo.flags(conn):
        name = row["name"]
        mode = overrides.get(name, row["mode"])
        bucket = _bucket(str(player["id"]), name)
        enabled = mode != "local" and (name in overrides or bucket < int(row["rollout_pct"]))
        result[name] = {
            "mode": mode,
            "enabled": enabled,
            "rollout_pct": int(row["rollout_pct"]),
            "bucket": bucket,
        }
    return result


def save_shadow(conn, player: dict, payload: dict) -> dict:
    if not isinstance(payload, dict) or not payload:
        raise InvalidArgument("shadow payload 必须是非空对象")
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
    if len(raw) > MAX_SHADOW_BYTES:
        raise InvalidArgument(f"shadow payload 超过 {MAX_SHADOW_BYTES} 字节")
    cutover_repo.save_shadow(conn, player["id"], payload, len(raw), int(player["state_version"]))
    return {"accepted": True, "keys": len(payload), "size_bytes": len(raw)}


def shadow(conn, player: dict) -> dict:
    row = cutover_repo.shadow(conn, player["id"])
    if row is None:
        return {"payload": None, "size_bytes": 0, "state_version": 0, "updated_at": None}
    return {
        "payload": row["payload"],
        "size_bytes": int(row["size_bytes"]),
        "state_version": int(row["state_version"]),
        "updated_at": row["updated_at"],
    }


def _bucket(player_id: str, flag: str) -> int:
    digest = hashlib.sha1(f"{player_id}:{flag}".encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % 100

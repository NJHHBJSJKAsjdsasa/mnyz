"""Cutover surface: feature flags and local-save shadow snapshots."""

from __future__ import annotations

from flask import Blueprint, g, request

from ...domain import cutover as cutover_domain
from ...domain import save_import
from ...infra.context import db
from ...models.explore import LocalSaveRequest
from ...repo import imports as import_repo
from ...repo import players as player_repo
from ..deps import parse_model, rate_limit, require_auth, success

bp = Blueprint("cutover", __name__)


@bp.get("/features")
@require_auth()
@rate_limit("features", 60, 60)
def features():
    with db().transaction() as conn:
        player = player_repo.get(conn, g.player_id)
        flags = cutover_domain.evaluate(conn, player)
    return success({"flags": flags})


@bp.get("/shadow/state")
@require_auth()
@rate_limit("shadow_read", 30, 60)
def shadow_read():
    with db().transaction() as conn:
        player = player_repo.get(conn, g.player_id)
        payload = cutover_domain.shadow(conn, player)
    return success(payload)


@bp.post("/shadow/state")
@require_auth()
@rate_limit("shadow_write", 30, 60)
def shadow_write():
    payload = request.get_json(silent=True)
    with db().transaction() as conn:
        player = player_repo.get(conn, g.player_id)
        result = cutover_domain.save_shadow(conn, player, payload)
    return success(result)


@bp.get("/migrations/local-save")
@require_auth()
@rate_limit("migration_read", 30, 60)
def local_save_status():
    with db().transaction() as conn:
        player = player_repo.get(conn, g.player_id)
        row = import_repo.get(conn, player["id"])
    return success(
        {
            "imported": row is not None,
            "payload_hash": row["payload_hash"] if row else None,
            "keys_count": int(row["keys_count"]) if row else 0,
            "summary": row["imported"] if row else None,
            "created_at": row["created_at"] if row else None,
        }
    )


@bp.post("/migrations/local-save")
@require_auth()
@rate_limit("migration_write", 5, 60)
def local_save_import():
    body = parse_model(LocalSaveRequest)
    with db().transaction() as conn:
        player = player_repo.lock(conn, g.player_id)
        result = save_import.import_snapshot(conn, player, g.account_id, body.keys, body.sha256)
    return success(result, int(result["state_version"]))

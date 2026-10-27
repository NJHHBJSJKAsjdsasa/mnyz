"""AI player directory and the ops endpoints (06 §9).

Public responses never expose the decision provider, model or prompt hash
(10 §4.2): an AI player is just a player in the directory.
"""

from __future__ import annotations

from flask import Blueprint, g, request

from ...domain import ai_economy
from ...repo import ai as ai_repo
from ...infra.context import db
from ...infra.errors import Forbidden, NotFound
from ...models.ai import AiTickRequest, ProviderUpdateRequest, RuntimePauseRequest
from ..deps import parse_model, rate_limit, require_auth, success

bp = Blueprint("ai_admin", __name__)


def _require_admin() -> None:
    role = str(getattr(g, "player", {}).get("account_role") or "")
    if role not in ("admin", "ops"):
        raise Forbidden("需要运维/管理员权限")


@bp.get("/players")
@require_auth()
@rate_limit("players_directory", 120, 60)
def players():
    controller = (request.args.get("controller") or "ai").strip().lower()
    with db().connection() as conn:
        return success({"players": ai_economy.directory(conn, controller)})


@bp.get("/players/<player_id>")
@require_auth()
@rate_limit("player_report", 120, 60)
def player(player_id: str):
    with db().connection() as conn:
        return success(ai_economy.report(conn, player_id))


@bp.post("/admin/ai/tick")
@require_auth(write=True)
@rate_limit("admin_ai_tick", 30, 60)
def run_tick():
    _require_admin()
    body = parse_model(AiTickRequest)
    with db().transaction() as conn:
        created = 0
        if body.bootstrap:
            created = ai_economy.bootstrap(
                conn, count=body.bootstrap, capital=body.capital
            )["created"]
        result = ai_economy.tick(conn, limit=body.limit)
    return success({**result, "bootstrapped": created})


@bp.post("/admin/ai/runtime-pause")
@require_auth(write=True)
@rate_limit("admin_ai_pause", 30, 60)
def runtime_pause():
    _require_admin()
    body = parse_model(RuntimePauseRequest)
    with db().transaction() as conn:
        return success(ai_economy.set_pause(conn, body.paused))


@bp.get("/admin/ai/providers")
@require_auth()
@rate_limit("admin_ai_providers", 60, 60)
def providers():
    """Ops-only view: modes and audit knobs, never exposed to players (10 §4.2)."""
    _require_admin()
    with db().connection() as conn:
        rows = ai_repo.providers(conn)
    return success({
        "providers": [
            {
                "name": row["name"],
                "kind": row["kind"],
                "version": row["version"],
                "status": row["status"],
                "model": row["model"],
                "timeout_ms": int(row["timeout_ms"]),
                "max_actions": int(row["max_actions"]),
                "allowlist": row["allowlist"],
                "has_endpoint": bool(row["endpoint"]),
                "updated_at": row["updated_at"].isoformat(),
            }
            for row in rows.values()
        ]
    })


@bp.post("/admin/ai/providers/<name>")
@require_auth(write=True)
@rate_limit("admin_ai_provider_update", 30, 60)
def update_provider(name: str):
    _require_admin()
    body = parse_model(ProviderUpdateRequest)
    with db().transaction() as conn:
        row = ai_repo.set_provider(
            conn,
            name,
            status=body.status,
            model=body.model,
            endpoint=body.endpoint,
            timeout_ms=body.timeout_ms,
            max_actions=body.max_actions,
            allowlist=body.allowlist,
        )
    if row is None:
        raise NotFound("provider 不存在")
    return success({
        "name": row["name"],
        "status": row["status"],
        "model": row["model"],
        "timeout_ms": int(row["timeout_ms"]),
        "max_actions": int(row["max_actions"]),
        "allowlist": row["allowlist"],
    })

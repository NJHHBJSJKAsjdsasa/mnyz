"""AI player directory and the ops endpoints (06 §9).

Public responses never expose the decision provider, model or prompt hash
(10 §4.2): an AI player is just a player in the directory.
"""

from __future__ import annotations

from flask import Blueprint, g, request

from ...domain import ai_economy
from ...infra.context import db
from ...infra.errors import Forbidden
from ...models.ai import AiTickRequest, RuntimePauseRequest
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

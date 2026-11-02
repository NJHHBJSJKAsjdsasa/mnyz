"""Player state endpoints that are not domain actions."""

from __future__ import annotations

from flask import Blueprint, g, request

from ...domain import events
from ...domain import state as state_domain
from ...domain.settlement import settle_offline
from ...infra.serialize import ts
from ...infra.context import db
from ...infra.errors import InvalidArgument
from ...repo import players as player_repo
from ..deps import current_player, rate_limit, require_auth, success

bp = Blueprint("session_state", __name__)


@bp.get("/state")
@require_auth()
@rate_limit("state", 60, 60)
def get_state():
    player = current_player()
    with db().transaction() as conn:
        settled = settle_offline(conn, player["id"])
        fresh = player_repo.get(conn, player["id"])
        snapshot = state_domain.compose(conn, fresh)
    snapshot["settlement"] = {
        "settled_at": ts(settled["settled_at"]),
    }
    return success(snapshot, int(fresh["state_version"]))


@bp.get("/session")
@require_auth()
def current_session():
    return success({"player_id": str(g.player_id), "session_id": str(g.session_id)})


@bp.get("/events")
@require_auth()
@rate_limit("events", 120, 60)
def events_stream():
    """Append-only activity feed (10 §P1-5).

    ``?since=<seq>`` is a cursor, not a timestamp: seq is monotonic and gap-free
    under a single writer, so a client can poll without missing or replaying rows.
    """
    raw_since = request.args.get("since") or "0"
    try:
        since = int(raw_since)
    except ValueError:
        raise InvalidArgument("since 必须是整数（上一次响应的 next_since）") from None
    try:
        limit = int(request.args.get("limit") or 100)
    except ValueError:
        raise InvalidArgument("limit 必须是整数") from None
    types = [t for t in (request.args.get("types") or "").split(",") if t.strip()]
    aggregate = (request.args.get("aggregate") or "").strip() or None
    with db().connection() as conn:
        return success(events.stream(
            conn, since=since, types=types or None, aggregate=aggregate, limit=limit
        ))

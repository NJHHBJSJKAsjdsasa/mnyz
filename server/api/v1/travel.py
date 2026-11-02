"""Server-authoritative navigation endpoints (11 §4.1 / §4.4).

``POST /travel/quote`` is free and cheap to retry: it prices a jump and returns a
30-second offer. ``POST /travel/commit`` spends that offer exactly once, so a
retried confirm cannot burn fuel twice.

The page route ``POST /navigate`` is intentionally untouched: it still renders a
destination, but the fuel it used to debit locally is now charged here. Tightening
``/navigate`` to require a commit ticket is a client change (11 §5), tracked as
TASK-BACKLOG T-01b.
"""

from __future__ import annotations

from flask import Blueprint, g, request

from ...domain import travel as travel_domain
from ...infra.context import db
from ...models.travel import TravelCommitRequest, TravelQuoteRequest
from ...repo import players as player_repo
from ..deps import (
    begin_idempotency,
    finish_idempotency,
    parse_model,
    rate_limit,
    require_auth,
    success,
)

bp = Blueprint("travel", __name__)


@bp.post("/travel/quote")
@require_auth()
@rate_limit("travel_quote", 240, 60)
def travel_quote():
    body = parse_model(TravelQuoteRequest)
    intent = travel_domain.TravelIntent(
        kind=body.kind,
        origin=(body.origin.x, body.origin.y, body.origin.z),
        target=(body.target.x, body.target.y, body.target.z),
    )
    with db().transaction() as conn:
        player = player_repo.get(conn, g.player_id)
        result = travel_domain.quote(conn, player, intent)
    return success(result)


@bp.post("/travel/commit")
@require_auth(write=True)
@rate_limit("travel_commit", 60, 60)
def travel_commit():
    body = parse_model(TravelCommitRequest)
    payload = {"quote_id": body.quote_id}
    with db().transaction() as conn:
        ticket = begin_idempotency(conn, g.account_id, payload)
        if ticket.replayed and ticket.cached:
            cached = ticket.cached
            return success(
                cached,
                int(cached.get("state_version", 0)),
                extra_headers={"Idempotent-Replay": "true"},
            )
        player = player_repo.get(conn, g.player_id)
        result = travel_domain.commit(conn, player, body.quote_id)
        finish_idempotency(conn, ticket, 200, result)
    return success(result, int(result["state_version"]))


@bp.get("/travel/history")
@require_auth()
@rate_limit("travel_history", 120, 60)
def travel_history():
    limit = min(50, max(1, int(request.args.get("limit", 20))))
    with db().transaction() as conn:
        player = player_repo.get(conn, g.player_id)
        result = travel_domain.recent(conn, player["id"], limit)
    return success(result)

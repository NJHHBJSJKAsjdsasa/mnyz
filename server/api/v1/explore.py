"""Exploration write endpoints. The first vertical slice is ``collect``."""

from __future__ import annotations

from flask import Blueprint, g, request

from ...domain import planet as planet_domain
from ...domain import codex_reward, scan_service, sector_service, surface_service, task_service
from ...domain import surface as surface_domain
from ...domain.collect import CollectIntent, collect, config_for
from ...infra.context import db
from ...infra.errors import InvalidArgument
from ...models.explore import CollectRequest, SurfaceSampleRequest
from ...repo import calendar as calendar_repo
from ...repo import codex as codex_repo
from ...repo import players as player_repo
from ...repo import ships as ship_repo
from ...repo import surface as surface_repo
from ..deps import (
    begin_idempotency,
    check_if_match,
    current_player,
    finish_idempotency,
    parse_model,
    rate_limit,
    require_auth,
    success,
)

bp = Blueprint("explore", __name__)


@bp.get("/planets/<path:planet_key>")
@require_auth()
@rate_limit("planet", 120, 60)
def planet_detail(planet_key: str):
    """Authoritative planet identity: name, type and elements from the seed."""
    with db().transaction() as conn:
        player = player_repo.get(conn, g.player_id)
        data = planet_domain.resolve_planet(conn, player, planet_key)
    return success(data)


@bp.post("/planets/<path:planet_key>/scan")
@require_auth(write=True)
@rate_limit("scan", 30, 60)
def scan_planet(planet_key: str):
    check_if_match(current_player())
    payload = {"planet_key": planet_key}
    with db().transaction() as conn:
        ticket = begin_idempotency(conn, g.account_id, payload)
        if ticket.replayed and ticket.cached:
            cached = ticket.cached
            return success(cached, int(cached.get("state_version", 0)), extra_headers={"Idempotent-Replay": "true"})
        player = player_repo.get(conn, g.player_id)
        result = scan_service.perform_scan(conn, player, planet_key, config_for(conn))
        finish_idempotency(conn, ticket, 200, result)
    return success(result, int(result["state_version"]))


@bp.get("/planets/<path:planet_key>/surface")
@require_auth()
@rate_limit("surface_read", 60, 60)
def surface_grid(planet_key: str):
    with db().transaction() as conn:
        player = player_repo.get(conn, g.player_id)
        planet = planet_domain.resolve_planet(conn, player, planet_key)
        day = calendar_repo.game_day(conn, player["timezone"])
        used = surface_repo.used(conn, player["id"], planet_key, day)
    return success(
        {
            "planet": planet_domain.public_payload(planet),
            "grid": surface_domain.grid(planet_key),
            "daily_samples": surface_domain.DAILY_SAMPLES,
            "used": used,
            "remaining": max(0, surface_domain.DAILY_SAMPLES - used),
            "game_day": day.isoformat(),
        }
    )


@bp.post("/planets/<path:planet_key>/surface/sample")
@require_auth(write=True)
@rate_limit("surface_sample", 30, 60)
def surface_sample(planet_key: str):
    body = parse_model(SurfaceSampleRequest)
    check_if_match(current_player())
    payload = {"planet_key": planet_key, "cell": body.cell}
    with db().transaction() as conn:
        ticket = begin_idempotency(conn, g.account_id, payload)
        if ticket.replayed and ticket.cached:
            cached = ticket.cached
            return success(cached, int(cached.get("state_version", 0)), extra_headers={"Idempotent-Replay": "true"})
        player = player_repo.get(conn, g.player_id)
        result = surface_service.sample(conn, player, planet_key, body.cell)
        finish_idempotency(conn, ticket, 200, result)
    return success(result, int(result["state_version"]))


@bp.post("/sectors/<sector_key>/unlock")
@require_auth(write=True)
@rate_limit("sector_unlock", 10, 60)
def unlock_sector(sector_key: str):
    check_if_match(current_player())
    payload = {"sector_key": sector_key}
    with db().transaction() as conn:
        ticket = begin_idempotency(conn, g.account_id, payload)
        if ticket.replayed and ticket.cached:
            cached = ticket.cached
            return success(cached, int(cached.get("state_version", 0)), extra_headers={"Idempotent-Replay": "true"})
        player = player_repo.get(conn, g.player_id)
        result = sector_service.unlock(conn, player, sector_key)
        finish_idempotency(conn, ticket, 200, result)
    return success(result, int(result["state_version"]))


@bp.post("/planets/<path:planet_key>/visit")
@require_auth(write=True)
@rate_limit("visit", 60, 60)
def visit_planet(planet_key: str):
    """Record the planet type and its elements in the codex."""

    with db().transaction() as conn:
        player = player_repo.get(conn, g.player_id)
        planet = planet_domain.resolve_planet(conn, player, planet_key)
        added = codex_repo.add_many(conn, player["id"], "planet", [planet["planet_type"]])
        added += codex_repo.add_many(conn, player["id"], "element", list(planet["elements"]))
        task_service.advance(conn, player, "planetsDiscovered", 1)
        version = player_repo.bump_state(conn, player["id"])
    return success({"added": added, "state_version": version})


@bp.get("/codex")
@require_auth()
@rate_limit("codex", 60, 60)
def codex():
    kind = request.args.get("kind")
    if kind and kind not in {"planet", "element", "lifeform"}:
        raise InvalidArgument("kind 必须是 planet/element/lifeform")
    with db().transaction() as conn:
        player = player_repo.get(conn, g.player_id)
        entries = codex_repo.list_entries(conn, g.player_id, kind)
        counts = ship_repo.codex_counts(conn, g.player_id)
        sections = codex_reward.status(conn, player)
    return success({"counts": counts, "entries": entries, "sections": sections})


@bp.post("/codex/<section>/claim")
@require_auth(write=True)
@rate_limit("codex_claim", 10, 60)
def codex_claim(section: str):
    check_if_match(current_player())
    payload = {"section": section}
    with db().transaction() as conn:
        ticket = begin_idempotency(conn, g.account_id, payload)
        if ticket.replayed and ticket.cached:
            cached = ticket.cached
            return success(cached, int(cached.get("state_version", 0)), extra_headers={"Idempotent-Replay": "true"})
        player = player_repo.get(conn, g.player_id)
        result = codex_reward.claim(conn, player, section)
        finish_idempotency(conn, ticket, 200, result)
    return success(result, int(result["state_version"]))


@bp.post("/planets/<path:planet_key>/collect")
@require_auth(write=True)
@rate_limit("collect", 60, 60)
def collect_planet(planet_key: str):
    body = parse_model(CollectRequest)
    check_if_match(current_player())
    payload = {"planet_key": planet_key, "coordinates": body.coordinates}

    with db().transaction() as conn:
        ticket = begin_idempotency(conn, g.account_id, payload)
        if ticket.replayed and ticket.cached:
            cached = ticket.cached
            return success(cached, int(cached.get("state_version", 0)), extra_headers={"Idempotent-Replay": "true"})
        player = player_repo.get(conn, g.player_id)
        result = collect(conn, player, CollectIntent(planet_key, body.coordinates), config_for(conn))
        finish_idempotency(conn, ticket, 200, result)
    return success(result, int(result["state_version"]))

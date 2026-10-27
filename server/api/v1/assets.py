"""M5/M5.5/M6/M6.5 endpoints: assets, colonies, combat and world sieges."""

from __future__ import annotations

from flask import Blueprint, g, request

from ...domain import (
    alliance_service,
    assets_service,
    challenge_service,
    colony_service,
    combat_service,
    faction_service,
    npc as npc_service,
    world_service,
)
from ...infra.context import db
from ...infra.errors import InvalidArgument
from ...models.explore import (
    ActionRequest,
    AllianceJoinRequest,
    CodeRequest,
    InviteCodeRequest,
    NameRequest,
    ResidentTradeRequest,
    PlanetRefRequest,
    TaskRequest,
)
from ...repo import players as player_repo
from ...repo import universes as universe_repo
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

bp = Blueprint("assets", __name__)


def _write(payload: dict, operation):
    check_if_match(current_player())
    with db().transaction() as conn:
        ticket = begin_idempotency(conn, g.account_id, payload)
        if ticket.replayed and ticket.cached:
            cached = ticket.cached
            return success(cached, int(cached.get("state_version", 0)), extra_headers={"Idempotent-Replay": "true"})
        player = player_repo.get(conn, g.player_id)
        result = operation(conn, player)
        finish_idempotency(conn, ticket, 200, result)
    return success(result, int(result.get("state_version", 0)))


def _read(operation):
    with db().transaction() as conn:
        player = player_repo.get(conn, g.player_id)
        return success(operation(conn, player))


@bp.get("/assets")
@require_auth()
@rate_limit("assets_read", 60, 60)
def assets():
    return _read(lambda conn, player: assets_service.assets_view(conn, player))


@bp.get("/leaderboard")
@require_auth()
@rate_limit("leaderboard", 30, 60)
def leaderboard():
    return _read(lambda conn, player: {"entries": assets_service.leaderboard(conn, player, 50)})


@bp.post("/stations")
@require_auth(write=True)
@rate_limit("station_build", 20, 60)
def build_station():
    body = parse_model(PlanetRefRequest)
    return _write({"planet_key": body.planet_key}, lambda conn, player: assets_service.build_station(conn, player, body.planet_key))


@bp.post("/stations/<station_id>/modules/<module_code>")
@require_auth(write=True)
@rate_limit("station_module", 30, 60)
def station_module(station_id: str, module_code: str):
    return _write(
        {"station_id": station_id, "module": module_code},
        lambda conn, player: assets_service.add_station_module(conn, player, station_id, module_code),
    )


@bp.post("/stations/<station_id>/claim")
@require_auth(write=True)
@rate_limit("station_claim", 30, 60)
def station_claim(station_id: str):
    return _write({"station_id": station_id}, lambda conn, player: assets_service.claim_station(conn, player, station_id))


@bp.post("/fleet")
@require_auth(write=True)
@rate_limit("fleet_recruit", 20, 60)
def recruit_fleet():
    body = parse_model(NameRequest)
    return _write({"name": body.name}, lambda conn, player: assets_service.recruit_fleet(conn, player, body.name))


@bp.post("/fleet/<fleet_id>/task")
@require_auth(write=True)
@rate_limit("fleet_task", 30, 60)
def fleet_task(fleet_id: str):
    body = parse_model(TaskRequest)
    return _write({"fleet_id": fleet_id, "task": body.task}, lambda conn, player: assets_service.set_fleet_task(conn, player, fleet_id, body.task))


@bp.post("/fleet/<fleet_id>/claim")
@require_auth(write=True)
@rate_limit("fleet_claim", 30, 60)
def fleet_claim(fleet_id: str):
    return _write({"fleet_id": fleet_id}, lambda conn, player: assets_service.claim_fleet(conn, player, fleet_id))


@bp.get("/alliances/mine")
@require_auth()
@rate_limit("alliance_read", 30, 60)
def alliance_mine():
    return _read(lambda conn, player: alliance_service.view(conn, player))


@bp.get("/residents/offer")
@require_auth()
@rate_limit("resident_offer", 30, 60)
def resident_offer():
    planet_key = request.args.get("planet_key", "")
    if not planet_key:
        raise InvalidArgument("缺少 planet_key")
    return _read(
        lambda conn, player: {"offer": npc_service.offer(
            conn, player, universe_repo.by_id(conn, player["universe_id"]), planet_key
        )}
    )


@bp.post("/residents/<resident_id>/trade")
@require_auth(write=True)
@rate_limit("resident_trade", 30, 60)
def resident_trade(resident_id: str):
    body = parse_model(ResidentTradeRequest)
    return _write(
        {"resident_id": resident_id, "planet_key": body.planet_key},
        lambda conn, player: npc_service.trade(
            conn, player, universe_repo.by_id(conn, player["universe_id"]), resident_id, body.planet_key
        ),
    )


@bp.post("/residents/<resident_id>/meet")
@require_auth(write=True)
@rate_limit("resident_meet", 60, 60)
def resident_meet(resident_id: str):
    return _write(
        {"resident_id": resident_id},
        lambda conn, player: npc_service.meet(
            conn, player, universe_repo.by_id(conn, player["universe_id"]), resident_id
        ),
    )


@bp.post("/alliances")
@require_auth(write=True)
@rate_limit("alliance_create", 5, 60)
def alliance_create():
    body = parse_model(NameRequest)
    return _write({"name": body.name}, lambda conn, player: alliance_service.create(conn, player, body.name))


@bp.post("/alliances/join")
@require_auth(write=True)
@rate_limit("alliance_join", 10, 60)
def alliance_join():
    body = parse_model(AllianceJoinRequest)
    return _write({"alliance_id": body.alliance_id}, lambda conn, player: alliance_service.join(conn, player, body.alliance_id))


@bp.post("/alliances/invites")
@require_auth(write=True)
@rate_limit("alliance_invite", 10, 60)
def alliance_invite():
    return _write({"action": "invite"}, lambda conn, player: alliance_service.create_invite(conn, player))


@bp.post("/alliances/join-code")
@require_auth(write=True)
@rate_limit("alliance_join_code", 20, 60)
def alliance_join_code():
    body = parse_model(InviteCodeRequest)
    return _write({"code": body.code}, lambda conn, player: alliance_service.join_code(conn, player, body.code))


@bp.get("/factions")
@require_auth()
@rate_limit("factions", 60, 60)
def factions():
    return _read(lambda conn, player: faction_service.view(conn, player))


@bp.get("/residents")
@require_auth()
@rate_limit("residents", 30, 60)
def residents():
    return _read(
        lambda conn, player: npc_service.view(
            conn, player, universe_repo.by_id(conn, player["universe_id"])
        )
    )


@bp.post("/alliances/leave")
@require_auth(write=True)
@rate_limit("alliance_leave", 10, 60)
def alliance_leave():
    return _write({"action": "leave"}, lambda conn, player: alliance_service.leave(conn, player))


@bp.get("/planets/<path:planet_key>/colony")
@require_auth()
@rate_limit("colony_read", 60, 60)
def colony(planet_key: str):
    return _read(lambda conn, player: colony_service.view(conn, player, planet_key))


@bp.post("/planets/<path:planet_key>/claim")
@require_auth(write=True)
@rate_limit("colony_claim", 10, 60)
def colony_claim(planet_key: str):
    return _write({"planet_key": planet_key}, lambda conn, player: colony_service.claim(conn, player, planet_key))


@bp.post("/planets/<path:planet_key>/build")
@require_auth(write=True)
@rate_limit("colony_build", 30, 60)
def colony_build(planet_key: str):
    body = parse_model(CodeRequest)
    return _write({"planet_key": planet_key, "code": body.code}, lambda conn, player: colony_service.build(conn, player, planet_key, body.code))


@bp.post("/planets/<path:planet_key>/deposits/claim")
@require_auth(write=True)
@rate_limit("colony_deposit", 30, 60)
def colony_deposits(planet_key: str):
    return _write({"planet_key": planet_key}, lambda conn, player: colony_service.claim_deposits(conn, player, planet_key))


@bp.post("/challenges")
@require_auth(write=True)
@rate_limit("challenge_create", 20, 60)
def challenge_create():
    return _write({"action": "create"}, lambda conn, player: challenge_service.create(conn, player))


@bp.get("/challenges/<path:code>")
@require_auth()
@rate_limit("challenge_read", 60, 60)
def challenge_info(code: str):
    return _read(lambda conn, player: challenge_service.info(conn, code))


@bp.post("/challenges/<path:code>/fight")
@require_auth(write=True)
@rate_limit("challenge_fight", 20, 60)
def challenge_fight(code: str):
    return _write({"code": code}, lambda conn, player: challenge_service.fight(conn, player, code))


@bp.post("/combat/start")
@require_auth(write=True)
@rate_limit("combat_start", 20, 60)
def combat_start():
    body = parse_model(PlanetRefRequest)
    return _write({"planet_key": body.planet_key}, lambda conn, player: combat_service.start(conn, player, body.planet_key))


@bp.get("/combat")
@require_auth()
@rate_limit("combat_read", 60, 60)
def combat_list():
    return _read(lambda conn, player: {"sessions": combat_service.active(conn, player)})


@bp.get("/combat/<session_id>")
@require_auth()
@rate_limit("combat_read", 60, 60)
def combat_view(session_id: str):
    return _read(lambda conn, player: combat_service.view(conn, player, session_id))


@bp.post("/combat/<session_id>/action")
@require_auth(write=True)
@rate_limit("combat_action", 60, 60)
def combat_action(session_id: str):
    body = parse_model(ActionRequest)
    return _write({"session_id": session_id, "action": body.action}, lambda conn, player: combat_service.act(conn, player, session_id, body.action))


@bp.get("/wrecks")
@require_auth()
@rate_limit("wrecks", 60, 60)
def wrecks():
    return _read(lambda conn, player: {"wrecks": combat_service.wrecks(conn, player)})


@bp.post("/planets/<path:planet_key>/salvage")
@require_auth(write=True)
@rate_limit("salvage", 20, 60)
def salvage(planet_key: str):
    return _write({"planet_key": planet_key}, lambda conn, player: combat_service.salvage(conn, player, planet_key))


@bp.get("/world-planets/<path:planet_key>")
@require_auth()
@rate_limit("world_read", 60, 60)
def world_planet(planet_key: str):
    return _read(lambda conn, player: world_service.view(conn, player, planet_key))


@bp.post("/world-planets/<path:planet_key>/claim")
@require_auth(write=True)
@rate_limit("world_claim", 10, 60)
def world_claim(planet_key: str):
    return _write({"planet_key": planet_key}, lambda conn, player: world_service.claim(conn, player, planet_key))


@bp.post("/world-planets/<path:planet_key>/siege")
@require_auth(write=True)
@rate_limit("siege_declare", 10, 60)
def siege_declare(planet_key: str):
    return _write({"planet_key": planet_key}, lambda conn, player: world_service.declare(conn, player, planet_key))


@bp.get("/sieges/<siege_id>")
@require_auth()
@rate_limit("siege_read", 60, 60)
def siege_detail(siege_id: str):
    return _read(lambda conn, player: world_service.detail(conn, player, siege_id))


@bp.post("/sieges/<siege_id>/join")
@require_auth(write=True)
@rate_limit("siege_join", 20, 60)
def siege_join(siege_id: str):
    return _write({"siege_id": siege_id}, lambda conn, player: world_service.join(conn, player, siege_id))


@bp.post("/sieges/loot")
@require_auth(write=True)
@rate_limit("siege_loot", 20, 60)
def siege_loot():
    return _write({"action": "loot"}, lambda conn, player: world_service.claim_loot(conn, player))

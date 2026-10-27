"""Authentication endpoints (register / login / refresh / logout / me)."""

from __future__ import annotations

from flask import Blueprint, g

from ...domain import auth as auth_domain
from ...domain import state as state_domain
from ...domain import universe as universe_domain
from ...infra import metrics
from ...infra.context import cache, db
from ...infra.errors import RateLimited
from ...models.auth import LoginRequest, RegisterRequest, SessionRequest
from ...repo import audit as audit_repo
from ...repo import players as player_repo
from ...repo import sessions as session_repo
from ..deps import (
    auth_context,
    auth_transaction,
    clear_refresh_cookie,
    client_info,
    current_player,
    parse_model,
    rate_limit,
    refresh_token_from_cookie,
    require_auth,
    set_refresh_cookie,
    success,
)

bp = Blueprint("auth", __name__)

REFRESH_PATH = "/api/v1/auth"


@bp.post("/auth/register")
@rate_limit("reg:ip", 3, 3600, by="ip")
def register():
    body = parse_model(RegisterRequest)
    with auth_transaction() as conn:
        universe = universe_domain.resolve(conn, body.universe_seed_name)
        command = auth_domain.RegisterCommand(
            email=body.email,
            password=body.password,
            universe=universe,
            display_name=body.display_name,
        )
        result = auth_domain.register(conn, auth_context(), command, client_info(body.device_id))
        data = _payload(result)
        response = success(data, int(result.player["state_version"]), status=201)
        set_refresh_cookie(response, result.refresh_token, result.refresh_ttl)
    metrics.inc("atlas_auth_total", {"action": "register"})
    return response


@bp.post("/auth/login")
@rate_limit("login:ip", 5, 60, by="ip")
def login():
    body = parse_model(LoginRequest)
    _limit_account(body.email)
    with auth_transaction() as conn:
        universe = universe_domain.resolve(conn, body.universe_seed_name)
        command = auth_domain.LoginCommand(
            email=body.email, password=body.password, universe=universe
        )
        result = auth_domain.login(conn, auth_context(), command, client_info())
        data = _payload(result)
        response = success(data, int(result.player["state_version"]))
        set_refresh_cookie(response, result.refresh_token, result.refresh_ttl)
    metrics.inc("atlas_auth_total", {"action": "login"})
    return response


@bp.post("/session")
@rate_limit("session:ip", 10, 60, by="ip")
def session():
    body = parse_model(SessionRequest)
    with auth_transaction() as conn:
        universe = universe_domain.resolve(conn, body.universe_seed_name)
        info = client_info(body.device_id)
        command = auth_domain.GuestCommand(universe=universe, device_hash=info.device_hash or "")
        result = auth_domain.guest_session(conn, auth_context(), command, info)
        data = _payload(result)
        snapshot = state_domain.compose(conn, result.player)
        data["resources"] = snapshot["resources"]
        data["cooldowns"] = snapshot["cooldowns"]
        response = success(data, int(result.player["state_version"]), status=201 if result.created else 200)
        set_refresh_cookie(response, result.refresh_token, result.refresh_ttl)
    metrics.inc("atlas_auth_total", {"action": "guest"})
    return response


@bp.post("/auth/refresh")
@rate_limit("refresh:ip", 60, 60, by="ip")
def refresh():
    token = refresh_token_from_cookie()
    with auth_transaction() as conn:
        result = auth_domain.refresh(conn, auth_context(), token, client_info())
        response = success(_payload(result), int(result.player["state_version"]))
        set_refresh_cookie(response, result.refresh_token, result.refresh_ttl)
    metrics.inc("atlas_auth_total", {"action": "refresh"})
    return response


@bp.post("/auth/logout")
@require_auth()
def logout():
    with db().transaction() as conn:
        session_repo.revoke(conn, g.session_id, "logout")
        audit_repo.write(
            conn,
            audit_repo.AuditEvent(
                action="logout", actor=g.account_id, request_id=getattr(g, "request_id", None)
            ),
        )
    cache().set_json(f"revoked:{g.session_id}", 1, 900)
    response = success({"logged_out": True})
    return clear_refresh_cookie(response)


@bp.post("/auth/logout-all")
@require_auth()
def logout_all():
    with db().transaction() as conn:
        count = auth_domain.logout_all(conn, g.account_id)
        audit_repo.write(
            conn,
            audit_repo.AuditEvent(action="logout_all", actor=g.account_id, after={"revoked": count}),
        )
    response = success({"revoked_sessions": count})
    return clear_refresh_cookie(response)


@bp.get("/me")
@require_auth()
def me():
    player = current_player()
    with db().connection() as conn:
        fresh = player_repo.get(conn, player["id"])
    return success(
        {
            "player": {
                "id": str(fresh["id"]),
                "display_name": fresh["display_name"],
                "timezone": fresh["timezone"],
                "state_version": int(fresh["state_version"]),
            },
            "account": {
                "id": str(player["account_id"]),
                "status": player["account_status"],
                "role": player["account_role"],
            },
        },
        int(fresh["state_version"]),
    )


def _payload(result: auth_domain.AuthResult) -> dict:
    return {
        "player": {
            "id": str(result.player["id"]),
            "display_name": result.player["display_name"],
            "timezone": result.player["timezone"],
            "state_version": int(result.player["state_version"]),
        },
        "account": {
            "id": str(result.account["id"]),
            "status": result.account["status"],
            "role": result.account["role"],
        },
        "access_token": result.access.token,
        "token_type": "Bearer",
        "expires_in": result.access.expires_in,
    }


def _limit_account(email: str) -> None:
    remaining = cache().take_token(f"rl:login:acc:{email.lower()}", 10, 3600)
    if remaining < 0:
        raise RateLimited(15 * 60 * 1000, "该账号尝试过于频繁")

"""Cross-cutting HTTP concerns: auth, rate limits, idempotency, envelopes."""

from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
from functools import wraps
from typing import Any, Callable, Iterator

from flask import g, jsonify, request
from pydantic import BaseModel, ValidationError

from ..config import Settings, get_settings
from ..domain.auth import AuthContext, ClientInfo, device_hash
from ..infra.context import cache, db, keys
from ..infra.errors import (
    AccountLocked,
    ApiError,
    IdempotencyConflict,
    InvalidArgument,
    MissingIdempotencyKey,
    PlayerLocked,
    RateLimited,
    StaleState,
    Unauthenticated,
)
from ..infra.security import request_hash
from ..repo import idempotency as idem_repo
from ..repo import players as player_repo


def settings() -> Settings:
    return get_settings()


def auth_context() -> AuthContext:
    current = settings()
    return AuthContext(
        ring=keys(),
        access_ttl=current.access_token_ttl_seconds,
        refresh_ttl=current.refresh_token_ttl_seconds,
    )


def client_info(device_id: str | None = None) -> ClientInfo:
    return ClientInfo(
        user_agent=request.headers.get("User-Agent", "")[:256],
        ip=request.remote_addr,
        device_hash=device_hash(device_id) if device_id else None,
        request_id=getattr(g, "request_id", None),
    )


def parse_model(model: type[BaseModel]) -> BaseModel:
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        raise InvalidArgument("请求体必须是 JSON 对象")
    try:
        return model.model_validate(payload)
    except ValidationError as exc:
        first = exc.errors()[0]
        raise InvalidArgument(f"{'.'.join(str(p) for p in first['loc'])}: {first['msg']}") from exc


def require_auth(write: bool = False) -> Callable:
    """Verify the access token and load player + account into ``g``."""

    def decorator(view: Callable) -> Callable:
        @wraps(view)
        def wrapper(*args: Any, **kwargs: Any):
            header = request.headers.get("Authorization", "")
            if not header.startswith("Bearer "):
                raise Unauthenticated("缺少访问令牌")
            claims = keys().decode(header[7:].strip())
            with db().connection() as conn:
                identity = player_repo.identity(conn, claims["sub"])
            if identity is None:
                raise Unauthenticated("令牌关联的玩家不存在")
            if int(claims.get("ver", -1)) != int(identity["token_version"]):
                raise Unauthenticated("令牌已失效，请重新登录")
            if identity["account_status"] in {"locked", "deleted"}:
                raise AccountLocked("账号状态不可用")
            if write and identity.get("locked_reason"):
                raise PlayerLocked(f"玩家已被冻结：{identity['locked_reason']}")
            g.player = identity
            g.player_id = identity["id"]
            g.account_id = identity["account_id"]
            g.session_id = claims["sid"]
            return view(*args, **kwargs)

        return wrapper

    return decorator


def rate_limit(scope: str, capacity: int, per_seconds: int, by: str = "player") -> Callable:
    """Token bucket per identity; falls back to the in-process bucket."""

    def decorator(view: Callable) -> Callable:
        @wraps(view)
        def wrapper(*args: Any, **kwargs: Any):
            if not settings().rate_limit_enabled:
                return view(*args, **kwargs)
            identity = getattr(g, "player_id", None) if by == "player" else request.remote_addr
            if not identity:
                identity = "anonymous"
            key = f"rl:{scope}:{identity}"
            remaining = cache().take_token(key, capacity, per_seconds)
            if remaining < 0:
                raise RateLimited(max(1000, per_seconds * 1000 // max(1, capacity)))
            response = view(*args, **kwargs)
            if hasattr(response, "headers"):
                response.headers["RateLimit-Limit"] = str(capacity)
                response.headers["RateLimit-Remaining"] = str(max(0, remaining))
                response.headers["RateLimit-Reset"] = str(per_seconds)
            return response

        return wrapper

    return decorator


@dataclass
class IdempotencyTicket:
    key: str
    account_id: str
    request_hash: str
    cached: dict | None = None

    @property
    def replayed(self) -> bool:
        return self.cached is not None


def begin_idempotency(conn, account_id: str, payload: dict) -> IdempotencyTicket:
    key = (request.headers.get("Idempotency-Key") or "").strip()
    if not key:
        raise MissingIdempotencyKey("写接口必须带 Idempotency-Key")
    if len(key) > 128:
        raise InvalidArgument("Idempotency-Key 过长")
    scoped = f"{account_id}:{key}"
    digest = request_hash(request.method, request.path, payload)
    row = idem_repo.claim(conn, key=scoped, account_id=account_id, route=request.path, request_hash=digest)
    if row is None:
        return IdempotencyTicket(scoped, account_id, digest)
    if row["account_id"] != account_id or row["request_hash"] != digest:
        raise IdempotencyConflict("同一幂等键用于了不同请求")
    if row["response"] is None:
        raise IdempotencyConflict("相同请求仍在处理中")
    return IdempotencyTicket(scoped, account_id, digest, cached=row["response"])


def finish_idempotency(conn, ticket: IdempotencyTicket, status: int, data: dict) -> None:
    idem_repo.store(conn, key=ticket.key, account_id=ticket.account_id, status=status, response=data)


def success(data: dict, state_version: int | None = None, status: int = 200, extra_headers: dict | None = None):
    body: dict[str, Any] = {"ok": True, "request_id": getattr(g, "request_id", ""), "data": data}
    if state_version is not None:
        body["state_version"] = int(state_version)
    response = jsonify(body)
    response.status_code = status
    if state_version is not None:
        response.headers["ETag"] = f'"{int(state_version)}"'
    for name, value in (extra_headers or {}).items():
        response.headers[name] = value
    return response


def check_if_match(player: dict) -> None:
    header = request.headers.get("If-Match")
    if not header:
        return
    expected = header.strip().strip('"')
    if expected != str(int(player["state_version"])):
        raise StaleState(f"期望状态 {expected}，当前 {player['state_version']}")


def set_refresh_cookie(response, token: str, ttl: int):
    response.set_cookie(
        "atlas_refresh",
        token,
        max_age=ttl,
        httponly=True,
        secure=settings().is_prod,
        samesite="Strict",
        path="/api/v1/auth",
    )
    return response


def clear_refresh_cookie(response):
    response.delete_cookie("atlas_refresh", path="/api/v1/auth")
    return response


def refresh_token_from_cookie() -> str:
    token = request.cookies.get("atlas_refresh", "")
    if not token:
        raise Unauthenticated("缺少刷新令牌")
    return token


def current_player() -> dict:
    player = getattr(g, "player", None)
    if not player:
        raise Unauthenticated("未认证")
    return player


@contextmanager
def auth_transaction() -> Iterator[Any]:
    """Commit auth bookkeeping before surfacing an ``ApiError``.

    Failed logins must increment ``failed_logins`` and refresh reuse must revoke
    every session — both happen right before the error is raised. A plain
    transaction would roll them back, so capture the error, let the transaction
    commit, and only then re-raise.
    """
    captured: ApiError | None = None
    with db().transaction() as conn:
        try:
            yield conn
        except ApiError as exc:
            captured = exc
    if captured is not None:
        raise captured

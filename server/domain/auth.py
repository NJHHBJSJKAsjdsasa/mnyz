"""Accounts, guest sessions and refresh rotation (docs/server/03).

Token format is ``<session_id>.<secret>``: the id makes lookup a primary-key
read while the secret is still verified against an Argon2id hash. The docs'
"lookup by hash" only works for deterministic hashes, which Argon2 is not.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import datetime

from ..infra.clock import db_now
from ..infra.errors import (
    AccountLocked,
    EmailTaken,
    InvalidArgument,
    InvalidCredentials,
    SessionReuse,
    SessionRevoked,
    Unauthenticated,
)
from ..infra.security import (
    AccessToken,
    KeyRing,
    dummy_verify,
    hash_password,
    hash_refresh,
    new_refresh_token,
    password_policy_errors,
    split_refresh_token,
    valid_email,
    verify_password,
    verify_refresh,
)
from ..repo import accounts as account_repo
from ..repo import audit as audit_repo
from ..repo import players as player_repo
from ..repo import sessions as session_repo
from ..repo import ships as ship_repo
from ..repo import wallets as wallet_repo

MAX_FAILURES = 5
LOCK_SECONDS = 900


@dataclass(frozen=True)
class AuthContext:
    ring: KeyRing
    access_ttl: int
    refresh_ttl: int


@dataclass(frozen=True)
class ClientInfo:
    user_agent: str = ""
    ip: str | None = None
    device_hash: str | None = None
    request_id: str | None = None


@dataclass
class AuthResult:
    account: dict
    player: dict
    access: AccessToken
    refresh_token: str
    refresh_ttl: int
    created: bool = False


@dataclass(frozen=True)
class RegisterCommand:
    email: str
    password: str
    universe: dict
    display_name: str = "舰长"


@dataclass(frozen=True)
class LoginCommand:
    email: str
    password: str
    universe: dict


@dataclass(frozen=True)
class GuestCommand:
    universe: dict
    device_hash: str


def register(conn, ctx: AuthContext, command: RegisterCommand, client: ClientInfo) -> AuthResult:
    email, password = command.email, command.password
    problems = password_policy_errors(password, email)
    if not valid_email(email):
        problems.append("邮箱格式无效")
    if problems:
        raise InvalidArgument("；".join(problems))
    if account_repo.by_email(conn, email):
        raise EmailTaken("该邮箱已注册")

    account = account_repo.create(
        conn, email=email.lower(), password_hash=hash_password(password), status="active"
    )
    player = _ensure_player(conn, account["id"], command.universe, command.display_name)
    refresh_token = _new_session(conn, ctx, player, client)
    audit_repo.write(
        conn,
        audit_repo.AuditEvent(
            action="register", actor=account["id"], ip=client.ip, request_id=client.request_id
        ),
    )
    return _result(ctx, account, player, refresh_token, created=True)


def login(conn, ctx: AuthContext, command: LoginCommand, client: ClientInfo) -> AuthResult:
    account = account_repo.by_email(conn, command.email)
    if account is None:
        dummy_verify(command.password)
        audit_repo.write(conn, audit_repo.AuditEvent(action="login_failed", target=command.email, ip=client.ip))
        raise InvalidCredentials()
    if account["status"] == "deleted":
        raise InvalidCredentials()
    _assert_not_locked(conn, account)

    ok, needs_rehash = verify_password(command.password, account["password_hash"] or "")
    if not ok:
        row = account_repo.record_failure(
            conn, account["id"], threshold=MAX_FAILURES, lock_seconds=LOCK_SECONDS
        )
        audit_repo.write(conn, audit_repo.AuditEvent(action="login_failed", actor=account["id"], ip=client.ip))
        if row["locked_until"] and row["failed_logins"] >= MAX_FAILURES:
            raise AccountLocked(f"失败次数过多，已锁定至 {row['locked_until'].isoformat()}")
        raise InvalidCredentials()

    if needs_rehash:
        account_repo.set_password(conn, account["id"], hash_password(command.password))
        account = account_repo.by_id(conn, account["id"])
    account_repo.reset_failures(conn, account["id"])
    player = _ensure_player(conn, account["id"], command.universe, "舰长")
    refresh_token = _new_session(conn, ctx, player, client)
    audit_repo.write(
        conn,
        audit_repo.AuditEvent(
            action="login", actor=account["id"], ip=client.ip, request_id=client.request_id
        ),
    )
    return _result(ctx, account, player, refresh_token)


def guest_session(conn, ctx: AuthContext, command: GuestCommand, client: ClientInfo) -> AuthResult:
    bound = account_repo.by_device(conn, command.device_hash)
    if bound:
        if bound["status"] == "deleted":
            raise InvalidCredentials()
        account = account_repo.by_id(conn, bound["account_id"])
        player = player_repo.get(conn, bound["player_id"])
        refresh_token = _new_session(conn, ctx, player, client)
        return _result(ctx, account, player, refresh_token)

    account = account_repo.create(conn, email=None, password_hash=None, status="guest")
    player = _ensure_player(conn, account["id"], command.universe, "舰长")
    account_repo.bind_device(conn, command.device_hash, account["id"], player["id"])
    refresh_token = _new_session(conn, ctx, player, client)
    return _result(ctx, account, player, refresh_token, created=True)


def refresh(conn, ctx: AuthContext, token: str, client: ClientInfo) -> AuthResult:
    sid, secret = split_refresh_token(token)
    session = session_repo.by_id(conn, sid)
    if session is None:
        raise Unauthenticated("会话不存在")
    if session["revoked_at"] is not None:
        _handle_revoked(conn, session, client)
    if not verify_refresh(secret, session["refresh_hash"]):
        raise Unauthenticated("刷新令牌无效")

    if not session_repo.rotate(conn, sid):
        raise SessionRevoked("会话已在其它请求中轮换")

    account = account_repo.by_id(conn, session["account_id"])
    player = player_repo.get(conn, session["player_id"]) if session["player_id"] else None
    if account is None or player is None:
        raise Unauthenticated("会话关联的玩家不存在")
    new_token = _new_session(conn, ctx, player, client, rotated_from=session["id"])
    return _result(ctx, account, player, new_token)


def logout(conn, session_id: str, reason: str = "logout") -> None:
    session_repo.revoke(conn, session_id, reason)


def logout_all(conn, account_id: str, reason: str = "logout_all") -> int:
    return session_repo.revoke_all(conn, account_id, reason)


def _handle_revoked(conn, session: dict, client: ClientInfo) -> None:
    if session["revoke_reason"] == "rotated":
        if _looks_like_concurrent_retry(conn, session, client):
            raise SessionRevoked("并发刷新，请稍后重试")
        session_repo.revoke_all(conn, session["account_id"], "reuse_detected")
        audit_repo.write(
            conn,
            audit_repo.AuditEvent(
                action="refresh_reuse",
                actor=str(session["account_id"]),
                target=str(session["id"]),
                ip=client.ip,
                request_id=client.request_id,
            ),
        )
        raise SessionReuse()
    raise SessionRevoked("会话已失效，请重新登录")


def _looks_like_concurrent_retry(conn, session: dict, client: ClientInfo) -> bool:
    """Two tabs refreshing at once must not be treated as token theft."""
    last_used = session.get("last_used_at")
    if not last_used:
        return False
    recent = (db_now(conn) - last_used).total_seconds() <= 5
    same_agent = (session.get("user_agent") or "") == (client.user_agent or "")[:256]
    return recent and same_agent


def _assert_not_locked(conn, account: dict) -> None:
    locked_until: datetime | None = account.get("locked_until")
    if account["status"] != "locked" and not locked_until:
        return
    if locked_until and locked_until <= db_now(conn):
        account_repo.reset_failures(conn, account["id"])
        if account["status"] == "locked":
            account_repo.set_status(conn, account["id"], "active")
        return
    raise AccountLocked("账号已被锁定，请稍后再试")


def _ensure_player(conn, account_id: str, universe: dict, display_name: str) -> dict:
    player = player_repo.by_account(conn, account_id, universe["id"])
    if player:
        return player
    player = player_repo.create(
        conn,
        account_id=account_id,
        universe_id=universe["id"],
        display_name=(display_name or "舰长")[:24],
    )
    wallet_repo.ensure(conn, player["id"])
    ship_repo.create_default(conn, player["id"])
    ship_repo.ensure_flags(conn, player["id"])
    return player


def _new_session(
    conn,
    ctx: AuthContext,
    player: dict,
    client: ClientInfo,
    rotated_from: str | None = None,
) -> str:
    sid, secret, token = new_refresh_token()
    session_repo.create(
        conn,
        session_repo.NewSession(
            id=sid,
            account_id=str(player["account_id"]),
            player_id=str(player["id"]),
            refresh_hash=hash_refresh(secret),
            rotated_from=rotated_from,
            user_agent=client.user_agent,
            ip=client.ip,
        ),
    )
    return token


def _result(ctx: AuthContext, account: dict, player: dict, refresh_token: str, created: bool = False) -> AuthResult:
    access = ctx.ring.encode_access(
        str(player["id"]),
        _session_of(refresh_token),
        int(account["token_version"]),
        ctx.access_ttl,
    )
    return AuthResult(
        account=account,
        player=player,
        access=access,
        refresh_token=refresh_token,
        refresh_ttl=ctx.refresh_ttl,
        created=created,
    )


def _session_of(token: str) -> str:
    return token.split(".", 1)[0]


def device_hash(device_id: str) -> str:
    return hashlib.sha256(("atlas-device:" + device_id).encode("utf-8")).hexdigest()

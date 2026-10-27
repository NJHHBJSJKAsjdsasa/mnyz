"""Argon2id passwords, RS256 access tokens, rotating refresh tokens, cursors."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
import secrets
import uuid
from dataclasses import dataclass
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from .errors import TokenExpired, Unauthenticated

# docs/server/03 §3: m=64MB, t=3, p=4, ~80ms per verification.
HASHER = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=4)
_DUMMY_HASH = HASHER.hash("atlas-timing-equaliser")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_WEAK = {"password", "1234567890", "qwertyuiop", "atlasatlas"}

ISSUER = "atlas"
AUDIENCE = "atlas-api"


def hash_password(password: str) -> str:
    return HASHER.hash(password)


def verify_password(password: str, stored: str) -> tuple[bool, bool]:
    """Return ``(ok, needs_rehash)``; never leaks whether the account exists."""
    try:
        HASHER.verify(stored, password)
        return True, HASHER.check_needs_rehash(stored)
    except (VerificationError, InvalidHashError):
        return False, False


def dummy_verify(password: str) -> None:
    """Burn the same CPU time as a real verification (anti-timing side channel)."""
    try:
        HASHER.verify(_DUMMY_HASH, password)
    except (VerificationError, InvalidHashError):
        pass


def password_policy_errors(password: str, email: str = "") -> list[str]:
    problems: list[str] = []
    if len(password) < 10:
        problems.append("密码至少 10 位")
    if len(password) > 128:
        problems.append("密码不得超过 128 位")
    if password.isdigit():
        problems.append("密码不能是纯数字")
    if email and password.lower() == email.lower():
        problems.append("密码不能与邮箱相同")
    if password.lower() in _WEAK:
        problems.append("密码过于常见")
    return problems


def valid_email(email: str) -> bool:
    return bool(_EMAIL_RE.match(email or "")) and len(email) <= 254


@dataclass(frozen=True)
class AccessToken:
    token: str
    expires_in: int
    jti: str


class KeyRing:
    """RS256 signing with one active key and any number of verification keys."""

    def __init__(
        self,
        private_pem: str,
        public_pem: str,
        kid: str,
        previous_pem: str = "",
    ) -> None:
        self.private_pem = private_pem
        self.kid = kid
        self._public: dict[str, str] = {kid: public_pem}
        if previous_pem:
            self._public[f"{kid}-prev"] = previous_pem

    @classmethod
    def from_settings(cls, settings) -> "KeyRing":
        ring = cls(
            settings.jwt_private_key,
            settings.jwt_public_key,
            settings.jwt_kid,
            settings.jwt_previous_public_key,
        )
        ring.self_test()
        return ring

    def self_test(self) -> None:
        token = self.encode_access("00000000-0000-0000-0000-000000000000", "self-test", 0, 30)
        claims = self.decode(token.token)
        if claims.get("sid") != "self-test":
            raise ValueError("JWT self-check failed: kid/keys do not match")

    def encode_access(self, player_id: str, sid: str, token_version: int, ttl: int) -> AccessToken:
        jti = uuid.uuid4().hex
        payload: dict[str, Any] = {
            "sub": player_id,
            "sid": sid,
            "ver": token_version,
            "role": "player",
            "iss": ISSUER,
            "aud": AUDIENCE,
            "jti": jti,
        }
        now = int(__import__("time").time())
        payload["iat"] = now
        payload["exp"] = now + ttl
        token = jwt.encode(payload, self.private_pem, algorithm="RS256", headers={"kid": self.kid})
        return AccessToken(token=token, expires_in=ttl, jti=jti)

    def decode(self, token: str) -> dict[str, Any]:
        try:
            header = jwt.get_unverified_header(token)
        except jwt.InvalidTokenError as exc:
            raise Unauthenticated("令牌格式无效") from exc
        key = self._public.get(str(header.get("kid", "")))
        if not key:
            raise Unauthenticated("未知的签名密钥")
        try:
            return jwt.decode(
                token,
                key,
                algorithms=["RS256"],
                audience=AUDIENCE,
                issuer=ISSUER,
                options={"require": ["exp", "iat", "sub", "sid"]},
            )
        except jwt.ExpiredSignatureError as exc:
            raise TokenExpired("访问令牌已过期") from exc
        except jwt.InvalidTokenError as exc:
            raise Unauthenticated("令牌校验失败") from exc


def new_refresh_token(session_id: str | None = None) -> tuple[str, str, str]:
    """Return ``(sid, secret, token)``; only the secret's hash is persisted."""
    sid = session_id or str(uuid.uuid4())
    secret = secrets.token_urlsafe(32)
    return sid, secret, f"{sid}.{secret}"


def split_refresh_token(token: str) -> tuple[str, str]:
    sid, _, secret = (token or "").partition(".")
    if not sid or not secret:
        raise Unauthenticated("刷新令牌格式无效")
    return sid, secret


def hash_refresh(secret: str) -> str:
    return HASHER.hash(secret)


def verify_refresh(secret: str, stored_hash: str) -> bool:
    try:
        HASHER.verify(stored_hash, secret)
        return True
    except (VerificationError, InvalidHashError):
        return False


def request_hash(method: str, path: str, body: Any) -> str:
    canonical = json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(f"{method.upper()}|{path}|{canonical}".encode("utf-8")).hexdigest()


def sign_cursor(payload: dict[str, Any], secret: str) -> str:
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    mac = hmac.new(secret.encode(), raw, hashlib.sha256).digest()[:12]
    return base64.urlsafe_b64encode(raw + b"." + mac).decode().rstrip("=")


def parse_cursor(cursor: str, secret: str) -> dict[str, Any]:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        blob = base64.urlsafe_b64decode(padded)
        raw, mac = blob.rsplit(b".", 1)
        expected = hmac.new(secret.encode(), raw, hashlib.sha256).digest()[:12]
        if not hmac.compare_digest(mac, expected):
            raise ValueError("bad signature")
        return json.loads(raw)
    except Exception as exc:  # noqa: BLE001 - any malformed cursor is a 400
        raise ValueError("invalid cursor") from exc

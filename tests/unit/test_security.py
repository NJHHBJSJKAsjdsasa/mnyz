"""Passwords, JWT key ring, refresh tokens and signed cursors."""

from __future__ import annotations

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from server.infra.errors import TokenExpired, Unauthenticated
from server.infra.security import (
    KeyRing,
    hash_password,
    hash_refresh,
    new_refresh_token,
    parse_cursor,
    password_policy_errors,
    request_hash,
    sign_cursor,
    split_refresh_token,
    valid_email,
    verify_password,
    verify_refresh,
)


@pytest.fixture(scope="module")
def ring() -> KeyRing:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    public_pem = key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()
    return KeyRing(private_pem, public_pem, "test-kid")


def test_password_hash_roundtrip():
    digest = hash_password("warp-drive-42")
    assert digest.startswith("$argon2id$")
    ok, needs_rehash = verify_password("warp-drive-42", digest)
    assert ok is True
    assert needs_rehash is False
    assert verify_password("wrong-password", digest)[0] is False


def test_password_policy():
    assert password_policy_errors("short", "a@b.co")
    assert password_policy_errors("1234567890", "a@b.co")
    assert password_policy_errors("a@b.co", "a@b.co")
    assert password_policy_errors("warp-drive-42", "a@b.co") == []
    assert valid_email("a@b.co")
    assert not valid_email("not-an-email")


def test_access_token_roundtrip(ring: KeyRing):
    token = ring.encode_access("player-1", "session-1", 3, 60)
    claims = ring.decode(token.token)
    assert claims["sub"] == "player-1"
    assert claims["sid"] == "session-1"
    assert claims["ver"] == 3
    assert claims["iss"] == "atlas"


def test_expired_token(ring: KeyRing):
    token = ring.encode_access("player-1", "session-1", 0, -5)
    with pytest.raises(TokenExpired):
        ring.decode(token.token)


def test_tampered_token(ring: KeyRing):
    token = ring.encode_access("player-1", "session-1", 0, 60)
    with pytest.raises(Unauthenticated):
        ring.decode(token.token[:-3] + "abc")


def test_unknown_kid(ring: KeyRing):
    import time

    import jwt

    now = int(time.time())
    token = jwt.encode(
        {
            "sub": "p",
            "sid": "s",
            "ver": 0,
            "iss": "atlas",
            "aud": "atlas-api",
            "iat": now,
            "exp": now + 60,
        },
        ring.private_pem,
        algorithm="RS256",
        headers={"kid": "ghost"},
    )
    with pytest.raises(Unauthenticated):
        ring.decode(token)


def test_refresh_token_shape_and_hash():
    sid, secret, token = new_refresh_token()
    assert token == f"{sid}.{secret}"
    assert split_refresh_token(token) == (sid, secret)
    digest = hash_refresh(secret)
    assert verify_refresh(secret, digest)
    assert not verify_refresh("nope", digest)


def test_request_hash_is_order_independent():
    a = request_hash("POST", "/x", {"a": 1, "b": 2})
    b = request_hash("post", "/x", {"b": 2, "a": 1})
    assert a == b
    assert a != request_hash("POST", "/x", {"a": 1, "b": 3})


def test_cursor_signature():
    secret = "s" * 32
    cursor = sign_cursor({"k": "2026-10-25", "id": 7}, secret)
    assert parse_cursor(cursor, secret) == {"k": "2026-10-25", "id": 7}
    with pytest.raises(ValueError):
        parse_cursor(cursor[:-2] + "AA", secret)

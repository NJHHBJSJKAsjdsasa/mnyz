"""Resolve the requested universe; dev may provision one on the fly."""

from __future__ import annotations

from ..config import get_settings
from ..infra.errors import NotFound
from ..repo import universes as universe_repo

DEV_ORIGIN_MS = 1735689600000  # 2025-01-01T00:00:00Z


def resolve(conn, seed_name: str) -> dict:
    row = universe_repo.by_seed_name(conn, seed_name)
    if row:
        return row
    settings = get_settings()
    if not settings.is_dev:
        raise NotFound(f"宇宙 {seed_name} 不存在")
    return universe_repo.create(conn, seed_name, universe_repo.derive_seed(seed_name), DEV_ORIGIN_MS)

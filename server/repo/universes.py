"""Universe lookup and dev-only auto-provisioning."""

from __future__ import annotations

import hashlib


def by_seed_name(conn, seed_name: str) -> dict | None:
    return conn.execute(
        "SELECT id, seed_name, seed, cosmic_origin_time, world_mode FROM universes WHERE seed_name = %s",
        (seed_name,),
    ).fetchone()


def by_id(conn, universe_id: str) -> dict | None:
    return conn.execute("SELECT * FROM universes WHERE id = %s", (universe_id,)).fetchone()


def create(conn, seed_name: str, seed: int, cosmic_origin_time: int) -> dict:
    return conn.execute(
        """
        INSERT INTO universes (seed_name, seed, cosmic_origin_time)
        VALUES (%s, %s, %s)
        ON CONFLICT (seed_name) DO UPDATE SET seed_name = EXCLUDED.seed_name
        RETURNING id, seed_name, seed, cosmic_origin_time, world_mode
        """,
        (seed_name, seed, cosmic_origin_time),
    ).fetchone()


def derive_seed(seed_name: str) -> int:
    """Stable 63-bit seed so a dev universe is reproducible across restarts."""
    digest = hashlib.sha256(seed_name.encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big") & 0x7FFF_FFFF_FFFF_FFFF

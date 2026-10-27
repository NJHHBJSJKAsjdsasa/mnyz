"""Read-through cache for server-generated planets (universe_cache.planets)."""

from __future__ import annotations

import json
from uuid import NAMESPACE_URL, uuid5

SCHEMA = "universe_cache"
GENERATOR_VERSION = 1


def cache_universe_id(universe_id) -> str:
    """Server-owned namespace; keeps API-generated rows apart from legacy ones."""
    return str(uuid5(NAMESPACE_URL, f"atlas-api-universe:{universe_id}"))


def version(conn, cache_universe: str) -> int:
    row = conn.execute(
        f"SELECT generator_version FROM {SCHEMA}.cache_meta WHERE universe_id = %s",
        (cache_universe,),
    ).fetchone()
    return int(row["generator_version"]) if row else GENERATOR_VERSION


def get(conn, cache_universe: str, key: dict):
    row = conn.execute(
        f"""
        SELECT p.data FROM {SCHEMA}.planets p
          JOIN {SCHEMA}.cache_meta m ON m.universe_id = p.universe_id
         WHERE p.universe_id = %s AND p.x = %s AND p.y = %s AND p.z = %s
           AND p.system_index = %s AND p.planet_name = %s
           AND p.generator_version = m.generator_version
        """,
        (
            cache_universe,
            key["x"],
            key["y"],
            key["z"],
            key["system_index"],
            key["planet_name"],
        ),
    ).fetchone()
    return row["data"] if row else None


def put(conn, cache_universe: str, key: dict, data: dict) -> None:
    conn.execute(
        f"""
        INSERT INTO {SCHEMA}.cache_meta (universe_id, generator_version)
        VALUES (%s, %s) ON CONFLICT (universe_id) DO NOTHING
        """,
        (cache_universe, GENERATOR_VERSION),
    )
    current = version(conn, cache_universe)
    conn.execute(
        f"""
        INSERT INTO {SCHEMA}.planets
               (universe_id, x, y, z, system_index, planet_name, data, generator_version)
        VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, %s)
        ON CONFLICT (universe_id, x, y, z, system_index, planet_name)
        DO UPDATE SET data = EXCLUDED.data,
                      generator_version = EXCLUDED.generator_version,
                      updated_at = now()
        WHERE {SCHEMA}.planets.generator_version < EXCLUDED.generator_version
        """,
        (
            cache_universe,
            key["x"],
            key["y"],
            key["z"],
            key["system_index"],
            key["planet_name"],
            json.dumps(data, sort_keys=True, ensure_ascii=False),
            current,
        ),
    )


def bump(conn, cache_universe: str) -> int:
    conn.execute(
        f"INSERT INTO {SCHEMA}.cache_meta (universe_id) VALUES (%s) ON CONFLICT DO NOTHING",
        (cache_universe,),
    )
    row = conn.execute(
        f"UPDATE {SCHEMA}.cache_meta SET generator_version = generator_version + 1, updated_at = now() "
        "WHERE universe_id = %s RETURNING generator_version",
        (cache_universe,),
    ).fetchone()
    return int(row["generator_version"]) if row else 0

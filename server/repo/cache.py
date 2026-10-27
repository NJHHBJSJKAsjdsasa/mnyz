"""SQL for the derived ``universe_cache`` schema (eviction / version bump)."""

from __future__ import annotations

SCHEMA = "universe_cache"
TABLES = ("planets", "systems", "galaxies")


def schema_ready(conn) -> bool:
    row = conn.execute(
        "SELECT 1 AS hit FROM information_schema.schemata WHERE schema_name = %s", (SCHEMA,)
    ).fetchone()
    return bool(row)


def total_counts(conn) -> dict[str, int]:
    counts: dict[str, int] = {}
    for table in TABLES:
        row = conn.execute(f"SELECT count(*) AS n FROM {SCHEMA}.{table}").fetchone()
        counts[table] = int(row["n"])
    return counts


def evict(conn, table: str, keep: int, batch: int = 10000) -> int:
    """Delete oldest rows beyond ``keep``; identifiers come from a whitelist."""
    if table not in TABLES:
        raise ValueError(table)
    rows = conn.execute(
        f"""
        WITH victims AS (
          SELECT ctid FROM {SCHEMA}.{table}
           ORDER BY updated_at DESC
           OFFSET %s LIMIT %s
        )
        DELETE FROM {SCHEMA}.{table} t USING victims v WHERE t.ctid = v.ctid
        RETURNING t.id
        """,
        (keep, batch),
    ).fetchall()
    return len(rows)


def version(conn, universe_id: str) -> int:
    row = conn.execute(
        f"SELECT generator_version FROM {SCHEMA}.cache_meta WHERE universe_id = %s", (universe_id,)
    ).fetchone()
    return int(row["generator_version"]) if row else 0


def bump_version(conn, universe_id: str) -> int:
    conn.execute(
        f"INSERT INTO {SCHEMA}.cache_meta (universe_id, generator_version) VALUES (%s, 1) "
        "ON CONFLICT (universe_id) DO NOTHING",
        (universe_id,),
    )
    row = conn.execute(
        f"UPDATE {SCHEMA}.cache_meta SET generator_version = generator_version + 1, updated_at = now() "
        "WHERE universe_id = %s RETURNING generator_version",
        (universe_id,),
    ).fetchone()
    return int(row["generator_version"]) if row else 0

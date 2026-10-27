"""PostgreSQL implementation of the derived universe cache.

This module is deliberately independent from Flask and from ``server.config``:
the legacy app may import it at any time, and a missing DSN must degrade to
"generate fresh, do not persist" instead of raising (docs/server/16 §7).

All methods are cache operations: every failure returns ``None``/``False`` and
logs at most once per minute. Callers must treat a miss as "generate again".
"""

from __future__ import annotations

import atexit
import configparser
import json
import logging
import os
import random
import threading
import time
import uuid
from contextlib import contextmanager
from pathlib import Path

log = logging.getLogger(__name__)

DEFAULT_SCHEMA = "universe_cache"
TABLES = {
    "galaxy": ("galaxies", ("x", "y", "z")),
    "system": ("systems", ("x", "y", "z", "system_index")),
    "planet": ("planets", ("x", "y", "z", "system_index", "planet_name")),
}
HIT_SAMPLE_RATE = 1 / 64
FAILURE_COOLDOWN_SECONDS = 30.0
ENV_FILE = Path(__file__).resolve().parent.parent / ".env.server"


def load_env_file(path: Path = ENV_FILE) -> None:
    """Read the server env file when the process was started without exports."""
    if os.getenv("ATLAS_DATABASE_URL") or not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        if key in {"ATLAS_DATABASE_URL", "ATLAS_CACHE_SCHEMA"} and not os.getenv(key):
            os.environ[key] = value.strip().strip("\"'")


def schema_name() -> str:
    name = os.getenv("ATLAS_CACHE_SCHEMA", DEFAULT_SCHEMA).strip()
    if not name or not name.replace("_", "").isalnum() or name[0].isdigit():
        log.warning("invalid ATLAS_CACHE_SCHEMA %r; using %s", name, DEFAULT_SCHEMA)
        return DEFAULT_SCHEMA
    return name


def current_universe_id() -> str:
    """Stable uuid derived from the *active* universe, not from a module global.

    ``remote_mode`` can switch universes per session, so this is evaluated on
    every call. ``seed_str`` is the remote-aware value; ``seed_hash`` is not.
    Outside a Flask app context (CLI/backfill) the identity cannot be resolved,
    so an explicit ``ATLAS_UNIVERSE_ID`` is honoured first.
    """
    override = os.getenv("ATLAS_UNIVERSE_ID", "").strip()
    if override:
        try:
            return str(uuid.UUID(override))
        except ValueError:
            log.warning("invalid ATLAS_UNIVERSE_ID %r; deriving instead", override)

    material = ""
    try:
        from flask import has_app_context

        if has_app_context():
            from pymodules.__atlas_config import config

            material = f"{config.seed_str}|{config.cosmic_origin_time or 0}"
    except Exception:  # noqa: BLE001 - legacy install without Flask context
        material = ""
    if not material:
        material = _material_from_atlas_ini()
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "atlas-universe:" + (material or "local-universe|0")))


def _material_from_atlas_ini() -> str:
    """Same seed material as ``Config.initialize`` but without the boot banner."""
    path = Path(os.getenv("ATLAS_ATLAS_INI", "atlas.ini"))
    if not path.exists():
        return ""
    parser = configparser.ConfigParser()
    try:
        parser.read(path)
        if not parser.has_section("Settings"):
            return ""
        seed = parser.get("Settings", "seed", fallback="").strip()
        origin = parser.get("Settings", "cosmic_origin_time", fallback="0").strip()
    except (OSError, configparser.Error):
        return ""
    return f"{seed}|{origin}" if seed else ""


class PgCacheManager:
    """Small pooled client; opens lazily so SQLite-only installs never need psycopg."""

    def __init__(self, dsn: str | None = None, schema: str | None = None, max_size: int = 4) -> None:
        load_env_file()
        self.dsn = dsn or os.getenv("ATLAS_DATABASE_URL", "")
        self.schema = schema_name() if schema is None else schema
        self.max_size = max_size
        self._pool = None
        self._lock = threading.Lock()
        self._disabled_until = 0.0
        self._versions: dict[str, tuple[int, float]] = {}
        atexit.register(self.close)

    @property
    def enabled(self) -> bool:
        return bool(self.dsn)

    def _connect(self):
        if not self.enabled or time.monotonic() < self._disabled_until:
            return None
        with self._lock:
            if self._pool is not None:
                return self._pool
            try:
                from psycopg_pool import ConnectionPool

                pool = ConnectionPool(
                    self.dsn,
                    min_size=0,
                    max_size=self.max_size,
                    kwargs={"autocommit": True, "row_factory": _dict_row()},
                    open=False,
                    timeout=2,
                )
                pool.open(wait=True, timeout=2)
                self._pool = pool
                return pool
            except Exception as exc:  # noqa: BLE001
                self._disable(f"connect failed: {type(exc).__name__}")
                return None

    def _disable(self, reason: str) -> None:
        self._disabled_until = time.monotonic() + FAILURE_COOLDOWN_SECONDS
        log.warning("pg cache disabled for %ss: %s", int(FAILURE_COOLDOWN_SECONDS), reason)

    @contextmanager
    def _connection(self):
        pool = self._connect()
        if pool is None:
            yield None
            return
        with pool.connection() as conn:
            yield conn

    def _run(self, operation, default):
        """Run ``operation(conn)``; cache failures never propagate."""
        try:
            with self._connection() as conn:
                if conn is None:
                    return default
                return operation(conn)
        except Exception as exc:  # noqa: BLE001
            self._disable(f"{type(exc).__name__}: {exc}")
            return default

    def current_version(self, universe_id: str) -> int:
        cached = self._versions.get(universe_id)
        if cached and time.monotonic() - cached[1] < 30:
            return cached[0]
        version = self._run(lambda conn: self._load_version(conn, universe_id), None)
        if version is None:
            # Never cache a value observed during an outage: a stale 1 would make
            # readers treat v2 rows as obsolete once the database is back.
            return 1
        self._versions[universe_id] = (version, time.monotonic())
        return version

    def _load_version(self, conn, universe_id: str) -> int:
        conn.execute(
            f"INSERT INTO {self.schema}.cache_meta (universe_id) VALUES (%s) "
            "ON CONFLICT (universe_id) DO NOTHING",
            (universe_id,),
        )
        row = conn.execute(
            f"SELECT generator_version FROM {self.schema}.cache_meta WHERE universe_id = %s",
            (universe_id,),
        ).fetchone()
        return int(row["generator_version"]) if row else 1

    def bump_version(self, universe_id: str) -> int:
        def operation(conn):
            conn.execute(
                f"INSERT INTO {self.schema}.cache_meta (universe_id, generator_version) VALUES (%s, 1) "
                "ON CONFLICT (universe_id) DO NOTHING",
                (universe_id,),
            )
            row = conn.execute(
                f"UPDATE {self.schema}.cache_meta SET generator_version = generator_version + 1, updated_at = now() "
                "WHERE universe_id = %s RETURNING generator_version",
                (universe_id,),
            ).fetchone()
            return int(row["generator_version"]) if row else 0

        result = self._run(operation, 0)
        self._versions.pop(universe_id, None)
        return result

    def get_galaxy(self, universe_id, x, y, z):
        return self._get("galaxy", universe_id, {"x": x, "y": y, "z": z})

    def save_galaxy(self, universe_id, x, y, z, data) -> bool:
        return self._save("galaxy", universe_id, {"x": x, "y": y, "z": z}, data)

    def get_system(self, universe_id, x, y, z, system_index):
        return self._get(
            "system", universe_id, {"x": x, "y": y, "z": z, "system_index": system_index}
        )

    def save_system(self, universe_id, x, y, z, system_index, data) -> bool:
        return self._save(
            "system", universe_id, {"x": x, "y": y, "z": z, "system_index": system_index}, data
        )

    def get_planet(self, universe_id, x, y, z, system_index, planet_name):
        return self._get(
            "planet",
            universe_id,
            {"x": x, "y": y, "z": z, "system_index": system_index, "planet_name": planet_name},
        )

    def save_planet(self, universe_id, x, y, z, system_index, planet_name, data) -> bool:
        return self._save(
            "planet",
            universe_id,
            {"x": x, "y": y, "z": z, "system_index": system_index, "planet_name": planet_name},
            data,
        )

    def exists(self, kind: str, universe_id: str, key: dict) -> bool:
        table, columns = TABLES[kind]
        clause = " AND ".join(f"{name} = %s" for name in columns)
        values = (universe_id, *(key[name] for name in columns))

        def operation(conn):
            row = conn.execute(
                f"SELECT 1 AS hit FROM {self.schema}.{table} WHERE universe_id = %s AND {clause} LIMIT 1",
                values,
            ).fetchone()
            return bool(row)

        return self._run(operation, False)

    def stats(self, universe_id: str) -> dict[str, int]:
        def operation(conn):
            counts: dict[str, int] = {}
            for name in ("galaxies", "systems", "planets"):
                row = conn.execute(
                    f"SELECT count(*) AS n FROM {self.schema}.{name} WHERE universe_id = %s",
                    (universe_id,),
                ).fetchone()
                counts[name] = int(row["n"]) if row else 0
            return counts

        return self._run(operation, {"galaxies": 0, "systems": 0, "planets": 0})

    def ping(self) -> bool:
        return self._run(lambda conn: bool(conn.execute("SELECT 1").fetchone()), False)

    def close(self) -> None:
        with self._lock:
            pool, self._pool = self._pool, None
        if pool is None:
            return
        try:
            pool.close(timeout=2)
        except Exception:  # noqa: BLE001 - shutdown best effort
            pass

    def _get(self, kind: str, universe_id: str, key: dict):
        table, columns = TABLES[kind]
        clause = " AND ".join(f"{name} = %s" for name in columns)
        values = (universe_id, *(key[name] for name in columns))
        version = self.current_version(universe_id)

        def operation(conn):
            row = conn.execute(
                f"SELECT data, generator_version FROM {self.schema}.{table} "
                f"WHERE universe_id = %s AND {clause}",
                values,
            ).fetchone()
            if row is None:
                return None
            row_version = int(row["generator_version"])
            if row_version < version:
                # Only obsolete rows are removed; a newer row means our cached
                # version is stale and must win (never delete the future).
                conn.execute(
                    f"DELETE FROM {self.schema}.{table} "
                    f"WHERE universe_id = %s AND {clause} AND generator_version < %s",
                    (*values, version),
                )
                return None
            if random.random() < HIT_SAMPLE_RATE:
                conn.execute(
                    f"UPDATE {self.schema}.{table} SET hit_count = hit_count + 1, updated_at = now() "
                    f"WHERE universe_id = %s AND {clause}",
                    values,
                )
            return row["data"]

        return self._run(operation, None)

    def _save(self, kind: str, universe_id: str, key: dict, data: dict) -> bool:
        table, columns = TABLES[kind]
        names = ("universe_id", *columns, "data", "generator_version")
        placeholders = ", ".join(["%s"] * len(names))
        version = self.current_version(universe_id)
        values = (
            universe_id,
            *(key[name] for name in columns),
            json.dumps(data, sort_keys=True, ensure_ascii=False),
            version,
        )

        def operation(conn):
            conn.execute(
                f"INSERT INTO {self.schema}.{table} ({', '.join(names)}) VALUES ({placeholders}) "
                f"ON CONFLICT ({', '.join(('universe_id', *columns))}) DO UPDATE SET updated_at = now()",
                values,
            )
            return True

        return self._run(operation, False)


def _dict_row():
    from psycopg.rows import dict_row

    return dict_row

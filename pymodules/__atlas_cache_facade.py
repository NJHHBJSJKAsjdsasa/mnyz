"""Backend switch for the derived universe cache (docs/server/16 §6).

``ATLAS_CACHE_BACKEND`` selects the read/write authority:
  sqlite (default during rollout) → ``__atlas_sqlite_cache``
  pg                              → ``__atlas_pg_cache``

``ATLAS_CACHE_DUAL_WRITE=true`` mirrors writes to the other backend so the
rollback path stays warm. PostgreSQL failures are swallowed by the manager, so
a cache outage degrades to "generate fresh" and never to a 5xx.

Note: ``pymodules/__atlas_cache.py`` is already the webp image cache, hence the
``_facade`` suffix instead of the name used in the design doc.
"""

from __future__ import annotations

import logging
import os

from pymodules.__atlas_pg_cache import PgCacheManager, current_universe_id
from pymodules.__atlas_sqlite_cache import sqlite_cache

log = logging.getLogger(__name__)

VALID_BACKENDS = {"sqlite", "pg"}


def _flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


class AtlasCacheFacade:
    """Drop-in replacement for ``sqlite_cache`` with an optional PG backend."""

    def __init__(self) -> None:
        self.backend = self._initial_backend()
        self.dual_write = _flag("ATLAS_CACHE_DUAL_WRITE", False)
        self.sqlite_fallback = _flag("ATLAS_CACHE_SQLITE_FALLBACK", True)
        self._pg = PgCacheManager()
        if self.backend == "pg" and not self._pg.enabled:
            log.warning("ATLAS_CACHE_BACKEND=pg but ATLAS_DATABASE_URL is missing; using sqlite")
            self.backend = "sqlite"

    def use_backend(self, backend: str) -> None:
        """Test/tooling hook; production selects via ``ATLAS_CACHE_BACKEND``."""
        if backend not in VALID_BACKENDS:
            raise ValueError(backend)
        self.backend = backend

    @staticmethod
    def _initial_backend() -> str:
        backend = os.getenv("ATLAS_CACHE_BACKEND", "sqlite").strip().lower()
        if backend not in VALID_BACKENDS:
            log.warning("invalid ATLAS_CACHE_BACKEND %r; using sqlite", backend)
            return "sqlite"
        return backend

    # -- test / tooling compatibility -------------------------------------
    @property
    def db_path(self) -> str:
        return sqlite_cache.db_path

    @db_path.setter
    def db_path(self, value: str) -> None:
        sqlite_cache.db_path = value

    def _init_db(self) -> None:
        sqlite_cache._init_db()

    # -- reads -------------------------------------------------------------
    def get_galaxy(self, x, y, z):
        if self.backend == "pg":
            data = self._pg.get_galaxy(self._universe(), x, y, z)
            if data is None and self.sqlite_fallback:
                data = sqlite_cache.get_galaxy(x, y, z)
            return data
        return sqlite_cache.get_galaxy(x, y, z)

    def get_system(self, x, y, z, system_index):
        if self.backend == "pg":
            data = self._pg.get_system(self._universe(), x, y, z, system_index)
            if data is None and self.sqlite_fallback:
                data = sqlite_cache.get_system(x, y, z, system_index)
            return data
        return sqlite_cache.get_system(x, y, z, system_index)

    def get_planet(self, x, y, z, system_index, planet_name):
        if self.backend == "pg":
            data = self._pg.get_planet(self._universe(), x, y, z, system_index, planet_name)
            if data is None and self.sqlite_fallback:
                data = sqlite_cache.get_planet(x, y, z, system_index, planet_name)
            return data
        return sqlite_cache.get_planet(x, y, z, system_index, planet_name)

    # -- writes ------------------------------------------------------------
    def save_galaxy(self, x, y, z, data) -> bool:
        return self._write(
            "galaxy",
            {"x": x, "y": y, "z": z},
            data,
            lambda: sqlite_cache.save_galaxy(x, y, z, data),
        )

    def save_system(self, x, y, z, system_index, data) -> bool:
        return self._write(
            "system",
            {"x": x, "y": y, "z": z, "system_index": system_index},
            data,
            lambda: sqlite_cache.save_system(x, y, z, system_index, data),
        )

    def save_planet(self, x, y, z, system_index, planet_name, data) -> bool:
        return self._write(
            "planet",
            {"x": x, "y": y, "z": z, "system_index": system_index, "planet_name": planet_name},
            data,
            lambda: sqlite_cache.save_planet(x, y, z, system_index, planet_name, data),
        )

    # -- existence / stats -------------------------------------------------
    def galaxy_exists(self, x, y, z) -> bool:
        return self._exists("galaxy", {"x": x, "y": y, "z": z}, lambda: sqlite_cache.galaxy_exists(x, y, z))

    def system_exists(self, x, y, z, system_index) -> bool:
        return self._exists(
            "system",
            {"x": x, "y": y, "z": z, "system_index": system_index},
            lambda: sqlite_cache.system_exists(x, y, z, system_index),
        )

    def planet_exists(self, x, y, z, system_index, planet_name) -> bool:
        return self._exists(
            "planet",
            {"x": x, "y": y, "z": z, "system_index": system_index, "planet_name": planet_name},
            lambda: sqlite_cache.planet_exists(x, y, z, system_index, planet_name),
        )

    def get_cache_stats(self) -> dict:
        if self.backend == "pg" and self._pg.enabled:
            return self._pg.stats(self._universe())
        return sqlite_cache.get_cache_stats()

    # -- internals ---------------------------------------------------------
    def _universe(self) -> str:
        return current_universe_id()

    def _write(self, kind: str, key: dict, data: dict, sqlite_write) -> bool:
        if self.backend == "pg":
            ok = self._pg_save(kind, key, data)
            if self.dual_write:
                sqlite_write()
            return ok
        written = sqlite_write()
        if self.dual_write:
            self._pg_save(kind, key, data)
        return written

    def _pg_save(self, kind: str, key: dict, data: dict) -> bool:
        universe = self._universe()
        if kind == "galaxy":
            return self._pg.save_galaxy(universe, key["x"], key["y"], key["z"], data)
        if kind == "system":
            return self._pg.save_system(
                universe, key["x"], key["y"], key["z"], key["system_index"], data
            )
        return self._pg.save_planet(
            universe,
            key["x"],
            key["y"],
            key["z"],
            key["system_index"],
            key["planet_name"],
            data,
        )

    def _exists(self, kind: str, key: dict, sqlite_check) -> bool:
        if self.backend == "pg" and self._pg.enabled:
            return self._pg.exists(kind, self._universe(), key)
        return sqlite_check()


cache = AtlasCacheFacade()

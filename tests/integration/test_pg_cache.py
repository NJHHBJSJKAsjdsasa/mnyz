"""PostgreSQL universe cache: roundtrip, versioning, isolation, concurrency."""

from __future__ import annotations

import uuid
from concurrent.futures import ThreadPoolExecutor

import psycopg
from psycopg.rows import dict_row

from pymodules.__atlas_pg_cache import PgCacheManager
from server.repo import cache as cache_repo

GALAXY = {
    "seed": 42,
    "name": "Test Galaxy",
    "coordinates": [1, 2, 3],
    "galaxy_type": "spiral",
    "cosmic_origin_time": 1735689600000,
    "base_min_systems": 2,
    "base_max_systems": 12,
    "distance_to_origin": 3.7,
    "max_distance": 100.0,
    "proximity_factor": 1.0,
    "num_systems": 7,
    "black_holes": 1,
    "pulsars": 2,
    "quasars": 0,
}

SYSTEM = {
    "seed": 99,
    "index": 3,
    "name": "Test System",
    "num_planets": 5,
    "stars": [{"Type": "G", "Color": "#fff", "Radius Factor": 1.0}],
    "star_system_type": "single",
}


def test_roundtrip(manager):
    uid = str(uuid.uuid4())
    assert manager.save_galaxy(uid, 1, 2, 3, GALAXY) is True
    assert manager.get_galaxy(uid, 1, 2, 3) == GALAXY
    assert manager.save_system(uid, 1, 2, 3, 3, SYSTEM) is True
    assert manager.get_system(uid, 1, 2, 3, 3) == SYSTEM
    assert manager.get_system(uid, 1, 2, 3, 4) is None


def test_universe_isolation(manager):
    first, second = str(uuid.uuid4()), str(uuid.uuid4())
    manager.save_galaxy(first, 4, 5, 6, GALAXY)
    assert manager.get_galaxy(second, 4, 5, 6) is None


def test_generator_version_invalidates(manager):
    uid = str(uuid.uuid4())
    manager.save_galaxy(uid, 1, 1, 1, GALAXY)
    assert manager.bump_version(uid) == 2
    assert manager.get_galaxy(uid, 1, 1, 1) is None
    manager.save_galaxy(uid, 1, 1, 1, GALAXY)
    assert manager.get_galaxy(uid, 1, 1, 1) == GALAXY


def test_concurrent_writes_leave_one_row(manager, test_dsn):
    uid = str(uuid.uuid4())

    def write(index: int) -> bool:
        return manager.save_galaxy(uid, 9, 9, 9, {**GALAXY, "num_systems": index})

    with ThreadPoolExecutor(max_workers=8) as pool:
        assert all(pool.map(write, range(8)))

    with psycopg.connect(test_dsn, autocommit=True) as conn:
        row = conn.execute(
            "SELECT count(*) FROM universe_cache.galaxies WHERE universe_id = %s", (uid,)
        ).fetchone()
    assert row[0] == 1


def test_eviction_keeps_newest(manager, test_dsn):
    uid = str(uuid.uuid4())
    with psycopg.connect(test_dsn, autocommit=True) as cleanup:
        cleanup.execute(
            "TRUNCATE universe_cache.galaxies, universe_cache.systems, universe_cache.planets"
        )
    for index in range(6):
        manager.save_galaxy(uid, index, 0, 0, GALAXY)

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        assert cache_repo.total_counts(conn)["galaxies"] == 6
        removed = cache_repo.evict(conn, "galaxies", keep=2, batch=100)
        remaining = conn.execute(
            "SELECT count(*) AS n FROM universe_cache.galaxies WHERE universe_id = %s", (uid,)
        ).fetchone()["n"]
    assert removed >= 4
    assert remaining == 2


def test_unreachable_database_degrades_without_raising():
    manager = PgCacheManager(
        dsn="postgresql://postgres:wrong@127.0.0.1:1/atlas", schema="universe_cache"
    )
    uid = str(uuid.uuid4())
    assert manager.get_galaxy(uid, 1, 2, 3) is None
    assert manager.save_galaxy(uid, 1, 2, 3, GALAXY) is False
    assert manager.stats(uid) == {"galaxies": 0, "systems": 0, "planets": 0}


def test_stats_counts_per_universe(manager):
    uid = str(uuid.uuid4())
    manager.save_galaxy(uid, 1, 1, 1, GALAXY)
    manager.save_galaxy(uid, 2, 2, 2, GALAXY)
    assert manager.stats(uid)["galaxies"] == 2

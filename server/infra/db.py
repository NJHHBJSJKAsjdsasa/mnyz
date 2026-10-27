"""PostgreSQL access: pool, explicit transactions, timeouts, retries.

Rules enforced here (see docs/server/02, 06):
* connections are autocommit; a business unit of work must use ``transaction()``
* ``lock_timeout`` / ``statement_timeout`` are set on every connection
* pool exhaustion surfaces as ``StorageOffline`` instead of a 500 stack trace
"""

from __future__ import annotations

import logging
import time
from contextlib import contextmanager
from typing import Any, Callable, Iterator, Sequence

import psycopg
from psycopg import errors as pg_errors
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool, PoolTimeout

from .errors import StorageOffline

log = logging.getLogger(__name__)

_SETUP = (
    "SET TIME ZONE 'UTC'",
    "SET lock_timeout = '1s'",
    "SET statement_timeout = '5s'",
    "SET idle_in_transaction_session_timeout = '10s'",
)


class Database:
    def __init__(self, dsn: str, *, min_size: int = 1, max_size: int = 10) -> None:
        self.dsn = dsn
        self._pool = ConnectionPool(
            dsn,
            min_size=min_size,
            max_size=max_size,
            kwargs={"autocommit": True, "row_factory": dict_row},
            configure=self._configure,
            open=False,
            timeout=5,
        )

    @staticmethod
    def _configure(conn: psycopg.Connection) -> None:
        for statement in _SETUP:
            conn.execute(statement)

    def open(self) -> None:
        self._pool.open(wait=True, timeout=10)

    def close(self) -> None:
        self._pool.close()

    @contextmanager
    def connection(self) -> Iterator[psycopg.Connection]:
        try:
            with self._pool.connection() as conn:
                yield conn
        except PoolTimeout as exc:  # pragma: no cover - only under real load
            raise StorageOffline("连接池已耗尽") from exc
        except psycopg.OperationalError as exc:
            raise StorageOffline("数据库不可用") from exc

    @contextmanager
    def transaction(self) -> Iterator[psycopg.Connection]:
        with self.connection() as conn:
            with conn.transaction():
                yield conn

    def ping(self) -> float:
        started = time.perf_counter()
        with self.connection() as conn:
            conn.execute("SELECT 1")
        return (time.perf_counter() - started) * 1000

    def fetch_one(self, sql: str, params: Sequence[Any] | None = None) -> dict | None:
        with self.connection() as conn:
            return conn.execute(sql, params).fetchone()

    def fetch_all(self, sql: str, params: Sequence[Any] | None = None) -> list[dict]:
        with self.connection() as conn:
            return conn.execute(sql, params).fetchall()

    def alembic_revision(self) -> str | None:
        row = self.fetch_one("SELECT version_num FROM alembic_version LIMIT 1")
        return row["version_num"] if row else None


def retry_on_serialization(func: Callable[[], Any], attempts: int = 3) -> Any:
    """Retry 40001/40P01 twice with 20ms/60ms backoff (docs/server/06 §5)."""
    delays = [0.02, 0.06]
    for index in range(attempts):
        try:
            return func()
        except (pg_errors.SerializationFailure, pg_errors.DeadlockDetected):
            if index >= len(delays):
                raise
            time.sleep(delays[index])
    raise AssertionError("unreachable")


def is_unique_violation(exc: BaseException) -> bool:
    return isinstance(exc, pg_errors.UniqueViolation)

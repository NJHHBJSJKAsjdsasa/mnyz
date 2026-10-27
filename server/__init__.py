"""Atlas server application factory (M0 skeleton).

Boot order: config → logging → DB pool → Redis → key ring → hooks → blueprints
→ self-check. A failed self-check refuses to start; this is deliberate because
a half-configured process serving writes is worse than a crashed one.
"""

from __future__ import annotations

import logging
import time
import uuid
from typing import Any

import psycopg
from flask import Flask, g, jsonify, request
from werkzeug.exceptions import HTTPException

from .config import ConfigError, Settings
from .infra import metrics
from .infra.db import Database
from .infra.errors import ApiError, StorageOffline
from .infra.logging import log_event, setup_logging
from .infra.redis import RedisFacade
from .infra.security import KeyRing
from .json_provider import AtlasJSONProvider

log = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> Flask:
    settings = settings or Settings.from_env()
    setup_logging(settings.log_level, service=f"atlas-api-{settings.env}")
    if settings.self_check_on_boot:
        settings.require_valid()

    app = Flask("atlas_server")
    app.config["SETTINGS"] = settings
    app.json = AtlasJSONProvider(app)
    app.json.sort_keys = False

    db = Database(
        settings.database_url,
        min_size=1,
        max_size=int(getattr(settings, "db_pool_max", 10)),
    )
    if settings.database_url:
        db.open()
    app.extensions["db"] = db
    app.extensions["redis"] = RedisFacade(settings.redis_url, required=settings.is_prod)
    app.extensions["keys"] = KeyRing.from_settings(settings)

    _register_hooks(app)
    _register_error_handlers(app)

    from .api.health import health_bp

    app.register_blueprint(health_bp)

    from .api.v1 import api_bp

    app.register_blueprint(api_bp, url_prefix="/api/v1")

    if settings.self_check_on_boot:
        problems = self_check(app)
        if problems:
            db.close()
            raise ConfigError("self-check failed: " + "; ".join(problems))
    return app


def self_check(app: Flask) -> list[str]:
    """Startup checks from docs/server/02 §7; returns human-readable failures."""
    settings: Settings = app.config["SETTINGS"]
    problems: list[str] = []
    db: Database = app.extensions["db"]
    cache: RedisFacade = app.extensions["redis"]

    try:
        revision = db.alembic_revision()
        if revision != settings.expected_revision:
            problems.append(f"迁移版本 {revision!r} != 期望 {settings.expected_revision!r}")
    except psycopg.Error as exc:
        return [f"ATLAS_DATABASE_URL 无法连接或缺少迁移表: {type(exc).__name__}"]

    if not cache.ping():
        if settings.is_prod:
            problems.append("ATLAS_REDIS_URL 无法 PING")
        else:
            log.warning("redis ping failed in dev: degraded mode")

    wrong = _reference_counts(db)
    for name, expected in (("resource_types", 12), ("tech_nodes", 16)):
        if wrong.get(name) != expected:
            problems.append(f"参考数据 {name} 行数 {wrong.get(name)} != {expected}")

    skew = _clock_skew(db)
    if skew is not None and skew > 2.0:
        problems.append(f"应用与数据库时钟偏差 {skew:.2f}s > 2s")
    return problems


def _reference_counts(db: Database) -> dict[str, int]:
    rows = db.fetch_all(
        """
        SELECT 'resource_types' AS name, count(*) AS n FROM resource_types
        UNION ALL SELECT 'tech_nodes', count(*) FROM tech_nodes
        """
    )
    return {row["name"]: int(row["n"]) for row in rows}


def _clock_skew(db: Database) -> float | None:
    from .infra.clock import now

    try:
        row = db.fetch_one("SELECT now() AS ts")
    except psycopg.Error:
        return None
    return abs((now() - row["ts"]).total_seconds())


def _register_hooks(app: Flask) -> None:
    @app.before_request
    def _start_timer() -> None:
        g.request_id = request.headers.get("X-Request-Id") or uuid.uuid4().hex
        g.started_at = time.perf_counter()

    @app.after_request
    def _cors(response):
        origin = request.headers.get("Origin")
        allowed = app.config["SETTINGS"].cors_origins
        if origin and origin in allowed:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Vary"] = "Origin"
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Allow-Headers"] = (
                "Authorization, Content-Type, Idempotency-Key, If-Match, X-Request-Id"
            )
            response.headers["Access-Control-Allow-Methods"] = (
                "GET, POST, PUT, PATCH, DELETE, OPTIONS"
            )
        return response

    @app.after_request
    def _finish(response):
        duration_ms = (time.perf_counter() - getattr(g, "started_at", time.perf_counter())) * 1000
        response.headers["X-Request-Id"] = getattr(g, "request_id", "")
        if request.path.startswith("/api/"):
            metrics.inc(
                "atlas_http_requests_total",
                {"route": request.endpoint or "unknown", "status": str(response.status_code)},
            )
            metrics.observe(
                "atlas_http_request_duration_ms",
                duration_ms,
                {"route": request.endpoint or "unknown"},
            )
            response.headers.setdefault("Cache-Control", "no-store")
        log_event(
            log,
            "request",
            request_id=getattr(g, "request_id", ""),
            method=request.method,
            route=request.endpoint or request.path,
            status=response.status_code,
            duration_ms=round(duration_ms, 2),
            player_id=str(getattr(g, "player_id", "") or ""),
        )
        return response


def _register_error_handlers(app: Flask) -> None:
    @app.errorhandler(ApiError)
    def _api_error(exc: ApiError):
        return _problem(exc.status, exc.to_problem(request.path, _rid()), exc.retry_after_ms)

    @app.errorhandler(psycopg.errors.LockNotAvailable)
    def _lock_timeout(exc):  # noqa: ANN001
        api = ApiError("数据库锁等待超时", code="lock_timeout", status=503, retry_after_ms=500)
        return _problem(api.status, api.to_problem(request.path, _rid()), 500)

    @app.errorhandler(psycopg.errors.SerializationFailure)
    def _serialization(exc):  # noqa: ANN001
        api = ApiError("事务冲突，请重试", code="transaction_retry_exhausted", status=503)
        return _problem(api.status, api.to_problem(request.path, _rid()), 500)

    @app.errorhandler(psycopg.OperationalError)
    def _storage_down(exc):  # noqa: ANN001
        api = StorageOffline("数据库暂不可用")
        return _problem(api.status, api.to_problem(request.path, _rid()), 3000)

    @app.errorhandler(HTTPException)
    def _http_error(exc: HTTPException):
        code = "not_found" if exc.code == 404 else "invalid_argument"
        api = ApiError(exc.description or exc.name, code=code, status=exc.code or 500)
        return _problem(api.status, api.to_problem(request.path, _rid()), None)

    @app.errorhandler(Exception)
    def _unexpected(exc: Exception):
        log.exception("unhandled error", extra={"request_id": _rid()})
        api = ApiError("服务器内部错误", code="internal_error", status=500)
        return _problem(api.status, api.to_problem(request.path, _rid()), None)


def _rid() -> str:
    return str(getattr(g, "request_id", ""))


def _problem(status: int, body: dict[str, Any], retry_after_ms: int | None):
    response = jsonify(body)
    response.status_code = status
    response.content_type = "application/problem+json; charset=utf-8"
    if retry_after_ms:
        response.headers["Retry-After"] = str(max(1, retry_after_ms // 1000))
    return response




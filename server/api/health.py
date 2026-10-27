"""Liveness / readiness / deep checks and the Prometheus scrape endpoint.

``live`` never touches dependencies (restart signal), ``ready`` gates the load
balancer (2s budget), ``deep`` is internal-only and never fails a request.
"""

from __future__ import annotations

import logging

from flask import Blueprint, Response, current_app, jsonify

from ..infra import metrics
from ..repo import jobs as job_repo
from ..repo import outbox as outbox_repo

log = logging.getLogger(__name__)
health_bp = Blueprint("health", __name__)


@health_bp.get("/health/live")
def live():
    return jsonify({"status": "ok"})


@health_bp.get("/health/ready")
def ready():
    problems: list[str] = []
    db = current_app.extensions["db"]
    cache = current_app.extensions["redis"]
    settings = current_app.config["SETTINGS"]

    try:
        latency = db.ping()
        if latency > 50:
            problems.append(f"db_latency_ms={latency:.1f}")
    except Exception as exc:  # noqa: BLE001 - readiness must never raise
        problems.append(f"database_unavailable:{type(exc).__name__}")
        latency = -1

    if not cache.ping():
        problems.append("redis_unavailable")

    revision = None
    try:
        revision = db.alembic_revision()
        if revision != settings.expected_revision:
            problems.append(f"migration_mismatch:{revision}")
    except Exception:  # noqa: BLE001
        problems.append("migration_unknown")

    body = {
        "status": "ok" if not problems else "degraded",
        "db_latency_ms": round(latency, 2),
        "revision": revision,
        "problems": problems,
    }
    return jsonify(body), 200 if not problems else 503


@health_bp.get("/health/deep")
def deep():
    db = current_app.extensions["db"]
    cache = current_app.extensions["redis"]
    report: dict = {"redis_degraded": cache.degraded}
    try:
        with db.connection() as conn:
            backlog = outbox_repo.backlog(conn)
        report["outbox_pending"] = int(backlog["n"])
        report["outbox_oldest_seconds"] = int(backlog["oldest"].total_seconds())
    except Exception:  # noqa: BLE001
        report["outbox_pending"] = None
    try:
        with db.connection() as conn:
            jobs = job_repo.last_success(conn)
        report["jobs"] = [
            {"name": row["job_name"], "last_ok": row["last_ok"].isoformat() if row["last_ok"] else None}
            for row in jobs
        ]
    except Exception:  # noqa: BLE001
        report["jobs"] = []
    return jsonify(report)


@health_bp.get("/metrics")
def prometheus():
    return Response(metrics.render(), content_type="text/plain; version=0.0.4; charset=utf-8")

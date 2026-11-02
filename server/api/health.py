"""Liveness / readiness / deep checks and the Prometheus scrape endpoint.

``live`` never touches dependencies (restart signal), ``ready`` gates the load
balancer (2s budget), ``deep`` is internal-only and never fails a request.
"""

from __future__ import annotations

from ..infra.serialize import ts

import logging
from datetime import datetime, timezone

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
            {"name": row["job_name"], "last_ok": ts(row["last_ok"])}
            for row in jobs
        ]
    except Exception:  # noqa: BLE001
        report["jobs"] = []
    return jsonify(report)


@health_bp.get("/health/jobs")
def jobs():
    """Per-job health: last outcome, last success, and whether it is overdue.

    Answers the question "is a scheduled job silently dead?" — 34 jobs run in the
    background and, before this endpoint, a job that stopped firing looked exactly like a
    job with nothing to do. ``stale`` means "no successful run within 2× its period".
    """
    from ..jobs.beat_schedule import SCHEDULE

    db = current_app.extensions["db"]
    try:
        with db.connection() as conn:
            rows = job_repo.overview(conn)
    except Exception:  # noqa: BLE001 - a broken bookkeeping table must not 500 the probe
        log.exception("jobs overview failed")
        return jsonify({"status": "unknown", "detail": "job_runs unreadable"}), 503

    now = datetime.now(timezone.utc)
    seen = {row["job_name"]: row for row in rows}
    report, stale, failing = [], [], []

    for name, period in sorted(SCHEDULE.items()):
        row = seen.get(name)
        if row is None:
            stale.append({"job": name, "reason": "never ran"})
            report.append(
                {"job": name, "period_s": period, "last_ok": None, "catch_up": False, "state": "never-ran"}
            )
            continue
        last_ok = row["last_finished_at"]
        overdue = last_ok is None or (now - last_ok).total_seconds() > period * 2
        state = "ok"
        if not row["last_ok"]:
            state = "failing"
            failing.append(
                {
                    "job": name,
                    "last_fail_date": row["last_fail_date"].isoformat() if row["last_fail_date"] else None,
                    "failed_7d": int(row["failed_7d"]),
                }
            )
        elif overdue:
            state = "stale"
            stale.append({"job": name, "reason": f"no success in {period * 2}s"})
        report.append(
            {
                "job": name,
                "period_s": period,
                # `last_ok` is the last *successful* finish; a job that only ever failed
                # still has a `finished_at`, so do not report that as an OK time.
                "last_ok": ts(last_ok) if row["last_ok"] else None,
                "last_ok_date": row["last_ok_date"].isoformat() if row["last_ok_date"] else None,
                "failed_7d": int(row["failed_7d"]),
                "catch_up": bool(row["last_catch_up"]),
                "state": state,
            }
        )

    status = "ok" if not stale and not failing else "degraded"
    return (
        jsonify({"status": status, "expected": len(SCHEDULE), "stale": stale, "failing": failing, "jobs": report}),
        200 if status == "ok" else 503,
    )


@health_bp.get("/metrics")
def prometheus():
    return Response(metrics.render(), content_type="text/plain; version=0.0.4; charset=utf-8")

"""Catch-up for schedule windows missed while the worker was down.

Celery beat fires on a wall clock; if the worker is not running at 03:00, the 03:00 tick
never happens. For a 24h job that means a full day of silence — the books stay unsettled
and nothing in the system notices, because "no row for today" and "nothing to do" look
identical (``job_runs`` is keyed by day).

This module answers "which jobs already missed their window?" and re-runs them once, with
``catch_up = true`` on the record so a late run is distinguishable from an on-time one.

Two deliberate limits:

* a job with **no** history is skipped — a fresh database would otherwise try to run all
  34 jobs on first boot; bootstrap is ``run_all()``'s job, not this one's;
* the grace factor is 1.5× the period, so a 60-second job that was down for 90 seconds is
  left alone (the next tick will cover it) while a daily job that missed its slot is picked
  up immediately.

Invoked from ``python -m server.jobs.cli --catch-up``; call it after the worker starts.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from ..infra.context import db
from .beat_schedule import SCHEDULE
from .runner import run_job

log = logging.getLogger(__name__)

GRACE_FACTOR = 1.5


def due(conn, now: datetime | None = None, grace: float = GRACE_FACTOR) -> list[dict]:
    """Jobs whose last success is older than ``grace × period``, most overdue first."""
    now = now or datetime.now(timezone.utc)
    rows = conn.execute(
        """
        SELECT job_name, max(finished_at) FILTER (WHERE ok) AS last_ok
          FROM job_runs GROUP BY job_name
        """
    ).fetchall()
    last_ok = {row["job_name"]: row["last_ok"] for row in rows}

    overdue: list[dict] = []
    for name, period in SCHEDULE.items():
        ok_at = last_ok.get(name)
        if ok_at is None:
            continue  # never ran: bootstrap's job, not catch-up's
        lag = (now - ok_at).total_seconds()
        if lag > period * grace:
            overdue.append(
                {
                    "job": name,
                    "period_s": period,
                    "lag_s": int(lag),
                    "last_ok": ok_at.isoformat(),
                }
            )
    return sorted(overdue, key=lambda item: -item["lag_s"])


def run_due(limit: int | None = None) -> list[dict]:
    """Re-run overdue jobs once each. One failure does not stop the rest."""
    with db().transaction() as conn:
        overdue = due(conn)
    if limit is not None:
        overdue = overdue[:limit]
    if not overdue:
        return []

    log.info("catch-up start", extra={"jobs": [item["job"] for item in overdue]})
    results: list[dict] = []
    for item in overdue:
        try:
            results.append(run_job(item["job"], catch_up=True))
        except Exception as exc:  # noqa: BLE001 - keep compensating the remaining jobs
            results.append(
                {
                    "job": item["job"],
                    "ok": False,
                    "catch_up": True,
                    "error": f"{type(exc).__name__}: {exc}",
                }
            )
    return results

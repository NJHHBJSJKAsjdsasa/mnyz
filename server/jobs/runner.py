"""Run one job with a Redis lock and a ``job_runs`` record."""

from __future__ import annotations

import logging
import time

from ..infra.context import cache, db
from .tasks import JOBS, finish_run, start_run

log = logging.getLogger(__name__)

LOCK_TTL = {
    "cleanup": 1200,
    "ensure_partitions": 3600,
    "reconcile_ledger": 1800,
    "settle_sleeping_players": 600,
    "outbox_relay": 10,
    "cache_evict": 3600,
    "expire_contracts": 120,
    "resolve_sieges": 300,
    "resolve_council_motions": 30,
    "bank_interest_tick": 900,
    "currency_issuance_tick": 900,
    "reconcile_currency": 1800,
    "property_appraisal_tick": 1800,
    "property_tax_tick": 1800,
    "stock_daily_tick": 1800,
    "stock_margin_tick": 1800,
    "ai_economy_tick": 240,
    "court_deadlines": 600,
    "insolvency_plan_tick": 600,
    "dt_recovery": 120,
    "dt_outbox_relay": 30,
    "revenue_split_tick": 3600,
}


def run_job(name: str) -> dict:
    if name not in JOBS:
        raise KeyError(f"unknown job {name}")
    holder = cache().acquire_lock(f"job:{name}", LOCK_TTL.get(name, 300))
    if holder is None:
        return {"job": name, "skipped": "locked"}
    started = time.perf_counter()
    try:
        with db().transaction() as conn:
            start_run(conn, name)
            result = JOBS[name](conn)
            finish_run(conn, name, result)
        elapsed = round((time.perf_counter() - started) * 1000, 2)
        log.info("job ok", extra={"job": name, "duration_ms": elapsed})
        return {"job": name, "ok": True, "duration_ms": elapsed, "result": result}
    finally:
        cache().release_lock(f"job:{name}", holder)


def run_all(names: list[str] | None = None) -> list[dict]:
    return [run_job(name) for name in (names or list(JOBS))]

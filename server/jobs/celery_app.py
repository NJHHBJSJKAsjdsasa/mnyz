"""Optional Celery wiring. The API never imports this module.

Celery is not a hard dependency: ``python -m server.jobs.cli`` runs the same
functions in-process for small deployments and tests.
"""

from __future__ import annotations

import os

try:  # pragma: no cover - exercised only when celery is installed
    from celery import Celery
except ImportError as exc:  # pragma: no cover
    raise ImportError(
        "celery is not installed; use `python -m server.jobs.cli` or `pip install celery[redis]`"
    ) from exc

from .runner import run_job

BROKER = os.getenv("ATLAS_CELERY_BROKER_URL", os.getenv("ATLAS_REDIS_URL", "redis://127.0.0.1:6379/1"))

celery_app = Celery("atlas", broker=BROKER, backend=None)
celery_app.conf.update(
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_time_limit=600,
    task_soft_time_limit=540,
    broker_connection_retry_on_startup=True,
)


@celery_app.task(name="atlas.job")
def run_named_job(name: str) -> dict:
    return run_job(name)


celery_app.conf.beat_schedule = {
    "outbox_relay": {"task": "atlas.job", "schedule": 5.0, "args": ("outbox_relay",)},
    "cleanup": {"task": "atlas.job", "schedule": 3600.0, "args": ("cleanup",)},
    "reconcile_ledger": {"task": "atlas.job", "schedule": 3600.0, "args": ("reconcile_ledger",)},
    "ensure_partitions": {"task": "atlas.job", "schedule": 86400.0, "args": ("ensure_partitions",)},
    "settle_sleeping": {"task": "atlas.job", "schedule": 900.0, "args": ("settle_sleeping_players",)},
    "cache_evict": {"task": "atlas.job", "schedule": 3600.0, "args": ("cache_evict",)},
    "expire_contracts": {"task": "atlas.job", "schedule": 60.0, "args": ("expire_contracts",)},
    "resolve_sieges": {"task": "atlas.job", "schedule": 60.0, "args": ("resolve_sieges",)},
    "resolve_council_motions": {"task": "atlas.job", "schedule": 15.0, "args": ("resolve_council_motions",)},
    "bank_interest_tick": {"task": "atlas.job", "schedule": 86400.0, "args": ("bank_interest_tick",)},
    "currency_issuance_tick": {"task": "atlas.job", "schedule": 86400.0, "args": ("currency_issuance_tick",)},
    "reconcile_currency": {"task": "atlas.job", "schedule": 3600.0, "args": ("reconcile_currency",)},
    "property_appraisal_tick": {"task": "atlas.job", "schedule": 21600.0, "args": ("property_appraisal_tick",)},
    "property_tax_tick": {"task": "atlas.job", "schedule": 86400.0, "args": ("property_tax_tick",)},
    "stock_daily_tick": {"task": "atlas.job", "schedule": 86400.0, "args": ("stock_daily_tick",)},
    "stock_margin_tick": {"task": "atlas.job", "schedule": 86400.0, "args": ("stock_margin_tick",)},
    "ai_economy_tick": {"task": "atlas.job", "schedule": 60.0, "args": ("ai_economy_tick",)},
    "court_deadlines": {"task": "atlas.job", "schedule": 3600.0, "args": ("court_deadlines",)},
    "insolvency_plan_tick": {"task": "atlas.job", "schedule": 3600.0, "args": ("insolvency_plan_tick",)},
    "dt_recovery": {"task": "atlas.job", "schedule": 15.0, "args": ("dt_recovery",)},
    "dt_outbox_relay": {"task": "atlas.job", "schedule": 10.0, "args": ("dt_outbox_relay",)},
    "revenue_split_tick": {"task": "atlas.job", "schedule": 3600.0, "args": ("revenue_split_tick",)},
}

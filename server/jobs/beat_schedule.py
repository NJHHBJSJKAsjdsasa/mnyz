"""Celery beat schedule in seconds (see docs/server/07 §3)."""

from __future__ import annotations

SCHEDULE = {
    "outbox_relay": 5,
    "cleanup": 3600,
    "reconcile_ledger": 3600,
    "ensure_partitions": 86400,
    "settle_sleeping_players": 900,
    "cache_evict": 3600,
    "expire_contracts": 60,
    "resolve_sieges": 60,
    "resolve_council_motions": 15,
    "bank_interest_tick": 86400,
    "currency_issuance_tick": 86400,
    "reconcile_currency": 3600,
    "property_appraisal_tick": 21600,
    "property_tax_tick": 86400,
    "stock_daily_tick": 86400,
    "stock_margin_tick": 86400,
    "ai_economy_tick": 60,
    "court_deadlines": 3600,
    "insolvency_plan_tick": 3600,
    "dt_recovery": 15,
    "dt_outbox_relay": 10,
    "revenue_split_tick": 3600,
    "price_index_tick": 300,
}

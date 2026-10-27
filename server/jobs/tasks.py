"""Idempotent maintenance jobs.

Every job is a plain function taking a connection, so it can be run from Celery,
cron or the CLI with identical semantics. Locks come from Redis (best effort);
``job_runs`` records outcomes for /health/deep.
"""

from __future__ import annotations

import logging
import os
from datetime import date

from ..domain import (
    ai_economy,
    bank_service,
    council_service,
    court_service,
    currency_service,
    dt_coordinator,
    insolvency_service,
    revenue_service,
    property_service,
    stock_service,
    world_service,
)
from ..domain.settlement import settle_offline
from ..repo import cache as cache_repo
from ..repo import contracts as contract_repo
from ..repo import ai as ai_repo
from ..repo import distributed_tx as dt_repo
from ..repo import idempotency as idem_repo
from ..repo import ledger as ledger_repo
from ..repo import outbox as outbox_repo

log = logging.getLogger(__name__)

PARTITIONED = ("ledger_entries", "outbox_events", "audit_log")


def start_run(conn, name: str) -> None:
    conn.execute(
        """
        INSERT INTO job_runs (job_name, run_date, started_at, ok, detail)
        VALUES (%s, %s, now(), false, NULL)
        ON CONFLICT (job_name, run_date)
        DO UPDATE SET started_at = now(), ok = false, detail = NULL
        """,
        (name, date.today()),
    )


def finish_run(conn, name: str, detail: dict) -> None:
    conn.execute(
        """
        UPDATE job_runs SET finished_at = now(), ok = true, detail = %s::jsonb
         WHERE job_name = %s AND run_date = %s
        """,
        (_json(detail), name, date.today()),
    )


def cleanup(conn) -> dict:
    """Idempotency keys >24h, published outbox >7d, login attempts >30d."""
    removed_keys = idem_repo.cleanup(conn, hours=24, batch=5000)
    outbox = conn.execute(
        "DELETE FROM outbox_events WHERE published_at < now() - interval '7 days' RETURNING id"
    ).fetchall()
    attempts = conn.execute(
        "DELETE FROM login_attempts WHERE created_at < now() - interval '30 days' RETURNING id"
    ).fetchall()
    return {"idempotency": removed_keys, "outbox": len(outbox), "login_attempts": len(attempts)}


def ensure_partitions(conn, months: int = 3) -> dict:
    created: list[str] = []
    for table in PARTITIONED:
        for year, month in _next_months(months):
            nxt_year, nxt_month = (year + 1, 1) if month == 12 else (year, month + 1)
            name = f"{table}_{year:04d}_{month:02d}"
            exists = conn.execute(
                "SELECT 1 AS hit FROM pg_class WHERE relname = %s", (name,)
            ).fetchone()
            if exists:
                continue
            conn.execute(
                f"CREATE TABLE {name} PARTITION OF {table} "
                f"FOR VALUES FROM ('{year:04d}-{month:02d}-01') TO ('{nxt_year:04d}-{nxt_month:02d}-01')"
            )
            created.append(name)
    return {"created": created}


def reconcile(conn) -> dict:
    """Flag unbalanced transactions and mismatched wallets; never auto-fix."""
    unbalanced = ledger_repo.unbalanced_transactions(conn, hours=24)
    mismatched = ledger_repo.mismatched_wallets(conn)
    frozen: list[str] = []
    for row in mismatched:
        conn.execute(
            "UPDATE players SET locked_reason = 'ledger_mismatch' WHERE id = %s AND locked_reason IS NULL",
            (row["player_id"],),
        )
        frozen.append(str(row["player_id"]))
    return {
        "unbalanced": [str(row["transaction_id"]) for row in unbalanced],
        "mismatched": [
            {
                "player_id": str(row["player_id"]),
                "resource": row["resource_code"],
                "wallet": str(row["balance"]),
                "ledger": str(row["ledger"]),
            }
            for row in mismatched
        ],
        "frozen": frozen,
    }


def settle_sleeping(conn, limit: int = 500) -> dict:
    rows = conn.execute(
        """
        SELECT id FROM players
         WHERE last_seen_at > now() - interval '4 hours'
           AND last_settled_at < now() - interval '1 minute'
         ORDER BY last_seen_at DESC
         LIMIT %s
        """,
        (limit,),
    ).fetchall()
    settled = 0
    for row in rows:
        settle_offline(conn, str(row["id"]))
        settled += 1
    return {"settled": settled}


def bank_interest_tick(conn) -> dict:
    """Daily accrual for every active loan (02 §6)."""
    return bank_service.accrue_interest(conn)


def currency_issuance_tick(conn) -> dict:
    """One issuance per UTC day; re-running the same day is a no-op."""
    day = date.today()
    existing = conn.execute(
        "SELECT day FROM currency_issuance WHERE day = %s", (day,)
    ).fetchone()
    if existing:
        return {"skipped": "already_issued", "day": str(day)}
    active = conn.execute(
        "SELECT COUNT(*) AS n FROM players WHERE last_seen_at > now() - interval '24 hours'"
    ).fetchone()
    result = currency_service.issue_daily(
        conn,
        day=day,
        active_players=int(active["n"]),
        volume_q1=0,  # 商品成交额尚未按 Q1 折算，先用 0，接入市场后再补
        idem_key=f"issuance:{day}",
    )
    return {
        "day": str(day),
        "emitted": result["emitted"],
        "reward_budget": result["reward_budget"],
        "active_players": int(active["n"]),
    }


def reconcile_currency(conn, hours: int = 24) -> dict:
    """Flag currency transactions that do not balance; never auto-fix."""
    rows = conn.execute(
        """
        SELECT t.id, t.kind, e.currency_code, SUM(e.delta) AS delta, c.base_value
          FROM currency_ledger_transactions t
          JOIN currency_ledger_entries e ON e.tx_id = t.id
          JOIN currencies c ON c.code = e.currency_code
         WHERE t.created_at > now() - interval '1 day' * %s
         GROUP BY t.id, t.kind, e.currency_code, c.base_value
        """,
        (hours,),
    ).fetchall()
    per_tx: dict[str, dict] = {}
    for row in rows:
        bucket = per_tx.setdefault(
            str(row["id"]), {"kind": row["kind"], "per_currency": {}, "q1": 0.0}
        )
        bucket["per_currency"][row["currency_code"]] = float(row["delta"])
        bucket["q1"] += float(row["delta"]) * float(row["base_value"])
    unbalanced = []
    for tx_id, bucket in per_tx.items():
        if bucket["kind"].startswith("exchange"):
            if abs(bucket["q1"]) > 0.01:
                unbalanced.append({"tx_id": tx_id, "kind": bucket["kind"], "q1": bucket["q1"]})
        elif any(abs(delta) > 0.0001 for delta in bucket["per_currency"].values()):
            unbalanced.append({"tx_id": tx_id, "kind": bucket["kind"], "per_currency": bucket["per_currency"]})
    return {"transactions": len(per_tx), "unbalanced": unbalanced}


def property_appraisal_tick(conn) -> dict:
    """Re-appraise every owned deed (04 §3.3)."""
    return property_service.reappraise_all(conn)


def property_tax_tick(conn) -> dict:
    """Issue this month's holding-tax bills; re-running is idempotent."""
    return property_service.issue_tax_bills(conn)


def stock_daily_tick(conn) -> dict:
    """UTC day change: daily summary, T+1 unlock and the delisting scan (05 §4.4/§7.3)."""
    return stock_service.daily_tick(conn)


def stock_margin_tick(conn) -> dict:
    """Daily borrow fee and maintenance-margin check for short positions (05 §1.2)."""
    return stock_service.margin_tick(conn)


def ai_economy_tick(conn) -> dict:
    """One AI heartbeat; the first run provisions the roster (06 §3, 10 §5)."""
    if ai_repo.count_agents(conn) == 0:
        ai_economy.bootstrap(conn)
    return ai_economy.tick(conn)


def court_deadlines(conn) -> dict:
    """Judge every hearing whose time has come and expire stale stays (08 §5.3)."""
    judged = court_service.judge_due_cases(conn)
    judged["stays_expired"] = insolvency_service.stays_expired(conn)
    return judged


def insolvency_plan_tick(conn) -> dict:
    """Close voting windows for restructuring plans (08 §6.5)."""
    return insolvency_service.plan_tick(conn)


def dt_recovery(conn) -> dict:
    """Take over expired leases and drive open 2PC transactions (09 §3.4)."""
    return dt_coordinator.recover(conn)


def revenue_split_tick(conn) -> dict:
    """Move the configured shares of collected fees out of the treasury (05 §11)."""
    return revenue_service.run_all(conn)


def dt_outbox_relay(conn, limit: int = 200) -> dict:
    """Publish the 2PC outbox; the sink is the log until a broker exists."""
    events = dt_repo.pending_outbox(conn, limit)
    published = 0
    for event in events:
        dt_repo.mark_published(conn, int(event["id"]))
        published += 1
    return {"published": published, "pending": len(events) - published}


def outbox_relay(conn, limit: int = 100) -> dict:
    """At-least-once hand-off; the publisher is a log sink until Kafka exists."""
    events = outbox_repo.pending(conn, limit)
    published = 0
    for event in events:
        try:
            log.info(
                "outbox publish",
                extra={"event": event["event_type"], "aggregate_id": event["aggregate_id"]},
            )
            outbox_repo.mark_published(conn, int(event["id"]))
            published += 1
        except Exception:  # noqa: BLE001
            outbox_repo.bump_retry(conn, int(event["id"]))
            break
    return {"published": published, "pending": len(events) - published}


def resolve_council_motions(conn) -> dict:
    return council_service.resolve_due(conn)


def resolve_sieges(conn) -> dict:
    """Resolve due sieges deterministically; ownership transfers atomically."""
    return world_service.resolve_due(conn)


def expire_contracts(conn) -> dict:
    """Mark accepted contracts past their 12h TTL as expired (docs/server/09 §5.4)."""
    return {"expired": contract_repo.expire(conn)}


def cache_evict(conn) -> dict:
    """Trim the derived universe cache; oldest rows go first (docs/server/16 §5)."""
    if not cache_repo.schema_ready(conn):
        return {"skipped": "no_cache_schema"}
    limits = {
        "planets": _limit("ATLAS_CACHE_MAX_PLANETS", 5_000_000),
        "systems": _limit("ATLAS_CACHE_MAX_SYSTEMS", 2_000_000),
        "galaxies": _limit("ATLAS_CACHE_MAX_GALAXIES", 500_000),
    }
    totals = cache_repo.total_counts(conn)
    removed: dict[str, int] = {}
    for table in ("planets", "systems", "galaxies"):
        excess = totals[table] - limits[table]
        if excess <= 0:
            continue
        removed[table] = cache_repo.evict(conn, table, limits[table], batch=min(excess, 50_000))
    return {"removed": removed, "totals": totals}


def _limit(name: str, default: int) -> int:
    try:
        return max(1, int(os.getenv(name, str(default))))
    except ValueError:
        return default


def _next_months(count: int) -> list[tuple[int, int]]:
    today = date.today()
    result: list[tuple[int, int]] = []
    year, month = today.year, today.month
    for _ in range(count):
        month += 1
        if month > 12:
            year, month = year + 1, 1
        result.append((year, month))
    return result


def _json(value: dict) -> str:
    import json

    return json.dumps(value, default=str)


JOBS = {
    "cleanup": cleanup,
    "ensure_partitions": ensure_partitions,
    "reconcile_ledger": reconcile,
    "settle_sleeping_players": settle_sleeping,
    "outbox_relay": outbox_relay,
    "cache_evict": cache_evict,
    "expire_contracts": expire_contracts,
    "resolve_sieges": resolve_sieges,
    "resolve_council_motions": resolve_council_motions,
    "bank_interest_tick": bank_interest_tick,
    "currency_issuance_tick": currency_issuance_tick,
    "reconcile_currency": reconcile_currency,
    "property_appraisal_tick": property_appraisal_tick,
    "property_tax_tick": property_tax_tick,
    "stock_daily_tick": stock_daily_tick,
    "stock_margin_tick": stock_margin_tick,
    "ai_economy_tick": ai_economy_tick,
    "court_deadlines": court_deadlines,
    "insolvency_plan_tick": insolvency_plan_tick,
    "dt_recovery": dt_recovery,
    "dt_outbox_relay": dt_outbox_relay,
    "revenue_split_tick": revenue_split_tick,
}

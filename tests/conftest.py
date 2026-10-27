"""Shared fixtures.

Integration tests need a disposable PostgreSQL database:

    set ATLAS_TEST_DATABASE_URL=postgresql://postgres:secret@127.0.0.1:5432/atlas_test
    python -m pytest tests -q

Without it the integration fixtures skip loudly; unit tests always run.
"""

from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import urlparse

import psycopg
import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]


def _ensure_database(dsn: str) -> None:
    parsed = urlparse(dsn)
    name = parsed.path.lstrip("/")
    admin = parsed._replace(path="/postgres").geturl()
    with psycopg.connect(admin, autocommit=True) as conn:
        if not conn.execute("SELECT 1 FROM pg_database WHERE datname = %s", (name,)).fetchone():
            conn.execute(f'CREATE DATABASE "{name}"')


def _migrate() -> None:
    from alembic import command
    from alembic.config import Config

    command.upgrade(Config(str(REPO_ROOT / "alembic.ini")), "head")


def _truncate(dsn: str) -> None:
    with psycopg.connect(dsn, autocommit=True) as conn:
        conn.execute(
            """
            TRUNCATE accounts, idempotency_keys, outbox_events, audit_log,
                     job_runs, login_attempts, dlq_events, feature_flags
            CASCADE
            """
        )
        conn.execute(
            """
            TRUNCATE universe_cache.planets, universe_cache.systems,
                     universe_cache.galaxies, universe_cache.cache_meta
            """
        )
        conn.execute("TRUNCATE market_days CASCADE")
        conn.execute(
            """
            TRUNCATE currency_ledger_entries, currency_ledger_transactions, currency_transfers,
                     currency_accounts, currency_issuance, bank_interest_runs, bank_loans,
                     bank_accounts, bank_reserves, deposit_insurance_claims,
                     deposit_insurance_fund, deposit_certificate_quotes, deposit_certificates,
                     interbank_loans, bribe_events, compliance_fund_entries, compliance_fund,
                     bank_officers CASCADE
            """
        )
        conn.execute(
            """
            TRUNCATE companies, share_holdings, company_financials, company_actions,
                     commerce_licenses, commerce_price_index, commerce_disputes,
                     exchanges, securities_firms, market_share_snapshots,
                     property_assets, property_listings, property_bids, property_escrow,
                     property_transfers, property_tax_bills, property_encumbrances,
                     star_systems, sovereignty_wars CASCADE
            """
        )
        conn.execute(
            """
            TRUNCATE stock_trades, stock_orders, stock_candles, stock_holders,
                     stock_daily_summary, dividends, margin_accounts,
                     securities_lending, short_positions, delisting_cases,
                     stock_listings CASCADE
            """
        )
        conn.execute("TRUNCATE ai_decisions, ai_agents CASCADE")
        conn.execute(
            """
            TRUNCATE company_charters, company_officers, board_seats,
                     shareholder_meetings, resolutions, resolution_votes,
                     related_party_transactions, commercial_courts, court_cases,
                     court_evidence, court_hearings, court_judgments, court_appeals,
                     asset_freezes, insolvency_cases, insolvency_claims,
                     restructuring_plans, plan_votes, asset_sales CASCADE
            """
        )
        from server.domain import court_service

        court_service.ensure_courts(conn)
        # players 的 CASCADE 会连带清掉 economic_actors，这里补回系统账户与央行
        from server.repo import banks as bank_repo
        from server.repo import currency as currency_repo

        currency_repo.ensure_system_actors(conn)
        bank_repo.ensure_central_bank(conn)
        conn.execute(
            """
            INSERT INTO exchanges (code, name, kind, currency_code, status)
            VALUES ('CUEX', '宇宙联合交易所', 'official', 'cc4', 'active')
            ON CONFLICT (code) DO NOTHING
            """
        )
        # 关系费开关会被用例打开，这里复位到默认关闭
        conn.execute("UPDATE currency_issuance_policy SET bribe_enabled = false")
        conn.execute(
            """
            TRUNCATE world_planets, sieges, siege_participants, loot_escrow,
                     planet_ownership_history CASCADE
            """
        )
        conn.execute(
            """
            INSERT INTO feature_flags (name, enabled, mode, rollout_pct, description) VALUES
              ('domain.explore', false, 'local', 0, 'collect/scan/surface'),
              ('domain.economy', false, 'local', 0, 'market/contracts/refit/tech'),
              ('domain.assets', false, 'local', 0, 'stations/fleet/colony'),
              ('domain.combat', false, 'local', 0, 'combat and sieges')
            ON CONFLICT (name) DO NOTHING
            """
        )


@pytest.fixture(scope="session")
def test_dsn() -> str:
    dsn = os.environ.get("ATLAS_TEST_DATABASE_URL", "").strip()
    if not dsn:
        pytest.skip("ATLAS_TEST_DATABASE_URL 未设置，跳过集成测试")
    os.environ["ATLAS_DATABASE_URL"] = dsn
    os.environ["ATLAS_SKIP_SELF_CHECK"] = "1"
    os.environ["ATLAS_RATE_LIMIT"] = "off"
    os.environ["ATLAS_REDIS_URL"] = "memory://"
    os.environ["ATLAS_ENV"] = "dev"
    _ensure_database(dsn)
    _migrate()
    return dsn


@pytest.fixture()
def app(test_dsn: str):
    _truncate(test_dsn)
    from server import create_app
    from server.config import Settings

    application = create_app(Settings.from_env())
    yield application
    application.extensions["db"].close()


@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture()
def db_conn(test_dsn: str):
    with psycopg.connect(test_dsn, autocommit=True) as conn:
        yield conn


@pytest.fixture()
def manager(test_dsn: str):
    from pymodules.__atlas_pg_cache import PgCacheManager

    instance = PgCacheManager(dsn=test_dsn, schema="universe_cache")
    yield instance
    instance.close()

"""Table ownership registry — the CI-enforceable half of the module rules.

Rule (docs/architecture/module-dependencies.md §2/§4):

    A module may write only the tables it owns. Cross-module access is read-only,
    and reads should go through the owning module's read API.

This file is the single source of truth for "who owns what". It is intentionally
a flat, reviewable map instead of something derived at runtime: when two modules
start writing the same table, the diff shows up here.

Patterns are matched in declaration order with :mod:`fnmatch`; the first match
wins, so put specific names before wildcards. A table that matches nothing is
*unassigned* — ``scripts/check_boundaries.py`` reports it but does not fail,
because the inventory is still being filled in module by module.

Adding a module: add an entry with its files and patterns, then run the checker.
"""

from __future__ import annotations

from fnmatch import fnmatch

# module -> (file stems in server/repo|domain|api/v1, table patterns)
MODULES: dict[str, dict] = {
    "platform": {
        "files": {
            "accounts", "auth", "sessions", "players", "idempotency", "outbox",
            "jobs", "audit", "cutover", "imports", "cache", "universes",
            "admin_ops", "session", "meta", "health", "calendar", "cooldowns",
        },
        "tables": [
            "accounts", "players", "sessions", "guest_devices", "login_attempts",
            "idempotency_keys", "outbox_events", "domain_events", "audit_log",
            "job_runs", "dlq_events", "feature_flags", "player_flag*",
            "player_shadow_state", "saga_steps", "local_save_imports",
            "universes", "game_config", "cooldowns",
        ],
    },
    "currency": {
        "files": {"currency", "currency_service", "ledger", "ledger_reversal",
                  "wallets", "reference"},
        "tables": [
            "currencies", "currency_*", "ledger_*", "economic_actors", "system_accounts",
            "wallets", "resource_types",
        ],
    },
    "bank": {
        "files": {"banks", "bank_service", "certificate_service", "interbank_service",
                  "insurance", "compliance_service"},
        "tables": [
            "banks", "bank_*", "deposit_*", "interbank_loans", "compliance_fund*",
            "bribe_events",
        ],
    },
    "protection": {
        "files": {"protection", "investor_protection"},
        "tables": ["investor_protection_*"],
    },
    "broker": {
        "files": {"brokers", "broker_service"},
        "tables": [
            "securities_firms", "broker_*", "listing_venues", "securities_lending",
        ],
    },
    "stock": {
        "files": {"stocks", "stock_service", "stock_corporate", "market_maker",
                  "market_index", "indices", "market", "market_service",
                  "exchange_service"},
        "tables": [
            "stock_*", "dividends", "delisting_cases", "margin_accounts",
            "short_positions", "exchanges", "exchange_fee_tiers",
            "candle_archive_partitions", "mm_programs", "mm_quotes",
            "price_indices", "price_index_points", "market_days", "market_quotes",
            "trade_orders",
        ],
    },
    "commerce": {
        "files": {"companies", "company_service", "company_law", "company_governance", "contracts",
                  "contract_service"},
        "tables": [
            "companies", "company_*", "share_holdings", "resolutions",
            "resolution_votes", "shareholder_meetings", "board_seats",
            "related_party_transactions", "commerce_*", "market_share_snapshots",
            "contracts",
            "contract_templates", "contract_events",
        ],
    },
    "property": {
        "files": {"properties", "property_service", "revenue", "revenue_service"},
        "tables": ["property_*", "revenue_*"],
    },
    "legal": {
        "files": {"legal", "court_service", "court_panel", "insolvency_service"},
        "tables": ["commercial_courts", "court_*", "asset_freezes", "asset_sales",
                   "insolvency_*", "restructuring_plans", "plan_votes"],
    },
    "dt": {
        "files": {"distributed_tx", "dt_coordinator", "internal_dt"},
        "tables": ["distributed_transactions", "dt_*"],
    },
    "ai": {
        "files": {"ai", "ai_economy", "ai_provider", "admin_ai"},
        "tables": ["ai_*"],
    },
    "assets": {
        "files": {"assets", "assets_service", "ships", "shipyard_service", "refit",
                  "tech", "codex", "codex_claims", "codex_reward", "tasks",
                  "task_service", "alliances", "alliance_service"},
        "tables": [
            "stations", "station_modules", "fleet_ships", "ships", "ship_modules",
            "alliance*", "player_tasks", "task_definitions", "tech_nodes",
            "player_tech", "codex_*", "structure_definitions", "module_definitions",
        ],
    },
    "world": {
        "files": {"world", "world_service", "colony", "colony_service", "combat",
                  "combat_service", "sieges", "planet", "planet_cache", "universe",
                  "residents", "npc", "faction_service", "rival", "sector",
                  "sector_service", "council", "council_service"},
        "tables": [
            "world_planets", "sieges", "siege_participants", "wrecks",
            "loot_escrow", "planet_claims", "planet_deposits", "planet_events",
            "planet_audit", "planet_structures", "planet_modifiers",
            "planet_ownership_history", "star_systems", "sovereignty_wars",
            "combat_*",
            "faction*", "npc_*", "discoveries", "sector_licenses", "council_*",
        ],
    },
    "explore_scan": {
        "files": {"explore", "scan", "scan_service", "surface", "surface_service",
                  "gathering", "challenge_service", "challenges", "collections",
                  "scans", "surface"},
        "tables": [
            "planet_scans", "surface_samples", "challenge_codes", "collections",
        ],
    },
}


def owner_of(table: str) -> str | None:
    for module, spec in MODULES.items():
        for pattern in spec["tables"]:
            if fnmatch(table, pattern):
                return module
    return None


def module_of(file_stem: str) -> str | None:
    for module, spec in MODULES.items():
        if file_stem in spec["files"]:
            return module
    return None

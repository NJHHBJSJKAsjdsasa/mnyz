# Atlas · Space Exploration & Economy Simulation (mnyz fork)

[简体中文](README.md) | **English**

A procedurally generated universe with an **authoritative server and a multi-currency economy** on top:
currency issuance, banking, companies, property, a stock exchange, AI players, a commercial court and
insolvency — all persisted in PostgreSQL, with AI agents playing by exactly the same rules as humans.

> **This project is built on top of the open-source project [SurceBeats/Atlas](https://github.com/SurceBeats/Atlas).**
> Upstream is a procedural universe generation engine (React + TypeScript + Three.js front end, Python + Flask
> back end, inspired by *No Man's Sky*) providing galaxy/star/planet generation, 3D rendering, mining and
> stargate links.
> This fork adds an **independent authoritative back end (`server/`)** and a **cosmic economy subsystem**,
> while keeping the upstream game entry point and renderer.

---

## 1. Relationship to upstream

| Aspect | Upstream SurceBeats/Atlas | This fork (mnyz) |
|---|---|---|
| Purpose | Procedural universe engine / exploration game | **Authoritative server + economy simulation** on top of it |
| Front end | React + TypeScript + Three.js | Reused (extra panels for economy, council, quests) |
| Back end | Monolithic Flask (`pymodules/`, stateless, cache-centric) | Adds `server/`: Flask + pydantic + psycopg3 + Alembic + PostgreSQL + Redis |
| Persistence | Browser localStorage / local cache | Server-side accounts, JWT, idempotent writes, ledger and positions in the DB |
| Economy | None | Nine currency tiers, double-entry ledger, banks, companies, property, stocks, AI players, courts/insolvency |
| License | PolyForm Noncommercial License 1.0.0 | Same (see [`LICENSE.md`](LICENSE.md)) |

Upstream: <https://github.com/SurceBeats/Atlas>

---

## 2. What this fork adds

### 2.1 Authoritative server (`server/`)

- **Layering**: `api/v1/*` (Flask blueprints) → `domain/*` (business rules) → `repo/*` (SQL only) → PostgreSQL.
  Requests are validated with pydantic `StrictModel`; errors are RFC 9457 problem+json.
- **Write discipline**: every write requires `Idempotency-Key` and `require_auth(write=True)`. Balances and
  positions may only change through `currency_service.post`, the single double-entry entry point that keeps
  each transaction balanced per currency (or in Q1 equivalent for exchanges).
- **Concurrency**: fixed lock order (actor → currency → bank → listing → order → asset → escrow → court);
  matching is serialized per listing row; cancel-vs-fill resolved by CAS on order status.
- **Operations**: `job_runs` audit trail, Redis locks, DLQ, feature flags for staged rollout, `/health/deep`.

### 2.2 Cosmic economy (migrations 0110 → 0114)

| Migration | Capabilities | Integration tests |
|---|---|---|
| `0110_currency_bank` | Nine currency tiers, double-entry ledger, Q4+ transfers, tier-by-tier exchange (5:1 up, 1:4.60 down), deposits/withdrawals, loans with accrual, issuance and rates, CDs (issue/quote/transfer/redeem), interbank lending, deposit insurance, relationship fees and compliance fund | 14 |
| `0111_commerce_property` | Company registration and equity, financials and book value, property registry and appraisal, fixed-price and auction listings, escrow settlement (2% transfer tax + 1% commission), monthly holding tax | 3 |
| `0112_stock_market` | IPO, limit/market matching (5 levels), fees on both sides + seller stamp tax, average cost, T+0/T+1, five candle intervals, circuit breakers and position caps, wash-trade detection, short selling / securities lending / margin, dividends, delisting triggers | 10 |
| `0113_ai_economy` | Real accounts/players/actors for AI agents, deterministic decision engine (replayable), `ai_decisions` audit log, runtime pause switch, public player directory | 5 |
| `0114_company_law_court` | Charter/officers/shareholder meetings/resolutions (ordinary >50%, special >2/3, related-party abstention), related-party approval, commercial court (filing/evidence/deterministic judgment/single appeal/enforcement/freezes), automatic stay, claim priority in liquidation, class voting on restructuring plans | 7 |
| `0115_cross_region_2pc` | Cross-region 2PC: coordinator transaction log, participants, decisions and outbox, lease takeover, 5 s budget rejection, cross-region fee (base + risk + congestion, split 4:3:2:1), unknown SLA with two-person resolution; a one-participant no-op while the database is single | 9 |

Current migration head: `0115_cross_region_2pc` (kept in sync with `server/config.py::DEFAULT_REVISION`).

### 2.3 Tests

Integration tests run against a real PostgreSQL database (`atlas_test`) and cover ledger conservation,
matching/position reconciliation, candle aggregation, shorting and margin calls, AI replay and equal
treatment, shareholder meetings and court flow, and liquidation priority.

```bash
ATLAS_TEST_DATABASE_URL="postgresql://postgres:***@127.0.0.1:5432/atlas_test" \
  python -m pytest tests -q      # 157 passed, ~16 minutes
```

---

## 3. Architecture

```
Browser
  └─ React + TypeScript + Three.js (atlas-ui/react)
       ├─ /api/*      → pymodules/  (upstream: universe generation, rendering, mining, P2P, stargates)
       └─ /api/v1/*   → server/     (this fork: accounts, currency, banks, companies, property,
                                     stocks, AI, courts, insolvency)
                           ├─ domain/    business rules and invariants
                           ├─ repo/      SQL only
                           ├─ migrations/versions/   0110 → 0114
                           └─ jobs/      scheduled work (interest, issuance, tax, candles, AI ticks, court deadlines)

PostgreSQL (accounts / ledger / orders / positions / cases)    Redis (cache / locks / rate limits)
```

## 4. Repository layout

```
server/                authoritative back end (the core of this fork)
  api/v1/              endpoints: bank, commerce, properties, stocks, admin_ai, court, insolvency
  domain/              services: currency, bank, company, property, stock, ai_*, court, insolvency
  repo/                pure SQL data access
  models/              request models (pydantic StrictModel)
  migrations/versions/ 0110 → 0114
  jobs/                scheduled jobs and worker
pymodules/             upstream game back end (universe generation, planet rendering, P2P, cache)
atlas-ui/react/        front end (React + Three.js)
docs/cosmic-economy/   economy design books (00 architecture … 10 AI decision engine)
docs/server/           server design documents
tests/                 unit + integration tests
```

---

## 5. Quick start

### 5.1 Requirements

Python 3.13, Node 22, PostgreSQL 16, Redis 7.

### 5.2 Back end

```bash
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt -r requirements-server.txt

# Generate dev keys and .env.server (use your own DSN)
python -m server.cli init-dev --dsn "postgresql://postgres:***@127.0.0.1:5432/atlas"
python -m server.cli migrate          # alembic upgrade head → 0114
python -m server.cli check            # startup self-check (schema revision, keys, cache)
python -m server.run                  # 127.0.0.1:8000
```

Production: `gunicorn -k gthread -w 4 server.wsgi:application`, or:

```bash
docker compose -f docker-compose.server.yml up -d
```

### 5.3 Front end and the upstream game entry point

```bash
npm install && npm run dev            # Vite dev server
python __main__.py                    # upstream monolith (universe generation + game API)
```

> The two back ends can run side by side: `__main__.py` serves procedural universe and render data,
> `server.run` serves accounts and economy. You do not need the upstream monolith to run the economy alone.

---

## 6. Design documents

| Document | Contents |
|---|---|
| [`docs/cosmic-economy/00`](docs/cosmic-economy/00-architecture-and-actors.md) | Architecture, actor model, global lock order |
| [`01`](docs/cosmic-economy/01-currency.md) / [`02`](docs/cosmic-economy/02-bank.md) | Currency tiers and issuance, banking and reserves |
| [`03`](docs/cosmic-economy/03-commerce-center.md) / [`04`](docs/cosmic-economy/04-property.md) | Commerce centre, property and appraisal |
| [`05`](docs/cosmic-economy/05-stock-kline.md) | Stocks, matching, candles, short selling |
| [`06`](docs/cosmic-economy/06-ai-players.md) / [`10`](docs/cosmic-economy/10-ai-decision-engine.md) | AI players as first-class players, deterministic decision engine |
| [`07`](docs/cosmic-economy/07-implementation-testing.md) | Migration breakdown, jobs, testing and launch gates |
| [`08`](docs/cosmic-economy/08-company-law-bankruptcy.md) / [`09`](docs/cosmic-economy/09-cross-region-2pc.md) | Company law / courts / insolvency, cross-region 2PC |
| [`ATLAS_PROJECT_DOCUMENTATION.md`](ATLAS_PROJECT_DOCUMENTATION.md) | Module-level documentation of the upstream engine |

---

## 7. Status and roadmap

- Done: 0110–0115 (currency/banking, commerce/property, stocks, AI players, company law/courts/insolvency,
  cross-region 2PC), 157 integration tests passing.
- Planned: `0116_ai_decision_provider` (external LLM only as an internal candidate adapter, disabled by
  default), economy charts in the front end, cross-region judgment recognition, multi-currency
  liquidation, player appeal panels.
- Known gaps per migration are recorded in the “落地状态 / implementation status” section of each design book
  (e.g. sub-exchange integration, player appeal panels, multi-currency liquidation).

---

## 8. License and attribution

- This project uses the **same license as upstream** [SurceBeats/Atlas](https://github.com/SurceBeats/Atlas):
  the **PolyForm Noncommercial License 1.0.0**, full text in [`LICENSE.md`](LICENSE.md) (identical to upstream).
- The license permits reading, modifying and distributing the software **for noncommercial purposes only**;
  the license and notices must be kept when redistributing.
- Upstream copyright belongs to its original authors and all upstream attribution is preserved. The `server/`,
  `tests/` and `docs/cosmic-economy/` additions in this fork are maintained here and released under the same
  license.

"""commerce and property: companies, licences, index, property deeds and tax

Revision ID: 0111_commerce_property
Revises: 0110_currency_bank
Create Date: 2026-10-26

Design references: docs/cosmic-economy/03 §2/§3/§5, 04 §2/§3/§4/§5.

Scope
-----
* companies + share holdings + monthly financials + corporate actions;
* commerce licences and the sector price index;
* property deeds, listings (fixed price and auction), escrow, transfer tax and
  monthly holding-tax bills;
* star systems / sovereignty wars are created here but their services land with
  0111b (needs the war/siege domain from 04 §2.3).
"""

from __future__ import annotations

from alembic import op

revision = "0111_commerce_property"
down_revision = "0110_currency_bank"
branch_labels = None
depends_on = None


ACTOR_KIND = """
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'economic_actors'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%''treasury''%'
  LOOP
    EXECUTE format('ALTER TABLE economic_actors DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE economic_actors
  ADD CONSTRAINT economic_actors_kind_check
  CHECK (kind IN ('player','bank','treasury','burn','central_bank','market',
                  'officer','equity','fund','company'));

INSERT INTO economic_actors (code, kind, controller, display_name, allow_negative)
VALUES ('escrow', 'market', 'system', '产权托管账户', false)
ON CONFLICT (code) DO NOTHING;
"""

COMPANIES = """
CREATE TABLE companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL UNIQUE CHECK (ticker ~ '^[A-Z][A-Z0-9]{2,7}$'),
  name text NOT NULL UNIQUE,
  founder_actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE RESTRICT,
  treasury_actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE RESTRICT,
  jurisdiction_sector text NOT NULL DEFAULT 'core',
  status text NOT NULL DEFAULT 'private'
    CHECK (status IN ('private','public','suspended','liquidated')),
  shares_total bigint NOT NULL CHECK (shares_total > 0),
  free_float bigint NOT NULL DEFAULT 0 CHECK (free_float >= 0),
  book_value numeric(30,4) NOT NULL DEFAULT 0,
  charter jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  listed_at timestamptz,
  CHECK (free_float <= shares_total)
);
CREATE INDEX companies_founder_idx ON companies (founder_actor_id);

CREATE TABLE share_holdings (
  actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  shares bigint NOT NULL CHECK (shares >= 0),
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, company_id)
);
CREATE INDEX share_holding_company_idx ON share_holdings (company_id, shares DESC);

CREATE TABLE company_financials (
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period date NOT NULL,
  revenue numeric(30,4) NOT NULL DEFAULT 0,
  cost numeric(30,4) NOT NULL DEFAULT 0,
  profit numeric(30,4) NOT NULL DEFAULT 0,
  assets numeric(30,4) NOT NULL DEFAULT 0,
  liabilities numeric(30,4) NOT NULL DEFAULT 0,
  published_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, period)
);

CREATE TABLE company_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('dividend','split','buyback','merger')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','done','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  effective_at timestamptz
);
CREATE INDEX company_action_idx ON company_actions (company_id, status);
"""

COMMERCE = """
CREATE TABLE commerce_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN
    ('cross_region_trade','bank','securities_firm','exchange','property_broker','port')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending','active','suspended','revoked','expired')),
  fee_currency text NOT NULL DEFAULT 'cc3' REFERENCES currencies(code),
  monthly_fee numeric(30,4) NOT NULL DEFAULT 0,
  reviewed_by text NOT NULL DEFAULT '',
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  UNIQUE (actor_id, kind, status)
);
CREATE INDEX commerce_license_kind_idx ON commerce_licenses (kind, status);

CREATE TABLE commerce_price_index (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_key text NOT NULL,
  period date NOT NULL,
  index_value numeric(20,6) NOT NULL CHECK (index_value > 0),
  sample_size integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sector_key, period)
);

CREATE TABLE commerce_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complainant_actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE CASCADE,
  respondent_actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE CASCADE,
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
  detail text NOT NULL DEFAULT '',
  resolution text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE exchanges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'official' CHECK (kind IN ('official','sub')),
  operator_actor_id uuid REFERENCES economic_actors(id) ON DELETE SET NULL,
  currency_code text NOT NULL DEFAULT 'cc4' REFERENCES currencies(code),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('pending','active','suspended','closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE securities_firms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL UNIQUE REFERENCES economic_actors(id) ON DELETE CASCADE,
  license_id uuid REFERENCES commerce_licenses(id) ON DELETE SET NULL,
  capital numeric(30,4) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE market_share_snapshots (
  actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE CASCADE,
  sector_key text NOT NULL,
  period date NOT NULL,
  share numeric(9,6) NOT NULL CHECK (share >= 0 AND share <= 1),
  hhi numeric(12,4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, sector_key, period)
);
"""

PROPERTY = """
CREATE TABLE property_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_key text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('planet','system')),
  name text NOT NULL DEFAULT '',
  jurisdiction_sector text NOT NULL DEFAULT 'core',
  owner_actor_id uuid REFERENCES economic_actors(id) ON DELETE SET NULL,
  deed_no text NOT NULL UNIQUE,
  base_by_type numeric(30,4) NOT NULL DEFAULT 10000,
  resource_score numeric(10,4) NOT NULL DEFAULT 0 CHECK (resource_score >= 0),
  development_level integer NOT NULL DEFAULT 0 CHECK (development_level >= 0),
  traffic_index numeric(10,4) NOT NULL DEFAULT 0 CHECK (traffic_index >= 0),
  recent_sale_premium numeric(10,4) NOT NULL DEFAULT 0,
  appraised_value numeric(30,4) NOT NULL DEFAULT 0,
  appraised_at timestamptz,
  status text NOT NULL DEFAULT 'owned'
    CHECK (status IN ('owned','listed','escrow','auction','frozen','sold')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX property_owner_idx ON property_assets (owner_actor_id, status);
CREATE INDEX property_sector_idx ON property_assets (jurisdiction_sector, kind);

CREATE TABLE property_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES property_assets(id) ON DELETE CASCADE,
  seller_actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE RESTRICT,
  kind text NOT NULL DEFAULT 'fixed' CHECK (kind IN ('fixed','auction')),
  price numeric(30,4) NOT NULL CHECK (price > 0),
  min_increment numeric(30,4) NOT NULL DEFAULT 0 CHECK (min_increment >= 0),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','escrow','sold','cancelled','expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  closed_at timestamptz
);
CREATE INDEX property_listing_open_idx ON property_listings (status, expires_at);

CREATE TABLE property_bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES property_listings(id) ON DELETE CASCADE,
  bidder_actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE RESTRICT,
  amount numeric(30,4) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'leading'
    CHECK (status IN ('leading','outbid','won','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX property_bid_listing_idx ON property_bids (listing_id, amount DESC);

CREATE TABLE property_escrow (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES property_listings(id) ON DELETE CASCADE,
  buyer_actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE RESTRICT,
  amount numeric(30,4) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'held'
    CHECK (status IN ('held','released','refunded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);

CREATE TABLE property_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES property_assets(id) ON DELETE RESTRICT,
  from_actor_id uuid REFERENCES economic_actors(id) ON DELETE SET NULL,
  to_actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE RESTRICT,
  price numeric(30,4) NOT NULL CHECK (price > 0),
  transfer_tax numeric(30,4) NOT NULL DEFAULT 0,
  commission numeric(30,4) NOT NULL DEFAULT 0,
  tx_id uuid REFERENCES currency_ledger_transactions(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE property_tax_rates (
  jurisdiction_sector text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('planet','system')),
  rate_bps integer NOT NULL CHECK (rate_bps BETWEEN 0 AND 200),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (jurisdiction_sector, kind)
);

CREATE TABLE property_tax_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES property_assets(id) ON DELETE CASCADE,
  period date NOT NULL,
  amount numeric(30,4) NOT NULL CHECK (amount >= 0),
  currency_code text NOT NULL DEFAULT 'cc1' REFERENCES currencies(code),
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'due' CHECK (status IN ('due','paid','overdue','lien','auction')),
  paid_at timestamptz,
  tx_id uuid REFERENCES currency_ledger_transactions(id),
  UNIQUE (asset_id, period)
);
CREATE INDEX property_tax_status_idx ON property_tax_bills (status, due_at);

CREATE TABLE property_encumbrances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES property_assets(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('lien','freeze','dispute')),
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz
);
CREATE INDEX property_encumbrance_open_idx ON property_encumbrances (asset_id, released_at);

CREATE TABLE star_systems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system_key text NOT NULL UNIQUE,
  name text NOT NULL,
  jurisdiction_sector text NOT NULL DEFAULT 'core',
  sovereignty_actor_id uuid REFERENCES economic_actors(id) ON DELETE SET NULL,
  defense_power numeric(20,4) NOT NULL DEFAULT 0,
  station_slots integer NOT NULL DEFAULT 0,
  traffic_index numeric(10,4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sovereignty_wars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id uuid NOT NULL REFERENCES star_systems(id) ON DELETE CASCADE,
  challenger_actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE CASCADE,
  defender_actor_id uuid REFERENCES economic_actors(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'declared'
    CHECK (status IN ('declared','active','resolved','cancelled')),
  war_score jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

INSERT INTO property_tax_rates (jurisdiction_sector, kind, rate_bps) VALUES
  ('core', 'planet', 20),
  ('core', 'system', 10)
ON CONFLICT (jurisdiction_sector, kind) DO NOTHING;
"""

GRANTS = """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      companies, share_holdings, company_financials, company_actions,
      commerce_licenses, commerce_price_index, commerce_disputes, exchanges,
      securities_firms, market_share_snapshots, property_assets, property_listings,
      property_bids, property_escrow, property_transfers, property_tax_rates,
      property_tax_bills, property_encumbrances, star_systems, sovereignty_wars
      TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT SELECT ON
      companies, share_holdings, company_financials, company_actions,
      commerce_licenses, commerce_price_index, exchanges, securities_firms,
      market_share_snapshots, property_assets, property_listings, property_bids,
      property_transfers, property_tax_rates, property_tax_bills, star_systems
      TO atlas_readonly;
  END IF;
END $$;
"""

DOWNGRADE = [
    "DROP TABLE IF EXISTS sovereignty_wars",
    "DROP TABLE IF EXISTS star_systems",
    "DROP TABLE IF EXISTS property_encumbrances",
    "DROP TABLE IF EXISTS property_tax_bills",
    "DROP TABLE IF EXISTS property_tax_rates",
    "DROP TABLE IF EXISTS property_transfers",
    "DROP TABLE IF EXISTS property_escrow",
    "DROP TABLE IF EXISTS property_bids",
    "DROP TABLE IF EXISTS property_listings",
    "DROP TABLE IF EXISTS property_assets",
    "DROP TABLE IF EXISTS market_share_snapshots",
    "DROP TABLE IF EXISTS securities_firms",
    "DROP TABLE IF EXISTS exchanges",
    "DROP TABLE IF EXISTS commerce_disputes",
    "DROP TABLE IF EXISTS commerce_price_index",
    "DROP TABLE IF EXISTS commerce_licenses",
    "DROP TABLE IF EXISTS company_actions",
    "DROP TABLE IF EXISTS company_financials",
    "DROP TABLE IF EXISTS share_holdings",
    "DROP TABLE IF EXISTS companies",
]


def upgrade() -> None:
    op.execute(ACTOR_KIND)
    for block in (COMPANIES, COMMERCE, PROPERTY):
        op.execute(block)
    op.execute(GRANTS)


def downgrade() -> None:
    for statement in DOWNGRADE:
        op.execute(statement)
    op.execute("DELETE FROM economic_actors WHERE kind = 'company'")
    op.execute("DELETE FROM economic_actors WHERE code = 'escrow' AND kind = 'market'")
    op.execute(
        "ALTER TABLE economic_actors DROP CONSTRAINT IF EXISTS economic_actors_kind_check"
    )
    op.execute(
        "ALTER TABLE economic_actors ADD CONSTRAINT economic_actors_kind_check "
        "CHECK (kind IN ('player','bank','treasury','burn','central_bank','market','officer','equity','fund'))"
    )

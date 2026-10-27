"""company law, commercial court and insolvency

Revision ID: 0114_company_law_court
Revises: 0113_ai_economy
Create Date: 2026-10-27

Design references: docs/cosmic-economy/08 §2/§3/§5/§6, 07 §1.

Scope
-----
* governance: charter, officers, board seats, shareholder meetings, resolutions
  and weighted votes, related-party transactions;
* commercial courts: three levels seeded in the core sector, cases, evidence,
  hearings, judgments, one appeal, asset freezes and enforcement;
* insolvency: cases with an automatic stay, CCMC-appointed administrator,
  claims, restructuring plans voted by class, liquidation in the statutory
  priority order and asset sales.

``companies.status`` gains ``bankrupt`` so an insolvent company can be frozen
without inventing a parallel state machine.
"""

from __future__ import annotations

from alembic import op

revision = "0114_company_law_court"
down_revision = "0113_ai_economy"
branch_labels = None
depends_on = None


GOVERNANCE = """
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'companies'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%liquidated%'
  LOOP
    EXECUTE format('ALTER TABLE companies DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE companies
  ADD CONSTRAINT companies_status_check
  CHECK (status IN ('private','public','suspended','liquidated','bankrupt'));

CREATE TABLE company_charters (
  company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  document jsonb NOT NULL DEFAULT '{}'::jsonb,
  adopted_at timestamptz NOT NULL DEFAULT now(),
  adopted_by uuid REFERENCES economic_actors(id) ON DELETE SET NULL
);

CREATE TABLE company_officers (
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('ceo','cfo','coo','secretary','director','chair')),
  appointed_at timestamptz NOT NULL DEFAULT now(),
  term_until timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','removed','resigned')),
  PRIMARY KEY (company_id, actor_id, role)
);
CREATE INDEX company_officer_actor_idx ON company_officers (actor_id, status);

CREATE TABLE board_seats (
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  seat_no integer NOT NULL CHECK (seat_no BETWEEN 1 AND 15),
  actor_id uuid REFERENCES economic_actors(id) ON DELETE SET NULL,
  elected_at timestamptz,
  term_until timestamptz,
  PRIMARY KEY (company_id, seat_no)
);

CREATE TABLE shareholder_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'extraordinary' CHECK (kind IN ('annual','extraordinary')),
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  record_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('scheduled','open','closed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX meeting_company_idx ON shareholder_meetings (company_id, status);

CREATE TABLE resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES shareholder_meetings(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN
    ('charter_amendment','officer_appointment','dividend','buyback','issuance',
     'related_party','dissolution','other')),
  special boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  yes bigint NOT NULL DEFAULT 0,
  no bigint NOT NULL DEFAULT 0,
  abstain bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','passed','rejected','cancelled')),
  created_by uuid REFERENCES economic_actors(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
CREATE INDEX resolution_company_idx ON resolutions (company_id, status);

CREATE TABLE resolution_votes (
  resolution_id uuid NOT NULL REFERENCES resolutions(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE CASCADE,
  shares bigint NOT NULL CHECK (shares >= 0),
  choice text NOT NULL CHECK (choice IN ('yes','no','abstain')),
  voted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (resolution_id, actor_id)
);

CREATE TABLE related_party_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  counterparty_actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE RESTRICT,
  kind text NOT NULL,
  amount numeric(30,4) NOT NULL CHECK (amount >= 0),
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed','approved','rejected','completed','void')),
  approved_by uuid REFERENCES economic_actors(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
CREATE INDEX related_party_company_idx ON related_party_transactions (company_id, status);
"""

COURT = """
CREATE TABLE commercial_courts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  jurisdiction_sector text NOT NULL DEFAULT 'core',
  level text NOT NULL CHECK (level IN ('first_instance','appeal','supreme')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO commercial_courts (code, name, jurisdiction_sector, level) VALUES
  ('CC-CORE-1', '宇宙商业法院（一审）', 'core', 'first_instance'),
  ('CC-CORE-2', '宇宙商业法院（上诉）', 'core', 'appeal'),
  ('CC-SUPREME', '最高商业法院', 'core', 'supreme')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE court_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id uuid NOT NULL REFERENCES commercial_courts(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN
    ('contract','tort','corporate','insolvency','takeover','regulatory')),
  plaintiff_actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE CASCADE,
  defendant_actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  jurisdiction_sector text NOT NULL DEFAULT 'core',
  amount numeric(30,4) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  currency_code text NOT NULL DEFAULT 'cc1' REFERENCES currencies(code),
  claim text NOT NULL DEFAULT '',
  filing_fee numeric(30,4) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'filed'
    CHECK (status IN ('filed','served','hearing','judgment','appealed','closed','enforced')),
  filed_at timestamptz NOT NULL DEFAULT now(),
  served_at timestamptz,
  hearing_at timestamptz,
  closed_at timestamptz
);
CREATE INDEX court_case_status_idx ON court_cases (status, hearing_at);
CREATE INDEX court_case_party_idx ON court_cases (plaintiff_actor_id, defendant_actor_id);

CREATE TABLE court_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES court_cases(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE CASCADE,
  side text NOT NULL CHECK (side IN ('plaintiff','defendant')),
  summary text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX court_evidence_case_idx ON court_evidence (case_id, side);

CREATE TABLE court_hearings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES court_cases(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  judge_actor_id uuid REFERENCES economic_actors(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','held','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX court_hearing_due_idx ON court_hearings (status, scheduled_at);

CREATE TABLE court_judgments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL UNIQUE REFERENCES court_cases(id) ON DELETE CASCADE,
  judgment jsonb NOT NULL DEFAULT '{}'::jsonb,
  remedy jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'issued'
    CHECK (status IN ('draft','issued','appealed','final','enforced')),
  issued_at timestamptz NOT NULL DEFAULT now(),
  enforced_at timestamptz
);

CREATE TABLE court_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES court_cases(id) ON DELETE CASCADE,
  judgment_id uuid NOT NULL REFERENCES court_judgments(id) ON DELETE CASCADE,
  appellant_actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'filed'
    CHECK (status IN ('filed','reviewing','upheld','overturned','closed')),
  filed_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  outcome jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE asset_freezes (
  case_id uuid NOT NULL REFERENCES court_cases(id) ON DELETE CASCADE,
  asset_kind text NOT NULL CHECK (asset_kind IN ('currency','stock','property','company')),
  asset_id text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','released','executed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  PRIMARY KEY (case_id, asset_kind, asset_id)
);
CREATE INDEX asset_freeze_active_idx ON asset_freezes (asset_kind, asset_id, status);
"""

INSOLVENCY = """
CREATE TABLE insolvency_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  bank_id uuid REFERENCES banks(id) ON DELETE CASCADE,
  court_id uuid NOT NULL REFERENCES commercial_courts(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('reorganization','liquidation','bank_resolution')),
  status text NOT NULL DEFAULT 'filed'
    CHECK (status IN ('filed','stay','administration','plan','liquidation','closed')),
  administrator_actor_id uuid REFERENCES economic_actors(id) ON DELETE SET NULL,
  filed_by_actor_id uuid REFERENCES economic_actors(id) ON DELETE SET NULL,
  reason text NOT NULL DEFAULT '',
  automatic_stay_until timestamptz,
  filed_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  CHECK (company_id IS NOT NULL OR bank_id IS NOT NULL)
);
CREATE INDEX insolvency_open_idx ON insolvency_cases (status, filed_at);
CREATE INDEX insolvency_company_idx ON insolvency_cases (company_id);

CREATE TABLE insolvency_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES insolvency_cases(id) ON DELETE CASCADE,
  claimant_actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('secured','priority','unsecured','equity','fine')),
  amount numeric(30,4) NOT NULL CHECK (amount >= 0),
  paid numeric(30,4) NOT NULL DEFAULT 0 CHECK (paid >= 0),
  status text NOT NULL DEFAULT 'filed'
    CHECK (status IN ('filed','admitted','disputed','rejected','paid')),
  filed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX claim_case_idx ON insolvency_claims (case_id, status, kind);

CREATE TABLE restructuring_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES insolvency_cases(id) ON DELETE CASCADE,
  document jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','voting','confirmed','rejected')),
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE plan_votes (
  plan_id uuid NOT NULL REFERENCES restructuring_plans(id) ON DELETE CASCADE,
  class text NOT NULL CHECK (class IN ('secured','priority','unsecured','equity')),
  yes_amount numeric(30,4) NOT NULL DEFAULT 0,
  no_amount numeric(30,4) NOT NULL DEFAULT 0,
  yes_count integer NOT NULL DEFAULT 0,
  no_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (plan_id, class)
);

CREATE TABLE asset_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES insolvency_cases(id) ON DELETE CASCADE,
  asset_kind text NOT NULL,
  asset_id text NOT NULL,
  method text NOT NULL DEFAULT 'auction' CHECK (method IN ('auction','private')),
  price numeric(30,4) NOT NULL DEFAULT 0 CHECK (price >= 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sold','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
"""

GRANTS = """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      company_charters, company_officers, board_seats, shareholder_meetings,
      resolutions, resolution_votes, related_party_transactions,
      commercial_courts, court_cases, court_evidence, court_hearings,
      court_judgments, court_appeals, asset_freezes, insolvency_cases,
      insolvency_claims, restructuring_plans, plan_votes, asset_sales
      TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT SELECT ON
      company_charters, company_officers, board_seats, shareholder_meetings,
      resolutions, related_party_transactions, commercial_courts, court_cases,
      court_judgments, court_appeals, insolvency_cases, insolvency_claims,
      restructuring_plans, plan_votes, asset_sales
      TO atlas_readonly;
  END IF;
END $$;
"""

DOWNGRADE = [
    "DROP TABLE IF EXISTS asset_sales",
    "DROP TABLE IF EXISTS plan_votes",
    "DROP TABLE IF EXISTS restructuring_plans",
    "DROP TABLE IF EXISTS insolvency_claims",
    "DROP TABLE IF EXISTS insolvency_cases",
    "DROP TABLE IF EXISTS asset_freezes",
    "DROP TABLE IF EXISTS court_appeals",
    "DROP TABLE IF EXISTS court_judgments",
    "DROP TABLE IF EXISTS court_hearings",
    "DROP TABLE IF EXISTS court_evidence",
    "DROP TABLE IF EXISTS court_cases",
    "DROP TABLE IF EXISTS commercial_courts",
    "DROP TABLE IF EXISTS related_party_transactions",
    "DROP TABLE IF EXISTS resolution_votes",
    "DROP TABLE IF EXISTS resolutions",
    "DROP TABLE IF EXISTS shareholder_meetings",
    "DROP TABLE IF EXISTS board_seats",
    "DROP TABLE IF EXISTS company_officers",
    "DROP TABLE IF EXISTS company_charters",
]


def upgrade() -> None:
    for block in (GOVERNANCE, COURT, INSOLVENCY):
        op.execute(block)
    op.execute(GRANTS)


def downgrade() -> None:
    for statement in DOWNGRADE:
        op.execute(statement)
    op.execute("UPDATE companies SET status = 'suspended' WHERE status = 'bankrupt'")
    op.execute("ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_status_check")
    op.execute(
        "ALTER TABLE companies ADD CONSTRAINT companies_status_check "
        "CHECK (status IN ('private','public','suspended','liquidated'))"
    )

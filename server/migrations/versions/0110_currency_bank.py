"""currency and bank: actors, multi-currency ledger, banks, issuance

Revision ID: 0110_currency_bank
Revises: 0109_cosmic_council
Create Date: 2026-10-26

Design references: docs/cosmic-economy/00 §4, 01 §3/§4/§5, 02 §2/§5/§6.

Conventions
-----------
* every balance lives in ``currency_accounts``; only ``domain.currency_service``
  may change it, and every change writes a balanced ledger transaction;
* system actors (treasury/burn/central bank/market) are seeded here and may go
  negative — treasury goes negative when currency is issued (01 §3.2);
* commercial banks are licensed at the business layer, not seeded here.
"""

from __future__ import annotations

from alembic import op

revision = "0110_currency_bank"
down_revision = "0109_cosmic_council"
branch_labels = None
depends_on = None

CURRENCIES = """
CREATE TABLE currencies (
  code text PRIMARY KEY,
  quality smallint NOT NULL UNIQUE CHECK (quality BETWEEN 1 AND 9),
  name text NOT NULL,
  base_value numeric(30,8) NOT NULL CHECK (base_value > 0),
  is_high_tier boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','frozen','retired')),
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO currencies (code, quality, name, base_value, is_high_tier) VALUES
  ('cc1', 1, '星尘币', 1, false),
  ('cc2', 2, '星砂币', 5, false),
  ('cc3', 3, '蔚蓝币', 25, false),
  ('cc4', 4, '银核币', 125, true),
  ('cc5', 5, '金核币', 625, true),
  ('cc6', 6, '星辉币', 3125, true),
  ('cc7', 7, '曲率币', 15625, true),
  ('cc8', 8, '奇点币', 78125, true),
  ('cc9', 9, '创世币', 390625, true);
"""

ACTORS = """
ALTER TABLE players ADD COLUMN controller text NOT NULL DEFAULT 'human'
  CHECK (controller IN ('human','server_ai'));

CREATE TABLE economic_actors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE,
  kind text NOT NULL CHECK (kind IN ('player','bank','treasury','burn','central_bank','market','officer','equity','fund')),
  controller text NOT NULL DEFAULT 'system' CHECK (controller IN ('human','server_ai','system')),
  player_id uuid UNIQUE REFERENCES players(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  allow_negative boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','frozen','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'player') = (player_id IS NOT NULL))
);
CREATE INDEX economic_actors_kind_idx ON economic_actors (kind);

INSERT INTO economic_actors (code, kind, controller, display_name, allow_negative) VALUES
  ('treasury', 'treasury', 'system', '宇宙财政', true),
  ('burn', 'burn', 'system', '销毁科目', false),
  ('cb', 'central_bank', 'system', '宇宙中央银行', true),
  ('market', 'market', 'system', '市场清算账户', false),
  ('officer_pool', 'officer', 'system', '银行柜员池', false),
  ('bank_equity', 'equity', 'system', '银行信贷权益', true),
  ('insurance_fund', 'fund', 'system', '存款保险基金', false),
  ('compliance_fund', 'fund', 'system', '合规基金', false);

INSERT INTO economic_actors (kind, controller, player_id, display_name)
SELECT 'player', p.controller, p.id, p.display_name
  FROM players p
 WHERE NOT EXISTS (SELECT 1 FROM economic_actors a WHERE a.player_id = p.id);
"""

ACCOUNTS = """
CREATE TABLE currency_accounts (
  actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE CASCADE,
  currency_code text NOT NULL REFERENCES currencies(code) ON DELETE RESTRICT,
  balance numeric(30,4) NOT NULL DEFAULT 0,
  frozen numeric(30,4) NOT NULL DEFAULT 0 CHECK (frozen >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, currency_code)
);

CREATE TABLE currency_ledger_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  ref_type text,
  ref_id text,
  idempotency_key text UNIQUE,
  memo text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX currency_tx_created_idx ON currency_ledger_transactions (created_at DESC);

CREATE TABLE currency_ledger_entries (
  id bigserial PRIMARY KEY,
  tx_id uuid NOT NULL REFERENCES currency_ledger_transactions(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE RESTRICT,
  currency_code text NOT NULL REFERENCES currencies(code) ON DELETE RESTRICT,
  delta numeric(30,4) NOT NULL,
  balance_after numeric(30,4) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX currency_entry_tx_idx ON currency_ledger_entries (tx_id);
CREATE INDEX currency_entry_actor_idx ON currency_ledger_entries (actor_id, created_at DESC);

CREATE TABLE currency_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE RESTRICT,
  to_actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE RESTRICT,
  currency_code text NOT NULL REFERENCES currencies(code) ON DELETE RESTRICT,
  amount numeric(30,4) NOT NULL CHECK (amount > 0),
  memo text NOT NULL DEFAULT '',
  tx_id uuid NOT NULL REFERENCES currency_ledger_transactions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_actor_id <> to_actor_id)
);
CREATE INDEX currency_transfer_from_idx ON currency_transfers (from_actor_id, created_at DESC);

CREATE TABLE exchange_fee_tiers (
  id smallserial PRIMARY KEY,
  max_q1_equiv numeric(30,4),
  rate numeric(6,4) NOT NULL CHECK (rate >= 0 AND rate < 1),
  effective_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO exchange_fee_tiers (max_q1_equiv, rate) VALUES
  (1000, 0.0600),
  (10000, 0.0500),
  (100000, 0.0400),
  (NULL, 0.0300);

CREATE TABLE currency_exchange_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_code text NOT NULL REFERENCES currencies(code),
  to_code text NOT NULL REFERENCES currencies(code),
  source_bank_id uuid,
  mid numeric(30,8) NOT NULL,
  spread_bps integer NOT NULL DEFAULT 800,
  bank_buy numeric(30,8) NOT NULL,
  bank_sell numeric(30,8) NOT NULL,
  quoted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX currency_quote_pair_idx ON currency_exchange_quotes (from_code, to_code, quoted_at DESC);
"""

BANKS = """
CREATE TABLE banks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'commercial' CHECK (kind IN ('central','commercial','ai')),
  owner_actor_id uuid REFERENCES economic_actors(id) ON DELETE SET NULL,
  actor_id uuid UNIQUE REFERENCES economic_actors(id) ON DELETE SET NULL,
  currency_code text NOT NULL DEFAULT 'cc1' REFERENCES currencies(code),
  reserve_ratio numeric(6,4) NOT NULL DEFAULT 0.1500 CHECK (reserve_ratio >= 0 AND reserve_ratio < 1),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending','active','suspended','liquidating','closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO economic_actors (code, kind, controller, display_name)
VALUES ('bank:ccb', 'bank', 'system', '宇宙中央银行')
ON CONFLICT (code) DO NOTHING;

INSERT INTO banks (code, name, kind, actor_id, currency_code)
SELECT 'ccb', '宇宙中央银行', 'central', a.id, 'cc1'
  FROM economic_actors a WHERE a.code = 'bank:ccb'
ON CONFLICT (code) DO NOTHING;

CREATE TABLE bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_id uuid NOT NULL REFERENCES banks(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE CASCADE,
  currency_code text NOT NULL REFERENCES currencies(code),
  balance numeric(30,4) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','frozen','closed')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bank_id, actor_id, currency_code)
);
CREATE INDEX bank_account_actor_idx ON bank_accounts (actor_id, status);

CREATE TABLE bank_reserves (
  bank_id uuid NOT NULL REFERENCES banks(id) ON DELETE CASCADE,
  currency_code text NOT NULL REFERENCES currencies(code),
  vault numeric(30,4) NOT NULL DEFAULT 0,
  cb_deposit numeric(30,4) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bank_id, currency_code)
);

CREATE TABLE bank_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_id uuid NOT NULL REFERENCES banks(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE RESTRICT,
  currency_code text NOT NULL REFERENCES currencies(code),
  principal numeric(30,4) NOT NULL CHECK (principal > 0),
  outstanding numeric(30,4) NOT NULL CHECK (outstanding >= 0),
  accrued_interest numeric(30,4) NOT NULL DEFAULT 0 CHECK (accrued_interest >= 0),
  rate_type text NOT NULL DEFAULT 'floating' CHECK (rate_type IN ('fixed','floating')),
  rate_bps integer NOT NULL CHECK (rate_bps >= 0 AND rate_bps <= 10000),
  spread_bps integer NOT NULL DEFAULT 250,
  next_reset_at timestamptz,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','repaid','overdue','defaulted','liquidated')),
  issued_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz NOT NULL,
  last_accrual_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bank_loan_actor_idx ON bank_loans (actor_id, status);
CREATE INDEX bank_loan_bank_idx ON bank_loans (bank_id, status);

CREATE TABLE bank_interest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_id uuid NOT NULL REFERENCES banks(id) ON DELETE CASCADE,
  run_date date NOT NULL,
  deposit_interest numeric(30,4) NOT NULL DEFAULT 0,
  loan_interest numeric(30,4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bank_id, run_date)
);

CREATE TABLE bank_rate_history (
  id bigserial PRIMARY KEY,
  effective_at timestamptz NOT NULL DEFAULT now(),
  policy_rate_bps integer NOT NULL CHECK (policy_rate_bps BETWEEN 0 AND 1500),
  deposit_rate_bps integer NOT NULL,
  lend_rate_bps integer NOT NULL,
  source text NOT NULL DEFAULT 'central_bank',
  note text NOT NULL DEFAULT ''
);

INSERT INTO bank_rate_history (policy_rate_bps, deposit_rate_bps, lend_rate_bps)
VALUES (400, 250, 650);
"""

ISSUANCE = """
CREATE TABLE currency_issuance_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  active_weight numeric(30,4) NOT NULL DEFAULT 80,
  volume_factor numeric(10,6) NOT NULL DEFAULT 0.00015,
  min_daily numeric(30,4) NOT NULL DEFAULT 5000,
  max_daily numeric(30,4) NOT NULL DEFAULT 250000,
  reward_share numeric(5,4) NOT NULL DEFAULT 0.70 CHECK (reward_share >= 0 AND reward_share <= 1),
  bribe_enabled boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','retired')),
  effective_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (min_daily <= max_daily)
);
CREATE UNIQUE INDEX currency_policy_active_uq ON currency_issuance_policy (status) WHERE status = 'active';

INSERT INTO currency_issuance_policy DEFAULT VALUES;

CREATE TABLE currency_issuance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL UNIQUE,
  raw_amount numeric(30,4) NOT NULL,
  emitted_amount numeric(30,4) NOT NULL,
  policy_id uuid NOT NULL REFERENCES currency_issuance_policy(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
"""

GOVERNANCE = """
CREATE TABLE bank_officers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_id uuid NOT NULL REFERENCES banks(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bribe_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE CASCADE,
  officer_actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE CASCADE,
  currency_code text NOT NULL REFERENCES currencies(code),
  amount_src numeric(30,4) NOT NULL CHECK (amount_src > 0),
  base_fee_q1 numeric(30,4) NOT NULL,
  bribe_q1 numeric(30,4) NOT NULL,
  audit_probability numeric(5,4) NOT NULL DEFAULT 0,
  recovered_q1 numeric(30,4) NOT NULL DEFAULT 0,
  frozen_at timestamptz,
  status text NOT NULL DEFAULT 'accepted'
    CHECK (status IN ('accepted','audited','fined','void')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bribe_event_actor_idx ON bribe_events (player_actor_id, created_at DESC);

CREATE TABLE compliance_fund (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  currency_code text NOT NULL UNIQUE REFERENCES currencies(code),
  balance numeric(30,4) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE compliance_fund_entries (
  id bigserial PRIMARY KEY,
  fund_id uuid NOT NULL REFERENCES compliance_fund(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('recovery','fine','payout')),
  amount numeric(30,4) NOT NULL,
  ref_type text,
  ref_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
"""

DEPOSITS = """
CREATE TABLE deposit_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_id uuid NOT NULL REFERENCES banks(id) ON DELETE RESTRICT,
  holder_actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE RESTRICT,
  currency_code text NOT NULL REFERENCES currencies(code),
  principal numeric(30,4) NOT NULL CHECK (principal > 0),
  accrued_interest numeric(30,4) NOT NULL DEFAULT 0 CHECK (accrued_interest >= 0),
  rate_bps integer NOT NULL,
  term_days integer NOT NULL CHECK (term_days > 0),
  transfer_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','transferred','redeemed','matured','defaulted')),
  issued_at timestamptz NOT NULL DEFAULT now(),
  matures_at timestamptz NOT NULL,
  redeemed_at timestamptz
);
CREATE INDEX deposit_cert_holder_idx ON deposit_certificates (holder_actor_id, status);

CREATE TABLE deposit_certificate_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id uuid NOT NULL REFERENCES deposit_certificates(id) ON DELETE CASCADE,
  seller_actor_id uuid NOT NULL REFERENCES economic_actors(id),
  ask_yield_bps integer NOT NULL,
  price numeric(30,4) NOT NULL CHECK (price > 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','filled','expired','cancelled')),
  buyer_actor_id uuid REFERENCES economic_actors(id),
  quoted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  filled_at timestamptz
);

CREATE TABLE interbank_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lender_bank_id uuid NOT NULL REFERENCES banks(id) ON DELETE RESTRICT,
  borrower_bank_id uuid REFERENCES banks(id) ON DELETE RESTRICT,
  currency_code text NOT NULL REFERENCES currencies(code),
  principal numeric(30,4) NOT NULL CHECK (principal > 0),
  rate_bps integer NOT NULL,
  term_days integer NOT NULL CHECK (term_days IN (1,7,30)),
  collateral text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','accepted','repaid','defaulted','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  matures_at timestamptz,
  CHECK (borrower_bank_id IS NULL OR lender_bank_id <> borrower_bank_id)
);

CREATE TABLE deposit_insurance_fund (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  currency_code text NOT NULL UNIQUE REFERENCES currencies(code),
  balance numeric(30,4) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  per_actor_cap_q1_equiv numeric(30,4) NOT NULL DEFAULT 10000,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE deposit_insurance_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id uuid NOT NULL REFERENCES deposit_insurance_fund(id) ON DELETE CASCADE,
  bank_id uuid NOT NULL REFERENCES banks(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE RESTRICT,
  claim_amount numeric(30,4) NOT NULL CHECK (claim_amount > 0),
  cap_applied numeric(30,4) NOT NULL DEFAULT 0,
  approvals jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','paid','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
"""

MOTION_KIND = """
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'council_motions'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%sector_license%'
  LOOP
    EXECUTE format('ALTER TABLE council_motions DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE council_motions
  ADD CONSTRAINT council_motions_kind_check
  CHECK (kind IN ('sector_license','membership','issuance_policy'));
"""

GRANTS = """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      currencies, economic_actors, currency_accounts, currency_ledger_transactions,
      currency_ledger_entries, currency_transfers, exchange_fee_tiers,
      currency_exchange_quotes, banks, bank_accounts, bank_reserves, bank_loans,
      bank_interest_runs, bank_rate_history, currency_issuance_policy, currency_issuance,
      bank_officers, bribe_events, compliance_fund, compliance_fund_entries,
      deposit_certificates, deposit_certificate_quotes, interbank_loans,
      deposit_insurance_fund, deposit_insurance_claims
      TO atlas_app;
    GRANT USAGE, SELECT ON SEQUENCE bank_rate_history_id_seq,
      compliance_fund_entries_id_seq, currency_ledger_entries_id_seq,
      exchange_fee_tiers_id_seq TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT SELECT ON
      currencies, economic_actors, currency_accounts, currency_ledger_transactions,
      currency_ledger_entries, currency_transfers, exchange_fee_tiers,
      currency_exchange_quotes, banks, bank_accounts, bank_reserves, bank_loans,
      bank_interest_runs, bank_rate_history, currency_issuance_policy, currency_issuance
      TO atlas_readonly;
  END IF;
END $$;
"""

DOWNGRADE = [
    "DROP TABLE IF EXISTS deposit_insurance_claims",
    "DROP TABLE IF EXISTS deposit_insurance_fund",
    "DROP TABLE IF EXISTS interbank_loans",
    "DROP TABLE IF EXISTS deposit_certificate_quotes",
    "DROP TABLE IF EXISTS deposit_certificates",
    "DROP TABLE IF EXISTS compliance_fund_entries",
    "DROP TABLE IF EXISTS compliance_fund",
    "DROP TABLE IF EXISTS bribe_events",
    "DROP TABLE IF EXISTS bank_officers",
    "DROP TABLE IF EXISTS currency_issuance",
    "DROP TABLE IF EXISTS currency_issuance_policy",
    "DROP TABLE IF EXISTS bank_rate_history",
    "DROP TABLE IF EXISTS bank_interest_runs",
    "DROP TABLE IF EXISTS bank_loans",
    "DROP TABLE IF EXISTS bank_reserves",
    "DROP TABLE IF EXISTS bank_accounts",
    "DROP TABLE IF EXISTS banks",
    "DROP TABLE IF EXISTS currency_exchange_quotes",
    "DROP TABLE IF EXISTS exchange_fee_tiers",
    "DROP TABLE IF EXISTS currency_transfers",
    "DROP TABLE IF EXISTS currency_ledger_entries",
    "DROP TABLE IF EXISTS currency_ledger_transactions",
    "DROP TABLE IF EXISTS currency_accounts",
    "DROP TABLE IF EXISTS economic_actors",
    "DROP TABLE IF EXISTS currencies",
]


def upgrade() -> None:
    op.execute(MOTION_KIND)
    for block in (CURRENCIES, ACTORS, ACCOUNTS, BANKS, ISSUANCE, GOVERNANCE, DEPOSITS):
        op.execute(block)
    op.execute(GRANTS)


def downgrade() -> None:
    for statement in DOWNGRADE:
        op.execute(statement)
    op.execute("ALTER TABLE council_motions DROP CONSTRAINT IF EXISTS council_motions_kind_check")
    op.execute(
        "ALTER TABLE council_motions ADD CONSTRAINT council_motions_kind_check "
        "CHECK (kind IN ('sector_license','membership'))"
    )
    op.execute("ALTER TABLE players DROP COLUMN IF EXISTS controller")

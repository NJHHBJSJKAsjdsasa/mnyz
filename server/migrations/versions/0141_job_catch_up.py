"""mark catch-up runs in ``job_runs``

``job_runs`` is keyed by ``(job_name, run_date)``, so a day has one row per job. When the
worker restarts after an outage, the job that should have fired at 03:00 is simply gone —
nothing re-runs it, and the next scheduled tick may be 24h away.

``catch_up`` records that a run was *compensating* a missed window rather than firing on
schedule, so ``/health/jobs`` (and anyone reading the table) can tell "this job ran late"
from "this job ran on time". The flag is sticky within a day: if any run of the day was a
catch-up, the row keeps ``true``.

Existing rows default to ``false`` — correct, because no past run was compensating anything.
"""

from __future__ import annotations

from alembic import op

revision = "0141_job_catch_up"
down_revision = "0140_investor_protection"
branch_labels = None
depends_on = None


DDL = """
ALTER TABLE job_runs ADD COLUMN IF NOT EXISTS catch_up boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN job_runs.catch_up IS
  'true when this run compensated a missed schedule window';
"""


def upgrade() -> None:
    op.execute(DDL)


def downgrade() -> None:
    op.execute("ALTER TABLE job_runs DROP COLUMN IF EXISTS catch_up")

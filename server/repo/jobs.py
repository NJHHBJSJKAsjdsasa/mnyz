"""Job bookkeeping reads used by /health/deep and /health/jobs."""

from __future__ import annotations


def last_success(conn) -> list[dict]:
    return conn.execute(
        """
        SELECT job_name, max(finished_at) AS last_ok
          FROM job_runs WHERE ok GROUP BY job_name
        """
    ).fetchall()


def overview(conn) -> list[dict]:
    """One row per job that has ever run, with its most recent outcome.

    `job_runs` is keyed by (job_name, run_date), so a job that runs every minute still has
    a single row per day — this reports the *last* result, not a run history.
    """
    return conn.execute(
        """
        SELECT job_name,
               max(run_date) FILTER (WHERE ok)                       AS last_ok_date,
               max(finished_at)                                      AS last_finished_at,
               (array_agg(ok       ORDER BY run_date DESC))[1]      AS last_ok,
               (array_agg(catch_up ORDER BY run_date DESC))[1]      AS last_catch_up,
               (array_agg(detail   ORDER BY run_date DESC))[1]      AS last_detail,
               count(*) FILTER (WHERE NOT ok AND run_date >= current_date - 7) AS failed_7d,
               max(CASE WHEN NOT ok THEN run_date END)               AS last_fail_date
          FROM job_runs
         GROUP BY job_name
        """
    ).fetchall()

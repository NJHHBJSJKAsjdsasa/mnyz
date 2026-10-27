"""Job bookkeeping reads used by /health/deep."""

from __future__ import annotations


def last_success(conn) -> list[dict]:
    return conn.execute(
        """
        SELECT job_name, max(finished_at) AS last_ok
          FROM job_runs WHERE ok GROUP BY job_name
        """
    ).fetchall()

"""Anti-trust snapshots (03 §6.3 / 07 §6.4 gate "no single actor > 40%").

The metric is deliberately boring and auditable:

    share_i = actor_i 30-day traded notional / sector total
    HHI     = Σ share_i² × 10000
    top3    = sum of the three largest shares

Three thresholds, any one of which is a violation: ``share > 40%``,
``top3 > 70%``, ``HHI > 2500``.

Two things this first pass does **not** do, and both are recorded in
TASK-BACKLOG rather than silently approximated:

* related parties are not merged (03 §2.3 "同一控制人合并计算") — that needs the
  ownership graph flattened per actor;
* the "rising >10pp for 3 consecutive months" trigger needs history, which only
  starts accumulating once this job has run for three months.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from ..repo import antitrust as antitrust_repo

SHARE_LIMIT = Decimal("0.40")
TOP3_LIMIT = Decimal("0.70")
HHI_LIMIT = Decimal("2500")


def snapshot(conn, *, days: int = 30, period: date | None = None) -> dict:
    """Recompute and persist one period. Re-running the same period is a no-op."""
    period = period or date.today()
    rows = antitrust_repo.flows(conn, days)

    sectors: dict[str, list[dict]] = {}
    for row in rows:
        total = Decimal(row["total"] or 0)
        if total <= 0:
            continue
        share = Decimal(row["amount"] or 0) / total
        sectors.setdefault(row["sector_key"], []).append(
            {"actor_id": str(row["actor_id"]), "amount": str(row["amount"]), "share": share}
        )

    violations: list[dict] = []
    written = 0
    for sector_key, actors in sectors.items():
        actors.sort(key=lambda item: item["share"], reverse=True)
        hhi = sum(item["share"] ** 2 for item in actors) * 10000
        top3 = sum(item["share"] for item in actors[:3])
        for item in actors:
            antitrust_repo.insert_share_snapshot(
                conn,
                actor_id=item["actor_id"],
                sector_key=sector_key,
                period=period,
                share=item["share"],
                hhi=hhi.quantize(Decimal("0.0001")),
            )
            written += 1
            if item["share"] > SHARE_LIMIT:
                violations.append(
                    {
                        "sector_key": sector_key,
                        "actor_id": item["actor_id"],
                        "kind": "single_actor",
                        "share": str(round(item["share"], 6)),
                    }
                )
        if top3 > TOP3_LIMIT:
            violations.append(
                {"sector_key": sector_key, "kind": "top3", "top3": str(round(top3, 6))}
            )
        if hhi > HHI_LIMIT:
            violations.append(
                {"sector_key": sector_key, "kind": "hhi", "hhi": str(round(hhi, 4))}
            )

    return {
        "period": day(period),
        "sectors": len(sectors),
        "actors": written,
        "violations": violations,
        "thresholds": {
            "share": str(SHARE_LIMIT),
            "top3": str(TOP3_LIMIT),
            "hhi": str(HHI_LIMIT),
        },
    }


def overview(conn, *, period: date | None = None) -> dict:
    """Read the persisted snapshot (the job's output), not a fresh computation."""
    period = period or antitrust_repo.latest_period(conn)
    if period is None:
        return {"period": None, "sectors": [], "violations": []}

    rows = antitrust_repo.snapshot_for(conn, period)
    sectors: dict[str, list[dict]] = {}
    for row in rows:
        sectors.setdefault(row["sector_key"], []).append(
            {
                "actor_id": str(row["actor_id"]),
                "share": str(row["share"]),
                "hhi": str(row["hhi"]),
            }
        )

    violations = []
    for sector_key, actors in sectors.items():
        hhi = Decimal(actors[0]["hhi"]) if actors else Decimal(0)
        top3 = sum(Decimal(item["share"]) for item in actors[:3])
        for item in actors:
            if Decimal(item["share"]) > SHARE_LIMIT:
                violations.append({"sector_key": sector_key, **item, "kind": "single_actor"})
        if top3 > TOP3_LIMIT:
            violations.append({"sector_key": sector_key, "kind": "top3", "top3": str(top3)})
        if hhi > HHI_LIMIT:
            violations.append({"sector_key": sector_key, "kind": "hhi", "hhi": str(hhi)})

    return {
        "period": day(period),
        "sectors": [
            {"sector_key": key, "actors": actors} for key, actors in sorted(sectors.items())
        ],
        "violations": violations,
    }

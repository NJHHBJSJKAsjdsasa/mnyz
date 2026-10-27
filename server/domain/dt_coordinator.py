"""Cross-region 2PC coordinator (09).

The coordinator only decides; participants execute. In the single-database stage
a transaction is a **one-participant no-op**: ``begin`` writes the log and runs
prepare+commit inline, so the caller never changes when regions are split later.

What is real today: the state machine, the fee model (base + risk + congestion,
clamped), the 5 s budget rejection, leases and takeover, the unknown-SLA ladder
and the append-only decision/outbox log.
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from ..infra.errors import Forbidden, InvalidArgument, NotFound, Unprocessable
from ..repo import distributed_tx as dt_repo

BUDGET_MS = 5000
REGION_RELATION = {
    ("core", "core"): "same",
    ("rim", "rim"): "same",
    ("outer", "outer"): "same",
    ("frontier", "frontier"): "same",
    ("core", "rim"): "adjacent",
    ("rim", "outer"): "cross",
    ("core", "outer"): "remote",
    ("core", "frontier"): "risk",
    ("rim", "frontier"): "risk",
    ("outer", "frontier"): "risk",
}
BASE_FEE_BPS = {"same": 0, "adjacent": 5, "cross": 10, "remote": 20, "risk": 25}
RISK_PREMIUM = {"cash": 0, "stock": 2, "property": 2, "court_freeze": 5}
REGION_LATENCY_MS = {
    ("core", "core"): 40,
    ("rim", "rim"): 40,
    ("outer", "outer"): 40,
    ("frontier", "frontier"): 60,
    ("core", "rim"): 900,
    ("rim", "outer"): 3200,
    ("core", "outer"): 6000,
    ("core", "frontier"): 7000,
    ("rim", "frontier"): 4500,
    ("outer", "frontier"): 5200,
}
FEE_SPLIT = (("coordinator", Decimal("0.40")), ("origin", Decimal("0.30")),
             ("asset_region", Decimal("0.20")), ("fund", Decimal("0.10")))
OPEN_STATUSES = ("init", "preparing", "prepared", "committing")
UNKNOWN_ELIGIBLE = ("preparing", "prepared", "committing", "aborting")
MAX_PARTICIPANTS = 8


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _pair(a: str, b: str) -> str:
    return REGION_RELATION.get((a, b)) or REGION_RELATION.get((b, a)) or "cross"


def _latency(a: str, b: str) -> int:
    return REGION_LATENCY_MS.get((a, b)) or REGION_LATENCY_MS.get((b, a)) or 3000


def _config(conn) -> dict:
    return dt_repo.config(conn) or {
        "budget_ms": BUDGET_MS, "prepare_ms": 2000, "commit_ms": 2000, "lease_seconds": 3,
        "unknown_after_ms": 8000, "freeze_after_ms": 10000, "capacity": 200,
    }


def _pending(conn) -> int:
    row = conn.execute(
        "SELECT COUNT(*) AS n FROM distributed_transactions "
        "WHERE status IN ('preparing','prepared','committing')"
    ).fetchone()
    return int(row["n"])


def _congestion_bps(conn, capacity: int) -> int:
    utilization = Decimal(_pending(conn)) / Decimal(max(1, capacity))
    if utilization <= Decimal("0.5"):
        return 0
    premium = math.ceil(10 * float(utilization) ** 2)
    return min(10, premium)


def estimate(conn, origin_region: str, target_regions: list[str], *,
             asset_class: str = "cash") -> dict:
    """Quote before the caller commits: fee, expected latency, accept/reject."""
    cfg = _config(conn)
    regions = sorted({origin_region, *target_regions})
    relations = [_pair(origin_region, region) for region in target_regions] or ["same"]
    base = max(BASE_FEE_BPS[relation] for relation in relations)
    premium = RISK_PREMIUM.get(asset_class, 0)
    congestion = _congestion_bps(conn, int(cfg["capacity"]))
    bps = base + premium + congestion
    if all(relation == "same" for relation in relations):
        bps = 0
    bps = max(0, min(30, bps))
    latency = max((_latency(origin_region, region) for region in target_regions), default=40)
    estimated_ms = latency + 200
    return {
        "fee_bps": bps,
        "estimated_settlement_ms": estimated_ms,
        "accepted": estimated_ms <= int(cfg["budget_ms"]),
        "regions": regions,
        "capacity": int(cfg["capacity"]),
        "pending": _pending(conn),
    }


def _fee_split(amount: Decimal) -> dict:
    return {name: str((amount * share).quantize(Decimal("0.0001")))
            for name, share in FEE_SPLIT}


def _payload(row: dict, conn, *, detail: bool = False) -> dict:
    data = {
        "tx_id": str(row["id"]),
        "kind": row["kind"],
        "status": row["status"],
        "origin_region": row["origin_region"],
        "coordinator_id": row["coordinator_id"],
        "coordinator_region": row["coordinator_region"],
        "notional": str(Decimal(row["notional"])),
        "currency_code": row["currency_code"],
        "fee_bps": int(row["fee_bps"]),
        "fee_amount": str(Decimal(row["fee_amount"])),
        "fee_split": _fee_split(Decimal(row["fee_amount"])),
        "retries": int(row["retries"]),
        "deadline_at": row["deadline_at"].isoformat(),
        "decided_at": row["decided_at"].isoformat() if row["decided_at"] else None,
        "unknown_since": row["unknown_since"].isoformat() if row["unknown_since"] else None,
        "last_error": row["last_error"],
        "created_at": row["created_at"].isoformat(),
    }
    if detail:
        data["participants"] = [
            {
                "participant_id": item["participant_id"],
                "region": item["region"],
                "status": item["status"],
                "prepared_at": item["prepared_at"].isoformat() if item["prepared_at"] else None,
                "committed_at": item["committed_at"].isoformat() if item["committed_at"] else None,
                "last_error": item["last_error"],
            }
            for item in dt_repo.participants_of(conn, str(row["id"]))
        ]
        data["decisions"] = [
            {
                "decision": item["decision"],
                "reason": item["reason"],
                "decided_by": item["decided_by"],
                "at": item["created_at"].isoformat(),
            }
            for item in dt_repo.decisions_of(conn, str(row["id"]))
        ]
        data["outbox"] = [
            {
                "event_type": item["event_type"],
                "payload": item["payload"],
                "published_at": item["published_at"].isoformat() if item["published_at"] else None,
            }
            for item in dt_repo.outbox_of(conn, str(row["id"]))
        ]
    return data


# ------------------------------------------------------------------ begin
def begin(
    conn,
    *,
    kind: str,
    participants: list[dict],
    payload: dict | None = None,
    origin_region: str = "core",
    coordinator_id: str = "dt-coordinator-1",
    idempotency_key: str | None = None,
    notional: Decimal = Decimal(0),
    currency_code: str | None = None,
    asset_class: str = "cash",
    defer: bool = False,
) -> dict:
    if idempotency_key:
        existing = dt_repo.tx_by_idempotency(conn, idempotency_key)
        if existing is not None:
            return {**_payload(existing, conn, detail=True), "replayed": True}
    if not participants:
        raise InvalidArgument("至少需要一个参与者")
    if len(participants) > MAX_PARTICIPANTS:
        raise InvalidArgument(f"参与者最多 {MAX_PARTICIPANTS} 个")
    seen: set[str] = set()
    clean: list[dict] = []
    for item in participants:
        pid = str(item.get("participant_id") or "").strip()
        if not pid or pid in seen:
            raise InvalidArgument("participant_id 必须唯一且非空")
        seen.add(pid)
        clean.append({"participant_id": pid, "region": str(item.get("region") or origin_region)})

    target_regions = [item["region"] for item in clean]
    quote = estimate(conn, origin_region, target_regions, asset_class=asset_class)
    if not quote["accepted"]:
        raise Unprocessable(
            f"跨区结算预估 {quote['estimated_settlement_ms']}ms 超过 5s 预算，已拒绝（09 §3.6）"
        )

    value = Decimal(str(notional or 0))
    cfg = _config(conn)
    fee = (value * Decimal(quote["fee_bps"]) / Decimal(10_000)).quantize(Decimal("0.0001"))
    row = dt_repo.insert_tx(
        conn,
        kind=kind,
        payload={**(payload or {}), "asset_class": asset_class,
                 "regions": quote["regions"],
                 "estimated_settlement_ms": quote["estimated_settlement_ms"]},
        origin_region=origin_region,
        coordinator_id=coordinator_id,
        coordinator_region=origin_region,
        fee_bps=quote["fee_bps"],
        fee_amount=fee,
        notional=value,
        currency_code=currency_code,
        deadline_at=_now() + timedelta(milliseconds=int(cfg["budget_ms"])),
        idempotency_key=idempotency_key,
    )
    tx_id = str(row["id"])
    for item in clean:
        dt_repo.insert_participant(conn, tx_id, item["participant_id"], item["region"])
    dt_repo.upsert_lease(
        conn, tx_id, coordinator_id, origin_region,
        _now() + timedelta(seconds=int(cfg["lease_seconds"])),
    )
    if defer:
        return _payload(dt_repo.tx_by_id(conn, tx_id), conn, detail=True)
    for item in clean:
        _prepare_one(conn, tx_id, item["participant_id"])
    _commit_tx(conn, tx_id, coordinator_id, reason="single-region inline commit")
    return _payload(dt_repo.tx_by_id(conn, tx_id), conn, detail=True)


def _prepare_one(conn, tx_id: str, participant_id: str) -> None:
    dt_repo.set_participant(conn, tx_id, participant_id, "prepared")


def prepare(conn, tx_id: str, participant_id: str, *, coordinator_id: str) -> dict:
    row = dt_repo.tx_by_id(conn, tx_id, for_update=True)
    if row is None:
        raise NotFound("事务不存在")
    if row["status"] not in ("init", "preparing", "prepared"):
        raise Unprocessable(f"事务状态 {row['status']} 不接受 prepare")
    if row["deadline_at"] <= _now():
        _abort_tx(conn, tx_id, coordinator_id, reason="prepare deadline exceeded")
        return _payload(dt_repo.tx_by_id(conn, tx_id), conn, detail=True)
    participants = {item["participant_id"] for item in dt_repo.participants_of(conn, tx_id)}
    if participant_id not in participants:
        raise NotFound("参与者不属于该事务")
    _prepare_one(conn, tx_id, participant_id)
    states = {item["status"] for item in dt_repo.participants_of(conn, tx_id)}
    if states <= {"prepared", "committed"}:
        dt_repo.set_tx_status(conn, tx_id, "prepared")
    return _payload(dt_repo.tx_by_id(conn, tx_id), conn, detail=True)


def commit(conn, tx_id: str, *, coordinator_id: str) -> dict:
    row = dt_repo.tx_by_id(conn, tx_id, for_update=True)
    if row is None:
        raise NotFound("事务不存在")
    if row["status"] == "committed":
        return {**_payload(row, conn, detail=True), "replayed": True}
    if row["status"] not in ("prepared", "committing"):
        raise Unprocessable(f"事务状态 {row['status']} 不能 commit（需先全部 prepared）")
    _commit_tx(conn, tx_id, coordinator_id, reason="all participants prepared")
    return _payload(dt_repo.tx_by_id(conn, tx_id), conn, detail=True)


def _commit_tx(conn, tx_id: str, coordinator_id: str, *, reason: str,
               log_decision: bool = True) -> None:
    dt_repo.set_tx_status(conn, tx_id, "committing")
    for item in dt_repo.participants_of(conn, tx_id):
        if item["status"] != "committed":
            dt_repo.set_participant(conn, tx_id, str(item["participant_id"]), "committed")
    dt_repo.set_tx_status(conn, tx_id, "committed", decided=True)
    row = dt_repo.tx_by_id(conn, tx_id)
    if log_decision:
        dt_repo.add_decision(conn, tx_id, "commit", reason, coordinator_id)
    dt_repo.add_outbox(
        conn, tx_id, "dt.committed",
        {
            "kind": row["kind"],
            "fee_bps": int(row["fee_bps"]),
            "fee_amount": str(Decimal(row["fee_amount"])),
            "fee_split": _fee_split(Decimal(row["fee_amount"])),
            "regions": (row["payload"] or {}).get("regions", []),
        },
    )


def abort(conn, tx_id: str, *, coordinator_id: str, reason: str = "participant refused") -> dict:
    row = dt_repo.tx_by_id(conn, tx_id, for_update=True)
    if row is None:
        raise NotFound("事务不存在")
    if row["status"] == "committed":
        raise Unprocessable("commit 之后不可回滚（09 §3.4）")
    if row["status"] == "aborted":
        return {**_payload(row, conn, detail=True), "replayed": True}
    _abort_tx(conn, tx_id, coordinator_id, reason=reason)
    return _payload(dt_repo.tx_by_id(conn, tx_id), conn, detail=True)


def _abort_tx(conn, tx_id: str, coordinator_id: str, *, reason: str,
              log_decision: bool = True) -> None:
    dt_repo.set_tx_status(conn, tx_id, "aborting")
    for item in dt_repo.participants_of(conn, tx_id):
        if item["status"] in ("pending", "prepared", "failed"):
            dt_repo.set_participant(conn, tx_id, str(item["participant_id"]), "aborted")
    conn.execute(
        "UPDATE distributed_transactions SET fee_amount = 0 WHERE id = %s", (tx_id,)
    )
    dt_repo.set_tx_status(conn, tx_id, "aborted", decided=True)
    if log_decision:
        dt_repo.add_decision(conn, tx_id, "abort", reason, coordinator_id)
    dt_repo.add_outbox(conn, tx_id, "dt.aborted", {"reason": reason, "fee_refunded": True})


def get(conn, tx_id: str) -> dict:
    row = dt_repo.tx_by_id(conn, tx_id)
    if row is None:
        raise NotFound("事务不存在")
    lease = dt_repo.lease_of(conn, tx_id)
    data = _payload(row, conn, detail=True)
    data["lease"] = (
        {
            "coordinator_id": lease["coordinator_id"],
            "region": lease["region"],
            "lease_until": lease["lease_until"].isoformat(),
        }
        if lease
        else None
    )
    return data


# ------------------------------------------------------------------ recovery
def recover(conn, *, coordinator_id: str = "dt-recovery") -> dict:
    """Take over expired leases, then drive every open transaction forward."""
    cfg = _config(conn)
    budget = int(cfg["budget_ms"])
    unknown_after = int(cfg["unknown_after_ms"])
    freeze_after = int(cfg["freeze_after_ms"])
    taken, committed, aborted, unknown, frozen = 0, 0, 0, 0, 0

    for lease in dt_repo.expired_leases(conn):
        tx_id = str(lease["tx_id"])
        row = dt_repo.tx_by_id(conn, tx_id, for_update=True)
        if row is None or row["status"] not in UNKNOWN_ELIGIBLE:
            continue
        dt_repo.upsert_lease(
            conn, tx_id, coordinator_id, row["origin_region"],
            _now() + timedelta(seconds=int(cfg["lease_seconds"])),
        )
        dt_repo.add_decision(
            conn, tx_id, "heuristic_commit" if row["status"] == "committing" else "heuristic_abort",
            f"lease takeover from {lease['coordinator_id']}", coordinator_id,
        )
        taken += 1

    for row in dt_repo.open_txs(conn, UNKNOWN_ELIGIBLE):
        tx_id = str(row["id"])
        now = _now()
        age_ms = int((now - row["created_at"]).total_seconds() * 1000)
        if row["status"] in ("preparing", "prepared") and now > row["deadline_at"]:
            _abort_tx(conn, tx_id, coordinator_id, reason="deadline exceeded, aborted by recovery")
            aborted += 1
            continue
        if age_ms >= freeze_after:
            dt_repo.set_tx_status(conn, tx_id, "unknown", unknown=True,
                                  error="frozen pending manual decision")
            dt_repo.add_outbox(conn, tx_id, "dt.frozen",
                               {"scope": "affected actors only", "sla_ms": freeze_after})
            unknown += 1
            frozen += 1
            continue
        if age_ms >= unknown_after:
            if row["status"] != "unknown":
                dt_repo.set_tx_status(conn, tx_id, "unknown", unknown=True,
                                      error="coordinator cannot decide within SLA")
                dt_repo.add_outbox(conn, tx_id, "dt.unknown", {"sla_ms": unknown_after})
                unknown += 1
            continue
        if row["status"] == "committing":
            dt_repo.bump_retry(conn, tx_id)
            _commit_tx(conn, tx_id, coordinator_id, reason="recovery retry commit")
            committed += 1
        elif row["status"] == "prepared":
            _commit_tx(conn, tx_id, coordinator_id, reason="prepared, recovery commit")
            committed += 1
        elif age_ms >= budget and row["status"] == "preparing":
            _abort_tx(conn, tx_id, coordinator_id, reason="budget exhausted")
            aborted += 1

    return {"taken_over": taken, "committed": committed, "aborted": aborted,
            "unknown": unknown, "frozen": frozen}


def resolve_unknown(conn, tx_id: str, *, decision: str, decided_by: str, reviewer: str,
                    reason: str = "") -> dict:
    if decision not in ("commit", "abort"):
        raise InvalidArgument("人工决议只能是 commit/abort")
    if not decided_by or not reviewer or decided_by == reviewer:
        raise Forbidden("unknown 事务需双人复核（决定人 ≠ 复核人）")
    row = dt_repo.tx_by_id(conn, tx_id, for_update=True)
    if row is None:
        raise NotFound("事务不存在")
    if row["status"] != "unknown":
        raise Unprocessable("只有 unknown 事务需要人工决议")
    label = "heuristic_commit" if decision == "commit" else "heuristic_abort"
    if decision == "commit":
        _commit_tx(conn, tx_id, decided_by, reason="manual commit after unknown",
                   log_decision=False)
    else:
        _abort_tx(conn, tx_id, decided_by, reason="manual abort after unknown",
                  log_decision=False)
    dt_repo.add_decision(conn, tx_id, label, reason or "manual resolution",
                         f"{decided_by}/{reviewer}")
    return {**_payload(dt_repo.tx_by_id(conn, tx_id), conn, detail=True),
            "resolved_by": f"{decided_by}/{reviewer}"}


def monitoring(conn) -> dict:
    rows = dt_repo.stats(conn)
    counts = {row["status"]: int(row["n"]) for row in rows}
    unknown = counts.get("unknown", 0)
    return {
        "by_status": counts,
        "unknown": unknown,
        "open": sum(counts.get(status, 0) for status in OPEN_STATUSES),
        "alert": unknown > 0,
    }

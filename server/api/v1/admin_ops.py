"""Operations read-only endpoints (12 §D): audit trail, job runs, dead letters.

These three tables existed since ``0008_platform`` but had no read path, so an
incident ("我分红没到账") could not be answered without psql access. They are
``admin``/``ops`` only and strictly read-only.
"""

from __future__ import annotations

from datetime import datetime

from flask import Blueprint, g, request

from ...domain import ops
from ...infra.context import db
from ...infra.serialize import day, ts
from ...infra.errors import InvalidArgument
from ...models.ops import AnnouncementRequest, PlayerGrantRequest, PlayerLockRequest
from ..deps import (
    begin_idempotency,
    finish_idempotency,
    parse_model,
    rate_limit,
    require_admin,
    require_auth,
    success,
)

bp = Blueprint("admin_ops", __name__)


def _operator() -> str:
    """``audit_log.actor`` is a uuid column — the operator's *player id*, not name."""
    return str(getattr(g, "player_id", "") or "")


def _write(payload: dict, action):
    with db().transaction() as conn:
        ticket = begin_idempotency(conn, g.account_id, payload)
        if ticket.replayed and ticket.cached:
            return success(ticket.cached, extra_headers={"Idempotent-Replay": "true"})
        result = action(conn)
        finish_idempotency(conn, ticket, 200, result)
    return success(result)


def _int(name: str, default: int, upper: int) -> int:
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        raise InvalidArgument(f"{name} 必须是整数") from None
    return max(1, min(value, upper))


def _since() -> datetime | None:
    raw = request.args.get("since")
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        raise InvalidArgument("since 需为 ISO 时间") from None


@bp.get("/admin/audit")
@require_auth()
@rate_limit("admin_audit", 60, 60)
def audit_entries():
    require_admin()
    limit = _int("limit", 100, 500)
    actor = (request.args.get("actor") or "").strip() or None
    action = (request.args.get("action") or "").strip() or None
    since = _since()
    where = []
    params: list = []
    if actor:
        where.append("actor = %s")
        params.append(actor)
    if action:
        where.append("action = %s")
        params.append(action)
    if since:
        where.append("created_at >= %s")
        params.append(since)
    sql = "SELECT id, actor, action, target, before, after, request_id, created_at FROM audit_log"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY created_at DESC LIMIT %s"
    params.append(limit)
    with db().connection() as conn:
        rows = conn.execute(sql, tuple(params)).fetchall()
    return success(
        {
            "entries": [
                {
                    "id": int(row["id"]),
                    "actor": str(row["actor"]) if row["actor"] else None,
                    "action": row["action"],
                    "target": row["target"],
                    "before": row["before"],
                    "after": row["after"],
                    "request_id": row["request_id"],
                    "created_at": ts(row["created_at"]),
                }
                for row in rows
            ],
            "limit": limit,
        }
    )


@bp.get("/admin/jobs/runs")
@require_auth()
@rate_limit("admin_jobs", 60, 60)
def job_runs():
    require_admin()
    limit = _int("limit", 50, 300)
    job = (request.args.get("job") or "").strip() or None
    where = []
    params: list = []
    if job:
        where.append("job_name = %s")
        params.append(job)
    sql = (
        "SELECT job_name, run_date, started_at, finished_at, ok, detail FROM job_runs"
    )
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY started_at DESC LIMIT %s"
    params.append(limit)
    with db().connection() as conn:
        rows = conn.execute(sql, tuple(params)).fetchall()
    return success(
        {
            "runs": [
                {
                    "job_name": row["job_name"],
                    "run_date": day(row["run_date"]),
                    "started_at": ts(row["started_at"]),
                    "finished_at": ts(row["finished_at"]),
                    "ok": bool(row["ok"]),
                    "detail": row["detail"],
                }
                for row in rows
            ]
        }
    )


@bp.get("/admin/dlq")
@require_auth()
@rate_limit("admin_dlq", 60, 60)
def dead_letters():
    require_admin()
    limit = _int("limit", 50, 300)
    with db().connection() as conn:
        rows = conn.execute(
            "SELECT id, task, payload, error, attempts, created_at, replayed_at "
            "  FROM dlq_events ORDER BY created_at DESC LIMIT %s",
            (limit,),
        ).fetchall()
    return success(
        {
            "events": [
                {
                    "id": int(row["id"]),
                    "task": row["task"],
                    "payload": row["payload"],
                    "error": row["error"],
                    "attempts": int(row["attempts"]),
                    "created_at": ts(row["created_at"]),
                    "replayed_at": ts(row["replayed_at"]),
                }
                for row in rows
            ]
        }
    )


# ------------------------------------------------------------------ players
@bp.post("/admin/players/<player_id>/lock")
@require_auth(write=True)
@rate_limit("admin_player_lock", 30, 60)
def lock_player(player_id: str):
    require_admin()
    body = parse_model(PlayerLockRequest)
    return _write(
        {"player": player_id, "lock": body.reason},
        lambda conn: ops.lock_player(conn, player_id=player_id, reason=body.reason, actor=_operator()),
    )


@bp.post("/admin/players/<player_id>/unlock")
@require_auth(write=True)
@rate_limit("admin_player_unlock", 30, 60)
def unlock_player(player_id: str):
    require_admin()
    return _write(
        {"player": player_id, "unlock": True},
        lambda conn: ops.unlock_player(conn, player_id=player_id, actor=_operator()),
    )


@bp.post("/admin/players/<player_id>/grant")
@require_auth(write=True)
@rate_limit("admin_player_grant", 60, 60)
def grant_player(player_id: str):
    """Compensation only. Additive, audited, and capped by the model."""
    require_admin()
    body = parse_model(PlayerGrantRequest)
    return _write(
        {"player": player_id, "resource": body.resource_code, "amount": str(body.amount)},
        lambda conn: ops.grant(
            conn,
            player_id=player_id,
            resource_code=body.resource_code,
            amount=body.amount,
            reason=body.reason,
            actor=_operator(),
        ),
    )


# ------------------------------------------------------------------ announcements
@bp.get("/admin/announcements")
@require_auth()
@rate_limit("admin_announcements", 60, 60)
def list_announcements():
    require_admin()
    with db().connection() as conn:
        return success(ops.active_announcements(conn, _int("limit", 10, 50)))


@bp.post("/admin/announcements")
@require_auth(write=True)
@rate_limit("admin_announce", 30, 60)
def publish_announcement():
    require_admin()
    body = parse_model(AnnouncementRequest)
    return _write(
        {"title": body.title, "severity": body.severity},
        lambda conn: ops.announce(
            conn,
            title=body.title,
            body=body.body,
            severity=body.severity,
            actor=_operator(),
            hours=body.hours,
        ),
    )


@bp.delete("/admin/announcements/<announcement_id>")
@require_auth(write=True)
@rate_limit("admin_announce_off", 30, 60)
def retract_announcement(announcement_id: str):
    require_admin()
    return _write(
        {"announcement": announcement_id, "active": False},
        lambda conn: ops.deactivate(conn, announcement_id=announcement_id, actor=_operator()),
    )


# ------------------------------------------------------------------ economy
@bp.get("/admin/economy/dashboard")
@require_auth()
@rate_limit("admin_dashboard", 60, 60)
def economy_dashboard():
    require_admin()
    with db().connection() as conn:
        return success(ops.dashboard(conn))

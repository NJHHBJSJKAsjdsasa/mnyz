"""Internal 2PC endpoints (09 §9).

Service-to-service only: every request must carry ``X-Internal-Token`` matching
``ATLAS_INTERNAL_TOKEN``. With no token configured the whole blueprint is closed,
so a forgotten env var fails closed instead of exposing the coordinator.
"""

from __future__ import annotations

from flask import Blueprint, request

from ...domain import dt_coordinator
from ...infra.context import db
from ...infra.errors import Forbidden
from ...models.dt import AbortRequest, BeginRequest, CommitRequest, PrepareRequest, ResolveRequest
from ..deps import parse_model, rate_limit, settings, success

bp = Blueprint("internal_dt", __name__)
INTERNAL_HEADER = "X-Internal-Token"


def _require_internal() -> None:
    expected = settings().internal_token
    if not expected:
        raise Forbidden("内部接口未启用（ATLAS_INTERNAL_TOKEN 未配置）")
    token = (request.headers.get(INTERNAL_HEADER) or "").strip()
    if not token or token != expected:
        raise Forbidden("内部接口令牌无效")


@bp.post("/internal/dt/begin")
@rate_limit("dt_begin", 120, 60, by="ip")
def begin():
    _require_internal()
    body = parse_model(BeginRequest)
    with db().transaction() as conn:
        result = dt_coordinator.begin(
            conn,
            kind=body.kind,
            participants=[item.model_dump() for item in body.participants],
            payload=body.payload,
            origin_region=body.origin_region,
            coordinator_id=body.coordinator_id,
            idempotency_key=(request.headers.get("Idempotency-Key") or "").strip() or None,
            notional=body.notional,
            currency_code=body.currency_code,
            asset_class=body.asset_class,
            defer=body.defer,
        )
    return success(result)


@bp.get("/internal/dt/stats")
@rate_limit("dt_stats", 120, 60, by="ip")
def stats():
    _require_internal()
    with db().connection() as conn:
        return success(dt_coordinator.monitoring(conn))


@bp.get("/internal/dt/<tx_id>")
@rate_limit("dt_get", 240, 60, by="ip")
def get(tx_id: str):
    _require_internal()
    with db().connection() as conn:
        return success(dt_coordinator.get(conn, tx_id))


@bp.post("/internal/dt/<tx_id>/prepare")
@rate_limit("dt_prepare", 240, 60, by="ip")
def prepare(tx_id: str):
    _require_internal()
    body = parse_model(PrepareRequest)
    with db().transaction() as conn:
        return success(dt_coordinator.prepare(
            conn, tx_id, body.participant_id, coordinator_id=body.coordinator_id
        ))


@bp.post("/internal/dt/<tx_id>/commit")
@rate_limit("dt_commit", 240, 60, by="ip")
def commit(tx_id: str):
    _require_internal()
    body = parse_model(CommitRequest)
    with db().transaction() as conn:
        return success(dt_coordinator.commit(conn, tx_id, coordinator_id=body.coordinator_id))


@bp.post("/internal/dt/<tx_id>/abort")
@rate_limit("dt_abort", 240, 60, by="ip")
def abort(tx_id: str):
    _require_internal()
    body = parse_model(AbortRequest)
    with db().transaction() as conn:
        return success(dt_coordinator.abort(
            conn, tx_id, coordinator_id=body.coordinator_id, reason=body.reason
        ))


@bp.post("/internal/dt/<tx_id>/resolve")
@rate_limit("dt_resolve", 30, 60, by="ip")
def resolve(tx_id: str):
    _require_internal()
    body = parse_model(ResolveRequest)
    with db().transaction() as conn:
        return success(dt_coordinator.resolve_unknown(
            conn, tx_id, decision=body.decision, decided_by=body.decided_by,
            reviewer=body.reviewer, reason=body.reason,
        ))

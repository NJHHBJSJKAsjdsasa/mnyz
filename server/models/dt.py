"""Request models for the internal 2PC endpoints (09 §9)."""

from __future__ import annotations

from decimal import Decimal

from pydantic import Field

from .auth import StrictModel


class ParticipantModel(StrictModel):
    participant_id: str = Field(min_length=1, max_length=64)
    region: str = Field(default="core", max_length=32)


class BeginRequest(StrictModel):
    kind: str = Field(min_length=2, max_length=48)
    participants: list[ParticipantModel] = Field(min_length=1, max_length=8)
    payload: dict = Field(default_factory=dict)
    origin_region: str = Field(default="core", max_length=32)
    coordinator_id: str = Field(default="dt-coordinator-1", max_length=64)
    notional: Decimal = Field(default=Decimal(0), ge=0, max_digits=24, decimal_places=4)
    currency_code: str | None = Field(default=None, max_length=4)
    asset_class: str = Field(default="cash", pattern="^(cash|stock|property|court_freeze)$")
    defer: bool = False


class PrepareRequest(StrictModel):
    participant_id: str = Field(min_length=1, max_length=64)
    coordinator_id: str = Field(default="dt-coordinator-1", max_length=64)


class CommitRequest(StrictModel):
    coordinator_id: str = Field(default="dt-coordinator-1", max_length=64)


class AbortRequest(StrictModel):
    coordinator_id: str = Field(default="dt-coordinator-1", max_length=64)
    reason: str = Field(default="", max_length=500)


class ResolveRequest(StrictModel):
    decision: str = Field(pattern="^(commit|abort)$")
    decided_by: str = Field(min_length=1, max_length=64)
    reviewer: str = Field(min_length=1, max_length=64)
    reason: str = Field(default="", max_length=500)

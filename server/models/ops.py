"""Request models for operator actions (12 §5)."""

from __future__ import annotations

from decimal import Decimal

from pydantic import Field

from .auth import StrictModel

MAX_GRANT = Decimal("10000000")


class PlayerLockRequest(StrictModel):
    reason: str = Field(min_length=1, max_length=200)


class PlayerGrantRequest(StrictModel):
    resource_code: str = Field(min_length=1, max_length=40)
    amount: Decimal = Field(gt=0, le=MAX_GRANT, max_digits=24, decimal_places=4)
    reason: str = Field(min_length=1, max_length=200)


class AnnouncementRequest(StrictModel):
    title: str = Field(min_length=1, max_length=120)
    body: str = Field(default="", max_length=2000)
    severity: str = Field(default="info", pattern="^(info|caution|degraded|critical)$")
    hours: int | None = Field(default=None, ge=1, le=720)

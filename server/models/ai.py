"""Request models for the AI economy (06 §9, 07 §3.5)."""

from __future__ import annotations

from decimal import Decimal

from pydantic import Field

from .auth import StrictModel


class AiTickRequest(StrictModel):
    limit: int | None = Field(default=None, ge=1, le=500)
    bootstrap: int | None = Field(default=None, ge=0, le=48)
    capital: Decimal = Field(default=Decimal("5000"), gt=0, max_digits=24, decimal_places=4)


class RuntimePauseRequest(StrictModel):
    paused: bool

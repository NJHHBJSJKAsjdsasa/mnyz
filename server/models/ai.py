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


class ProviderUpdateRequest(StrictModel):
    status: str | None = Field(default=None, pattern="^(disabled|shadow|canary|live)$")
    model: str | None = Field(default=None, max_length=64)
    endpoint: str | None = Field(default=None, max_length=255)
    timeout_ms: int | None = Field(default=None, ge=50, le=10000)
    max_actions: int | None = Field(default=None, ge=1, le=20)
    allowlist: list[str] | None = Field(default=None, max_length=200)

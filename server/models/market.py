"""Request models for market / exchange / market-maker endpoints (03 §4, 05 §9)."""

from __future__ import annotations

from decimal import Decimal

from pydantic import Field

from .auth import StrictModel


class ExchangeCreateRequest(StrictModel):
    code: str = Field(min_length=3, max_length=8, pattern=r"^[A-Za-z0-9]{3,8}$")
    name: str = Field(min_length=1, max_length=80)
    fee_bps: int = Field(default=10, ge=0, le=100)
    listing_fee: Decimal = Field(default=Decimal(0), ge=0, max_digits=24, decimal_places=4)
    # None = unlimited. Enforced on listing creation, not on this call.
    max_listings: int | None = Field(default=None, ge=1, le=100_000)


class MmProgramRequest(StrictModel):
    quantity: int = Field(gt=0, le=1_000_000_000)


class QuoteRequest(StrictModel):
    quantity: int | None = Field(default=None, gt=0, le=1_000_000_000)
    refresh: bool = True


class SplitRequest(StrictModel):
    ratio: Decimal = Field(gt=0, max_digits=12, decimal_places=4)


class ArchiveCandlesRequest(StrictModel):
    days: int = Field(default=30, ge=1, le=3650)


class ArchivePartitionsRequest(StrictModel):
    months_ahead: int = Field(default=3, ge=0, le=60)
    months_back: int = Field(default=24, ge=0, le=240)


class ArchiveColdRequest(StrictModel):
    keep_months: int = Field(default=6, ge=0, le=240)


class ArchiveRestoreRequest(StrictModel):
    partition: str = Field(min_length=1, max_length=128)


class HaltRequest(StrictModel):
    minutes: int = Field(default=60, ge=1, le=60 * 24 * 30)
    reason: str = Field(default="", max_length=200)

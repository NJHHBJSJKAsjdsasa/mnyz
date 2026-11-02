"""Brokerage request models (05 §9)."""

from __future__ import annotations

from decimal import Decimal

from pydantic import Field

from .auth import StrictModel


class FirmRequest(StrictModel):
    capital: Decimal = Field(default=Decimal(0), ge=0, max_digits=24, decimal_places=4)


class MembershipRequest(StrictModel):
    exchange_code: str = Field(min_length=2, max_length=8)
    commission_bps: int = Field(default=5, ge=0, le=100)


class BrokerAccountRequest(StrictModel):
    broker_code: str = Field(min_length=2, max_length=64)   # actor code or actor id
    commission_bps: int | None = Field(default=None, ge=0, le=100)


class VenueRequest(StrictModel):
    exchange_code: str = Field(min_length=2, max_length=8)
    fee_bps: int | None = Field(default=None, ge=0, le=100)

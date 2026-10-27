"""Request models for companies and property."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import Field

from .auth import StrictModel


class CompanyRequest(StrictModel):
    ticker: str = Field(min_length=3, max_length=8)
    name: str = Field(min_length=2, max_length=64)
    shares_total: int = Field(default=1_000_000, ge=1_000, le=10_000_000_000)
    jurisdiction_sector: str = Field(default="core", max_length=32)


class ShareTransferRequest(StrictModel):
    to_actor_id: str = Field(min_length=8, max_length=64)
    shares: int = Field(gt=0)


class FinancialsRequest(StrictModel):
    period: date
    revenue: Decimal = Field(ge=0, max_digits=24, decimal_places=4)
    cost: Decimal = Field(ge=0, max_digits=24, decimal_places=4)
    assets: Decimal = Field(ge=0, max_digits=24, decimal_places=4)
    liabilities: Decimal = Field(ge=0, max_digits=24, decimal_places=4)


class PropertyRegisterRequest(StrictModel):
    asset_key: str = Field(min_length=3, max_length=120)
    kind: str = Field(default="planet", pattern="^(planet|system)$")
    name: str = Field(default="", max_length=64)
    jurisdiction_sector: str = Field(default="core", max_length=32)
    owner_actor_id: str | None = None
    base_by_type: Decimal = Field(gt=0, max_digits=24, decimal_places=4)
    resource_score: Decimal = Field(default=Decimal(0), ge=0, le=100)
    development_level: int = Field(default=0, ge=0, le=100)
    traffic_index: Decimal = Field(default=Decimal(0), ge=0, le=100)


class PropertyListRequest(StrictModel):
    price: Decimal = Field(gt=0, max_digits=24, decimal_places=4)
    kind: str = Field(default="fixed", pattern="^(fixed|auction)$")
    days: int = Field(default=30, ge=1, le=90)
    min_increment: Decimal = Field(default=Decimal(0), ge=0, max_digits=24, decimal_places=4)


class PropertyBidRequest(StrictModel):
    amount: Decimal = Field(gt=0, max_digits=24, decimal_places=4)

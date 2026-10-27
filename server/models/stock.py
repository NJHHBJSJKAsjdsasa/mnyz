"""Request models for the stock market (05 §8)."""

from __future__ import annotations

from decimal import Decimal

from pydantic import Field

from .auth import StrictModel


class StockOrderRequest(StrictModel):
    side: str = Field(pattern="^(buy|sell)$")
    type: str = Field(default="limit", pattern="^(limit|market)$")
    price: Decimal | None = Field(default=None, gt=0, max_digits=24, decimal_places=4)
    quantity: int = Field(gt=0, le=1_000_000_000)


class IpoRequest(StrictModel):
    ticker: str = Field(min_length=3, max_length=8)
    offer_shares: int = Field(gt=0, le=10_000_000_000)
    price: Decimal = Field(gt=0, max_digits=24, decimal_places=4)
    settlement_mode: str = Field(default="t0", pattern="^(t0|t1)$")
    shortable: bool = True


class ShortRequest(StrictModel):
    quantity: int = Field(gt=0, le=1_000_000_000)


class CoverRequest(StrictModel):
    quantity: int | None = Field(default=None, gt=0, le=1_000_000_000)


class LendRequest(StrictModel):
    quantity: int = Field(gt=0, le=1_000_000_000)
    fee_bps: int = Field(default=300, ge=100, le=1000)
    days: int = Field(default=30, ge=1, le=365)


class MarginDepositRequest(StrictModel):
    amount: Decimal = Field(gt=0, max_digits=24, decimal_places=4)


class DividendRequest(StrictModel):
    per_share: Decimal = Field(gt=0, max_digits=24, decimal_places=4)

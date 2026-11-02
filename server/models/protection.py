"""Request models for investor-protection claims (T-23)."""

from __future__ import annotations

from decimal import Decimal

from pydantic import Field

from .auth import StrictModel


class ClaimRequest(StrictModel):
    kind: str = Field(pattern="^(firm_default|settlement_failure|fraud)$")
    amount: Decimal = Field(gt=0, max_digits=24, decimal_places=4)
    reason: str = Field(min_length=2, max_length=500)
    currency_code: str = Field(default="cc4", max_length=8)
    ref_type: str | None = Field(default=None, max_length=40)
    ref_id: str | None = Field(default=None, max_length=80)


class ClaimDecisionRequest(StrictModel):
    approve: bool
    note: str = Field(default="", max_length=500)

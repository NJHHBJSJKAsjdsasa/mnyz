"""Revenue split request models."""

from __future__ import annotations

from decimal import Decimal

from pydantic import Field

from .auth import StrictModel


class SplitRequest(StrictModel):
    kind: str | None = Field(default=None, max_length=32)
    amount: Decimal | None = Field(default=None, gt=0, max_digits=24, decimal_places=4)

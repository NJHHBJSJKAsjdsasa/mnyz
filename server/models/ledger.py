"""Request model for a ledger reversal (T-32)."""

from __future__ import annotations

from pydantic import Field

from .auth import StrictModel


class ReverseRequest(StrictModel):
    reason: str = Field(min_length=1, max_length=500)

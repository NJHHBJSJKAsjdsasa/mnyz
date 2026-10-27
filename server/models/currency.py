"""Request models for the currency and bank endpoints."""

from __future__ import annotations

from decimal import Decimal

from pydantic import Field, model_validator

from .auth import StrictModel

CURRENCY_PATTERN = r"^cc[1-9]$"


class TransferRequest(StrictModel):
    to_actor_id: str | None = None
    to_player_id: str | None = None
    currency_code: str = Field(pattern=CURRENCY_PATTERN)
    amount: Decimal = Field(gt=0, max_digits=24, decimal_places=4)
    memo: str = Field(default="", max_length=200)

    @model_validator(mode="after")
    def _exactly_one_target(self) -> "TransferRequest":
        targets = [value for value in (self.to_actor_id, self.to_player_id) if value]
        if len(targets) != 1:
            raise ValueError("to_actor_id 与 to_player_id 必须且只能提供一个")
        return self


class ExchangeRequest(StrictModel):
    from_code: str = Field(pattern=CURRENCY_PATTERN)
    to_code: str = Field(pattern=CURRENCY_PATTERN)
    amount: Decimal = Field(gt=0, max_digits=24, decimal_places=4)
    direction: str = Field(default="up", pattern="^(up|down)$")


class BankAmountRequest(StrictModel):
    currency_code: str = Field(default="cc1", pattern=CURRENCY_PATTERN)
    amount: Decimal = Field(gt=0, max_digits=24, decimal_places=4)


class LoanRequest(StrictModel):
    currency_code: str = Field(default="cc1", pattern=CURRENCY_PATTERN)
    amount: Decimal = Field(gt=0, max_digits=24, decimal_places=4)
    term_days: int = Field(default=90, ge=30, le=180)


class RepayRequest(StrictModel):
    amount: Decimal = Field(gt=0, max_digits=24, decimal_places=4)


class CertificateRequest(StrictModel):
    currency_code: str = Field(default="cc1", pattern=CURRENCY_PATTERN)
    amount: Decimal = Field(gt=0, max_digits=24, decimal_places=4)
    term_days: int = Field(default=90)


class CertificateQuoteRequest(StrictModel):
    ask_yield_bps: int = Field(ge=0, le=5000)


class InterbankOrderRequest(StrictModel):
    currency_code: str = Field(default="cc1", pattern=CURRENCY_PATTERN)
    amount: Decimal = Field(gt=0, max_digits=24, decimal_places=4)
    rate_bps: int = Field(ge=0, le=2000)
    term_days: int = Field(default=7)


class InsuranceClaimRequest(StrictModel):
    bank_id: str = Field(min_length=8, max_length=64)
    currency_code: str = Field(default="cc1", pattern=CURRENCY_PATTERN)
    amount: Decimal = Field(gt=0, max_digits=24, decimal_places=4)


class BribeRequest(StrictModel):
    officer_actor_id: str = Field(min_length=8, max_length=64)
    currency_code: str = Field(default="cc1", pattern=CURRENCY_PATTERN)
    amount: Decimal = Field(gt=0, max_digits=24, decimal_places=4)
    base_fee_q1: Decimal = Field(gt=0, max_digits=24, decimal_places=4)

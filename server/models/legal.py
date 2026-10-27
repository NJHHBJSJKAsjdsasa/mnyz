"""Request models for company law, the commercial court and insolvency (08 §9)."""

from __future__ import annotations

from decimal import Decimal

from pydantic import Field

from .auth import StrictModel


class CharterRequest(StrictModel):
    document: dict


class MeetingRequest(StrictModel):
    kind: str = Field(default="extraordinary", pattern="^(annual|extraordinary)$")


class ResolutionRequest(StrictModel):
    kind: str = Field(
        pattern="^(charter_amendment|officer_appointment|dividend|buyback|issuance|"
                "related_party|dissolution|other)$"
    )
    payload: dict = Field(default_factory=dict)


class VoteRequest(StrictModel):
    choice: str = Field(pattern="^(yes|no|abstain)$")


class RelatedPartyRequest(StrictModel):
    counterparty_actor_id: str = Field(min_length=8, max_length=64)
    kind: str = Field(min_length=2, max_length=48)
    amount: Decimal = Field(gt=0, max_digits=24, decimal_places=4)


class RelatedPartyDecisionRequest(StrictModel):
    approve: bool


class CourtCaseRequest(StrictModel):
    kind: str = Field(pattern="^(contract|tort|corporate|insolvency|takeover|regulatory)$")
    defendant_actor_id: str = Field(min_length=8, max_length=64)
    amount: Decimal = Field(default=Decimal(0), ge=0, max_digits=24, decimal_places=4)
    claim: str = Field(default="", max_length=2000)
    currency_code: str = Field(default="cc1", max_length=4)
    sector: str = Field(default="core", max_length=32)
    company_ticker: str | None = Field(default=None, max_length=8)


class EvidenceRequest(StrictModel):
    summary: str = Field(min_length=1, max_length=1000)
    payload: dict = Field(default_factory=dict)


class FreezeRequest(StrictModel):
    asset_kind: str = Field(pattern="^(currency|stock|property|company)$")
    asset_id: str = Field(min_length=1, max_length=120)


class InsolvencyRequest(StrictModel):
    ticker: str = Field(min_length=3, max_length=8)
    kind: str = Field(default="liquidation", pattern="^(reorganization|liquidation)$")
    reason: str = Field(default="", max_length=1000)


class ClaimRequest(StrictModel):
    kind: str = Field(pattern="^(secured|priority|unsecured|equity|fine)$")
    amount: Decimal = Field(gt=0, max_digits=24, decimal_places=4)


class PlanRequest(StrictModel):
    document: dict


class PlanVoteRequest(StrictModel):
    plan_id: str = Field(min_length=8, max_length=64)
    claim_class: str = Field(pattern="^(secured|priority|unsecured|equity)$")
    choice: str = Field(pattern="^(yes|no)$")


class RecognitionRequest(StrictModel):
    region: str = Field(min_length=2, max_length=32)


class RecognitionDecisionRequest(StrictModel):
    recognize: bool
    reason_code: str | None = Field(default=None, max_length=32)
    reason: str = Field(default="", max_length=500)


class EnforceRequest(StrictModel):
    region: str = Field(default="", max_length=32)

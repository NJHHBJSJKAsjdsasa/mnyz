"""Request models for the exploration domain."""

from __future__ import annotations

from pydantic import Field, field_validator

from .auth import StrictModel

MAX_COORDINATE = 10_000_000


class CollectRequest(StrictModel):
    coordinates: str = Field(min_length=5, max_length=48)
    planet_type: str | None = Field(default=None, max_length=64)

    @field_validator("coordinates")
    @classmethod
    def _check_coordinates(cls, value: str) -> str:
        parts = value.split(",")
        if len(parts) != 3:
            raise ValueError("coordinates must be x,y,z")
        for part in parts:
            try:
                number = float(part)
            except ValueError as exc:
                raise ValueError("coordinates must be numeric") from exc
            if not 0 <= number <= MAX_COORDINATE:
                raise ValueError("coordinates out of range")
        return ",".join(part.strip() for part in parts)


class ScanRequest(StrictModel):
    coordinates: str = Field(min_length=5, max_length=48)


class SurfaceSampleRequest(StrictModel):
    cell: int = Field(ge=0, lt=64)


class MarketOrderRequest(StrictModel):
    resource_code: str = Field(min_length=1, max_length=40)
    quantity: int = Field(ge=1, le=9999)


class PlanetRefRequest(StrictModel):
    planet_key: str = Field(min_length=8, max_length=200)


class NameRequest(StrictModel):
    name: str = Field(min_length=1, max_length=48)


class TaskRequest(StrictModel):
    task: str = Field(min_length=3, max_length=12)


class CodeRequest(StrictModel):
    code: str = Field(min_length=1, max_length=64)


class AllianceJoinRequest(StrictModel):
    alliance_id: str = Field(min_length=36, max_length=36)


class InviteCodeRequest(StrictModel):
    code: str = Field(min_length=4, max_length=24)


class ActionRequest(StrictModel):
    action: str = Field(min_length=3, max_length=12)


class LocalSaveRequest(StrictModel):
    keys: dict[str, str]
    sha256: str | None = None


class RefitRequest(StrictModel):
    use_voucher: bool = False


class ResidentTradeRequest(StrictModel):
    planet_key: str = Field(min_length=8, max_length=200)


class CouncilSectorRequest(StrictModel):
    sector_key: str = Field(min_length=5, max_length=5)


class CouncilVoteRequest(StrictModel):
    vote: str = Field(pattern="^(yes|no)$")

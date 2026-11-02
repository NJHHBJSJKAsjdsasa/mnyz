"""Request models for server-authoritative navigation (11 §4.1)."""

from __future__ import annotations

from pydantic import Field

from .auth import StrictModel

MAX_COORDINATE = 10_000_000


class Point(StrictModel):
    x: int = Field(ge=0, le=MAX_COORDINATE)
    y: int = Field(ge=0, le=MAX_COORDINATE)
    z: int = Field(ge=0, le=MAX_COORDINATE)


class TravelQuoteRequest(StrictModel):
    kind: str = Field(pattern="^(galaxy|system|planet)$")
    origin: Point
    target: Point


class TravelCommitRequest(StrictModel):
    quote_id: str = Field(min_length=36, max_length=36)

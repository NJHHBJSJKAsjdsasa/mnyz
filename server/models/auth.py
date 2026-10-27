"""Request models for authentication endpoints."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="ignore")


class RegisterRequest(StrictModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=10, max_length=128)
    universe_seed_name: str = Field(default="atlas-main", max_length=64)
    display_name: str = Field(default="舰长", max_length=24)
    device_id: str | None = Field(default=None, max_length=64)


class LoginRequest(StrictModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)
    universe_seed_name: str = Field(default="atlas-main", max_length=64)


class SessionRequest(StrictModel):
    universe_seed_name: str = Field(min_length=1, max_length=64)
    device_id: str = Field(min_length=1, max_length=64)
    display_name: str = Field(default="舰长", max_length=24)


class LogoutAllRequest(StrictModel):
    pass

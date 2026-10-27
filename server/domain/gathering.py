"""Collect reward formula (docs/server/09 §2) as a pure function.

Inputs are already-resolved facts; no DB access here. That keeps the parity
fixtures trivial and lets the same numbers be reproduced by ``tools/parity``.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from .rng import coordinate_variation, stream
from .ship import stats, warp_coil_multiplier

BASE_PLANET = {"antimatter": 18.0, "element115": 22.0, "deuterium": 27.0}
DIMINISH_AFTER = 3
DIMINISH_STEP = 0.15
DIMINISH_FLOOR = 0.4


@dataclass(frozen=True)
class CollectContext:
    planet_key: str
    coordinates: str
    game_day: str
    ship_level: int
    module_level: int = 0
    module_overclock: int = 0
    hull: int = 100
    sector_licensed: bool = False
    event_multiplier: float = 1.0
    tech_mining_level: int = 0
    ally_size: int = 0
    rival_marked: bool = False
    base_resources: dict[str, float] | None = None


@dataclass(frozen=True)
class CollectResult:
    gains: dict[str, int]
    factors: dict[str, float] = field(default_factory=dict)
    diminishing: float = 1.0

    @property
    def total(self) -> int:
        return sum(self.gains.values())


def diminishing(count: int) -> float:
    """First three collections are full, then −15% each, floored at 0.4."""
    if count <= DIMINISH_AFTER:
        return 1.0
    return max(DIMINISH_FLOOR, 1 - (count - DIMINISH_AFTER) * DIMINISH_STEP)


def base_yield(coordinates: str) -> dict[str, float]:
    variation = coordinate_variation(coordinates)
    return {code: value * variation for code, value in BASE_PLANET.items()}


def multiplier_product(ctx: CollectContext, count: int) -> tuple[dict[str, float], float]:
    dim = diminishing(count)
    factors = {
        "diminishing": dim,
        "random": 0.9 + stream(ctx.planet_key, ctx.game_day, "collect").next() * 0.2,
        "ship": float(stats(ctx.ship_level)["multiplier"]),
        "module": warp_coil_multiplier(ctx.module_level, ctx.module_overclock),
        "hull": 0.5 + 0.5 * max(0, min(100, ctx.hull)) / 100,
        "sector": 1.2 if ctx.sector_licensed else 1.0,
        "event": max(0.0, ctx.event_multiplier),
        "rival": 0.85 if ctx.rival_marked else 1.0,
        "ally": 1 + min(0.10, 0.02 * ctx.ally_size),
        "tech": 1 + 0.04 * ctx.tech_mining_level,
    }
    product = 1.0
    for value in factors.values():
        product *= value
    return factors, product


def compute(ctx: CollectContext, count: int, storage_cap: int | None = None) -> CollectResult:
    """Reward for one collection; ``count`` is the number of prior collections."""
    base = _base_values(ctx)
    factors, product = multiplier_product(ctx, count)
    cap = math.floor((storage_cap or stats(ctx.ship_level)["storage"]) * 0.25)
    gains: dict[str, int] = {}
    for code, value in base.items():
        amount = math.floor(value * product)
        if value >= 1 and amount < 1:
            amount = 1
        gains[code] = max(0, min(amount, cap))
    return CollectResult(gains=gains, factors=factors, diminishing=factors["diminishing"])


def _base_values(ctx: CollectContext) -> dict[str, float]:
    """Authoritative element yield when present; coordinate fallback otherwise."""
    if ctx.base_resources:
        return {code: float(ctx.base_resources.get(code, 0)) for code in BASE_PLANET}
    return base_yield(ctx.coordinates)

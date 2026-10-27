"""Surface survey: 8×8 deterministic richness grid, three samples per day.

The client renders the grid and submits a cell index; the server recomputes the
value and the yield, so a modified client cannot pick a better cell than the
one it displayed (docs/server/09, M3).
"""

from __future__ import annotations

import math

from .rng import hash_text

GRID_SIZE = 8
GRID_CELLS = GRID_SIZE * GRID_SIZE
DAILY_SAMPLES = 3


def cell_value(planet_key: str, index: int) -> float:
    if not 0 <= index < GRID_CELLS:
        raise ValueError("cell index out of range")
    return (hash_text(f"surface|{planet_key.lower()}|{index}") % 1000) / 1000


def grid(planet_key: str) -> list[float]:
    return [cell_value(planet_key, index) for index in range(GRID_CELLS)]


def sample_yield(planet_key: str, index: int) -> dict[str, int]:
    value = cell_value(planet_key, index)
    yields = {
        "antimatter": _round(10 + value * 60),
        "deuterium": _round(2 + value * 6),
    }
    if value > 0.9:
        yields["exoticCrystal"] = 1 + _round((value - 0.9) * 10)
    return yields


def _round(value: float) -> int:
    return int(math.floor(value + 0.5))

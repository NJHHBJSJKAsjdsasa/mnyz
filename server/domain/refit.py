"""Refit / overclock costs from reference data (docs/server/09 §6)."""

from __future__ import annotations

import math

MAX_MODULE_LEVEL = 999
MAX_OVERCLOCK = 3
OVERCLOCK_MIN_LEVEL = 10


def refit_cost(cost_curve: dict, target_level: int) -> dict[str, int]:
    base = cost_curve.get("base", {})
    growth = float(cost_curve.get("growth", 1.35))
    scale = float(cost_curve.get("scale", 3.5))
    return {
        code: max(1, _round(float(amount) * math.pow(growth, target_level - 1) * scale))
        for code, amount in base.items()
    }


def overclock_cost(cost_curve: dict, next_level: int, overclock: int) -> dict[str, int]:
    base = refit_cost(cost_curve, next_level)
    factor = math.pow(2, min(MAX_OVERCLOCK, overclock) + 1)
    return {code: max(1, _round(amount * factor)) for code, amount in base.items()}


def repair_cost(missing_hull: int) -> dict[str, int]:
    missing = max(0, int(missing_hull))
    if missing == 0:
        return {}
    return {"antimatter": 4 * missing, "quantumAlloy": math.ceil(missing / 8)}


def _round(value: float) -> int:
    return int(math.floor(value + 0.5))

"""Ship stats derived from level — never stored twice (docs/server/04 §3.1).

The curves mirror ``UnifiedSpaceshipStorage.upgradeShip`` so the client and
server agree at every level; the 999 level values are the parity fixture.
"""

from __future__ import annotations

import math

MAX_LEVEL = 999


def stats(level: int) -> dict[str, float]:
    level = max(1, min(MAX_LEVEL, int(level)))
    efficiency = 1 + (level - 1) * 0.2 if level <= 16 else 4.0 + (level - 16) * 0.02
    ranges = 500 + (level - 1) * 200 if level <= 25 else 5300 + (level - 25) * 12
    storage = 1000 + (level - 1) * 400 if level <= 20 else 8600 + (level - 20) * 45
    multiplier = 1.0 + (level - 1) * 0.242 if level <= 100 else 24.958 + (level - 100) * 0.02
    return {
        "level": level,
        "efficiency": round(efficiency, 4),
        "range": math.floor(ranges),
        "storage": math.floor(storage),
        "multiplier": round(multiplier, 4),
    }


def storage_cap(level: int) -> int:
    return int(stats(level)["storage"])


def warp_coil_multiplier(level: int, overclock: int = 0) -> float:
    """``1 + sqrt(8 × lv) × ocFactor / 100`` (docs/server/09 §2.3 row 4)."""
    if level <= 0:
        return 1.0
    factor = 1 + 0.05 * max(0, min(3, overclock))
    return 1 + (round(8 * math.sqrt(level)) * factor) / 100


def upgrade_cost(level: int) -> dict[str, int]:
    """Cost to go from ``level`` to ``level + 1`` (frontend parity)."""
    current = level
    storage = 1000 + (current - 1) * 400 if current <= 20 else 1000 + 20 * 400 + int(
        math.log(current - 20 + 1) * 1200
    )
    base = int((storage * 0.4) // 1.3)
    scaling = 1 + (current - 1) * 0.01 if current <= 100 else 2 * math.pow(1.03, current - 100)
    scaled = int(base * scaling)
    return {
        "antimatter": scaled,
        "element115": int(scaled * 0.95),
        "deuterium": int(scaled * 0.9),
    }

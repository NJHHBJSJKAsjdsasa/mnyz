"""Orbital scan: deterministic outcome + sector scaling (docs/server/09 §3)."""

from __future__ import annotations

import math
from dataclasses import dataclass

from .rng import SeededRandom, hash_text

SCAN_BASE_COOLDOWN_SECONDS = 480
SCAN_MIN_COOLDOWN_SECONDS = 30
SCAN_BASE_COST = 6
SCAN_MIN_COST = 2

RELIC_CHANCE = 0.06
RICH_CHANCE = 0.30
NORMAL_CHANCE = 0.75

RICH_POOL = ["quantumAlloy", "plasmaCell", "neuralCircuit", "exoticCrystal", "nebulaDust"]
NORMAL_POOL = RICH_POOL + ["blackHoleFragment"]

TITLES = {
    "relic": ("远古遗迹", "扫描到非自然构造，提取出前文明遗留物。"),
    "rich": ("稀有矿脉", "发现高浓度矿层，货舱已装载样本。"),
    "normal": ("常规矿脉", "地表读数平稳，回收到少量可用资源。"),
    "barren": ("无异常", "地表结构均匀，仅消耗了探测燃料。"),
}


@dataclass(frozen=True)
class ScanOutcome:
    kind: str
    title: str
    detail: str
    yields: dict[str, int]


def roll_scan(planet_key: str, planet_type: str, scans: int, sector_factor: float = 1.0) -> ScanOutcome:
    """Pure outcome; ``scans`` is the 1-based count including this scan."""
    rng = SeededRandom(hash_text(f"{planet_key.lower()}|{planet_type}|{scans}|scan"))
    roll = rng.next()
    if roll < RELIC_CHANCE:
        kind = "relic"
        yields = {"ancientRelic": 1, "exoticCrystal": 2 + int(rng.next() * 4)}
    elif roll < RICH_CHANCE:
        kind = "rich"
        yields = _pick(rng, RICH_POOL, 2 + int(rng.next() * 2), 1.6, 2.2)
    elif roll < NORMAL_CHANCE:
        kind = "normal"
        yields = _pick(rng, NORMAL_POOL, 1 + int(rng.next() * 2), 0.8, 1.4)
    else:
        kind = "barren"
        yields = {}

    if sector_factor > 1 and yields:
        yields = {code: max(1, _round(value * sector_factor)) for code, value in yields.items()}
    title, detail = TITLES[kind]
    return ScanOutcome(kind=kind, title=title, detail=detail, yields=yields)


def _pick(rng: SeededRandom, pool: list[str], count: int, low: float, high: float) -> dict[str, int]:
    available = list(pool)
    result: dict[str, int] = {}
    for _ in range(min(count, len(available))):
        code = available.pop(int(rng.next() * len(available)))
        base = 1 + rng.next() * 3
        result[code] = max(1, _round(base * (low + rng.next() * (high - low))))
    return result


def scan_cooldown_seconds(
    scan_level: int,
    overclock: int,
    survey_level: int,
    base_seconds: int = SCAN_BASE_COOLDOWN_SECONDS,
    floor_seconds: int = SCAN_MIN_COOLDOWN_SECONDS,
) -> int:
    oc = 1 + 0.05 * max(0, min(3, overclock))
    reduction = min(90, _round(9 * math.sqrt(max(0, scan_level)) * oc)) / 100 if scan_level > 0 else 0
    survey = 1 - min(0.20, 0.03 * max(0, survey_level))
    milliseconds = base_seconds * 1000 * (1 - reduction) * survey
    return max(floor_seconds, _round(milliseconds / 1000))


def scan_cost(scan_level: int) -> int:
    return max(SCAN_MIN_COST, SCAN_BASE_COST - max(0, scan_level))


def _round(value: float) -> int:
    """Math.round parity (half away from zero), not Python's banker's rounding."""
    return int(math.floor(value + 0.5)) if value >= 0 else -int(math.floor(-value + 0.5))

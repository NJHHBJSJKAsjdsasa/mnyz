"""Deterministic randomness shared with the client (docs/server/09 §1).

FNV-1a 32-bit for hashing and the 16807 LCG for streams: both are integer-only
so JavaScript and Python produce bit-identical sequences.
"""

from __future__ import annotations

FNV_OFFSET = 2166136261
FNV_PRIME = 16777619
LCG_MOD = 2147483647
LCG_MULT = 16807


def fnv1a(text: str) -> int:
    value = FNV_OFFSET
    for char in text:
        value ^= ord(char)
        value = (value * FNV_PRIME) & 0xFFFFFFFF
    return value & 0xFFFFFFFF


def hash_text(text: str) -> int:
    """Same as ``PlanetScanSystem.hashText``: positive 31-bit seed."""
    return abs(_signed(fnv1a(text))) % LCG_MOD


def _signed(value: int) -> int:
    return value - 0x1_0000_0000 if value & 0x8000_0000 else value


def coordinate_variation(coordinates: str) -> float:
    """0.5 .. 2.0 from a coordinate string (docs/server/09 §2.1 fallback)."""
    digest = fnv1a(coordinates or "")
    return 0.5 + (digest / 0xFFFFFFFF) * 1.5


class SeededRandom:
    """LCG 16807; ``next()`` is in (0, 1) when the seed is non-zero."""

    def __init__(self, seed: int) -> None:
        self.state = seed % LCG_MOD or 1

    def next(self) -> float:
        self.state = (self.state * LCG_MULT) % LCG_MOD
        return (self.state - 1) / (LCG_MOD - 1)

    def randint(self, low: int, high: int) -> int:
        return low + int(self.next() * (high - low + 1))


def stream(*parts: object) -> SeededRandom:
    return SeededRandom(hash_text("|".join(str(part) for part in parts)))

"""Rival captain marks: the same planet loses 15% yield while staked."""

from __future__ import annotations

from .rng import hash_text

MARK_RATE = 12


def is_marked(planet_key: str, universe_seed: int, week: str) -> bool:
    seed = hash_text(f"rival-mark|{universe_seed}|{week}|{planet_key}")
    return seed % 100 < MARK_RATE

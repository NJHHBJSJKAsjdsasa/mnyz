"""Market quote generation and player-side price modifiers (docs/server/09 §4).

Quotes are global per planet/day; player discounts (cargoBay) and sell bonuses
(trade tech) are applied at read/transaction time so the displayed price is the
charged price for that player without making the market player-specific.
"""

from __future__ import annotations

import math

from .rng import SeededRandom, hash_text

GOODS = [
    ("quantumAlloy", 6),
    ("plasmaCell", 8),
    ("neuralCircuit", 10),
    ("exoticCrystal", 18),
    ("nebulaDust", 14),
    ("blackHoleFragment", 40),
    ("ancientRelic", 30),
    ("alienArtifact", 34),
    ("dimensionalShard", 50),
]
GOODS_BY_CODE = dict(GOODS)
SELL_RATIO = 0.45
QUOTES_PER_DAY = 3


def generate_quotes(planet_key: str, game_day) -> list[dict]:
    rng = SeededRandom(hash_text(f"{planet_key.lower()}|{game_day}|market"))
    pool = list(GOODS)
    quotes: list[dict] = []
    for _ in range(QUOTES_PER_DAY):
        code, base = pool.pop(int(rng.next() * len(pool)))
        buy = max(2, _round(base * (0.65 + rng.next() * 0.7)))
        sell = max(1, _round(base * SELL_RATIO))
        stock = max(1, _round(4 + hash_text(f"{planet_key.lower()}:{code}") % 13))
        quotes.append(
            {"resource_code": code, "buy_price": buy, "sell_price": sell, "stock": stock}
        )
    return quotes


def buy_multiplier(cargo_level: int) -> float:
    if cargo_level <= 0:
        return 1.0
    return 1 - min(0.60, _round(5 * math.sqrt(cargo_level)) / 100)


def sell_multiplier(trade_level: int) -> float:
    return 1 + 0.03 * max(0, trade_level)


def adjusted_buy(base_price: int, cargo_level: int) -> int:
    return max(2, _round(base_price * buy_multiplier(cargo_level)))


def adjusted_sell(base_price: int, trade_level: int) -> int:
    return max(1, _round(base_price * sell_multiplier(trade_level)))


def _round(value: float) -> int:
    return int(math.floor(value + 0.5))

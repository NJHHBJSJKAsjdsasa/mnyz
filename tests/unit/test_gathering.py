"""Collect formula: diminishing table, caps, determinism, ordering."""

from __future__ import annotations

from dataclasses import replace

from server.domain.gathering import (
    CollectContext,
    base_yield,
    compute,
    diminishing,
)

BASE_CTX = CollectContext(
    planet_key="planet_1,2,3_0_x",
    coordinates="1,2,3",
    game_day="2026-10-25",
    ship_level=1,
    module_level=0,
    module_overclock=0,
    hull=100,
    sector_licensed=False,
    event_multiplier=1.0,
    tech_mining_level=0,
    ally_size=0,
    rival_marked=False,
)


def test_diminishing_table():
    assert [diminishing(n) for n in (1, 2, 3, 4, 5, 9, 12, 30)] == [
        1.0,
        1.0,
        1.0,
        0.85,
        0.7,
        0.4,
        0.4,
        0.4,
    ]


def test_base_yield_is_deterministic():
    assert base_yield("1,2,3") == base_yield("1,2,3")
    assert base_yield("1,2,3") != base_yield("4,5,6")


def test_result_is_repeatable():
    first = compute(BASE_CTX, 0)
    second = compute(BASE_CTX, 0)
    assert first.gains == second.gains
    assert first.factors == second.factors


def test_storage_cap_limits_single_resource():
    result = compute(BASE_CTX, 0, storage_cap=40)
    assert all(amount <= 10 for amount in result.gains.values())


def test_minimum_one_when_base_positive():
    damaged = replace(BASE_CTX, hull=0)
    result = compute(damaged, 30)
    assert all(amount >= 1 for amount in result.gains.values())


def test_rival_mark_reduces_yield():
    normal = compute(BASE_CTX, 0)
    marked = compute(replace(BASE_CTX, rival_marked=True), 0)
    for code, amount in marked.gains.items():
        assert amount <= normal.gains[code]
    assert marked.factors["rival"] == 0.85


def test_sector_and_tech_increase_yield():
    boosted = compute(replace(BASE_CTX, sector_licensed=True, tech_mining_level=4), 0)
    normal = compute(BASE_CTX, 0)
    assert boosted.factors["sector"] == 1.2
    assert boosted.factors["tech"] == 1.16
    assert sum(boosted.gains.values()) > sum(normal.gains.values())

"""Scan/surface formulas: determinism, thresholds and boundary values."""

from __future__ import annotations

import pytest

from server.domain.scan import roll_scan, scan_cost, scan_cooldown_seconds
from server.domain.surface import DAILY_SAMPLES, cell_value, grid, sample_yield


def test_scan_is_deterministic():
    first = roll_scan("planet_1,2,3_0_test", "Rocky", 1)
    second = roll_scan("planet_1,2,3_0_test", "Rocky", 1)
    assert first == second


def test_scan_changes_with_count_and_type():
    a = roll_scan("planet_1,2,3_0_test", "Rocky", 1)
    b = roll_scan("planet_1,2,3_0_test", "Rocky", 2)
    c = roll_scan("planet_1,2,3_0_test", "Gas Giant", 1)
    assert (a.kind, a.yields) != (b.kind, b.yields) or (a.kind, a.yields) != (c.kind, c.yields)


def test_scan_kinds_are_valid():
    for scans in range(1, 40):
        outcome = roll_scan("planet_9,9,9_1_x", "Oceanic", scans)
        assert outcome.kind in {"relic", "rich", "normal", "barren"}
        assert outcome.title
        if outcome.kind == "barren":
            assert outcome.yields == {}
        else:
            assert outcome.yields
            assert all(amount >= 1 for amount in outcome.yields.values())


def test_relic_always_has_ancient_relic():
    for scans in range(1, 200):
        outcome = roll_scan("planet_1,1,1_0_y", "Anomaly", scans)
        if outcome.kind == "relic":
            assert outcome.yields["ancientRelic"] >= 1
            assert "exoticCrystal" in outcome.yields


def test_sector_factor_scales_up():
    outcome = roll_scan("planet_1,2,3_0_test", "Rocky", 1, sector_factor=1.2)
    base = roll_scan("planet_1,2,3_0_test", "Rocky", 1)
    for code, amount in base.yields.items():
        assert outcome.yields[code] >= amount


def test_scan_cooldown_floor_and_cost():
    assert scan_cooldown_seconds(0, 0, 0) == 480
    # sqrtCurve(9, 9) = 27, i.e. -27% at Lv9 (the doc's "≈90" example is wrong).
    assert scan_cooldown_seconds(9, 0, 0) == 350
    assert scan_cooldown_seconds(999, 0, 0) == 48
    assert scan_cooldown_seconds(0, 0, 4) == 422
    assert scan_cooldown_seconds(0, 0, 0, base_seconds=600, floor_seconds=60) == 600
    assert scan_cooldown_seconds(999, 0, 0, base_seconds=600, floor_seconds=60) == 60
    assert scan_cost(0) == 6
    assert scan_cost(5) == 2
    assert scan_cost(50) == 2


def test_surface_grid_is_stable():
    assert grid("planet_1,2,3_0_x") == grid("planet_1,2,3_0_x")
    assert len(grid("planet_1,2,3_0_x")) == 64
    assert all(0 <= value <= 1 for value in grid("planet_1,2,3_0_x"))


def test_surface_yield_monotonic_with_value():
    key = "planet_1,2,3_0_x"
    values = [cell_value(key, index) for index in range(64)]
    hot = max(range(64), key=lambda index: values[index])
    cold = min(range(64), key=lambda index: values[index])
    assert sample_yield(key, hot)["antimatter"] >= sample_yield(key, cold)["antimatter"]


def test_surface_limits():
    assert DAILY_SAMPLES == 3
    with pytest.raises(ValueError):
        cell_value("x", 64)

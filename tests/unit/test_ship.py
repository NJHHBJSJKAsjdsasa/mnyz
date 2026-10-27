"""Ship curve parity with UnifiedSpaceshipStorage.upgradeShip."""

from __future__ import annotations

from server.domain import ship


def test_level_one_baseline():
    stats = ship.stats(1)
    assert stats == {
        "level": 1,
        "efficiency": 1.0,
        "range": 500,
        "storage": 1000,
        "multiplier": 1.0,
    }


def test_breakpoints():
    assert ship.stats(16)["efficiency"] == 4.0
    assert ship.stats(17)["efficiency"] == 4.02
    assert ship.stats(25)["range"] == 5300
    assert ship.stats(26)["range"] == 5312
    assert ship.stats(20)["storage"] == 8600
    assert ship.stats(21)["storage"] == 8645
    assert ship.stats(100)["multiplier"] == 24.958
    assert ship.stats(101)["multiplier"] == 24.978


def test_level_999_values():
    stats = ship.stats(999)
    assert stats["efficiency"] == 23.66
    assert stats["range"] == 16988
    assert stats["storage"] == 52655
    assert stats["multiplier"] == 42.938


def test_level_is_clamped():
    assert ship.stats(0)["level"] == 1
    assert ship.stats(5000)["level"] == 999


def test_warp_coil_and_upgrade_cost():
    assert ship.warp_coil_multiplier(0) == 1.0
    assert ship.warp_coil_multiplier(10) == 1.25
    cost = ship.upgrade_cost(1)
    assert cost["antimatter"] > 0
    assert cost["element115"] < cost["antimatter"]

"""JSON cache filename parsing used by the backfill tool."""

from __future__ import annotations

from server.cache_tools import _parse_galaxy_name, _parse_planet_name, _parse_system_name


def test_galaxy_name():
    assert _parse_galaxy_name("galaxy_1_2_3.json") == {"x": 1, "y": 2, "z": 3}
    assert _parse_galaxy_name("galaxy_bad.json") is None


def test_system_name():
    assert _parse_system_name("system_4_5_6_7.json") == {
        "x": 4,
        "y": 5,
        "z": 6,
        "system_index": 7,
    }


def test_planet_name_with_underscores():
    assert _parse_planet_name("planet_1_2_3_4_alpha_beta.json") == {
        "x": 1,
        "y": 2,
        "z": 3,
        "system_index": 4,
        "planet_name": "alpha_beta",
    }


def test_out_of_range_rejected():
    assert _parse_galaxy_name("galaxy_-1_2_3.json") is None
    assert _parse_galaxy_name("galaxy_1_2_99999999.json") is None

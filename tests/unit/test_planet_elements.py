"""Authoritative planet generator: determinism, shape and resource mapping."""

from __future__ import annotations

import pytest

from pymodules.__planet_elements import (
    PLANET_TYPES,
    element_resources,
    planet_identity,
    seedmaster_for,
)

from server.domain.planet import parse_planet_key
from server.infra.errors import InvalidArgument

SEED = 20261025
COORDS = (1, 2, 3)


def test_legacy_large_system_index_is_accepted():
    # Real legacy keys can carry tens of millions of systems (int4 cache column).
    key = parse_planet_key("planet_4192629,4367295,3370756_73234633_rheagan_iw-2757")
    assert key.system_index == 73234633


def test_out_of_range_system_index_rejected():
    with pytest.raises(InvalidArgument):
        parse_planet_key("planet_1,2,3_2000000001_x")


def test_seedmaster_matches_base64_chain():
    assert seedmaster_for(SEED, 0) == str(SEED)
    assert seedmaster_for(SEED, 1) == "MjAyNjEwMjU="


def test_identity_is_deterministic():
    first = planet_identity(SEED, *COORDS, 0, 0)
    second = planet_identity(SEED, *COORDS, 0, 0)
    assert first == second


def test_identity_shape():
    planet = planet_identity(SEED, *COORDS, 0, 0)
    assert planet["name"]
    assert planet["planet_type"] in PLANET_TYPES
    assert 5 <= len(planet["elements"]) <= 10
    assert planet["resources"] == element_resources(planet["elements"])
    assert set(planet["resources"]) == {"antimatter", "element115", "deuterium"}


def test_different_planets_differ():
    for index in (0, 1, 2):
        left = planet_identity(SEED, *COORDS, 0, index)
        right = planet_identity(SEED, *COORDS, 0, index + 1)
        assert left["name"] != right["name"]
        assert left["element_seed"] != right["element_seed"]


def test_invalid_index_rejected():
    with pytest.raises(ValueError):
        planet_identity(SEED, *COORDS, 0, -1)
    with pytest.raises(ValueError):
        planet_identity(SEED, *COORDS, 0, 10)

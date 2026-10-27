"""Deterministic RNG parity anchors (FNV-1a + LCG 16807)."""

from __future__ import annotations

from server.domain.rng import SeededRandom, coordinate_variation, fnv1a, hash_text, stream


def test_fnv_empty_matches_reference_offset():
    assert fnv1a("") == 2166136261


def test_hash_text_is_positive_31_bit():
    # JS Math.imul yields a signed 32-bit value; abs() of the empty-string hash
    # is 2128831035, which is the parity fixture for PlanetScanSystem.hashText.
    assert hash_text("") == abs(2166136261 - 0x1_0000_0000) % 2147483647
    assert 0 <= hash_text("planet_1,2,3_0_x") < 2147483647


def test_lcg_first_steps():
    rng = SeededRandom(1)
    assert rng.state == 1
    first = rng.next()
    assert abs(first - 16806 / 2147483646) < 1e-12


def test_zero_seed_is_coerced():
    assert SeededRandom(0).state == 1


def test_stream_is_repeatable_and_key_sensitive():
    a = stream("planet", "2026-10-25", "collect").next()
    b = stream("planet", "2026-10-25", "collect").next()
    c = stream("planet", "2026-10-26", "collect").next()
    assert a == b
    assert a != c


def test_coordinate_variation_bounds():
    for coords in ("0,0,0", "1,2,3", "9999999,1,2", ""):
        value = coordinate_variation(coords)
        assert 0.5 <= value <= 2.0

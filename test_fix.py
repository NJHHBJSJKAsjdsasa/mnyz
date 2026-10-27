# test_fix.py
# Regression tests for the "planet generation and index" bug family.
# Run with: python test_fix.py
#
# The config singleton is pinned to the default universe so the tests do not
# depend on a local atlas.ini (and do not print the emoji boot banner, which
# breaks on GBK consoles).

import os
import sys
import shutil
import hashlib
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pymodules.__atlas_config import config

TEST_SEED_STR = "1.618033988749895"
TEST_COSMIC_ORIGIN = 514080000

config._seed_str = TEST_SEED_STR
config.seed_hash = hashlib.sha256(TEST_SEED_STR.encode("utf-8")).hexdigest()
config._seed = int(config.seed_hash, 16)
config._cosmic_origin_time = TEST_COSMIC_ORIGIN
config._initialized = True

from pymodules.__universe_constants import PhysicalConstants
from pymodules.__universe_init_solarsystem import SolarSystem
from pymodules.__element_resources import element_resources
from pymodules.__atlas_sqlite_cache import sqlite_cache
from pymodules.__atlas_cache_proxy import CachedSolarSystem

CONSTANTS = PhysicalConstants()
SYSTEM_SEED = 987654321


class PlanetIndexTests(unittest.TestCase):
    """get_planet must be a pure lookup, never a generator."""

    def setUp(self):
        self.system = SolarSystem(SYSTEM_SEED, 0, CONSTANTS)

    def test_out_of_range_returns_none(self):
        for index in (self.system.num_planets, self.system.num_planets + 1, 15):
            self.assertIsNone(self.system.get_planet(index), f"index {index} must not create a planet")

    def test_negative_and_invalid_index_returns_none(self):
        for index in (-1, None, "0", 1.0):
            self.assertIsNone(self.system.get_planet(index))

    def test_lookup_does_not_mutate_planet_count(self):
        before = self.system.num_planets
        for index in range(before, before + 5):
            self.system.get_planet(index)
        self.assertEqual(self.system.num_planets, before)
        self.assertEqual(sorted(self.system.planets), list(range(before)))

    def test_every_valid_index_is_materialized(self):
        self.assertEqual(len(self.system.planets), self.system.num_planets)
        names = [self.system.get_planet(i).name for i in range(self.system.num_planets)]
        self.assertEqual(len(names), len(set(names)))

    def test_generation_is_deterministic(self):
        twin = SolarSystem(SYSTEM_SEED, 0, CONSTANTS)
        self.assertEqual(twin.num_planets, self.system.num_planets)
        self.assertEqual(
            [twin.get_planet(i).name for i in range(twin.num_planets)],
            [self.system.get_planet(i).name for i in range(self.system.num_planets)],
        )


class StarMassTests(unittest.TestCase):
    """Every planet of a system must orbit the same star mass."""

    def test_all_planets_share_star_mass(self):
        system = SolarSystem(SYSTEM_SEED, 0, CONSTANTS)
        expected = system.get_star_mass()
        for planet in system.planets.values():
            self.assertAlmostEqual(planet.star_mass, expected)


class SolarSystemCacheTests(unittest.TestCase):
    """A cache hit must rebuild the same planets as a cache miss."""

    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp()
        self.original_db_path = sqlite_cache.db_path
        sqlite_cache.db_path = os.path.join(self.tmp_dir, "cache.db")
        sqlite_cache._init_db()
        self.coordinates = (11, 22, 33)

    def tearDown(self):
        sqlite_cache.db_path = self.original_db_path
        shutil.rmtree(self.tmp_dir, ignore_errors=True)

    def test_cache_hit_rebuilds_planets(self):
        cold = CachedSolarSystem(SYSTEM_SEED, 5, CONSTANTS, self.coordinates)
        warm = CachedSolarSystem(SYSTEM_SEED, 5, CONSTANTS, self.coordinates)

        self.assertGreater(len(warm.planets), 0, "cached system must not be an empty shell")
        self.assertEqual(warm.num_planets, cold.num_planets)
        self.assertEqual(sorted(warm.planets), sorted(cold.planets))
        self.assertEqual(
            [warm.get_planet(i).name for i in range(warm.num_planets)],
            [cold.get_planet(i).name for i in range(cold.num_planets)],
        )

    def test_cached_system_keeps_index_semantics(self):
        CachedSolarSystem(SYSTEM_SEED, 5, CONSTANTS, self.coordinates)
        warm = CachedSolarSystem(SYSTEM_SEED, 5, CONSTANTS, self.coordinates)
        self.assertIsNone(warm.get_planet(warm.num_planets))

    def test_extra_planets_survive_cache_hit(self):
        """The 7th..10th planets must keep their names after a cache hit."""
        fresh = None
        for offset in range(2000):
            candidate = SolarSystem(SYSTEM_SEED + offset, 5, CONSTANTS)
            if candidate.num_planets > 6:
                fresh = candidate
                break
        if fresh is None:
            self.skipTest("no extra-planet seed found")

        coordinates = (44, 55, 66)
        CachedSolarSystem(SYSTEM_SEED + offset, 5, CONSTANTS, coordinates)
        warm = CachedSolarSystem(SYSTEM_SEED + offset, 5, CONSTANTS, coordinates)

        self.assertEqual(warm.num_planets, fresh.num_planets)
        self.assertEqual(
            [warm.get_planet(i).name for i in range(warm.num_planets)],
            [fresh.get_planet(i).name for i in range(fresh.num_planets)],
        )


class PlanetElementParityTests(unittest.TestCase):
    """The server-side generator must reproduce Planet.name/type/elements."""

    def test_generated_identity_matches_planet_class(self):
        from pymodules.__planet_elements import planet_identity

        identity = planet_identity(config.seed, 11, 22, 33, 5, 0)
        system = SolarSystem(int(identity["system_seed"]), 5, CONSTANTS)

        for index in range(system.num_planets):
            generated = planet_identity(config.seed, 11, 22, 33, 5, index)
            planet = system.get_planet(index)
            self.assertEqual(generated["name"], planet.name)
            self.assertEqual(generated["planet_type"], planet.planet_type)
            self.assertEqual(generated["elements"], planet.elements)
            self.assertEqual(generated["resources"], element_resources(planet.elements))


class SurfaceTranslatorTests(unittest.TestCase):
    """Every real planet type must resolve to a surface translator."""

    def test_every_planet_type_is_registered(self):
        from pymodules.__drawer_cplanet_type import get_planet_color_map
        from pymodules.planet_renderer.main_translator import PlanetRenderingTranslator

        translator = PlanetRenderingTranslator()
        for planet_type in get_planet_color_map():
            self.assertIn(planet_type, translator.planet_types, f"missing translator for {planet_type}")

    def test_translation_produces_surface_data(self):
        from pymodules.planet_renderer.main_translator import PlanetRenderingTranslator

        translator = PlanetRenderingTranslator()
        system = SolarSystem(SYSTEM_SEED, 0, CONSTANTS)
        for index in range(system.num_planets):
            data = translator.translate_planet_rendering(system.get_planet(index))
            self.assertTrue(data["surface_elements"], f"empty surface_elements for index {index}")


if __name__ == "__main__":
    unittest.main(verbosity=2)

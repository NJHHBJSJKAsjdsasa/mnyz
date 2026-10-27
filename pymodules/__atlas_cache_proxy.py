# pymodules/__atlas_cache_proxy.py

from pymodules.__atlas_cache_facade import cache
from pymodules.__atlas_config import config
from pymodules.__universe_init_galaxy import Galaxy
from pymodules.__universe_init_solarsystem import SolarSystem


class CachedGalaxy(Galaxy):
    """Galaxy whose scalar attributes are cached; children stay seed-derived."""

    def __init__(self, seed, name, constants, galaxy_type="spiral", coordinates=(0, 0, 0), cosmic_origin_time=None):
        x, y, z = coordinates
        cached_data = cache.get_galaxy(x, y, z)

        if cached_data:
            self.seed = cached_data["seed"]
            self.name = cached_data["name"]
            self.constants = constants
            self.coordinates = tuple(cached_data["coordinates"])
            self.galaxy_type = cached_data["galaxy_type"]
            self.cosmic_origin_time = cached_data.get("cosmic_origin_time") or cosmic_origin_time
            self.base_min_systems = cached_data["base_min_systems"]
            self.base_max_systems = cached_data["base_max_systems"]
            self.distance_to_origin = cached_data["distance_to_origin"]
            self.max_distance = cached_data["max_distance"]
            self.proximity_factor = cached_data["proximity_factor"]
            self.num_systems = cached_data["num_systems"]
            self.black_holes = cached_data["black_holes"]
            self.pulsars = cached_data["pulsars"]
            self.quasars = cached_data["quasars"]
            self.solar_systems = {}
            return

        super().__init__(seed, name, constants, galaxy_type, coordinates, cosmic_origin_time)
        cache.save_galaxy(
            x,
            y,
            z,
            {
                "seed": self.seed,
                "name": self.name,
                "coordinates": list(self.coordinates),
                "galaxy_type": self.galaxy_type,
                "cosmic_origin_time": self.cosmic_origin_time,
                "base_min_systems": self.base_min_systems,
                "base_max_systems": self.base_max_systems,
                "distance_to_origin": self.distance_to_origin,
                "max_distance": self.max_distance,
                "proximity_factor": self.proximity_factor,
                "num_systems": self.num_systems,
                "black_holes": self.black_holes,
                "pulsars": self.pulsars,
                "quasars": self.quasars,
            },
        )

    def get_solar_system(self, index):
        self.calculate_num_systems()
        if index < 0 or index >= self.num_systems:
            raise ValueError(f"Solar System index out of range. Must be between 0 and {self.num_systems - 1}.")

        if index not in self.solar_systems:
            self.solar_systems[index] = CachedSolarSystem(
                self.get_solar_system_seed(index),
                index,
                self.constants,
                self.coordinates,
            )
        return self.solar_systems[index]


class CachedSolarSystem(SolarSystem):
    """Solar system whose scalar attributes are cached.

    Planets are never read back from the cache: they are rebuilt from the system
    seed so that a cached system is byte-for-byte identical to a fresh one.
    """

    def __init__(self, seed, index, constants, galaxy_coordinates):
        self.galaxy_coordinates = galaxy_coordinates
        x, y, z = galaxy_coordinates
        cached_data = cache.get_system(x, y, z, index)

        if cached_data:
            self.seed = cached_data["seed"]
            self.index = cached_data["index"]
            self.constants = constants
            self.name = cached_data["name"]
            self.num_planets = cached_data["num_planets"]
            self.stars = cached_data.get("stars") or []
            self.star_system_type = cached_data.get("star_system_type", "single")
            self.planets = {}
            self._build_planets(self.num_planets)
            return

        super().__init__(seed, index, constants)
        cache.save_system(
            x,
            y,
            z,
            index,
            {
                "seed": self.seed,
                "index": self.index,
                "name": self.name,
                "num_planets": self.num_planets,
                "stars": self.stars,
                "star_system_type": self.star_system_type,
            },
        )


def patch_universe_get_galaxy():
    """Route Universe.get_galaxy through the cache-backed subclasses."""
    from pymodules.__universe_init_universe import Universe

    def cached_get_galaxy(self, x, y, z):
        max_coordinate = 10**7
        if not (0 <= x <= max_coordinate and 0 <= y <= max_coordinate and 0 <= z <= max_coordinate):
            raise ValueError(f"Coordinates out of range. Must be between 0 and {max_coordinate}.")

        if (x, y, z) not in self.galaxies:
            from pymodules.__universe_name_generator import generate_galaxy_name

            galaxy_seed = self.generate_galaxy_seed(x, y, z)
            self.galaxies[(x, y, z)] = CachedGalaxy(
                galaxy_seed,
                generate_galaxy_name(galaxy_seed),
                self.constants,
                coordinates=(x, y, z),
                cosmic_origin_time=self.cosmic_origin_time or config.cosmic_origin_time,
            )
        return self.galaxies[(x, y, z)]

    Universe.get_galaxy = cached_get_galaxy

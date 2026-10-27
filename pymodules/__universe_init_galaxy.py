# pymodules/__universe_init_galaxy.py

import math
import time
import random
import hashlib

from pymodules.__atlas_seedmaster import seedmaster


class Galaxy:
    def __init__(
        self,
        seed,
        name,
        constants,
        galaxy_type="spiral",
        coordinates=(0, 0, 0),
        cosmic_origin_time=None,
    ):
        self.seed = seed
        self.name = name
        self.constants = constants
        self.coordinates = coordinates
        self.galaxy_type = galaxy_type
        self.cosmic_origin_time = cosmic_origin_time
        random.seed(seed)

        if self.galaxy_type == "Dwarf":
            self.base_min_systems = 500
            self.base_max_systems = random.randint(10**5, 10**7)
        elif self.galaxy_type == "Spiral":
            self.base_min_systems = 1500
            self.base_max_systems = random.randint(10**9, 5 * 10**10)
        elif self.galaxy_type == "Elliptical":
            self.base_min_systems = 5000
            self.base_max_systems = random.randint(10**10, 10**11)
        else:
            self.base_min_systems = 3500
            self.base_max_systems = random.randint(10**8, 10**9)

        self.distance_to_origin = math.sqrt(
            (self.coordinates[0] - 4999999) ** 2
            + (self.coordinates[1] - 4999999) ** 2
            + (self.coordinates[2] - 4999999) ** 2
        )

        self.max_distance = math.sqrt(3 * (4999999**2))

        self.proximity_factor = max(
            0, 1 - (self.distance_to_origin / self.max_distance)
        )

        if cosmic_origin_time - time.time() >= 59999997000000:
            self.num_systems = 0
            self.galaxy_type = "Singularity Void"
            self.black_holes = 0
            self.pulsars = 0
            self.quasars = 0
        else:
            self.calculate_num_systems()

        self.solar_systems = {}

        if self.num_systems <= 0:
            self.galaxy_type = "Singularity Void"
            self.black_holes = 0
            self.pulsars = 0
            self.quasars = 0
        else:
            self.black_holes = random.randint(1, 10)
            self.pulsars = random.randint(0, 50)
            self.quasars = random.randint(0, 2)

    def calculate_num_systems(self):
        tiempo_transcurrido = time.time() - self.cosmic_origin_time
        minutos_transcurridos = tiempo_transcurrido // 60

        growth_systems = int(minutos_transcurridos * self.proximity_factor * 10)

        base_num_systems = int(
            self.base_min_systems
            + (self.base_max_systems - self.base_min_systems) * self.proximity_factor
        )

        self.num_systems = max(
            min(base_num_systems + growth_systems, self.base_max_systems), 0
        )

    def get_solar_system_seed(self, index):
        """Deterministic seed for the solar system at index."""
        return int(
            hashlib.sha256(f"{self.seed}-{seedmaster(8)}-{index}".encode()).hexdigest(),
            16,
        )

    def get_solar_system(self, index):
        self.calculate_num_systems()
        if index < 0 or index >= self.num_systems:
            raise ValueError(
                f"Solar System index out of range. Must be between 0 and {self.num_systems - 1}."
            )
        if index not in self.solar_systems:
            # Import here to avoid circular imports
            from pymodules.__universe_init_solarsystem import SolarSystem

            system_seed = self.get_solar_system_seed(index)
            self.solar_systems[index] = SolarSystem(system_seed, index, self.constants)
        return self.solar_systems[index]
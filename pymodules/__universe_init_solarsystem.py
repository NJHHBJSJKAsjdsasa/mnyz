# pymodules/__universe_init_solarsystem.py

import random
import hashlib

from pymodules.__atlas_seedmaster import seedmaster
from pymodules.__universe_name_generator import generate_name


EXTRA_PLANET_PROBABILITIES = {
    6: 0.35,
    7: 0.25,
    8: 0.10,
    9: 0.05,
}

STAR_MASS_FACTORS = {
    "Red Dwarf": 0.2,
    "Yellow Dwarf": 1.0,
    "Blue Giant": 10.0,
    "Red Giant": 1.2,
    "White Dwarf": 0.6,
    "Neutron Star": 1.4,
}


class SolarSystem:
    def __init__(self, seed, index, constants):
        self.seed = seed
        self.index = index
        self.constants = constants
        random.seed(seed)
        self.name = generate_name(seed + index, "system")
        self.num_planets = random.randint(1, 6)
        self.planets = {}

        self.star_system_type = self.determine_star_system_type()
        self.stars = self.generate_stars()

        self._build_planets(self.num_planets)
        self._maybe_add_extra_planets()

    def _build_planets(self, count):
        """Materialize planets 0..count-1 from their seeds (order-independent of RNG state)."""
        for planet_index in range(count):
            self.planets[planet_index] = self._create_planet(planet_index)

    def _create_planet(self, index):
        """Build one planet; the seed formula is shared by normal and extra planets.

        ``index >= 6`` is exactly the extra-planet range (base count is 1..6), so
        deriving ``is_extra`` from the index keeps cache-hit rebuilds identical
        to fresh generation. Passing the flag explicitly used to differ and gave
        a cached system different names for its 7th..10th planets.
        """
        from pymodules.__universe_init_planet import Planet

        planet_seed = int(
            hashlib.sha256(f"{self.seed}-{seedmaster(4)}-{index}".encode()).hexdigest(),
            16,
        )
        planet_name = generate_name(planet_seed, "planet", is_extra=index >= 6)
        return Planet(planet_seed, planet_name, self.constants, self.get_star_mass())

    def _maybe_add_extra_planets(self):
        """Append the optional 7th..10th planet when the roll succeeds."""
        for extra_index, probability in EXTRA_PLANET_PROBABILITIES.items():
            if self.num_planets != extra_index:
                break

            extra_seed = int(
                hashlib.sha256(f"{self.seed}-extra-planet-{extra_index}".encode()).hexdigest(),
                16,
            )
            random.seed(extra_seed)

            if random.random() >= probability:
                break

            self.planets[extra_index] = self._create_planet(extra_index)
            self.num_planets = extra_index + 1

    def get_star_mass(self):
        """Primary star mass in solar masses, used by every orbital calculation."""
        if not self.stars:
            return self.constants.M_SUN
        return self.constants.M_SUN * STAR_MASS_FACTORS.get(self.stars[0]["Type"], 1.0)

    def determine_star_system_type(self):
        system_type = random.choices(
            ["single", "binary", "tertiary"],
            weights=[0.7, 0.25, 0.05],
            k=1,
        )[0]
        return system_type

    def generate_stars(self):
        star_count = 1 if self.star_system_type == "single" else 2 if self.star_system_type == "binary" else 3
        stars = []
        for i in range(star_count):
            star_seed = int(
                hashlib.sha256(f"{self.seed}-{seedmaster(2)}-{i}".encode()).hexdigest(),
                16,
            )
            stars.append(self.generate_star(star_seed))
        return stars

    def generate_star(self, seed):
        random.seed(seed)

        star_types = {
            "Red Dwarf": {"color": "red", "radius_factor": 0.5},
            "Yellow Dwarf": {"color": "yellow", "radius_factor": 1.0},
            "Blue Giant": {"color": "blue", "radius_factor": 2.0},
            "Red Giant": {"color": "orange", "radius_factor": 3.0},
            "White Dwarf": {"color": "white", "radius_factor": 0.3},
            "Neutron Star": {"color": "purple", "radius_factor": 0.2},
        }

        star_type = random.choice(list(star_types.keys()))
        star_properties = star_types[star_type]

        return {
            "Type": star_type,
            "Color": star_properties["color"],
            "Radius Factor": star_properties["radius_factor"],
        }

    def get_planet(self, index):
        """Return the planet at index, or None when the index does not exist."""
        if not isinstance(index, int) or isinstance(index, bool) or index < 0:
            return None
        return self.planets.get(index)

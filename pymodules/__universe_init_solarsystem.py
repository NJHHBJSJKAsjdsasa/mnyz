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
    # Beyond ten planets the 11th may be a frontier world — one of
    # `FRONTIER_TYPES` in `__universe_init_planet`. Ported from upstream 3.0.2.
    10: 0.30,
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
        self._planets = {}
        self._planets_built = False

        self.star_system_type = self.determine_star_system_type()
        self.stars = self.generate_stars()

        # Planet count is resolved now; the planets themselves are built on first
        # access. The count has to be known immediately — it is on every list row —
        # but a page of 150 systems holds ~500 planets, and materialising them cost
        # 354ms per page even with the system scalars cached. Almost nothing needs
        # the planets: the system list reads `name` and `num_planets`, and the star
        # map reads `orbital_radius`.
        self.num_planets = self._resolve_planet_count()

    def _resolve_planet_count(self):
        """Base 1..6 plus any extra, decided without building the bodies.

        Same rolls `_maybe_add_extra_planets` made, minus the construction: each
        extra planet re-seeds from its own hash, so the decision never depends on
        the RNG state the planets themselves would leave behind.

        The 11th planet additionally draws a slot (upstream 3.0.2): only slots that
        name a type in `FRONTIER_TYPES` produce a planet, the rest mean "no 11th
        planet yet". The chosen type is kept on the instance for `_create_planet`.
        """
        count = self.num_planets
        self.frontier_type = None
        for extra_index, probability in EXTRA_PLANET_PROBABILITIES.items():
            if count != extra_index:
                break
            extra_seed = int(
                hashlib.sha256(f"{self.seed}-extra-planet-{extra_index}".encode()).hexdigest(),
                16,
            )
            random.seed(extra_seed)
            if random.random() >= probability:
                break

            if extra_index == 10:
                from pymodules.__universe_init_planet import FRONTIER_SLOTS, FRONTIER_TYPES

                slot = random.randint(1, FRONTIER_SLOTS)
                if slot > len(FRONTIER_TYPES):
                    break
                self.frontier_type = FRONTIER_TYPES[slot - 1]

            count = extra_index + 1
        return count

    @property
    def planets(self):
        """Planet bodies, materialised on first use.

        Every planet seeds itself from its own hash (`Planet.__init__` does
        `random.seed(planet_seed)`), so building them late cannot change what they
        look like — the order and timing of construction are irrelevant.
        """
        if not self._planets_built:
            self._planets_built = True
            self._build_planets(self.num_planets)
        return self._planets

    def _build_planets(self, count):
        """Materialize planets 0..count-1 from their seeds (order-independent of RNG state)."""
        for planet_index in range(count):
            self._planets[planet_index] = self._create_planet(planet_index)

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
        # Only the 11th slot can be a frontier world. `getattr` because a system
        # restored from the Postgres cache never ran `_resolve_planet_count`: its
        # planet count is whatever it was the day it was cached, and an old cached
        # system must keep rendering exactly the planets it always had.
        frontier_type = getattr(self, "frontier_type", None) if index >= 10 else None
        return Planet(planet_seed, planet_name, self.constants, self.get_star_mass(), frontier_type=frontier_type)

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

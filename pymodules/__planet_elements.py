"""Pure planet identity/element generator used by the authoritative server.

Mirrors ``Planet`` in ``__universe_init_planet.py`` without importing the Flask
config singleton: seeds are derived from an explicit universe seed, so the same
function works in the API process, in tests and in CLI backfills.

Chain (docs/server/09 §2):
  galaxy_seed = sha256("{universe_seed}-{base64^12(seed)}-{x}-{y}-{z}")
  system_seed = sha256("{galaxy_seed}-{base64^8(seed)}-{index}")
  name_seed   = sha256("{system_seed}-{base64^4(seed)}-{planet_index}")
  planet_seed = sha256("{name_seed}-{name}-{base64^4(seed)}")
"""

from __future__ import annotations

import base64
import hashlib
import random
import threading

from pymodules.__element_resources import element_resources
from pymodules.__universe_elements import periodic_table
from pymodules.__universe_name_generator import generate_name

PLANET_TYPES = [
    "Rocky",
    "Gas Giant",
    "Icy",
    "Oceanic",
    "Desert",
    "Lava",
    "Arid",
    "Tundra",
    "Swamp",
    "Forest",
    "Savannah",
    "Cave",
    "Crystalline",
    "Anomaly",
    "Metallic",
    "Toxic",
    "Radioactive",
    "Magma",
    "Molten Core",
    "Carbon",
    "Diamond",
    "Super Earth",
    "Sub Earth",
    "Frozen Gas Giant",
    "Nebulous",
    "Aquifer",
    "Exotic",
]

TYPE_ELEMENTS = {
    "Rocky": ["Silicon", "Iron", "Magnesium", "Oxygen"],
    "Gas Giant": ["Hydrogen", "Helium", "Neon", "Argon"],
    "Icy": ["Nitrogen", "Oxygen", "Hydrogen", "Sulfur"],
    "Oceanic": ["Oxygen", "Hydrogen", "Sodium", "Chlorine"],
    "Desert": ["Silicon", "Oxygen", "Iron", "Aluminum"],
    "Lava": ["Magnesium", "Silicon", "Iron", "Sulfur"],
    "Arid": ["Silicon", "Oxygen", "Iron", "Calcium"],
    "Tundra": ["Nitrogen", "Oxygen", "Carbon", "Iron"],
    "Swamp": ["Carbon", "Oxygen", "Phosphorus", "Nitrogen"],
    "Forest": ["Oxygen", "Carbon", "Nitrogen", "Phosphorus"],
    "Savannah": ["Oxygen", "Carbon", "Silicon", "Phosphorus"],
    "Cave": ["Silicon", "Calcium", "Iron", "Carbon"],
    "Crystalline": ["Silicon", "Carbon", "Oxygen", "Iron"],
    "Anomaly": ["Copernicium", "Nihonium", "Flerovium", "Moscovium"],
    "Metallic": ["Iron", "Nickel", "Titanium", "Cobalt"],
    "Toxic": ["Sulfur", "Chlorine", "Phosphorus", "Fluorine"],
    "Radioactive": ["Uranium", "Thorium", "Plutonium", "Radium"],
    "Magma": ["Magnesium", "Silicon", "Iron", "Sulfur"],
    "Molten Core": ["Iron", "Nickel", "Magnesium", "Sulfur"],
    "Carbon": ["Carbon", "Oxygen", "Silicon", "Iron"],
    "Diamond": ["Carbon", "Silicon", "Nitrogen", "Oxygen"],
    "Super Earth": ["Iron", "Magnesium", "Silicon", "Oxygen"],
    "Sub Earth": ["Silicon", "Iron", "Carbon", "Oxygen"],
    "Frozen Gas Giant": ["Hydrogen", "Helium", "Neon", "Nitrogen"],
    "Nebulous": ["Hydrogen", "Helium", "Neon", "Argon"],
    "Aquifer": ["Oxygen", "Hydrogen", "Sodium", "Chlorine"],
    "Exotic": ["Oganesson", "Livermorium", "Tennessine", "Flerovium"],
}

ELEMENT_NAMES = [name for name, _ in periodic_table]
ELEMENT_WEIGHTS = dict(periodic_table)
FALLBACK_ELEMENTS = [name for name, weight in periodic_table if weight > 0.0000000001]
MAX_PLANET_INDEX = 9

# generate_name reseeds the global RNG; serialise so concurrent requests cannot
# interleave two names.
_NAME_LOCK = threading.Lock()


def seedmaster_for(universe_seed: int, iterations: int) -> str:
    if iterations == 0:
        return str(universe_seed)
    payload = str(universe_seed).encode("utf-8")
    for _ in range(iterations):
        payload = base64.b64encode(payload)
    return payload.decode("utf-8")


def galaxy_seed(universe_seed: int, x: int, y: int, z: int) -> int:
    material = f"{universe_seed}-{seedmaster_for(universe_seed, 12)}-{x}-{y}-{z}"
    return int(hashlib.sha256(material.encode("utf-8")).hexdigest(), 16)


def system_seed(universe_seed: int, x: int, y: int, z: int, system_index: int) -> int:
    galaxy = galaxy_seed(universe_seed, x, y, z)
    material = f"{galaxy}-{seedmaster_for(universe_seed, 8)}-{system_index}"
    return int(hashlib.sha256(material.encode("utf-8")).hexdigest(), 16)


def naming_seed_for(universe_seed: int, system: int, planet_index: int) -> int:
    material = f"{system}-{seedmaster_for(universe_seed, 4)}-{planet_index}"
    return int(hashlib.sha256(material.encode("utf-8")).hexdigest(), 16)


def planet_name(universe_seed: int, x: int, y: int, z: int, system_index: int, planet_index: int) -> str:
    """Cheap name-only lookup used to resolve an index from a planet key."""
    if not 0 <= planet_index <= MAX_PLANET_INDEX:
        raise ValueError(f"planet index out of range: {planet_index}")
    system = system_seed(universe_seed, x, y, z, system_index)
    naming = naming_seed_for(universe_seed, system, planet_index)
    with _NAME_LOCK:
        return generate_name(naming, "planet", is_extra=planet_index >= 6)


def planet_identity(
    universe_seed: int,
    x: int,
    y: int,
    z: int,
    system_index: int,
    planet_index: int,
) -> dict:
    """Return the generated identity for one planet (pure, deterministic)."""
    if not 0 <= planet_index <= MAX_PLANET_INDEX:
        raise ValueError(f"planet index out of range: {planet_index}")
    sm4 = seedmaster_for(universe_seed, 4)
    system = system_seed(universe_seed, x, y, z, system_index)
    naming_seed = naming_seed_for(universe_seed, system, planet_index)
    with _NAME_LOCK:
        name = generate_name(naming_seed, "planet", is_extra=planet_index >= 6)
    element_material = f"{naming_seed}-{name}-{sm4}"
    element_seed = int(hashlib.sha256(element_material.encode("utf-8")).hexdigest(), 16)

    rng = random.Random(element_seed)
    planet_type = rng.choice(PLANET_TYPES)
    possible = TYPE_ELEMENTS.get(planet_type, FALLBACK_ELEMENTS)
    rng.seed(element_seed)
    elements = _roll_elements(rng, possible)
    return {
        "name": name,
        "planet_type": planet_type,
        "elements": elements,
        "resources": element_resources(elements),
        "planet_index": planet_index,
        "system_index": system_index,
        "system_seed": str(system),
        "seed": str(naming_seed),
        "element_seed": str(element_seed),
    }


def _roll_elements(rng: random.Random, possible: list[str]) -> list[str]:
    preselected = rng.sample(possible, min(2, len(possible)))
    remaining = [name for name in ELEMENT_NAMES if name not in preselected]
    weights = [ELEMENT_WEIGHTS[name] for name in remaining]
    wanted = min(rng.randint(5, 10) - len(preselected), len(remaining))
    additional: list[str] = []
    while len(additional) < wanted and remaining:
        picked = rng.choices(remaining, weights=weights, k=1)[0]
        additional.append(picked)
        index = remaining.index(picked)
        remaining.pop(index)
        weights.pop(index)
    return preselected + additional

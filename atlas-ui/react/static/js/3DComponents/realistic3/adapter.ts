// atlas-ui/react/static/js/3DComponents/realistic3/adapter.ts
//
// Bridge between the 2.x planet payload and the 3.0 realistic renderer's data contract.
//
// The renderer (vendored verbatim from SurceBeats/Atlas 3.0.2, see VENDOR.md) reads a
// loosely-typed "rendering data" object: planetLook() takes
//   data.original_planet_data | data.planet_info  -> planet_type, surface_temperature, life_forms
//   data.planet_info.{name,type,base_color}
//   data.atmosphere.type
//   data.seeds.{planet_seed,shape_seed}
// The 2.x pages hand us a flatter object (planetData props on the 3D wrappers). This
// module maps one onto the other and keeps the mapping in one place, so the vendored
// files stay untouched and diffable against upstream.

export interface PlanetLike {
  name?: string;
  planet_type?: string;
  surface_temperature?: number;
  atmosphere?: string;
  life_forms?: string;
  base_color?: string;
  rotation_period_seconds?: number;
  // Anything the caller already has as a stable per-planet seed (name, key, coordinates).
  seed?: string;
}

/** Shape consumed by looks.ts / effects.ts. Same field names upstream uses. */
export interface LookInput {
  planet_info: { name: string; type: string; base_color?: string; surface_temperature?: number };
  original_planet_data: { planet_type?: string; surface_temperature?: number; life_forms?: string };
  atmosphere: { type: string };
  life_forms: { type: string };
  seeds: { planet_seed: string; shape_seed: string };
}

const asString = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim() ? value : fallback;

export function lookInputFromPlanet(planet: PlanetLike, fallbackSeed = "atlas"): LookInput {
  const name = asString(planet.name, "Unknown");
  const type = asString(planet.planet_type, "Rocky");
  // A seed that is stable for the same planet across reloads: the renderer derives every
  // shape parameter from it, so an unstable seed means the planet changes shape each visit.
  const seed = asString(planet.seed, `${name}|${type}|${fallbackSeed}`);
  return {
    planet_info: {
      name,
      type,
      base_color: planet.base_color,
      surface_temperature: planet.surface_temperature,
    },
    original_planet_data: {
      planet_type: type,
      surface_temperature: planet.surface_temperature,
      life_forms: planet.life_forms,
    },
    atmosphere: { type: asString(planet.atmosphere, "None") },
    life_forms: { type: asString(planet.life_forms, "None") },
    seeds: { planet_seed: seed, shape_seed: seed },
  };
}

/**
 * Dev-only ring sample for the lab.
 *
 * In the app rings arrive from the 2.x backend (`renderingApiData.rings`) in exactly the
 * shape `RealisticRings` wants, so nothing needs mapping. The lab has no backend, hence
 * this generator. Keep it out of the page path.
 */
export function sampleRings(seed: number) {
  const planetRadius = 200;
  const bands = Array.from({ length: 5 }, (_, index) => {
    const inner = 260 + index * 42 + (seed % 7);
    return { inner, outer: inner + 26 + ((seed * (index + 3)) % 18) };
  });
  return {
    has_rings: true,
    inner_radius: bands[0].inner,
    outer_radius: bands[bands.length - 1].outer,
    planet_radius: planetRadius,
    tilt_factor: 0.26,
    shape_seed: seed % 1000,
    bands,
  };
}

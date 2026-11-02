// atlas-ui/react/static/js/3DComponents/realistic3/moons.ts
//
// Synthetic moon systems for the vendored 3.0 MoonSystem.
//
// 2.x has no moon data yet (the backend only ships planet-level rendering-data), so the
// lab and step-3 page mount need something deterministic to draw. This module fabricates
// a MoonSystemData that satisfies MoonSystem's contract from just (count, seed) and is
// stable across reloads — same seed, same moons, same orbits.
//
// When the backend starts returning real moons, replace the call site with the payload;
// MoonSystem itself needs no change (its interface is the vendored MoonData).

export interface MoonSystemData {
  count: number;
  roche_limit: number;
  hill_radius: number;
  moons: MoonData[];
  render_settings: { max_visible_distance: number; lod_distances: number[] };
  cosmic_origin_time: number;
  planet_mass: number;
  planet_radius: number;
}

export interface MoonData {
  name: string;
  properties: {
    mass_kg: number;
    radius_km: number;
    density_kg_m3: number;
    type: string;
    origin: string;
  };
  orbit: {
    semi_major_axis_km: number;
    eccentricity: number;
    inclination_deg: number;
    orbital_period_seconds: number;
    orbital_period_days: number;
    current_angle: number;
    initial_phase?: number;
  };
  rotation: {
    rotation_period_s: number;
    rotation_period_hours: number;
    angular_velocity_rad_s: number;
    is_tidally_locked: boolean;
  };
  visuals: {
    base_color: string;
    roughness: number;
    metalness: number;
    normal_strength: number;
    relative_size: number;
    has_atmosphere: boolean;
    atmosphere_color?: string;
    atmosphere_opacity?: number;
  };
  procedural: { seed: number; noise_scale: number; crater_density: number; surface_variation: number };
}

/** Deterministic 32-bit hash — no Math.random, so the same seed never reshuffles. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stable float in [0,1) from a seed and a salt. */
function unit(seed: string, salt: number): number {
  return (hash(`${seed}:${salt}`) % 10000) / 10000;
}

const KINDS = [
  { type: "rocky", color: "#8b8680", roughness: 0.9, metalness: 0.1, density: 3300, origin: "co-formation" },
  { type: "icy", color: "#d9e4f2", roughness: 0.35, metalness: 0.05, density: 1900, origin: "captured" },
  { type: "asteroidal", color: "#5d4f3a", roughness: 0.95, metalness: 0.15, density: 2600, origin: "captured" },
  { type: "volcanic", color: "#7a5a4a", roughness: 0.75, metalness: 0.12, density: 3500, origin: "co-formation" },
];

const MOON_NAMES = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

/**
 * Build a plausible moon system: relative sizes 0.05–0.16, semi-major axes growing
 * geometrically, periods from Kepler's third law around a 1-Earth-mass planet.
 */
export function synthesizeMoonSystem(count: number, seed: string, planetRadius = 1): MoonSystemData {
  const total = Math.max(0, Math.min(Math.floor(count), 8));
  const planetMass = 5.972e24;
  const moons: MoonData[] = [];

  for (let index = 0; index < total; index += 1) {
    const kind = KINDS[Math.floor(unit(seed, index * 7 + 1) * KINDS.length) % KINDS.length];
    const relativeSize = 0.05 + unit(seed, index * 7 + 2) * 0.11;
    const radiusKm = Math.max(80, relativeSize * 6371);
    const axisKm = 42000 * Math.pow(1.65, index) * (0.9 + unit(seed, index * 7 + 3) * 0.2);
    // Kepler: T = 2π √(a³ / GM), a in metres
    const periodSeconds = 2 * Math.PI * Math.sqrt(Math.pow(axisKm * 1000, 3) / (6.674e-11 * planetMass));
    const tidallyLocked = axisKm < 400000;
    const rotationPeriod = tidallyLocked ? periodSeconds : periodSeconds * (0.4 + unit(seed, index * 7 + 4));
    const icy = kind.type === "icy";

    moons.push({
      name: `Moon ${MOON_NAMES[index] ?? index + 1}`,
      properties: {
        mass_kg: (4 / 3) * Math.PI * Math.pow(radiusKm * 1000, 3) * kind.density,
        radius_km: radiusKm,
        density_kg_m3: kind.density,
        type: kind.type,
        origin: kind.origin,
      },
      orbit: {
        semi_major_axis_km: axisKm,
        eccentricity: 0.002 + unit(seed, index * 7 + 5) * 0.05,
        inclination_deg: unit(seed, index * 7 + 6) * 8,
        orbital_period_seconds: periodSeconds,
        orbital_period_days: periodSeconds / 86400,
        current_angle: unit(seed, index * 7 + 7) * Math.PI * 2,
        initial_phase: unit(seed, index * 7 + 8) * Math.PI * 2,
      },
      rotation: {
        rotation_period_s: rotationPeriod,
        rotation_period_hours: rotationPeriod / 3600,
        angular_velocity_rad_s: (Math.PI * 2) / rotationPeriod,
        is_tidally_locked: tidallyLocked,
      },
      visuals: {
        base_color: kind.color,
        roughness: kind.roughness,
        metalness: kind.metalness,
        normal_strength: 0.8,
        relative_size: relativeSize,
        has_atmosphere: icy && unit(seed, index * 7 + 9) > 0.6,
        atmosphere_color: "#9fc4e8",
        atmosphere_opacity: 0.35,
      },
      procedural: {
        seed: hash(`${seed}:moon:${index}`) % 100000,
        noise_scale: 2 + unit(seed, index * 7 + 10) * 4,
        crater_density: 0.4 + unit(seed, index * 7 + 11) * 0.5,
        surface_variation: 0.5,
      },
    });
  }

  const farthest = moons.length ? moons[moons.length - 1].orbit.semi_major_axis_km : 1;
  return {
    count: total,
    roche_limit: planetRadius * 2.4,
    hill_radius: farthest * 3,
    moons,
    render_settings: {
      max_visible_distance: farthest * 4,
      lod_distances: [planetRadius * 4, planetRadius * 10, planetRadius * 30],
    },
    cosmic_origin_time: 0,
    planet_mass: planetMass,
    planet_radius: planetRadius,
  };
}

/** Keep the type narrow for callers that only pass a count. */
export type MoonInput = number | MoonSystemData | null | undefined;

export function resolveMoonSystem(
  input: MoonInput,
  seed: string,
  planetRadius = 1
): MoonSystemData | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") {
    return input > 0 ? synthesizeMoonSystem(input, seed, planetRadius) : null;
  }
  return input.count > 0 ? input : null;
}

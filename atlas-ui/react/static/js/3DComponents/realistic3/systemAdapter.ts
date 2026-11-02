// atlas-ui/react/static/js/3DComponents/realistic3/systemAdapter.ts
//
// Bridge between 2.x's `/api/system/rendering-data` and the vendored 3.0 `SystemLayer`.
//
// Good news: the 2.x endpoint (pymodules/planet_renderer/api_endpoints.py::_get_system_rendering_data)
// already ships almost exactly the 3.0 shape — orbits in AU, `initial_orbital_angle`,
// `current_orbital_angle`, `eccentricity_factor`, `surface_temperature` in °C, and a
// `timing` block. What is missing is bookkeeping:
//
//   system.index            the 2.x payload has no system index   -> caller passes it
//   planets[].index         array order                            -> index = position
//   stars[].Size            a string ("1.4") in 2.x                -> Number
//   planets[].elements      absent in the system payload           -> []
//   stargate_url            absent in the system payload           -> ""
//   Timing.current_time     `timing.current_time` (server clock)   -> fall back to now
//
// The vendored file is untouched; if upstream changes its contract, this is the only file
// that has to move.

import type { PlanetDetail, StarInfo, SystemDetail, Timing } from "./systemTypes.ts";

/** What `GET /api/system/rendering-data` returns (loosely typed on purpose). */
export interface RawSystemResponse {
  success?: boolean;
  system_name?: string;
  system_data?: RawSystemData;
}

export interface RawSystemData {
  name?: string;
  star_system_type?: string;
  num_planets?: number;
  stars?: Array<{ Type?: string; Color?: string; Size?: string | number }>;
  planets?: RawPlanet[];
  timing?: {
    cosmic_origin_time?: number;
    current_time?: number;
    max_orbital_radius?: number;
    system_planets_count?: number;
  };
}

export interface RawPlanet {
  name?: string;
  planet_type?: string;
  diameter?: number;
  mass?: number;
  density?: number;
  gravity?: number;
  orbital_radius?: number;
  orbital_period_seconds?: number;
  orbital_speed?: number;
  axial_tilt?: number;
  rotation_period_seconds?: number;
  surface_temperature?: number;
  atmosphere?: string;
  life_forms?: string;
  elements?: string[];
  eccentricity_factor?: number;
  initial_orbital_angle?: number;
  current_orbital_angle?: number;
  relative_orbital_radius?: number;
  mean_temperature?: number;
  atmosphere_factor?: number;
  stargate_url?: string;
}

// Same table the vendored SystemLayer uses for its glow sprites, repeated here so the
// standalone star stage can tint without constructing a whole system.
const STAR_TINTS: Record<string, number> = {
  red: 0xff7a4d,
  yellow: 0xfff1c9,
  blue: 0xa9c8ff,
  orange: 0xffb86b,
  white: 0xf4f7ff,
  purple: 0xc9a6ff,
};

export function starTint(color: string | undefined): number {
  return STAR_TINTS[String(color ?? "").toLowerCase()] ?? 0xffffff;
}

export function adaptStar(star: { Type?: string; Color?: string; Size?: string | number }): StarInfo {
  const size = typeof star.Size === "number" ? star.Size : Number.parseFloat(String(star.Size ?? "1"));
  return {
    Type: String(star.Type ?? "Yellow Dwarf"),
    Color: String(star.Color ?? "yellow"),
    // 2.x stores it as a string; the renderer multiplies it by a solar radius
    Size: Number.isFinite(size) && size > 0 ? size : 1,
  };
}

const num = (value: unknown, fallback: number): number => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * 2.x payload -> `{ system, timing }` for `new SystemLayer(system, timing)`.
 * Returns `null` when the payload has no usable system (the caller degrades to classic).
 */
export function adaptSystemPayload(
  raw: RawSystemResponse | RawSystemData | null | undefined,
  options: { index?: number; cosmicOriginTime?: number; now?: number } = {}
): { system: SystemDetail; timing: Timing } | null {
  if (!raw) return null;
  const data: RawSystemData =
    (raw as RawSystemResponse).system_data ?? (raw as RawSystemData);
  if (!data || !Array.isArray(data.planets) || data.planets.length === 0) return null;

  const now = options.now ?? Date.now() / 1000;
  const cosmicOrigin = num(data.timing?.cosmic_origin_time, options.cosmicOriginTime ?? now);
  const currentTime = num(data.timing?.current_time, now);

  const planets: PlanetDetail[] = data.planets.map((planet, index) => {
    const orbitalPeriod = Math.max(1, num(planet.orbital_period_seconds, 31557600));
    const initialAngle = num(planet.initial_orbital_angle, 0);
    // The server sends `current_orbital_angle` for its own "now"; recompute only if absent
    const currentAngle = num(
      planet.current_orbital_angle,
      (initialAngle + ((2 * Math.PI) / orbitalPeriod) * (currentTime - cosmicOrigin)) % (2 * Math.PI)
    );
    return {
      index,
      name: String(planet.name ?? `Planet ${index + 1}`),
      planet_type: String(planet.planet_type ?? "Rocky"),
      diameter: num(planet.diameter, 12742),
      mass: num(planet.mass, 1),
      density: num(planet.density, 5.5),
      gravity: num(planet.gravity, 9.8),
      orbital_radius: Math.max(1e-4, num(planet.orbital_radius, 1)),
      orbital_period_seconds: orbitalPeriod,
      orbital_speed: num(planet.orbital_speed, 0),
      axial_tilt: num(planet.axial_tilt, 0),
      rotation_period_seconds: num(planet.rotation_period_seconds, 86400),
      surface_temperature: num(planet.surface_temperature, 15),
      mean_temperature: planet.mean_temperature,
      atmosphere_factor: planet.atmosphere_factor,
      atmosphere: String(planet.atmosphere ?? "None"),
      life_forms: String(planet.life_forms ?? "None"),
      elements: Array.isArray(planet.elements) ? planet.elements : [],
      eccentricity_factor: num(planet.eccentricity_factor, 0.1),
      initial_orbital_angle: initialAngle,
      current_orbital_angle: currentAngle,
      relative_orbital_radius: num(planet.relative_orbital_radius, 0),
      stargate_url: String(planet.stargate_url ?? ""),
    };
  });

  const maxOrbitalRadius =
    num(data.timing?.max_orbital_radius, 0) || Math.max(...planets.map((planet) => planet.orbital_radius));

  const system: SystemDetail = {
    index: options.index ?? 0,
    name: String(data.name ?? "Unknown system"),
    star_system_type: String(data.star_system_type ?? "Unknown"),
    num_planets: num(data.num_planets, planets.length),
    stars: Array.isArray(data.stars) && data.stars.length ? data.stars.map(adaptStar) : [adaptStar({})],
    planets,
    max_orbital_radius: maxOrbitalRadius,
    stargate_url: String((data as { stargate_url?: string }).stargate_url ?? ""),
  };

  return { system, timing: { cosmic_origin_time: cosmicOrigin, current_time: currentTime } };
}

/**
 * Orbit angle `secondsFromNow` after the payload's own "now": `angle = current + ω · elapsed`.
 * The lab and the checks use it to confirm the adapter agrees with the backend formula
 * (`initial + ω · (current_time - cosmic_origin_time)`).
 */
export function orbitAngleAt(planet: PlanetDetail, secondsFromNow = 0): number {
  const omega = (2 * Math.PI) / Math.max(1, planet.orbital_period_seconds);
  return (planet.current_orbital_angle + omega * secondsFromNow) % (2 * Math.PI);
}

// atlas-ui/react/static/js/SystemLab/fixture.ts
//
// Synthetic `/api/system/rendering-data` payloads for the system lab. The lab has no Flask
// session, so it cannot call the real endpoint; these fixtures reproduce its exact shape
// (pymodules/planet_renderer/api_endpoints.py::_get_system_rendering_data) and go through
// the same `adaptSystemPayload`, so the adapter is exercised, not bypassed.

import type { RawSystemResponse } from "../3DComponents/realistic3/systemAdapter.ts";

export interface FixturePlanet {
  name: string;
  planet_type: string;
  diameter: number; // km
  orbital_radius: number; // AU
  orbital_period_seconds: number;
  rotation_period_seconds: number;
  axial_tilt: number;
  surface_temperature: number;
  atmosphere: string;
  life_forms: string;
  eccentricity_factor: number;
}

export interface Fixture {
  id: string;
  label: string;
  stars: Array<{ Type: string; Color: string; Size: string }>;
  planets: FixturePlanet[];
}

const YEAR = 31557600;

export const FIXTURES: Fixture[] = [
  {
    id: "sol-like",
    label: "类太阳 · 6 行星",
    stars: [{ Type: "Yellow Dwarf", Color: "yellow", Size: "1" }],
    planets: [
      { name: "Cinder", planet_type: "Lava", diameter: 4879, orbital_radius: 0.32, orbital_period_seconds: YEAR * 0.24, rotation_period_seconds: 5067360, axial_tilt: 0.03, surface_temperature: 430, atmosphere: "None", life_forms: "None", eccentricity_factor: 0.2 },
      { name: "Vesper", planet_type: "Desert", diameter: 12104, orbital_radius: 0.61, orbital_period_seconds: YEAR * 0.62, rotation_period_seconds: 20997360, axial_tilt: 177, surface_temperature: 90, atmosphere: "Carbon Dioxide", life_forms: "None", eccentricity_factor: 0.01 },
      { name: "Terra", planet_type: "Oceanic", diameter: 12742, orbital_radius: 1.0, orbital_period_seconds: YEAR, rotation_period_seconds: 86164, axial_tilt: 23.4, surface_temperature: 14, atmosphere: "Nitrogen", life_forms: "Carbon-based", eccentricity_factor: 0.02 },
      { name: "Rust", planet_type: "Arid", diameter: 6779, orbital_radius: 1.52, orbital_period_seconds: YEAR * 1.88, rotation_period_seconds: 88643, axial_tilt: 25, surface_temperature: -63, atmosphere: "Thin", life_forms: "Microbial", eccentricity_factor: 0.09 },
      { name: "Jove", planet_type: "Gas Giant", diameter: 139820, orbital_radius: 5.2, orbital_period_seconds: YEAR * 11.9, rotation_period_seconds: 35730, axial_tilt: 3.1, surface_temperature: -110, atmosphere: "Hydrogen", life_forms: "None", eccentricity_factor: 0.05 },
      { name: "Frost", planet_type: "Frozen Gas Giant", diameter: 50724, orbital_radius: 9.6, orbital_period_seconds: YEAR * 29.4, rotation_period_seconds: 57996, axial_tilt: 97, surface_temperature: -190, atmosphere: "Methane", life_forms: "None", eccentricity_factor: 0.01 },
    ],
  },
  {
    id: "binary",
    label: "双恒星 · 4 行星",
    stars: [
      { Type: "Blue Giant", Color: "blue", Size: "2.6" },
      { Type: "Red Dwarf", Color: "red", Size: "0.4" },
    ],
    planets: [
      { name: "Ember", planet_type: "Molten Core", diameter: 9800, orbital_radius: 0.9, orbital_period_seconds: YEAR * 0.4, rotation_period_seconds: 172800, axial_tilt: 4, surface_temperature: 1100, atmosphere: "Superheated", life_forms: "None", eccentricity_factor: 0.12 },
      { name: "Ash", planet_type: "Rocky", diameter: 5400, orbital_radius: 2.4, orbital_period_seconds: YEAR * 1.4, rotation_period_seconds: 98000, axial_tilt: 12, surface_temperature: 240, atmosphere: "Thin", life_forms: "None", eccentricity_factor: 0.07 },
      { name: "Lumen", planet_type: "Oceanic", diameter: 13200, orbital_radius: 4.8, orbital_period_seconds: YEAR * 3.9, rotation_period_seconds: 72000, axial_tilt: 19, surface_temperature: 28, atmosphere: "Oxygen-Rich", life_forms: "Carbon-based", eccentricity_factor: 0.03 },
      { name: "Bloom", planet_type: "Exotic", diameter: 41000, orbital_radius: 8.2, orbital_period_seconds: YEAR * 8.7, rotation_period_seconds: 45000, axial_tilt: 41, surface_temperature: 5, atmosphere: "Exotic Gases", life_forms: "Exotic", eccentricity_factor: 0.05 },
    ],
  },
  {
    id: "compact",
    label: "红矮星 · 3 行星（紧凑）",
    stars: [{ Type: "Red Dwarf", Color: "red", Size: "0.3" }],
    planets: [
      { name: "Tick", planet_type: "Icy", diameter: 3100, orbital_radius: 0.08, orbital_period_seconds: YEAR * 0.02, rotation_period_seconds: 43200, axial_tilt: 2, surface_temperature: -120, atmosphere: "Thin", life_forms: "None", eccentricity_factor: 0.02 },
      { name: "Tock", planet_type: "Tundra", diameter: 6200, orbital_radius: 0.14, orbital_period_seconds: YEAR * 0.05, rotation_period_seconds: 61000, axial_tilt: 9, surface_temperature: -40, atmosphere: "Nitrogen", life_forms: "Microbial", eccentricity_factor: 0.01 },
      { name: "Rill", planet_type: "Swamp", diameter: 11400, orbital_radius: 0.22, orbital_period_seconds: YEAR * 0.11, rotation_period_seconds: 80000, axial_tilt: 15, surface_temperature: 12, atmosphere: "Methane", life_forms: "Carbon-based", eccentricity_factor: 0.04 },
    ],
  },
];

/** The fixture as the endpoint would send it (angles already advanced to "now"). */
export function fixtureToPayload(fixture: Fixture, now = Date.now() / 1000): RawSystemResponse {
  const cosmicOrigin = now - 4.2e9;
  const maxOrbitalRadius = Math.max(...fixture.planets.map((planet) => planet.orbital_radius));
  return {
    success: true,
    system_name: fixture.id,
    system_data: {
      name: fixture.label,
      star_system_type: fixture.stars.length > 1 ? "Binary" : "Single",
      num_planets: fixture.planets.length,
      stars: fixture.stars,
      planets: fixture.planets.map((planet) => {
        const omega = (2 * Math.PI) / planet.orbital_period_seconds;
        // A spread of starting angles so the orbits are not lined up
        const initialAngle = (planet.name.length * 1.37) % (2 * Math.PI);
        return {
          ...planet,
          mass: 1,
          density: 5.5,
          gravity: 9.8,
          orbital_speed: 0,
          elements: [],
          initial_orbital_angle: initialAngle,
          current_orbital_angle: (initialAngle + omega * (now - cosmicOrigin)) % (2 * Math.PI),
          relative_orbital_radius: planet.orbital_radius / maxOrbitalRadius,
        };
      }),
      timing: {
        cosmic_origin_time: cosmicOrigin,
        current_time: now,
        max_orbital_radius: maxOrbitalRadius,
        system_planets_count: fixture.planets.length,
      },
    },
  };
}

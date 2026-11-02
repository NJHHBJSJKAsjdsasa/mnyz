// atlas-ui/react/static/js/3DComponents/realistic3/systemTypes.ts
//
// The type half of upstream's `Explore/api.ts` (3.0.2), copied verbatim so the vendored
// `SystemLayer.ts` can keep its data contract without dragging in the explorer's fetch
// layer. Only shapes live here — no network code.
//
// Where the data actually comes from in this repo is `systemAdapter.ts`, which maps
// 2.x's `/api/system/rendering-data` onto these shapes.

export type Coordinates = [number, number, number];

export interface StarInfo {
  Type: string;
  Color: string;
  Size: number;
}

export interface SystemSummary {
  index: number;
  name: string;
  star_system_type: string;
  num_planets: number;
  stars: StarInfo[];
}

export interface PlanetDetail {
  index: number;
  name: string;
  planet_type: string;
  diameter: number;
  mass: number;
  density: number;
  gravity: number;
  orbital_radius: number;
  orbital_period_seconds: number;
  orbital_speed: number;
  axial_tilt: number;
  rotation_period_seconds: number;
  surface_temperature: number;
  // The type's temperature at the mean distance, and the atmosphere's factor on it: with
  // them its temperature anywhere along its orbit (planetTemperatureAt)
  mean_temperature?: number;
  atmosphere_factor?: number;
  atmosphere: string;
  life_forms: string;
  elements: string[];
  eccentricity_factor: number;
  initial_orbital_angle: number;
  current_orbital_angle: number;
  relative_orbital_radius: number;
  stargate_url: string;
}

export interface SystemDetail extends SystemSummary {
  planets: PlanetDetail[];
  max_orbital_radius: number;
  stargate_url: string;
}

export interface Timing {
  cosmic_origin_time: number;
  current_time: number;
}

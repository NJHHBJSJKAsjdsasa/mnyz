// atlas-ui/react/static/js/Shell/railFilter.ts — one definition of "matches".
//
// The rail both filters its list and reports how many rows survived, and those
// two must agree. Keeping the predicate here rather than in the components means
// the count in the search box cannot drift from the rows rendered.

export interface SystemLike {
  name: string;
  number: number;
}

export interface PlanetLike {
  name: string;
}

export const normalizeQuery = (query: string): string => query.trim().toLowerCase();

/** Name substring, or the system's number — `#42` should find system #42. */
export const matchesSystem = (system: SystemLike, needle: string): boolean =>
  !needle || system.name.toLowerCase().includes(needle) || String(system.number).includes(needle);

export const matchesPlanet = (planet: PlanetLike, needle: string): boolean =>
  !needle || planet.name.toLowerCase().includes(needle);

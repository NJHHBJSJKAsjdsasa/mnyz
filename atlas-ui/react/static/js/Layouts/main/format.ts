// Layouts/main/format.ts — page-local helpers; the two generic formatters live in
// `Utils/format.ts` and are re-exported here so page code has one import site.

export { formatCosmicTime, formatResource } from "../../Utils/format.ts";

export interface Coordinates {
  x: number;
  y: number;
  z: number;
}

/** Distance from the origin (1_000_000, 1_000_000, 1_000_000) in coordinate units. */
export const distanceFromOrigin = (coordinates: Coordinates): number =>
  Math.floor(
    Math.sqrt(
      Math.pow(coordinates.x - 1_000_000, 2) +
        Math.pow(coordinates.y - 1_000_000, 2) +
        Math.pow(coordinates.z - 1_000_000, 2),
    ),
  );

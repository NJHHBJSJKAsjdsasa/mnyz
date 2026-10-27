// atlas-ui/react/static/js/Utils/SectorMath.tsx
// Pure sector arithmetic, kept free of imports so both the sector store and the
// cosmic-event roll can use it without creating an import cycle.

export const SECTOR_SPAN = 1_000_000;

export interface SectorCoord {
  key: string;
  x: number;
  y: number;
  z: number;
}

/**
 * Planet keys look like `planet_1,2,3_0_name`; recover the coordinates from the
 * second segment so systems that only receive a key can still scope by sector.
 */
export const coordinatesFromKey = (planetKey: string): string => {
  const parts = (planetKey ?? "").split("_");
  return parts.length >= 2 ? parts[1] : "";
};

/** "x,y,z" → the 10×10×10 sector it falls in (clamped). */
export const sectorOf = (coordinates: string): SectorCoord => {
  const parts = (coordinates ?? "").split(",").map((value) => Number(value.trim()));
  const axis = (value: number | undefined) =>
    Math.max(0, Math.min(9, Math.floor((Number.isFinite(value) ? (value as number) : 0) / SECTOR_SPAN)));

  const x = axis(parts[0]);
  const y = axis(parts[1]);
  const z = axis(parts[2]);
  return { key: `${x}-${y}-${z}`, x, y, z };
};

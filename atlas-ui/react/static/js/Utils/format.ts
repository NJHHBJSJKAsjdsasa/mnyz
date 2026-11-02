// Utils/format.ts — the two number/date formatters the HUD needs everywhere.
//
// `formatResource` existed verbatim in FuelBars, ResourceStatusBar and the main
// layout (2026-10-29); three copies of "1.23M" is how the fourth one ends up
// printing "1.2 M". One implementation, imported.

/** 1234 → "1.2k", 1_234_567 → "1.23M". */
export const formatResource = (value: number): string => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toString();
};

/** Unix seconds → "YYYY-MM-DD HH:MM:SS" in the browser's zone. */
export const formatCosmicTime = (timestamp: number): string => {
  if (!timestamp) return "Unknown Origin";
  const date = new Date(timestamp * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

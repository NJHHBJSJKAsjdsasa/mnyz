// Components/planet/format.ts — the four display formatters PlanetInfo and its
// sub-components share. Extracted 2026-10-29 (05 §3.1 PlanetInfo 拆分).

export const formatPeriod = (seconds: number) => {
  const days = seconds / (60 * 60 * 24);
  if (days < 30) {
    return `${days.toFixed(2)} 天`;
  } else if (days < 365) {
    return `${(days / 30).toFixed(2)} 月`;
  } else {
    return `${(days / 365).toFixed(2)} 年`;
  }
};

export const formatTemperature = (celsius: number) => {
  const fahrenheit = (celsius * 9) / 5 + 32;
  return `${celsius.toFixed(1)}°C (${fahrenheit.toFixed(1)}°F)`;
};

export const formatMass = (mass: number) => {
  return `${mass.toExponential(2)} kg`;
};

export const formatDistance = (distance: number) => {
  return `${distance.toFixed(2)} km`;
};

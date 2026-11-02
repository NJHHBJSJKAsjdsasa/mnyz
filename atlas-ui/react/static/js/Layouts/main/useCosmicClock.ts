// Layouts/main/useCosmicClock.ts — "bits since the big bang" readout.
//
// The universe is 1.9M years old at most (see MAX_UNIVERSE_AGE_SECONDS), and the
// page shows how far it has come with 15 decimals. That string has to be
// recomputed every second, so it rides the shared clock (`Utils/clock.tsx`) —
// one timer for the whole app, paused while the tab is hidden.

import { useEffect, useState } from "react";
import { subscribeClock } from "../../Utils/clock.tsx";

/** 1.9M years, in seconds. The denominator of the "development" percentage. */
export const MAX_UNIVERSE_AGE_SECONDS = 1_900_000 * 365.25 * 24 * 60 * 60;

export const calculateUniverseAge = (cosmicOriginTime: number): { age: string; development: string } => {
  const ageInSeconds = Math.floor(Date.now() / 1000) - cosmicOriginTime;
  if (ageInSeconds < 0) return { age: "Not yet born", development: "0%" };

  const years = Math.floor(ageInSeconds / (365.25 * 24 * 60 * 60));
  const days = Math.floor((ageInSeconds % (365.25 * 24 * 60 * 60)) / (24 * 60 * 60));
  const hours = Math.floor((ageInSeconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((ageInSeconds % (60 * 60)) / 60);
  const seconds = Math.floor(ageInSeconds % 60);

  const parts: string[] = [];
  if (years > 0) parts.push(`${years}Y`);
  if (days > 0) parts.push(`${days}D`);
  if (hours > 0) parts.push(`${hours}H`);
  if (minutes > 0) parts.push(`${minutes}M`);
  parts.push(`${seconds}S`);

  const percentage = (ageInSeconds / MAX_UNIVERSE_AGE_SECONDS) * 100;
  const development = `${percentage.toFixed(15).replace(/0+$/, "").replace(/\.$/, "")}%`;

  return { age: parts.join(" "), development };
};

export interface CosmicClock {
  age: string;
  development: string;
}

export const useCosmicClock = (cosmicOriginTime?: number): CosmicClock => {
  const [age, setAge] = useState("");
  const [development, setDevelopment] = useState("");

  useEffect(() => {
    if (!cosmicOriginTime) return;
    return subscribeClock(() => {
      const next = calculateUniverseAge(cosmicOriginTime);
      setAge(next.age);
      setDevelopment(next.development);
    });
  }, [cosmicOriginTime]);

  return { age, development };
};

export default useCosmicClock;

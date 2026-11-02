// Utils/arecibo/figures/lifeFormData.ts — Deterministic height and population figures derived from the planet name.
// Lifted verbatim from LifeAreciboTranslator.tsx (05 §3.1 split, 2026-10-29).

import { getLifeCategory } from "../data.ts";
import { createSeededRandom, hashString } from "../primitives.ts";

export function generateLifeFormHeight(lifeForm: string, planetName: string): number {
  if (lifeForm === "Intelligent Life") {
    const hash = hashString(lifeForm + planetName);
    const rng = createSeededRandom(hash);

    const heightVariations = [12, 14, 18, 22, 26];

    const index = Math.floor(rng.random() * heightVariations.length);
    return heightVariations[index];
  }

  const category = getLifeCategory(lifeForm);
  const hash = hashString(lifeForm + planetName);
  const rng = createSeededRandom(hash);

  switch (category) {
    case "carbon-based":
      return Math.floor(10 + rng.random() * 15);
    case "silicon-based":
      return Math.floor(25 + rng.random() * 25);
    case "robotic":
      return Math.floor(5 + rng.random() * 95);
    case "gaseous":
      return Math.floor(100 + rng.random() * 100);
    case "energy":
      return Math.floor(1 + rng.random() * 9);
    case "divine":
      return Math.floor(200 + rng.random() * 55);
    default:
      return Math.floor(12 + rng.random() * 6);
  }
}

export function generatePlanetaryPopulation(lifeForm: string, planetName: string): number {
  const category = getLifeCategory(lifeForm);
  const combinedHash = hashString(lifeForm + planetName);
  const rng = createSeededRandom(combinedHash);

  switch (category) {
    case "carbon-based":
      return Math.floor(1000000000 + rng.random() * 9000000000);
    case "silicon-based":
      return Math.floor(100000000 + rng.random() * 1900000000);
    case "robotic":
      return Math.floor(1000000 + rng.random() * 4999000000);
    case "gaseous":
      return Math.floor(10000000 + rng.random() * 490000000);
    case "energy":
      return Math.floor(100000 + rng.random() * 49900000);
    case "divine":
      return 1;
    default:
      return Math.floor(3000000000 + rng.random() * 3000000000);
  }
}

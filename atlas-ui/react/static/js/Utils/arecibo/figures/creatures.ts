// Utils/arecibo/figures/creatures.ts — Animal / plant / bacteria variants for carbon-based worlds.
// Lifted verbatim from LifeAreciboTranslator.tsx (05 §3.1 split, 2026-10-29).

import { COLORS, setPixel } from "../primitives.ts";

export function drawAnimalForm(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number, rng: { random: () => number }): void {
  const animalType = Math.floor(rng.random() * 5);

  switch (animalType) {
    case 0:
      drawQuadrupedMammal(bitmap, colorMap, centerCol, startRow);
      break;
    case 1:
      drawBirdForm(bitmap, colorMap, centerCol, startRow);
      break;
    case 2:
      drawFishForm(bitmap, colorMap, centerCol, startRow);
      break;
    case 3:
      drawInsectForm(bitmap, colorMap, centerCol, startRow);
      break;
    case 4:
      drawReptileForm(bitmap, colorMap, centerCol, startRow);
      break;
  }
}

export function drawQuadrupedMammal(bitmap: number[], colorMap: number[], centerCol: number, startRow: number): void {
  setPixel(bitmap, colorMap, centerCol - 2, startRow, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 2, startRow + 1, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol - 1, startRow + 1, 1, COLORS.RED);

  for (let c = 0; c <= 2; c++) {
    setPixel(bitmap, colorMap, centerCol + c, startRow + 2, 1, COLORS.RED);
    setPixel(bitmap, colorMap, centerCol + c, startRow + 3, 1, COLORS.RED);
  }

  setPixel(bitmap, colorMap, centerCol, startRow + 4, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 2, startRow + 4, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 5, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 2, startRow + 5, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol + 3, startRow + 2, 1, COLORS.RED);
}

export function drawBirdForm(bitmap: number[], colorMap: number[], centerCol: number, startRow: number): void {
  setPixel(bitmap, colorMap, centerCol - 1, startRow, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol - 2, startRow, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 2, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol - 2, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 2, startRow + 1, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol, startRow + 3, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 4, 1, COLORS.RED);
}

export function drawFishForm(bitmap: number[], colorMap: number[], centerCol: number, startRow: number): void {
  setPixel(bitmap, colorMap, centerCol - 2, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 2, startRow + 2, 1, COLORS.RED);

  for (let c = -1; c <= 2; c++) {
    setPixel(bitmap, colorMap, centerCol + c, startRow + 2, 1, COLORS.RED);
  }

  setPixel(bitmap, colorMap, centerCol - 1, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 3, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 3, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol + 3, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 3, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 3, startRow + 3, 1, COLORS.RED);
}

export function drawInsectForm(bitmap: number[], colorMap: number[], centerCol: number, startRow: number): void {
  setPixel(bitmap, colorMap, centerCol - 1, startRow, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol, startRow + 1, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol + 1, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 2, startRow + 3, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol - 1, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 3, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 2, startRow + 4, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol - 2, startRow, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow, 1, COLORS.RED);
}

export function drawReptileForm(bitmap: number[], colorMap: number[], centerCol: number, startRow: number): void {
  setPixel(bitmap, colorMap, centerCol - 2, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 1, startRow, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 1, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 3, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 4, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 2, startRow + 5, 1, COLORS.RED);
}

export function drawBacteriaForm(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number, rng: { random: () => number }): void {
  const bacteriaType = Math.floor(rng.random() * 7);

  switch (bacteriaType) {
    case 0:
      drawCoccusBacteria(bitmap, colorMap, centerCol, startRow, height);
      break;
    case 1:
      drawBacillusBacteria(bitmap, colorMap, centerCol, startRow, height);
      break;
    case 2:
      drawSpirillusBacteria(bitmap, colorMap, centerCol, startRow, height);
      break;
    case 3:
      drawStreptococcusBacteria(bitmap, colorMap, centerCol, startRow, height);
      break;
    case 4:
      drawStaphylococcusBacteria(bitmap, colorMap, centerCol, startRow, height);
      break;
    case 5:
      drawVibroBacteria(bitmap, colorMap, centerCol, startRow, height);
      break;
    default:
      drawFilamentousBacteria(bitmap, colorMap, centerCol, startRow, height);
  }
}

export function drawCoccusBacteria(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 3, 1, COLORS.RED);
}

export function drawBacillusBacteria(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  for (let r = 0; r < Math.min(5, height); r++) {
    setPixel(bitmap, colorMap, centerCol, startRow + r, 1, COLORS.RED);
    if (r === 1 || r === 3) {
      setPixel(bitmap, colorMap, centerCol - 1, startRow + r, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol + 1, startRow + r, 1, COLORS.RED);
    }
  }
}

export function drawSpirillusBacteria(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  setPixel(bitmap, colorMap, centerCol - 1, startRow, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 3, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 4, 1, COLORS.RED);
}

export function drawStreptococcusBacteria(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  setPixel(bitmap, colorMap, centerCol, startRow, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 3, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 3, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 4, 1, COLORS.RED);
}

export function drawStaphylococcusBacteria(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  setPixel(bitmap, colorMap, centerCol, startRow, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 3, 1, COLORS.RED);
}

export function drawVibroBacteria(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  setPixel(bitmap, colorMap, centerCol - 1, startRow, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 3, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 4, 1, COLORS.RED);
}

export function drawFilamentousBacteria(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  for (let r = 0; r < Math.min(6, height); r++) {
    setPixel(bitmap, colorMap, centerCol, startRow + r, 1, COLORS.RED);
    if (r === 2) {
      setPixel(bitmap, colorMap, centerCol - 1, startRow + r, 1, COLORS.RED);
    }
    if (r === 4) {
      setPixel(bitmap, colorMap, centerCol + 1, startRow + r, 1, COLORS.RED);
    }
  }
}

export function drawVegetationForm(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number, rng: { random: () => number }): void {
  const hash = Math.floor(rng.random() * 6);

  switch (hash) {
    case 0:
      drawTreeForm(bitmap, colorMap, centerCol, startRow, height);
      break;
    case 1:
      drawBushForm(bitmap, colorMap, centerCol, startRow, height);
      break;
    case 2:
      drawPalmTreeForm(bitmap, colorMap, centerCol, startRow, height);
      break;
    case 3:
      drawFlowerForm(bitmap, colorMap, centerCol, startRow, height);
      break;
    case 4:
      drawConiferForm(bitmap, colorMap, centerCol, startRow, height);
      break;
    default:
      drawFernForm(bitmap, colorMap, centerCol, startRow, height);
  }
}

export function drawTreeForm(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  setPixel(bitmap, colorMap, centerCol - 1, startRow, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol - 2, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 2, startRow + 1, 1, COLORS.RED);

  for (let r = 2; r < height - 1; r++) {
    setPixel(bitmap, colorMap, centerCol, startRow + r, 1, COLORS.RED);
  }

  setPixel(bitmap, colorMap, centerCol - 1, startRow + height - 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + height - 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + height - 1, 1, COLORS.RED);
}

export function drawBushForm(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  const midHeight = Math.floor(height / 2);

  for (let r = 0; r < midHeight; r++) {
    const width = Math.max(1, 3 - Math.abs(r - 1));
    for (let c = -width; c <= width; c++) {
      if (Math.abs(c) <= width) {
        setPixel(bitmap, colorMap, centerCol + c, startRow + r, 1, COLORS.RED);
      }
    }
  }

  for (let r = midHeight; r < height - 1; r++) {
    setPixel(bitmap, colorMap, centerCol, startRow + r, 1, COLORS.RED);
  }

  setPixel(bitmap, colorMap, centerCol - 1, startRow + height - 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + height - 1, 1, COLORS.RED);
}

export function drawPalmTreeForm(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  setPixel(bitmap, colorMap, centerCol - 3, startRow, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 1, startRow, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 3, startRow, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol - 2, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 2, startRow + 1, 1, COLORS.RED);

  for (let r = 2; r < height - 1; r++) {
    const offset = r % 2 === 0 ? 0 : r % 4 === 2 ? 1 : -1;
    setPixel(bitmap, colorMap, centerCol + offset, startRow + r, 1, COLORS.RED);
  }

  setPixel(bitmap, colorMap, centerCol - 1, startRow + height - 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + height - 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + height - 1, 1, COLORS.RED);
}

export function drawFlowerForm(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  setPixel(bitmap, colorMap, centerCol, startRow - 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 1, startRow, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 1, 1, COLORS.RED);

  for (let r = 2; r < height - 1; r++) {
    setPixel(bitmap, colorMap, centerCol, startRow + r, 1, COLORS.RED);
  }

  setPixel(bitmap, colorMap, centerCol, startRow + height - 1, 1, COLORS.RED);
}

export function drawConiferForm(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  const midHeight = Math.floor(height * 0.8);

  for (let r = 0; r < midHeight; r++) {
    const width = Math.min(2, Math.floor(r / 2));
    for (let c = -width; c <= width; c++) {
      setPixel(bitmap, colorMap, centerCol + c, startRow + r, 1, COLORS.RED);
    }
  }

  for (let r = midHeight; r < height - 1; r++) {
    setPixel(bitmap, colorMap, centerCol, startRow + r, 1, COLORS.RED);
  }

  setPixel(bitmap, colorMap, centerCol, startRow + height - 1, 1, COLORS.RED);
}

export function drawFernForm(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  setPixel(bitmap, colorMap, centerCol - 2, startRow, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 2, startRow, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol - 1, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 2, 1, COLORS.RED);

  for (let r = 3; r < height - 1; r++) {
    setPixel(bitmap, colorMap, centerCol, startRow + r, 1, COLORS.RED);
  }

  setPixel(bitmap, colorMap, centerCol - 1, startRow + height - 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + height - 1, 1, COLORS.RED);
}

export function drawVegetableAnimalForm(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number, rng: { random: () => number }): void {
  const hybridType = Math.floor(rng.random() * 6);

  switch (hybridType) {
    case 0:
      drawTreentHybrid(bitmap, colorMap, centerCol, startRow, height);
      break;
    case 1:
      drawCoralAnimalHybrid(bitmap, colorMap, centerCol, startRow, height);
      break;
    case 2:
      drawWalkingPlantHybrid(bitmap, colorMap, centerCol, startRow, height);
      break;
    case 3:
      drawPhotosynthethicAnimalHybrid(bitmap, colorMap, centerCol, startRow, height);
      break;
    case 4:
      drawMyceliaNeuralHybrid(bitmap, colorMap, centerCol, startRow, height);
      break;
    default:
      drawFlowerBeastHybrid(bitmap, colorMap, centerCol, startRow, height);
  }
}

export function drawTreentHybrid(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  setPixel(bitmap, colorMap, centerCol - 1, startRow, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 1, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol - 2, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 2, startRow + 2, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol, startRow + 3, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 4, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol - 1, startRow + 5, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 5, 1, COLORS.RED);
}

export function drawCoralAnimalHybrid(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  setPixel(bitmap, colorMap, centerCol, startRow, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 1, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol - 2, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 2, startRow + 2, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol - 1, startRow + 3, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 3, 1, COLORS.RED);
}

export function drawWalkingPlantHybrid(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  setPixel(bitmap, colorMap, centerCol - 1, startRow, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 2, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 2, startRow + 2, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol, startRow + 3, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 4, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 4, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 5, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 5, 1, COLORS.RED);
}

export function drawPhotosynthethicAnimalHybrid(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  setPixel(bitmap, colorMap, centerCol, startRow, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol - 2, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 2, startRow + 1, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 3, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol - 1, startRow + 4, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 4, 1, COLORS.RED);
}

export function drawMyceliaNeuralHybrid(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  setPixel(bitmap, colorMap, centerCol, startRow, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 1, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol - 2, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 2, startRow + 2, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol - 1, startRow + 3, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 3, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 4, 1, COLORS.RED);
}

export function drawFlowerBeastHybrid(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  setPixel(bitmap, colorMap, centerCol, startRow - 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 1, startRow, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 1, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol, startRow, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 3, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol - 1, startRow + 4, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 4, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 4, 1, COLORS.RED);
}

export function addRandomFeatures(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number, rng: { random: () => number }): void {
  for (let i = 0; i < 3; i++) {
    const randomRow = startRow + Math.floor(rng.random() * height);
    const randomCol = centerCol + Math.floor(rng.random() * 6) - 3;

    if (rng.random() < 0.5) {
      setPixel(bitmap, colorMap, randomCol, randomRow, 1, COLORS.RED);
    }
  }
}

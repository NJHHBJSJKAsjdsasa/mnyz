// Utils/arecibo/figures/lifeForm.ts — Silhouettes of the transmitting organism, one per life family.
// Lifted verbatim from LifeAreciboTranslator.tsx (05 §3.1 split, 2026-10-29).

import { getEnergyPattern, getLifeCategory, getNitrogenBases } from "../data.ts";
import { drawAnimalForm, drawBacteriaForm, drawVegetableAnimalForm, drawVegetationForm } from "./creatures.ts";
import { generateLifeFormHeight, generatePlanetaryPopulation } from "./lifeFormData.ts";
import { COLORS, createSeededRandom, hashString, setPixel } from "../primitives.ts";

export function drawLifeFormSection(bitmap: number[], colorMap: number[], lifeForm: string, planetName: string, startRow: number, height: number): void {
  drawLifeFormHeight(bitmap, colorMap, lifeForm, planetName, startRow, height);

  drawLifeFormRepresentation(bitmap, colorMap, lifeForm, planetName, startRow, height);

  drawLifeFormPopulation(bitmap, colorMap, lifeForm, planetName, startRow, height);
}

export function drawLifeFormHeight(bitmap: number[], colorMap: number[], lifeForm: string, planetName: string, startRow: number, height: number): void {
  if (lifeForm === "Have I just found God?") {
    return;
  }

  const heightValue = generateLifeFormHeight(lifeForm, planetName);

  const barCol = 3;

  const binaryHeight = heightValue.toString(2);
  const barMiddleRow = startRow + Math.floor(height / 2);
  const binaryStartCol = barCol - 2;

  const barHeight = height;

  for (let i = 0; i < barHeight; i++) {
    const currentRow = startRow + i;
    if (currentRow === barMiddleRow - 1 || currentRow === barMiddleRow || currentRow === barMiddleRow + 1) {
      continue;
    }
    setPixel(bitmap, colorMap, barCol, currentRow, 1, COLORS.BLUE);
  }

  setPixel(bitmap, colorMap, binaryStartCol, barMiddleRow, 1, COLORS.WHITE);

  for (let i = 0; i < binaryHeight.length && i < 4; i++) {
    const bit = parseInt(binaryHeight[i]);

    const bitCol = binaryStartCol + 1 + i;

    if (bitCol === barCol) {
      continue;
    }

    if (bit === 1) {
      setPixel(bitmap, colorMap, bitCol, barMiddleRow, 1, COLORS.WHITE);
    }
  }
}

export function drawLifeFormRepresentation(bitmap: number[], colorMap: number[], lifeForm: string, planetName: string, startRow: number, height: number): void {
  const category = getLifeCategory(lifeForm);

  const centerCols = [8, 9, 10, 11, 12, 13, 14];
  const centerCol = centerCols[Math.floor(centerCols.length / 2)];

  if (lifeForm === "Intelligent Life") {
    const hash = hashString(lifeForm + planetName);
    const rng = createSeededRandom(hash);

    const headType = Math.floor(rng.random() * 5);
    const torsoType = Math.floor(rng.random() * 5);
    const legsType = Math.floor(rng.random() * 5);

    drawModularLifeForm(bitmap, colorMap, centerCol, startRow, height, headType, torsoType, legsType);
  } else {
    const hash = hashString(lifeForm + planetName);
    const rng = createSeededRandom(hash);

    switch (category) {
      case "carbon-based":
        drawCarbonBasedForm(bitmap, colorMap, centerCols, centerCol, startRow, height, lifeForm, rng);
        break;
      case "silicon-based":
        drawSiliconBasedForm(bitmap, colorMap, centerCols, centerCol, startRow, height, rng);
        break;
      case "robotic":
        drawRoboticForm(bitmap, colorMap, centerCols, centerCol, startRow, height, rng);
        break;
      case "gaseous":
        drawGaseousForm(bitmap, colorMap, centerCols, centerCol, startRow, height, rng);
        break;
      case "energy":
        drawEnergyForm(bitmap, colorMap, centerCols, centerCol, startRow, height, rng, lifeForm, planetName);
        break;
      case "divine":
        drawDivineForm(bitmap, colorMap, centerCols, centerCol, startRow, height, rng);
        break;
      default:
        drawHumanoidForm(bitmap, colorMap, centerCols, centerCol, startRow, height);
    }
  }
}

export function drawLifeFormPopulation(bitmap: number[], colorMap: number[], lifeForm: string, planetName: string, startRow: number, height: number): void {
  const population = generatePlanetaryPopulation(lifeForm, planetName);

  const binaryPopulation = population.toString(2);

  const startCol = 16;
  const maxCols = 6;
  const maxRows = height;

  let bitIndex = binaryPopulation.length - 1;

  for (let row = 0; row < maxRows && bitIndex >= 0; row++) {
    for (let col = 0; col < maxCols && bitIndex >= 0; col++) {
      const bit = parseInt(binaryPopulation[bitIndex]);

      if (bit === 1) {
        setPixel(bitmap, colorMap, startCol + col, startRow + row, 1, COLORS.WHITE);
      }

      bitIndex--;
    }
  }
}

export function drawModularLifeForm(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number, headType: number, torsoType: number, legsType: number): void {
  drawHead(bitmap, colorMap, centerCol, startRow, headType);
  drawTorso(bitmap, colorMap, centerCol, startRow + 3, torsoType);
  drawLegs(bitmap, colorMap, centerCol, startRow + 6, legsType);
}

export function drawHead(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, headType: number): void {
  switch (headType) {
    case 0:
      setPixel(bitmap, colorMap, centerCol, startRow, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol - 1, startRow + 1, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol, startRow + 1, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol + 1, startRow + 1, 1, COLORS.RED);
      break;

    case 1:
      setPixel(bitmap, colorMap, centerCol, startRow, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol - 1, startRow + 1, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol + 1, startRow + 1, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol - 1, startRow + 2, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol, startRow + 2, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol + 1, startRow + 2, 1, COLORS.RED);
      break;

    case 2:
      for (let r = 0; r < 3; r++) {
        for (let c = -1; c <= 1; c++) {
          setPixel(bitmap, colorMap, centerCol + c, startRow + r, 1, COLORS.RED);
        }
      }
      break;

    case 3:
      setPixel(bitmap, colorMap, centerCol, startRow, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol, startRow + 1, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol - 1, startRow + 2, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol, startRow + 2, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol + 1, startRow + 2, 1, COLORS.RED);
      break;

    case 4:
      setPixel(bitmap, colorMap, centerCol - 1, startRow, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol + 1, startRow, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol, startRow + 1, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol - 1, startRow + 2, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol, startRow + 2, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol + 1, startRow + 2, 1, COLORS.RED);
      break;
  }
}

export function drawTorso(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, torsoType: number): void {
  switch (torsoType) {
    case 0:
      for (let r = 0; r < 3; r++) {
        setPixel(bitmap, colorMap, centerCol, startRow + r, 1, COLORS.RED);
      }
      setPixel(bitmap, colorMap, centerCol - 1, startRow + 1, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol + 1, startRow + 1, 1, COLORS.RED);
      break;

    case 1:
      for (let r = 0; r < 3; r++) {
        for (let c = -1; c <= 1; c++) {
          setPixel(bitmap, colorMap, centerCol + c, startRow + r, 1, COLORS.RED);
        }
      }
      setPixel(bitmap, colorMap, centerCol - 2, startRow + 1, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol + 2, startRow + 1, 1, COLORS.RED);
      break;

    case 2:
      for (let r = 0; r < 3; r++) {
        setPixel(bitmap, colorMap, centerCol, startRow + r, 1, COLORS.RED);
      }
      setPixel(bitmap, colorMap, centerCol - 1, startRow, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol + 1, startRow, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol - 2, startRow + 1, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol + 2, startRow + 1, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol - 1, startRow + 2, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol + 1, startRow + 2, 1, COLORS.RED);
      break;

    case 3:
      setPixel(bitmap, colorMap, centerCol, startRow, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol, startRow + 1, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol, startRow + 2, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol - 2, startRow + 1, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol + 2, startRow + 1, 1, COLORS.RED);
      break;

    case 4:
      setPixel(bitmap, colorMap, centerCol, startRow, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol - 1, startRow + 1, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol, startRow + 1, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol + 1, startRow + 1, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol, startRow + 2, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol - 2, startRow + 1, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol + 2, startRow + 1, 1, COLORS.RED);
      break;
  }
}

export function drawLegs(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, legsType: number): void {
  switch (legsType) {
    case 0:
      for (let r = 0; r < 3; r++) {
        setPixel(bitmap, colorMap, centerCol - 1, startRow + r, 1, COLORS.RED);
        setPixel(bitmap, colorMap, centerCol + 1, startRow + r, 1, COLORS.RED);
      }
      break;

    case 1:
      for (let r = 0; r < 2; r++) {
        setPixel(bitmap, colorMap, centerCol - 1, startRow + r, 1, COLORS.RED);
        setPixel(bitmap, colorMap, centerCol + 1, startRow + r, 1, COLORS.RED);
      }
      setPixel(bitmap, colorMap, centerCol - 2, startRow + 2, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol - 1, startRow + 2, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol + 1, startRow + 2, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol + 2, startRow + 2, 1, COLORS.RED);
      break;

    case 2:
      setPixel(bitmap, colorMap, centerCol - 2, startRow, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol - 1, startRow, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol + 1, startRow, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol + 2, startRow, 1, COLORS.RED);

      setPixel(bitmap, colorMap, centerCol - 2, startRow + 1, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol - 1, startRow + 1, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol + 1, startRow + 1, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol + 2, startRow + 1, 1, COLORS.RED);

      setPixel(bitmap, colorMap, centerCol - 2, startRow + 2, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol - 1, startRow + 2, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol + 1, startRow + 2, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol + 2, startRow + 2, 1, COLORS.RED);
      break;

    case 3:
      setPixel(bitmap, colorMap, centerCol, startRow, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol, startRow + 1, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol, startRow + 2, 1, COLORS.RED);
      break;

    case 4:
      setPixel(bitmap, colorMap, centerCol - 1, startRow, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol + 1, startRow, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol - 2, startRow + 1, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol, startRow + 1, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol + 2, startRow + 1, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol - 1, startRow + 2, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol + 1, startRow + 2, 1, COLORS.RED);
      break;
  }
}

export function drawHumanoidForm(bitmap: number[], colorMap: number[], cols: number[], centerCol: number, startRow: number, height: number): void {
  setPixel(bitmap, colorMap, centerCol, startRow, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 1, 1, COLORS.RED);

  for (let r = 2; r <= 5; r++) {
    setPixel(bitmap, colorMap, centerCol, startRow + r, 1, COLORS.RED);
  }

  setPixel(bitmap, colorMap, centerCol - 1, startRow + 3, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 3, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 2, startRow + 3, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 2, startRow + 3, 1, COLORS.RED);

  for (let r = 6; r < height; r++) {
    setPixel(bitmap, colorMap, centerCol - 1, startRow + r, 1, COLORS.RED);
    setPixel(bitmap, colorMap, centerCol + 1, startRow + r, 1, COLORS.RED);
  }
}

export function drawCarbonBasedForm(bitmap: number[], colorMap: number[], cols: number[], centerCol: number, startRow: number, height: number, lifeForm: string, rng: { random: () => number }): void {
  switch (lifeForm) {
    case "Bacteria":
      drawBacteriaForm(bitmap, colorMap, centerCol, startRow, height, rng);
      break;
    case "Vegetation":
      drawVegetationForm(bitmap, colorMap, centerCol, startRow, height, rng);
      break;
    case "Animal Life":
      drawAnimalForm(bitmap, colorMap, centerCol, startRow, height, rng);
      break;
    case "Vegetable Animals":
      drawVegetableAnimalForm(bitmap, colorMap, centerCol, startRow, height, rng);
      break;
    case "Intelligent Life":
      drawHumanoidForm(bitmap, colorMap, cols, centerCol, startRow, height);
      break;
    default:
      drawHumanoidForm(bitmap, colorMap, cols, centerCol, startRow, height);
  }
}

export function drawSiliconBasedForm(bitmap: number[], colorMap: number[], cols: number[], centerCol: number, startRow: number, height: number, rng: { random: () => number }): void {
  const crystalType = Math.floor(rng.random() * 7);

  switch (crystalType) {
    case 0:
      drawQuartzCrystal(bitmap, colorMap, centerCol, startRow, height);
      break;
    case 1:
      drawFeldsparStructure(bitmap, colorMap, centerCol, startRow, height);
      break;
    case 2:
      drawOlivineNetwork(bitmap, colorMap, centerCol, startRow, height);
      break;
    case 3:
      drawZeoliteFramework(bitmap, colorMap, centerCol, startRow, height);
      break;
    case 4:
      drawGarnetStructure(bitmap, colorMap, centerCol, startRow, height);
      break;
    case 5:
      drawPyroxeneChain(bitmap, colorMap, centerCol, startRow, height);
      break;
    default:
      drawSilicateMatrix(bitmap, colorMap, centerCol, startRow, height);
  }
}

export function drawQuartzCrystal(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  setPixel(bitmap, colorMap, centerCol, startRow, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 1, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol - 2, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 2, startRow + 2, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol - 2, startRow + 3, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 2, startRow + 3, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol - 1, startRow + 4, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 4, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 5, 1, COLORS.RED);
}

export function drawFeldsparStructure(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  setPixel(bitmap, colorMap, centerCol - 1, startRow, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 2, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 2, startRow + 1, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol - 1, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 2, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol, startRow + 3, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 2, startRow + 4, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 2, startRow + 4, 1, COLORS.RED);
}

export function drawOlivineNetwork(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  setPixel(bitmap, colorMap, centerCol, startRow, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol - 1, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 1, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol, startRow + 2, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol - 2, startRow + 3, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 2, startRow + 3, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol - 1, startRow + 4, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 4, 1, COLORS.RED);
}

export function drawZeoliteFramework(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  setPixel(bitmap, colorMap, centerCol - 2, startRow, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 2, startRow, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol - 1, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 1, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol - 2, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 2, startRow + 2, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol - 1, startRow + 3, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 3, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol, startRow + 4, 1, COLORS.RED);
}

export function drawGarnetStructure(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  setPixel(bitmap, colorMap, centerCol, startRow, 1, COLORS.RED);

  for (let c = -2; c <= 2; c++) {
    setPixel(bitmap, colorMap, centerCol + c, startRow + 1, 1, COLORS.RED);
  }

  setPixel(bitmap, colorMap, centerCol - 2, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 2, startRow + 2, 1, COLORS.RED);

  for (let c = -1; c <= 1; c++) {
    setPixel(bitmap, colorMap, centerCol + c, startRow + 3, 1, COLORS.RED);
  }

  setPixel(bitmap, colorMap, centerCol, startRow + 4, 1, COLORS.RED);
}

export function drawPyroxeneChain(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  for (let r = 0; r < Math.min(6, height); r++) {
    setPixel(bitmap, colorMap, centerCol, startRow + r, 1, COLORS.RED);
    if (r % 2 === 0) {
      setPixel(bitmap, colorMap, centerCol - 1, startRow + r, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol + 1, startRow + r, 1, COLORS.RED);
    }
  }
}

export function drawSilicateMatrix(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  setPixel(bitmap, colorMap, centerCol, startRow, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 1, 1, COLORS.RED);

  for (let c = -2; c <= 2; c++) {
    setPixel(bitmap, colorMap, centerCol + c, startRow + 2, 1, COLORS.RED);
  }

  setPixel(bitmap, colorMap, centerCol - 1, startRow + 3, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 3, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol, startRow + 4, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 2, startRow + 5, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 2, startRow + 5, 1, COLORS.RED);
}

export function drawRoboticForm(bitmap: number[], colorMap: number[], cols: number[], centerCol: number, startRow: number, height: number, rng: { random: () => number }): void {
  const headType = Math.floor(rng.random() * 3);
  const torsoType = Math.floor(rng.random() * 3);
  const legsType = Math.floor(rng.random() * 3);

  drawModularRoboticForm(bitmap, colorMap, centerCol, startRow, height, headType, torsoType, legsType);
}

export function drawModularRoboticForm(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number, headType: number, torsoType: number, legsType: number): void {
  switch (headType) {
    case 0:
      for (let c = -1; c <= 1; c++) {
        setPixel(bitmap, colorMap, centerCol + c, startRow, 1, COLORS.RED);
        setPixel(bitmap, colorMap, centerCol + c, startRow + 1, 1, COLORS.RED);
      }
      setPixel(bitmap, colorMap, centerCol, startRow - 1, 1, COLORS.RED);
      break;

    case 1:
      setPixel(bitmap, colorMap, centerCol, startRow, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol, startRow + 1, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol - 2, startRow, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol + 2, startRow, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol - 1, startRow + 1, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol + 1, startRow + 1, 1, COLORS.RED);
      break;

    case 2:
      setPixel(bitmap, colorMap, centerCol, startRow, 1, COLORS.RED);
      for (let c = -1; c <= 1; c++) {
        setPixel(bitmap, colorMap, centerCol + c, startRow + 1, 1, COLORS.RED);
      }
      setPixel(bitmap, colorMap, centerCol - 2, startRow + 2, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol + 2, startRow + 2, 1, COLORS.RED);
      break;
  }

  switch (torsoType) {
    case 0:
      for (let r = 3; r <= 5; r++) {
        setPixel(bitmap, colorMap, centerCol - 1, startRow + r, 1, COLORS.RED);
        setPixel(bitmap, colorMap, centerCol, startRow + r, 1, COLORS.RED);
        setPixel(bitmap, colorMap, centerCol + 1, startRow + r, 1, COLORS.RED);
      }
      setPixel(bitmap, colorMap, centerCol - 2, startRow + 4, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol + 2, startRow + 4, 1, COLORS.RED);
      break;

    case 1:
      for (let r = 3; r <= 5; r++) {
        setPixel(bitmap, colorMap, centerCol, startRow + r, 1, COLORS.RED);
      }
      setPixel(bitmap, colorMap, centerCol - 1, startRow + 3, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol + 1, startRow + 3, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol - 1, startRow + 5, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol + 1, startRow + 5, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol - 3, startRow + 4, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol + 3, startRow + 4, 1, COLORS.RED);
      break;

    case 2:
      setPixel(bitmap, colorMap, centerCol, startRow + 4, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol - 1, startRow + 3, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol + 1, startRow + 3, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol - 1, startRow + 4, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol + 1, startRow + 4, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol - 1, startRow + 5, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol + 1, startRow + 5, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol - 2, startRow + 3, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol + 2, startRow + 3, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol - 2, startRow + 5, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol + 2, startRow + 5, 1, COLORS.RED);
      break;
  }

  switch (legsType) {
    case 0:
      for (let r = 6; r < Math.min(height, 9); r++) {
        setPixel(bitmap, colorMap, centerCol - 1, startRow + r, 1, COLORS.RED);
        setPixel(bitmap, colorMap, centerCol + 1, startRow + r, 1, COLORS.RED);
      }
      break;

    case 1:
      for (let r = 6; r < Math.min(height, 9); r++) {
        setPixel(bitmap, colorMap, centerCol - 1, startRow + r, 1, COLORS.RED);
        setPixel(bitmap, colorMap, centerCol + 1, startRow + r, 1, COLORS.RED);
        if ((r - 6) % 2 === 0) {
          setPixel(bitmap, colorMap, centerCol - 2, startRow + r, 1, COLORS.RED);
          setPixel(bitmap, colorMap, centerCol + 2, startRow + r, 1, COLORS.RED);
        }
      }
      break;

    case 2:
      for (let r = 6; r < Math.min(height, 9); r++) {
        for (let c = -2; c <= 2; c++) {
          setPixel(bitmap, colorMap, centerCol + c, startRow + r, 1, COLORS.RED);
        }
        if ((r - 6) % 2 === 1) {
          setPixel(bitmap, colorMap, centerCol, startRow + r, 0, COLORS.BLACK);
        }
      }
      break;
  }
}

export function drawGaseousForm(bitmap: number[], colorMap: number[], cols: number[], centerCol: number, startRow: number, height: number, rng: { random: () => number }): void {
  const gasType = Math.floor(rng.random() * 8);

  switch (gasType) {
    case 0:
      drawGlobularGas(bitmap, colorMap, centerCol, startRow, height);
      break;
    case 1:
      drawStreamingGas(bitmap, colorMap, centerCol, startRow, height);
      break;
    case 2:
      drawTurbulentGas(bitmap, colorMap, centerCol, startRow, height);
      break;
    case 3:
      drawLayeredGas(bitmap, colorMap, centerCol, startRow, height);
      break;
    case 4:
      drawSpiralGas(bitmap, colorMap, centerCol, startRow, height);
      break;
    case 5:
      drawClusteredGas(bitmap, colorMap, centerCol, startRow, height);
      break;
    case 6:
      drawFilamentaryGas(bitmap, colorMap, centerCol, startRow, height);
      break;
    default:
      drawDiffuseGas(bitmap, colorMap, centerCol, startRow, height);
  }
}

export function drawGlobularGas(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  setPixel(bitmap, colorMap, centerCol, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 3, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol - 1, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 3, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 3, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 4, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 4, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol, startRow + 5, 1, COLORS.RED);
}

export function drawStreamingGas(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  setPixel(bitmap, colorMap, centerCol - 2, startRow + 5, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 4, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 3, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 2, startRow + 1, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol - 1, startRow + 3, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 3, 1, COLORS.RED);
}

export function drawTurbulentGas(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 2, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 3, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 2, startRow + 3, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 4, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 4, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 5, 1, COLORS.RED);
}

export function drawLayeredGas(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 1, 1, COLORS.RED);

  for (let col = centerCol - 2; col <= centerCol + 2; col++) {
    setPixel(bitmap, colorMap, col, startRow + 3, 1, COLORS.RED);
  }

  setPixel(bitmap, colorMap, centerCol - 1, startRow + 5, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 5, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 5, 1, COLORS.RED);
}

export function drawSpiralGas(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  setPixel(bitmap, colorMap, centerCol, startRow + 3, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol - 1, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 2, startRow + 3, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 2, startRow + 4, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 4, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 5, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 1, 1, COLORS.RED);
}

export function drawClusteredGas(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  setPixel(bitmap, colorMap, centerCol, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 3, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol - 2, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 2, startRow + 2, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol + 2, startRow + 4, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 2, startRow + 5, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol - 1, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 3, 1, COLORS.RED);
}

export function drawFilamentaryGas(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  for (let r = 1; r <= 5; r++) {
    setPixel(bitmap, colorMap, centerCol, startRow + r, 1, COLORS.RED);
  }

  setPixel(bitmap, colorMap, centerCol - 1, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 2, startRow + 3, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol + 1, startRow + 4, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 2, startRow + 5, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol + 1, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 5, 1, COLORS.RED);
}

export function drawDiffuseGas(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 1, 1, COLORS.RED);

  for (let r = 2; r < 5; r++) {
    setPixel(bitmap, colorMap, centerCol - 2, startRow + r, 1, COLORS.RED);
    setPixel(bitmap, colorMap, centerCol - 1, startRow + r, 1, COLORS.RED);
    setPixel(bitmap, colorMap, centerCol, startRow + r, 1, COLORS.RED);
    setPixel(bitmap, colorMap, centerCol + 1, startRow + r, 1, COLORS.RED);
    setPixel(bitmap, colorMap, centerCol + 2, startRow + r, 1, COLORS.RED);
  }

  setPixel(bitmap, colorMap, centerCol - 1, startRow + 5, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 5, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 5, 1, COLORS.RED);
}

export function drawEnergyForm(bitmap: number[], colorMap: number[], cols: number[], centerCol: number, startRow: number, height: number, rng: { random: () => number }, lifeForm: string, planetName: string): void {
  const energyStates = getNitrogenBases(lifeForm, planetName);
  const primaryState = energyStates[0];
  const manifestationType = getEnergyPattern(primaryState);

  switch (manifestationType) {
    case "wave":
      drawWaveManifesta(bitmap, colorMap, centerCol, startRow, height);
      break;
    case "spiral":
      drawSpiralField(bitmap, colorMap, centerCol, startRow, height);
      break;
    case "vortex":
      drawVortexManifesta(bitmap, colorMap, centerCol, startRow, height);
      break;
    case "pulse":
      drawPulseManifesta(bitmap, colorMap, centerCol, startRow, height);
      break;
    case "interference":
      drawInterferencePattern(bitmap, colorMap, centerCol, startRow, height);
      break;
    case "quantum":
      drawQuantumState(bitmap, colorMap, centerCol, startRow, height);
      break;
    case "dimensional":
      drawDimensionalRift(bitmap, colorMap, centerCol, startRow, height);
      break;
    case "infinite":
      drawInfiniteField(bitmap, colorMap, centerCol, startRow, height);
      break;
    default:
      drawEnergyZigzag(bitmap, colorMap, centerCol, startRow, height);
  }
}

export function drawWaveManifesta(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  for (let r = 0; r < Math.min(8, height); r++) {
    const wave = Math.round(2 * Math.sin((r * Math.PI) / 3));
    setPixel(bitmap, colorMap, centerCol + wave, startRow + r, 1, COLORS.RED);
  }
}

export function drawSpiralField(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  let angle = 0;
  for (let r = 0; r < Math.min(7, height); r++) {
    const radius = Math.floor(r / 2) + 1;
    const x = Math.round(radius * Math.cos(angle));
    const y = Math.round(radius * Math.sin(angle));
    setPixel(bitmap, colorMap, centerCol + x, startRow + r, 1, COLORS.RED);
    angle += Math.PI / 2.5;
  }
}

export function drawVortexManifesta(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  setPixel(bitmap, colorMap, centerCol, startRow + 3, 1, COLORS.RED);
  for (let ring = 1; ring <= 2; ring++) {
    for (let offset = -ring; offset <= ring; offset++) {
      if (Math.abs(offset) === ring) {
        setPixel(bitmap, colorMap, centerCol + offset, startRow + 3 - ring, 1, COLORS.RED);
        setPixel(bitmap, colorMap, centerCol + offset, startRow + 3 + ring, 1, COLORS.RED);
      }
    }
  }
}

export function drawPulseManifesta(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  for (let r = 0; r < Math.min(8, height); r += 2) {
    for (let c = -1; c <= 1; c++) {
      setPixel(bitmap, colorMap, centerCol + c, startRow + r, 1, COLORS.RED);
    }
  }
}

export function drawInterferencePattern(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  for (let r = 0; r < Math.min(7, height); r++) {
    const wave1 = Math.sin((r * Math.PI) / 2);
    const wave2 = Math.sin((r * Math.PI) / 3 + Math.PI / 4);
    const interference = wave1 + wave2;

    if (interference > 0.5) {
      setPixel(bitmap, colorMap, centerCol - 1, startRow + r, 1, COLORS.RED);
      setPixel(bitmap, colorMap, centerCol + 1, startRow + r, 1, COLORS.RED);
    }
    if (Math.abs(interference) > 1) {
      setPixel(bitmap, colorMap, centerCol, startRow + r, 1, COLORS.RED);
    }
  }
}

export function drawQuantumState(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  setPixel(bitmap, colorMap, centerCol - 2, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 2, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 4, 1, COLORS.RED);
}

export function drawDimensionalRift(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  for (let r = 1; r < 6; r++) {
    setPixel(bitmap, colorMap, centerCol, startRow + r, 1, COLORS.RED);
  }
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 4, 1, COLORS.RED);
}

export function drawInfiniteField(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  setPixel(bitmap, colorMap, centerCol, startRow + 1, 1, COLORS.RED);
  for (let c = -1; c <= 1; c++) {
    setPixel(bitmap, colorMap, centerCol + c, startRow + 2, 1, COLORS.RED);
    setPixel(bitmap, colorMap, centerCol + c, startRow + 3, 1, COLORS.RED);
  }
  setPixel(bitmap, colorMap, centerCol, startRow + 4, 1, COLORS.RED);
}

export function drawEnergyZigzag(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  setPixel(bitmap, colorMap, centerCol - 2, startRow, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 3, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 2, startRow + 4, 1, COLORS.RED);
}

export function drawDivineForm(bitmap: number[], colorMap: number[], cols: number[], centerCol: number, startRow: number, height: number, rng: { random: () => number }): void {
  setPixel(bitmap, colorMap, centerCol, startRow, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol - 1, startRow + 1, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 1, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol - 2, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol, startRow + 2, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 2, startRow + 2, 1, COLORS.RED);

  setPixel(bitmap, colorMap, centerCol - 2, startRow + 3, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 3, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 3, 1, COLORS.RED);
  setPixel(bitmap, colorMap, centerCol + 2, startRow + 3, 1, COLORS.RED);

  for (let c = -3; c <= 3; c++) {
    setPixel(bitmap, colorMap, centerCol + c, startRow + 4, 1, COLORS.RED);
  }

  setPixel(bitmap, colorMap, centerCol, startRow + 2, 1, COLORS.WHITE);
}

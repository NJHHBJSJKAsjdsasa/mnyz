// Utils/arecibo/figures/transmission.ts — How the message was sent: planetary system, antenna geometry, exotic channels.
// Lifted verbatim from LifeAreciboTranslator.tsx (05 §3.1 split, 2026-10-29).

import { COLORS, WIDTH, createPlanetRNG, setPixel } from "../primitives.ts";

export async function drawSolarSystem(bitmap: number[], colorMap: number[], planetName: string, startRow: number): Promise<void> {
  try {
    const response = await fetch("/api/arecibo");
    const data = await response.json();

    if (!data.success || !data.system_data) {
      console.warn("No system data available from /api/arecibo");
      drawBasicSolarSystem(bitmap, colorMap, startRow);
      return;
    }

    const systemData = data.system_data;
    const totalPlanets = systemData.total_planets;
    const currentPlanetIndex = systemData.current_planet_index;
    const planets = systemData.planets || [];

    drawAreciboStyleSolarSystem(bitmap, colorMap, totalPlanets, currentPlanetIndex, startRow, planets);
  } catch (error) {
    console.warn("Error fetching data from /api/arecibo:", error);
    drawBasicSolarSystem(bitmap, colorMap, startRow);
  }
}

export function drawAreciboStyleSolarSystem(bitmap: number[], colorMap: number[], totalPlanets: number, currentPlanetIndex: number, startRow: number, planets: any[] = []): void {
  const starStartCol = 1;
  const starStartRow = startRow + 1;

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      setPixel(bitmap, colorMap, starStartCol + col, starStartRow + row, 1, COLORS.YELLOW);
    }
  }

  let currentCol = starStartCol + 3 + 1;

  for (let i = 0; i < totalPlanets; i++) {
    const planetSize = getRealPlanetSize(i, currentPlanetIndex, planets);
    const planetStartRow = starStartRow;

    for (let row = 0; row < planetSize; row++) {
      setPixel(bitmap, colorMap, currentCol, planetStartRow + row, 1, COLORS.YELLOW);
    }

    currentCol += 1 + 1;

    if (currentCol >= WIDTH - 1) {
      break;
    }
  }
}

export function getRealPlanetSize(planetIndex: number, currentPlanetIndex: number, planets: any[]): number {
  if (planetIndex === currentPlanetIndex) {
    return 3;
  }

  const planetData = planets.find((p) => p.index === planetIndex);
  if (planetData && planetData.size_category) {
    switch (planetData.size_category) {
      case "small":
        return 1;
      case "medium":
        return 2;
      case "large":
        return 3;
      default:
        return 1;
    }
  }

  if (planetIndex === 0) return 1;
  if (planetIndex === 1) return 2;
  return (planetIndex % 2) + 1;
}

export function drawTransmissionMethod(bitmap: number[], colorMap: number[], lifeForm: string, planetName: string, startRow: number, height: number): void {
  const centerCol = Math.floor(WIDTH / 2);

  const rng = createPlanetRNG(planetName);

  switch (lifeForm) {
    case "Intelligent Life":
      drawIntelligentLifeAntenna(bitmap, colorMap, centerCol, startRow - 1, height - 2, rng);
      break;
    case "Silicon-Based Life":
      drawSiliconBasedAntenna(bitmap, colorMap, centerCol, startRow - 1, height - 2, rng);
      break;
    case "Conscious Gas":
      drawTelepathicWaves(bitmap, colorMap, centerCol, startRow - 1, height - 2, rng);
      break;
    case "Non-Physical Entity":
      drawNonPhysicalTransmission(bitmap, colorMap, centerCol, startRow - 1, height - 2, rng);
      break;
    case "Robotic Entities":
      drawRoboticAntenna(bitmap, colorMap, centerCol, startRow - 1, height - 2, rng);
      break;
    case "Have I just found God?":
      drawDoubleSlitExperiment(bitmap, colorMap, centerCol, startRow - 1, height - 2);
      break;
    case "Animal Life":
    case "Vegetation":
    case "Bacteria":
    case "Vegetable Animals":
    default:
      break;
  }

  if (lifeForm !== "Animal Life" && lifeForm !== "Vegetation" && lifeForm !== "Bacteria" && lifeForm !== "Vegetable Animals") {
    drawAntennaSize(bitmap, colorMap, lifeForm, planetName, startRow + height - 2, rng);
  }
}

export function drawAntennaSize(bitmap: number[], colorMap: number[], lifeForm: string, planetName: string, startRow: number, rng: { random: () => number }): void {
  let antennaSize: number;

  switch (lifeForm) {
    case "Intelligent Life":
      antennaSize = Math.floor(50 + rng.random() * 450);
      break;
    case "Silicon-Based Life":
      antennaSize = Math.floor(100 + rng.random() * 900);
      break;
    case "Conscious Gas":
      antennaSize = Math.floor(10 + rng.random() * 190);
      break;
    case "Non-Physical Entity":
      antennaSize = Math.floor(1 + rng.random() * 1999);
      break;
    case "Robotic Entities":
      antennaSize = Math.floor(200 + rng.random() * 600);
      break;
    case "Have I just found God?":
      antennaSize = 137;
      break;
    default:
      antennaSize = 305;
      break;
  }

  if (antennaSize > 1023) antennaSize = 1023;
  const binary = antennaSize.toString(2).padStart(10, "0");

  for (let i = 0; i < 5; i++) {
    if (binary[i] === "1") {
      const col = 7 + i * 2;
      setPixel(bitmap, colorMap, col, startRow, 1, COLORS.WHITE);
    }
  }

  for (let i = 0; i < 4; i++) {
    setPixel(bitmap, colorMap, i, startRow + 1, 1, COLORS.WHITE);
  }

  for (let i = 5; i < 10; i++) {
    if (binary[i] === "1") {
      const col = 6 + (i - 5) * 2;
      setPixel(bitmap, colorMap, col, startRow + 1, 1, COLORS.WHITE);
    }
  }

  for (let i = 0; i < 4; i++) {
    setPixel(bitmap, colorMap, 19 + i, startRow + 1, 1, COLORS.WHITE);
  }
}

export function drawIntelligentLifeAntenna(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number, rng: { random: () => number }): void {
  const antennaType = Math.floor(rng.random() * 3);

  switch (antennaType) {
    case 0:
      drawParabolicAntenna(bitmap, colorMap, centerCol, startRow + 2);
      break;
    case 1:
      drawRadioTower(bitmap, colorMap, centerCol, startRow + 1);
      break;
    case 2:
      drawAntennaArray(bitmap, colorMap, centerCol, startRow + 2);
      break;
  }
}

export function drawParabolicAntenna(bitmap: number[], colorMap: number[], centerCol: number, startRow: number): void {
  setPixel(bitmap, colorMap, centerCol, startRow + 3, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol, startRow + 2, 1, COLORS.LILAC);

  setPixel(bitmap, colorMap, centerCol - 1, startRow, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol, startRow, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol + 1, startRow, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 1, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 1, 1, COLORS.LILAC);
}

export function drawRadioTower(bitmap: number[], colorMap: number[], centerCol: number, startRow: number): void {
  for (let i = 0; i < 6; i++) {
    setPixel(bitmap, colorMap, centerCol, startRow + i, 1, COLORS.LILAC);
  }

  setPixel(bitmap, colorMap, centerCol - 1, startRow + 1, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 1, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 3, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 3, 1, COLORS.LILAC);
}

export function drawAntennaArray(bitmap: number[], colorMap: number[], centerCol: number, startRow: number): void {
  for (let i = -1; i <= 1; i++) {
    const col = centerCol + i * 2;
    setPixel(bitmap, colorMap, col, startRow + 2, 1, COLORS.LILAC);
    setPixel(bitmap, colorMap, col, startRow + 1, 1, COLORS.LILAC);
    setPixel(bitmap, colorMap, col, startRow, 1, COLORS.LILAC);
  }
}

export function drawSiliconBasedAntenna(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number, rng: { random: () => number }): void {
  const antennaType = Math.floor(rng.random() * 3);

  switch (antennaType) {
    case 0:
      drawCrystallineAntenna(bitmap, colorMap, centerCol, startRow + 1);
      break;
    case 1:
      drawSiliconPyramid(bitmap, colorMap, centerCol, startRow + 1);
      break;
    case 2:
      drawHexagonalArray(bitmap, colorMap, centerCol, startRow + 2);
      break;
  }
}

export function drawCrystallineAntenna(bitmap: number[], colorMap: number[], centerCol: number, startRow: number): void {
  setPixel(bitmap, colorMap, centerCol, startRow + 2, 1, COLORS.LILAC);

  setPixel(bitmap, colorMap, centerCol - 1, startRow + 1, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 1, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol, startRow, 1, COLORS.LILAC);

  setPixel(bitmap, colorMap, centerCol - 2, startRow + 3, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol, startRow + 3, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol + 2, startRow + 3, 1, COLORS.LILAC);
}

export function drawSiliconPyramid(bitmap: number[], colorMap: number[], centerCol: number, startRow: number): void {
  setPixel(bitmap, colorMap, centerCol, startRow, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 1, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol, startRow + 1, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 1, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol - 2, startRow + 2, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 2, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol, startRow + 2, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 2, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol + 2, startRow + 2, 1, COLORS.LILAC);
}

export function drawHexagonalArray(bitmap: number[], colorMap: number[], centerCol: number, startRow: number): void {
  setPixel(bitmap, colorMap, centerCol, startRow + 1, 1, COLORS.LILAC);

  setPixel(bitmap, colorMap, centerCol - 1, startRow, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol + 1, startRow, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 2, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 2, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol - 2, startRow + 1, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol + 2, startRow + 1, 1, COLORS.LILAC);
}

export function drawNonPhysicalTransmission(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number, rng: { random: () => number }): void {
  const transmissionType = Math.floor(rng.random() * 3);

  switch (transmissionType) {
    case 0:
      drawDimensionalVortex(bitmap, colorMap, centerCol, startRow + 2);
      break;
    case 1:
      drawEnergyField(bitmap, colorMap, centerCol, startRow + 1, rng);
      break;
    case 2:
      drawInterdimensionalPortal(bitmap, colorMap, centerCol, startRow + 2);
      break;
  }
}

export function drawDimensionalVortex(bitmap: number[], colorMap: number[], centerCol: number, startRow: number): void {
  setPixel(bitmap, colorMap, centerCol, startRow, 1, COLORS.LILAC);

  setPixel(bitmap, colorMap, centerCol, startRow - 1, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol + 1, startRow, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol, startRow + 1, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol - 1, startRow, 1, COLORS.LILAC);

  setPixel(bitmap, colorMap, centerCol - 1, startRow - 1, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol + 1, startRow - 1, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 1, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 1, 1, COLORS.LILAC);

  setPixel(bitmap, colorMap, centerCol - 2, startRow - 1, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol + 2, startRow + 1, 1, COLORS.LILAC);
}

export function drawEnergyField(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, rng: { random: () => number }): void {
  setPixel(bitmap, colorMap, centerCol, startRow + 2, 1, COLORS.LILAC);

  for (let i = 0; i < 8; i++) {
    if (rng.random() > 0.4) {
      const offsetX = Math.floor(rng.random() * 5) - 2;
      const offsetY = Math.floor(rng.random() * 5) - 2;

      if (offsetX !== 0 || offsetY !== 0) {
        setPixel(bitmap, colorMap, centerCol + offsetX, startRow + 2 + offsetY, 1, COLORS.LILAC);
      }
    }
  }

  setPixel(bitmap, colorMap, centerCol - 1, startRow + 1, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 3, 1, COLORS.LILAC);
}

export function drawInterdimensionalPortal(bitmap: number[], colorMap: number[], centerCol: number, startRow: number): void {
  setPixel(bitmap, colorMap, centerCol - 2, startRow - 1, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol - 1, startRow - 1, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol, startRow - 1, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol + 1, startRow - 1, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol + 2, startRow - 1, 1, COLORS.LILAC);

  setPixel(bitmap, colorMap, centerCol - 2, startRow, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol + 2, startRow, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol - 2, startRow + 1, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol + 2, startRow + 1, 1, COLORS.LILAC);

  setPixel(bitmap, colorMap, centerCol - 2, startRow + 2, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 2, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol, startRow + 2, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 2, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol + 2, startRow + 2, 1, COLORS.LILAC);

  setPixel(bitmap, colorMap, centerCol, startRow, 1, COLORS.LILAC);
}

export function drawTelepathicWaves(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number, rng: { random: () => number }): void {
  setPixel(bitmap, colorMap, centerCol, startRow + 3, 1, COLORS.LILAC);

  const waveCount = 3 + Math.floor(rng.random() * 3);

  for (let wave = 0; wave < waveCount; wave++) {
    const radius = wave + 1;
    const intensity = rng.random();

    if (intensity > 0.3) {
      if (radius === 1) {
        setPixel(bitmap, colorMap, centerCol, startRow + 2, 1, COLORS.LILAC);
        setPixel(bitmap, colorMap, centerCol, startRow + 4, 1, COLORS.LILAC);
        setPixel(bitmap, colorMap, centerCol - 1, startRow + 3, 1, COLORS.LILAC);
        setPixel(bitmap, colorMap, centerCol + 1, startRow + 3, 1, COLORS.LILAC);
      } else if (radius === 2) {
        setPixel(bitmap, colorMap, centerCol - 1, startRow + 1, 1, COLORS.LILAC);
        setPixel(bitmap, colorMap, centerCol + 1, startRow + 1, 1, COLORS.LILAC);
        setPixel(bitmap, colorMap, centerCol - 1, startRow + 5, 1, COLORS.LILAC);
        setPixel(bitmap, colorMap, centerCol + 1, startRow + 5, 1, COLORS.LILAC);
        setPixel(bitmap, colorMap, centerCol - 2, startRow + 3, 1, COLORS.LILAC);
        setPixel(bitmap, colorMap, centerCol + 2, startRow + 3, 1, COLORS.LILAC);
      } else if (radius >= 3) {
        const angle = wave * 1.5 + rng.random() * 0.5;
        const x = Math.round(Math.cos(angle) * radius);
        const y = Math.round(Math.sin(angle) * radius);
        setPixel(bitmap, colorMap, centerCol + x, startRow + 3 + y, 1, COLORS.LILAC);
      }
    }
  }
}

export function drawRoboticAntenna(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number, rng: { random: () => number }): void {
  const antennaType = Math.floor(rng.random() * 3);

  switch (antennaType) {
    case 0:
      drawSymmetricSpikes(bitmap, colorMap, centerCol, startRow + 2);
      break;
    case 1:
      drawSensorGrid(bitmap, colorMap, centerCol, startRow + 1);
      break;
    case 2:
      drawMultiArmAntenna(bitmap, colorMap, centerCol, startRow + 1);
      break;
  }
}

export function drawSymmetricSpikes(bitmap: number[], colorMap: number[], centerCol: number, startRow: number): void {
  setPixel(bitmap, colorMap, centerCol, startRow, 1, COLORS.LILAC);

  setPixel(bitmap, colorMap, centerCol, startRow - 1, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol, startRow + 1, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol - 1, startRow, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol + 1, startRow, 1, COLORS.LILAC);

  setPixel(bitmap, colorMap, centerCol - 1, startRow - 1, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol + 1, startRow - 1, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 1, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 1, 1, COLORS.LILAC);
}

export function drawSensorGrid(bitmap: number[], colorMap: number[], centerCol: number, startRow: number): void {
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      setPixel(bitmap, colorMap, centerCol - 1 + x, startRow + y, 1, COLORS.LILAC);
    }
  }

  setPixel(bitmap, colorMap, centerCol, startRow - 1, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol, startRow + 3, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol - 2, startRow + 1, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol + 2, startRow + 1, 1, COLORS.LILAC);
}

export function drawMultiArmAntenna(bitmap: number[], colorMap: number[], centerCol: number, startRow: number): void {
  setPixel(bitmap, colorMap, centerCol, startRow + 2, 1, COLORS.LILAC);

  setPixel(bitmap, colorMap, centerCol, startRow + 1, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol, startRow, 1, COLORS.LILAC);

  setPixel(bitmap, colorMap, centerCol - 2, startRow + 1, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 1, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 1, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol + 2, startRow + 1, 1, COLORS.LILAC);

  setPixel(bitmap, colorMap, centerCol - 2, startRow, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol + 2, startRow, 1, COLORS.LILAC);
}

export function drawDoubleSlitExperiment(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  setPixel(bitmap, colorMap, centerCol - 4, startRow + 3, 1, COLORS.LILAC);

  setPixel(bitmap, colorMap, centerCol, startRow, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol, startRow + 1, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol, startRow + 3, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol, startRow + 5, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol, startRow + 6, 1, COLORS.LILAC);

  const screenCol = centerCol + 3;

  setPixel(bitmap, colorMap, screenCol, startRow + 3, 1, COLORS.LILAC);

  setPixel(bitmap, colorMap, screenCol, startRow + 1, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, screenCol, startRow + 5, 1, COLORS.LILAC);

  setPixel(bitmap, colorMap, centerCol - 2, startRow + 3, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 2, 1, COLORS.LILAC);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 4, 1, COLORS.LILAC);
}

export function drawBasicSolarSystem(bitmap: number[], colorMap: number[], startRow: number): void {
  const centerCol = Math.floor(WIDTH / 2);

  setPixel(bitmap, colorMap, centerCol, startRow + 2, 1, COLORS.YELLOW);
  setPixel(bitmap, colorMap, centerCol - 1, startRow + 2, 1, COLORS.YELLOW);
  setPixel(bitmap, colorMap, centerCol + 1, startRow + 2, 1, COLORS.YELLOW);

  const orbits = [
    { col: centerCol - 3, row: startRow + 4 },
    { col: centerCol - 1, row: startRow + 6 },
    { col: centerCol + 2, row: startRow + 5 },
    { col: centerCol + 4, row: startRow + 7 },
  ];

  orbits.forEach((orbit, index) => {
    if (index === 2) {
      setPixel(bitmap, colorMap, orbit.col, orbit.row, 1, COLORS.YELLOW);
      setPixel(bitmap, colorMap, orbit.col, orbit.row - 1, 1, COLORS.YELLOW);
      setPixel(bitmap, colorMap, orbit.col, orbit.row + 1, 1, COLORS.YELLOW);
    } else {
      setPixel(bitmap, colorMap, orbit.col, orbit.row, 1, COLORS.YELLOW);
    }
  });
}

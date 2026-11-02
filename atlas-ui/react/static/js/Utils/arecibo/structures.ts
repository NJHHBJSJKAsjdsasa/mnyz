// Utils/arecibo/structures.ts — Long-form structures: DNA helix, crystal lattice, data, quantum and energy fields.
// Lifted verbatim from LifeAreciboTranslator.tsx (05 §3.1 split, 2026-10-29).

import { calculateFieldIntensity, getElementsForLifeForm, getEnergyFrequency, getEnergyPattern, getGenomeSizeData, getLifeCategory, getNitrogenBases } from "./data.ts";
import { COLORS, HEIGHT, createSeededRandom, hashString, setPixel } from "./primitives.ts";

export function drawDNAHelixBorders(bitmap: number[], colorMap: number[]): void {
  setPixel(bitmap, colorMap, 3, 27, 1, COLORS.GREEN);
  setPixel(bitmap, colorMap, 4, 27, 1, COLORS.GREEN);

  setPixel(bitmap, colorMap, 18, 27, 1, COLORS.GREEN);
  setPixel(bitmap, colorMap, 19, 27, 1, COLORS.GREEN);
}

export function drawDNADoubleHelix(bitmap: number[], colorMap: number[], lifeForm: string, planetName: string, startRow: number = 28, height: number = 15): void {
  const category = getLifeCategory(lifeForm);
  const centerCol = 11;

  switch (category) {
    case "carbon-based":
      drawCarbonBasedDoubleHelix(bitmap, colorMap, lifeForm, planetName, centerCol, startRow, height);
      break;
    case "silicon-based":
      drawSiliconBasedStructure(bitmap, colorMap, centerCol, startRow, height, lifeForm, planetName);
      break;
    case "robotic":
      drawDigitalDataStructure(bitmap, colorMap, centerCol, startRow, height, lifeForm, planetName);
      break;
    case "gaseous":
      drawQuantumFieldStructure(bitmap, colorMap, centerCol, startRow, height, lifeForm, planetName);
      break;
    case "energy":
      drawEnergyFieldStructure(bitmap, colorMap, centerCol, startRow, height, lifeForm, planetName);
      break;
    case "divine":
      drawCosmicGeometryStructure(bitmap, colorMap, centerCol, startRow, height);
      break;
    default:
      drawCarbonBasedDoubleHelix(bitmap, colorMap, lifeForm, planetName, centerCol, startRow, height);
  }
}

export function drawCarbonBasedDoubleHelix(bitmap: number[], colorMap: number[], lifeForm: string, planetName: string, centerCol: number, startRow: number, height: number): void {
  const genomicData = getGenomeSizeData(lifeForm, planetName, getElementsForLifeForm(lifeForm, planetName));

  const centerCol1 = 11;
  const centerCol2 = 12;

  const totalBases = genomicData.totalBases;
  const binaryString = totalBases.toString(2);

  const helixHash = hashString(lifeForm + planetName + "helix");
  const helixRng = createSeededRandom(helixHash);

  const baseTurnsPerHeight = 10.5;
  const baseAmplitude = 0.5;

  const turnVariation = (helixRng.random() - 0.5) * 2.0;
  const amplitudeVariation = (helixRng.random() - 0.5) * 0.3;
  const phaseShift = helixRng.random() * Math.PI;

  const planetTurnsPerHeight = baseTurnsPerHeight + turnVariation;
  const planetAmplitude = baseAmplitude + amplitudeVariation;

  for (let i = 0; i < height; i++) {
    const row = startRow + i;
    if (row >= HEIGHT) break;

    const leftBitIndex = i * 2;
    if (leftBitIndex < binaryString.length) {
      const leftBit = parseInt(binaryString[leftBitIndex]);
      if (leftBit === 1) {
        setPixel(bitmap, colorMap, centerCol1, row, 1, COLORS.WHITE);
      }
    }

    const rightBitIndex = i * 2 + 1;
    if (rightBitIndex < binaryString.length) {
      const rightBit = parseInt(binaryString[rightBitIndex]);
      if (rightBit === 1) {
        setPixel(bitmap, colorMap, centerCol2, row, 1, COLORS.WHITE);
      }
    }

    const helixPhase = (i * Math.PI * 2) / planetTurnsPerHeight + phaseShift;

    const leftHelixRange = 9 - 0;
    const leftHelixPosition = 0 + Math.round(leftHelixRange / 2 + (leftHelixRange / 2) * planetAmplitude * Math.cos(helixPhase));
    setPixel(bitmap, colorMap, Math.max(0, Math.min(9, leftHelixPosition)), row, 1, COLORS.BLUE);

    const rightHelixRange = 22 - 14;
    const rightHelixPosition = 14 + Math.round(rightHelixRange / 2 + (rightHelixRange / 2) * planetAmplitude * Math.cos(helixPhase + Math.PI));
    setPixel(bitmap, colorMap, Math.max(14, Math.min(22, rightHelixPosition)), row, 1, COLORS.BLUE);

    if (lifeForm === "Intelligent Life") {
      const secondaryPhase = helixPhase + Math.PI;
      const leftSecondary = Math.round(centerCol1 - 3 - planetAmplitude * Math.cos(secondaryPhase));
      const rightSecondary = Math.round(centerCol2 + 3 + planetAmplitude * Math.cos(secondaryPhase));

      const secondaryFreq = Math.max(3, Math.floor(planetTurnsPerHeight / 2));
      if (leftSecondary >= 5 && leftSecondary <= 9 && i % secondaryFreq === 0) {
        setPixel(bitmap, colorMap, leftSecondary, row, 1, COLORS.BLUE);
      }
      if (rightSecondary >= 14 && rightSecondary <= 18 && i % (secondaryFreq + 1) === 0) {
        setPixel(bitmap, colorMap, rightSecondary, row, 1, COLORS.BLUE);
      }
    } else if (lifeForm === "Vegetation") {
      const rnaFreq = Math.max(4, Math.floor(planetTurnsPerHeight));
      if (i % rnaFreq === Math.floor(rnaFreq / 2)) {
        const rnaCol = leftHelixPosition - Math.round(planetAmplitude);
        if (rnaCol >= 0 && rnaCol <= 9) {
          setPixel(bitmap, colorMap, rnaCol, row, 1, COLORS.BLUE);
        }
      }
    }
  }
}

export function drawSiliconBasedStructure(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number, lifeForm: string, planetName: string): void {
  const hash = hashString(lifeForm + planetName + "crystalline");
  const rng = createSeededRandom(hash);

  const structureTypes = [
    { units: 500000, name: "Cuarzo simple" },
    { units: 1200000, name: "Feldespato complejo" },
    { units: 800000, name: "Olivino" },
    { units: 2000000, name: "Zeolita porosa" },
    { units: 1500000, name: "Granate denso" },
    { units: 900000, name: "Piroxeno cadena" },
    { units: 1800000, name: "Matriz silicática" },
  ];

  const structureIndex = Math.floor(rng.random() * structureTypes.length);
  const selectedStructure = structureTypes[structureIndex];
  const crystallineUnits = selectedStructure.units;
  const binaryString = crystallineUnits.toString(2);

  const patternType = Math.floor(rng.random() * 3);

  const centerCol1 = 11;
  const centerCol2 = 12;

  for (let i = 0; i < height; i++) {
    const row = startRow + i;
    if (row >= HEIGHT) break;

    const leftBitIndex = i * 2;
    if (leftBitIndex < binaryString.length) {
      const leftBit = parseInt(binaryString[leftBitIndex]);
      if (leftBit === 1) {
        setPixel(bitmap, colorMap, centerCol1, row, 1, COLORS.WHITE);
      }
    }

    const rightBitIndex = i * 2 + 1;
    if (rightBitIndex < binaryString.length) {
      const rightBit = parseInt(binaryString[rightBitIndex]);
      if (rightBit === 1) {
        setPixel(bitmap, colorMap, centerCol2, row, 1, COLORS.WHITE);
      }
    }

    let crystalPhase: number;

    switch (patternType) {
      case 0:
        crystalPhase = (i * Math.PI * 2) / 6;
        break;
      case 1:
        crystalPhase = (i * Math.PI * 2) / 4;
        break;
      default:
        crystalPhase = (i * Math.PI * 2) / 8 + rng.random() * 0.5;
    }

    const leftCrystalRange = 9 - 0;
    const leftCrystalPosition = 0 + Math.round(leftCrystalRange / 2 + (leftCrystalRange / 2) * Math.sin(crystalPhase));
    setPixel(bitmap, colorMap, Math.max(0, Math.min(9, leftCrystalPosition)), row, 1, COLORS.BLUE);

    const rightCrystalRange = 22 - 14;
    const rightCrystalPosition = 14 + Math.round(rightCrystalRange / 2 + (rightCrystalRange / 2) * Math.sin(crystalPhase + Math.PI));
    setPixel(bitmap, colorMap, Math.max(14, Math.min(22, rightCrystalPosition)), row, 1, COLORS.BLUE);
  }
}

export function drawDigitalDataStructure(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number, lifeForm: string, planetName?: string): void {
  const hash = hashString(lifeForm + (planetName || "Earth") + "datastructure");
  const rng = createSeededRandom(hash);

  const codeComplexityVariations = [2147483647, Math.floor(2147483647 * 0.5), Math.floor(2147483647 * 0.25), 2147483647 * 2, Math.floor(2147483647 * 0.75)];

  const complexityIndex = Math.floor(rng.random() * codeComplexityVariations.length);
  const codeLines = codeComplexityVariations[complexityIndex];
  const binaryString = Math.abs(codeLines).toString(2);

  const busPatterns = [
    { type: "synchronized", frequency: 4, phase: 0 },
    { type: "asynchronous", frequency: 6, phase: Math.PI / 3 },
    { type: "pipelined", frequency: 8, phase: Math.PI / 2 },
    { type: "burst", frequency: 3, phase: 0 },
    { type: "differential", frequency: 5, phase: Math.PI / 4 },
  ];

  const patternIndex = Math.floor(rng.random() * busPatterns.length);
  const busPattern = busPatterns[patternIndex];

  const centerCol1 = 11;
  const centerCol2 = 12;

  for (let i = 0; i < height; i++) {
    const row = startRow + i;
    if (row >= HEIGHT) break;

    const leftBitIndex = i * 2;
    if (leftBitIndex < binaryString.length) {
      const leftBit = parseInt(binaryString[leftBitIndex]);
      const codeQuality = 0.9 + (rng.random() - 0.5) * 0.15;
      if (leftBit === 1 && rng.random() < codeQuality) {
        setPixel(bitmap, colorMap, centerCol1, row, 1, COLORS.WHITE);
      }
    }

    const rightBitIndex = i * 2 + 1;
    if (rightBitIndex < binaryString.length) {
      const rightBit = parseInt(binaryString[rightBitIndex]);
      const codeQuality = 0.9 + (rng.random() - 0.5) * 0.15;
      if (rightBit === 1 && rng.random() < codeQuality) {
        setPixel(bitmap, colorMap, centerCol2, row, 1, COLORS.WHITE);
      }
    }

    let digitalPhase: number;

    switch (busPattern.type) {
      case "synchronized":
        digitalPhase = (i * Math.PI * 2) / busPattern.frequency + busPattern.phase;
        break;
      case "asynchronous":
        digitalPhase = (i * Math.PI * 2) / busPattern.frequency + busPattern.phase + rng.random() * 0.5;
        break;
      case "pipelined":
        digitalPhase = (i * Math.PI * 2) / busPattern.frequency + busPattern.phase + ((i % 3) * Math.PI) / 6;
        break;
      case "burst":
        digitalPhase = i % 4 < 2 ? (i * Math.PI * 2) / busPattern.frequency + busPattern.phase : (i * Math.PI * 2) / (busPattern.frequency * 2) + busPattern.phase;
        break;
      case "differential":
        digitalPhase = (i * Math.PI * 2) / busPattern.frequency + busPattern.phase + Math.sin(i * 0.3) * 0.2;
        break;
      default:
        digitalPhase = (i * Math.PI * 2) / 4;
    }

    const leftBusRange = 9 - 0;
    let leftBusPosition: number;

    if (busPattern.type === "synchronized" || busPattern.type === "pipelined") {
      leftBusPosition = 0 + Math.round(leftBusRange / 2 + (leftBusRange / 2) * Math.sin(digitalPhase));
    } else if (busPattern.type === "asynchronous") {
      leftBusPosition = 0 + Math.round(leftBusRange / 2 + (leftBusRange / 3) * Math.sin(digitalPhase));
    } else {
      leftBusPosition = 0 + Math.round(leftBusRange / 2 + (leftBusRange / 2) * Math.sin(digitalPhase) * Math.cos(digitalPhase * 0.7));
    }

    const finalLeftBusPosition = Math.max(0, Math.min(9, leftBusPosition));
    setPixel(bitmap, colorMap, finalLeftBusPosition, row, 1, COLORS.BLUE);

    const rightBusRange = 22 - 14;
    let rightBusPosition: number;

    if (busPattern.type === "synchronized") {
      rightBusPosition = 14 + Math.round(rightBusRange / 2 + (rightBusRange / 2) * Math.sin(digitalPhase + Math.PI));
    } else if (busPattern.type === "asynchronous") {
      rightBusPosition = 14 + Math.round(rightBusRange / 2 + (rightBusRange / 3) * Math.cos(digitalPhase + Math.PI / 2));
    } else if (busPattern.type === "pipelined") {
      rightBusPosition = 14 + Math.round(rightBusRange / 2 + (rightBusRange / 2) * Math.sin(digitalPhase + Math.PI + ((i % 4) * Math.PI) / 8));
    } else {
      rightBusPosition = 14 + Math.round(rightBusRange / 2 + (rightBusRange / 2) * Math.cos(digitalPhase) * Math.sin(digitalPhase * 0.5));
    }

    const finalRightBusPosition = Math.max(14, Math.min(22, rightBusPosition));
    setPixel(bitmap, colorMap, finalRightBusPosition, row, 1, COLORS.BLUE);

    if (busPattern.type === "burst" && i % 4 === 0 && rng.random() > 0.5) {
      const burstLeftCol = Math.max(0, Math.min(9, finalLeftBusPosition + Math.floor(rng.random() * 3) - 1));
      const burstRightCol = Math.max(14, Math.min(22, finalRightBusPosition + Math.floor(rng.random() * 3) - 1));
      setPixel(bitmap, colorMap, burstLeftCol, row, 1, COLORS.BLUE);
      setPixel(bitmap, colorMap, burstRightCol, row, 1, COLORS.BLUE);
    }

    if (busPattern.type === "differential" && rng.random() > 0.7) {
      const diffCol = Math.floor(rng.random() * 23);
      if (diffCol < 10 || diffCol > 13) {
        setPixel(bitmap, colorMap, diffCol, row, 1, COLORS.BLUE);
      }
    }
  }
}

export function drawQuantumFieldStructure(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number, lifeForm: string, planetName?: string): void {
  const hash = hashString(lifeForm + (planetName || "Earth") + "quantumfield");
  const rng = createSeededRandom(hash);

  const baseQuantumStates = 1048576;
  const quantumVariations = [baseQuantumStates, baseQuantumStates * 2, Math.floor(baseQuantumStates * 0.5), baseQuantumStates * 4, Math.floor(baseQuantumStates * 1.5)];

  const quantumConfigIndex = Math.floor(rng.random() * quantumVariations.length);
  const quantumStates = quantumVariations[quantumConfigIndex];
  const binaryString = quantumStates.toString(2);

  const oscillationPatterns = [
    { type: "sine", frequency: 12, phase: 0 },
    { type: "cosine", frequency: 10, phase: Math.PI / 4 },
    { type: "mixed", frequency: 8, phase: Math.PI / 2 },
    { type: "chaos", frequency: 15, phase: 0 },
    { type: "entangled", frequency: 6, phase: Math.PI / 3 },
  ];

  const patternIndex = Math.floor(rng.random() * oscillationPatterns.length);
  const pattern = oscillationPatterns[patternIndex];

  const centerCol1 = 11;
  const centerCol2 = 12;

  for (let i = 0; i < height; i++) {
    const row = startRow + i;
    if (row >= HEIGHT) break;

    const leftBitIndex = i * 2;
    if (leftBitIndex < binaryString.length) {
      const leftBit = parseInt(binaryString[leftBitIndex]);
      const showProbability = 0.8 + (rng.random() - 0.5) * 0.3;
      if (leftBit === 1 && rng.random() < showProbability) {
        setPixel(bitmap, colorMap, centerCol1, row, 1, COLORS.WHITE);
      }
    }

    const rightBitIndex = i * 2 + 1;
    if (rightBitIndex < binaryString.length) {
      const rightBit = parseInt(binaryString[rightBitIndex]);
      const showProbability = 0.8 + (rng.random() - 0.5) * 0.3;
      if (rightBit === 1 && rng.random() < showProbability) {
        setPixel(bitmap, colorMap, centerCol2, row, 1, COLORS.WHITE);
      }
    }

    let quantumPhase: number;

    switch (pattern.type) {
      case "sine":
        quantumPhase = (i * Math.PI * 2) / pattern.frequency + pattern.phase;
        break;
      case "cosine":
        quantumPhase = (i * Math.PI * 2) / pattern.frequency + pattern.phase;
        break;
      case "mixed":
        quantumPhase = (i * Math.PI * 2) / pattern.frequency + pattern.phase + Math.sin(i * 0.5) * 0.5;
        break;
      case "chaos":
        quantumPhase = (i * Math.PI * 2) / pattern.frequency + rng.random() * Math.PI * 0.3;
        break;
      case "entangled":
        quantumPhase = (i * Math.PI * 2) / pattern.frequency + pattern.phase + Math.cos(i * 0.3) * 0.7;
        break;
      default:
        quantumPhase = (i * Math.PI * 2) / 12;
    }

    const leftFieldRange = 9 - 0;
    let leftFieldPosition: number;

    if (pattern.type === "sine" || pattern.type === "mixed") {
      leftFieldPosition = 0 + Math.round(leftFieldRange / 2 + (leftFieldRange / 2) * Math.sin(quantumPhase));
    } else if (pattern.type === "cosine") {
      leftFieldPosition = 0 + Math.round(leftFieldRange / 2 + (leftFieldRange / 2) * Math.cos(quantumPhase));
    } else {
      leftFieldPosition = 0 + Math.round(leftFieldRange / 2 + (leftFieldRange / 2) * Math.sin(quantumPhase) * Math.cos(quantumPhase * 0.7));
    }

    const finalLeftPosition = Math.max(0, Math.min(9, leftFieldPosition));
    setPixel(bitmap, colorMap, finalLeftPosition, row, 1, COLORS.BLUE);

    const rightFieldRange = 22 - 14;
    let rightFieldPosition: number;

    if (pattern.type === "sine" || pattern.type === "mixed") {
      rightFieldPosition = 14 + Math.round(rightFieldRange / 2 + (rightFieldRange / 2) * Math.cos(quantumPhase + Math.PI));
    } else if (pattern.type === "cosine") {
      rightFieldPosition = 14 + Math.round(rightFieldRange / 2 + (rightFieldRange / 2) * Math.sin(quantumPhase + Math.PI));
    } else {
      rightFieldPosition = 14 + Math.round(rightFieldRange / 2 + (rightFieldRange / 2) * Math.cos(quantumPhase) * Math.sin(quantumPhase * 0.5));
    }

    const finalRightPosition = Math.max(14, Math.min(22, rightFieldPosition));
    setPixel(bitmap, colorMap, finalRightPosition, row, 1, COLORS.BLUE);

    if (pattern.type === "entangled" && rng.random() > 0.7) {
      const entangledLeftCol = Math.max(0, Math.min(9, finalLeftPosition + Math.floor(rng.random() * 3) - 1));
      const entangledRightCol = Math.max(14, Math.min(22, finalRightPosition + Math.floor(rng.random() * 3) - 1));
      setPixel(bitmap, colorMap, entangledLeftCol, row, 1, COLORS.BLUE);
      setPixel(bitmap, colorMap, entangledRightCol, row, 1, COLORS.BLUE);
    }

    if (pattern.type === "chaos" && rng.random() > 0.8) {
      const chaosCol = Math.floor(rng.random() * 23);
      if (chaosCol < 10 || chaosCol > 13) {
        setPixel(bitmap, colorMap, chaosCol, row, 1, COLORS.BLUE);
      }
    }
  }
}

export function drawEnergyFieldStructure(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number, lifeForm: string, planetName: string): void {
  const energyTypes = getElementsForLifeForm(lifeForm, planetName);
  const energyStates = getNitrogenBases(lifeForm, planetName);

  const hash = hashString(lifeForm + planetName + "energy");
  const rng = createSeededRandom(hash);

  const energyConstants = [299792458, 6626070e-34, 16605390e-27, 96485340, 13806490e-23, 20181970, 25812807, 48359775, 11263490e-6];

  const energyConstantIndex = Math.floor(rng.random() * energyConstants.length);
  const energyUnits = energyConstants[energyConstantIndex];
  const binaryString = energyUnits.toString(2);

  const centerCol1 = 11;
  const centerCol2 = 12;

  const fieldPattern = getEnergyPattern(energyStates[0]);
  const fieldFrequency = getEnergyFrequency(energyStates[1] || energyStates[0]);

  for (let i = 0; i < height; i++) {
    const row = startRow + i;
    if (row >= HEIGHT) break;

    const leftBitIndex = i * 2;
    if (leftBitIndex < binaryString.length) {
      const leftBit = parseInt(binaryString[leftBitIndex]);
      if (leftBit === 1) {
        setPixel(bitmap, colorMap, centerCol1, row, 1, COLORS.WHITE);
      }
    }

    const rightBitIndex = i * 2 + 1;
    if (rightBitIndex < binaryString.length) {
      const rightBit = parseInt(binaryString[rightBitIndex]);
      if (rightBit === 1) {
        setPixel(bitmap, colorMap, centerCol2, row, 1, COLORS.WHITE);
      }
    }

    const energyPhase = (i * Math.PI * 2) / fieldFrequency;

    const leftFieldIntensity = calculateFieldIntensity(fieldPattern, energyPhase, i, "left");
    if (leftFieldIntensity > 0) {
      const leftRange = 9;
      const leftPosition = Math.round(leftRange * leftFieldIntensity);
      setPixel(bitmap, colorMap, Math.max(0, Math.min(9, leftPosition)), row, 1, COLORS.BLUE);
    }

    const rightFieldIntensity = calculateFieldIntensity(fieldPattern, energyPhase + Math.PI, i, "right");
    if (rightFieldIntensity > 0) {
      const rightRange = 8;
      const rightPosition = 14 + Math.round(rightRange * rightFieldIntensity);
      setPixel(bitmap, colorMap, Math.max(14, Math.min(22, rightPosition)), row, 1, COLORS.BLUE);
    }
  }
}

export function drawCosmicGeometryStructure(bitmap: number[], colorMap: number[], centerCol: number, startRow: number, height: number): void {
  const centerCol1 = 11;
  const centerCol2 = 12;

  for (let i = 0; i < height; i++) {
    const row = startRow + i;
    if (row >= HEIGHT) break;

    if (i % 2 === 0) {
      setPixel(bitmap, colorMap, centerCol2, row, 1, COLORS.WHITE);
    } else {
      setPixel(bitmap, colorMap, centerCol1, row, 1, COLORS.WHITE);
    }

    const goldenPhase = (i * Math.PI * 2) / 13;
    const fibonacciPhase = (i * 1.618033988749) % (2 * Math.PI);

    const leftGeometryRange = 9 - 0;
    const leftGeometryPosition = 0 + Math.round(leftGeometryRange / 2 + (leftGeometryRange / 2) * Math.sin(goldenPhase));
    setPixel(bitmap, colorMap, Math.max(0, Math.min(9, leftGeometryPosition)), row, 1, COLORS.BLUE);

    const rightGeometryRange = 22 - 14;
    const rightGeometryPosition = 14 + Math.round(rightGeometryRange / 2 + (rightGeometryRange / 2) * Math.cos(fibonacciPhase));
    setPixel(bitmap, colorMap, Math.max(14, Math.min(22, rightGeometryPosition)), row, 1, COLORS.BLUE);
  }
}

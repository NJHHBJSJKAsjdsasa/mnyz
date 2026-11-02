// Utils/arecibo/sections.ts — Numbered Arecibo sections (1..10): numbers, elements, nucleotides, genetic code.
// Lifted verbatim from LifeAreciboTranslator.tsx (05 §3.1 split, 2026-10-29).

import { calculateEnergyPattern, getElementsForLifeForm, getEnergyFrequency, getEnergyPattern, getGenomeSizeData, getLifeCategory, getNitrogenBases, getNucleotideVariation, getSilicateBonds } from "./data.ts";
import { COLORS, HEIGHT, createSeededRandom, drawBlankLine, drawChemicalFormula, drawLine, hashString, setPixel } from "./primitives.ts";
import { drawDNAHelixBorders } from "./structures.ts";

export function drawNumbers(bitmap: number[], colorMap: number[]): void {
  const columnPositions = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19];

  for (let i = 0; i < 10; i++) {
    const number = i + 1;
    const col = columnPositions[i];
    const binary = number.toString(2);

    for (let bit = 0; bit < binary.length && bit < 4; bit++) {
      const row = 3 - bit;
      const bitValue = parseInt(binary[binary.length - 1 - bit]);
      setPixel(bitmap, colorMap, col, row, bitValue, COLORS.WHITE);
    }
  }
}

export function drawChemicalElements(bitmap: number[], colorMap: number[], lifeForm: string, planetName?: string): void {
  const elements = getElementsForLifeForm(lifeForm, planetName || "Earth");
  const category = getLifeCategory(lifeForm);

  switch (category) {
    case "carbon-based":
      drawCarbonBasedElements(bitmap, colorMap, elements);
      break;
    case "silicon-based":
      drawSiliconBasedElements(bitmap, colorMap, elements);
      break;
    case "robotic":
      drawRoboticElements(bitmap, colorMap, elements);
      break;
    case "gaseous":
      drawGaseousElements(bitmap, colorMap, elements);
      break;
    case "energy":
      drawEnergyElements(bitmap, colorMap, elements);
      break;
    case "divine":
      drawDivineElements(bitmap, colorMap, elements);
      break;
    default:
      drawCarbonBasedElements(bitmap, colorMap, elements);
  }
}

export function drawNucleotides(bitmap: number[], colorMap: number[], lifeForm: string, planetName?: string): void {
  const category = getLifeCategory(lifeForm);

  switch (category) {
    case "carbon-based":
      drawCarbonBasedGenetics(bitmap, colorMap, lifeForm, planetName);
      break;
    case "silicon-based":
      drawSiliconBasedGenetics(bitmap, colorMap, lifeForm, planetName);
      break;
    case "robotic":
      drawRoboticInformation(bitmap, colorMap, lifeForm, planetName);
      break;
    case "gaseous":
      drawGaseousInformation(bitmap, colorMap, lifeForm, planetName);
      break;
    case "energy":
      drawEnergyInformation(bitmap, colorMap, lifeForm, planetName);
      break;
    case "divine":
      drawDivineInformation(bitmap, colorMap);
      break;
    default:
      drawCarbonBasedGenetics(bitmap, colorMap, lifeForm);
  }
}

export function drawCarbonBasedGenetics(bitmap: number[], colorMap: number[], lifeForm: string, planetName?: string): void {
  const elements = getElementsForLifeForm(lifeForm, planetName || "Earth");
  const bases = getNitrogenBases(lifeForm, planetName || "Earth");

  drawNucleotideFormulas(bitmap, colorMap, bases, elements, lifeForm);

  drawBlankLine(bitmap, colorMap, 16);

  drawSugarPhosphateBackbone(bitmap, colorMap, elements);

  drawBlankLine(bitmap, colorMap, 21);

  drawGenomeSize(bitmap, colorMap, elements, lifeForm);

  drawBlankLine(bitmap, colorMap, 26);

  drawDNAHelixBorders(bitmap, colorMap);
}

export function drawSiliconBasedGenetics(bitmap: number[], colorMap: number[], lifeForm: string, planetName: string): void {
  const silicateBases = getNitrogenBases(lifeForm, planetName);

  const siliconUnits = silicateBases.map((base, index) => ({
    col: 4 + index * 4,
    base: base,
    bonds: getSilicateBonds(base),
  }));

  for (const unit of siliconUnits) {
    drawChemicalFormula(bitmap, colorMap, unit.col, 12, unit.bonds);
  }

  drawBlankLine(bitmap, colorMap, 16);

  const centerCol = 11;
  for (let row = 17; row <= 20; row++) {
    setPixel(bitmap, colorMap, centerCol, row, 1, COLORS.GREEN);

    const offset = (row - 17) % 2 === 0 ? 3 : 4;
    setPixel(bitmap, colorMap, centerCol - offset, row, 1, COLORS.GREEN);
    setPixel(bitmap, colorMap, centerCol + offset, row, 1, COLORS.GREEN);

    if (row % 2 === 1) {
      setPixel(bitmap, colorMap, 6, row, 1, COLORS.GREEN);
      setPixel(bitmap, colorMap, 16, row, 1, COLORS.GREEN);
    }
  }

  drawBlankLine(bitmap, colorMap, 21);

  for (let row = 22; row <= 25; row++) {
    const layer = row - 22;
    for (let col = 9 - layer; col <= 13 + layer; col++) {
      if ((col + row) % 2 === 0) {
        setPixel(bitmap, colorMap, col, row, 1, COLORS.GREEN);
      }
    }
  }

  drawBlankLine(bitmap, colorMap, 26);

  drawDNAHelixBorders(bitmap, colorMap);
}

export function drawRoboticInformation(bitmap: number[], colorMap: number[], lifeForm: string, planetName?: string): void {
  const hash = hashString(lifeForm + (planetName || "Earth") + "digital");
  const rng = createSeededRandom(hash);

  const digitalArchitectures = [
    [
      { col: 4, code: [0, 0] },
      { col: 8, code: [0, 1] },
      { col: 12, code: [1, 0] },
      { col: 16, code: [1, 1] },
    ],
    [
      { col: 4, code: [1, 0] },
      { col: 8, code: [1, 1] },
      { col: 12, code: [0, 0] },
      { col: 16, code: [0, 1] },
    ],
    [
      { col: 4, code: [0, 1] },
      { col: 8, code: [1, 0] },
      { col: 12, code: [1, 1] },
      { col: 16, code: [0, 0] },
    ],
    [
      { col: 4, code: [1, 1] },
      { col: 8, code: [0, 0] },
      { col: 12, code: [0, 1] },
      { col: 16, code: [1, 0] },
    ],
  ];

  const archIndex = Math.floor(rng.random() * digitalArchitectures.length);
  const digitalCodes = digitalArchitectures[archIndex];

  for (const dc of digitalCodes) {
    const colVariation = Math.floor(rng.random() * 3) - 1;
    const adjustedCol = Math.max(3, Math.min(19, dc.col + colVariation));

    const headerIntensity = rng.random() > 0.2 ? 1 : 0;
    if (headerIntensity) {
      setPixel(bitmap, colorMap, adjustedCol, 12, 1, COLORS.GREEN);
      setPixel(bitmap, colorMap, adjustedCol + 1, 12, 1, COLORS.GREEN);
    }

    for (let i = 0; i < dc.code.length; i++) {
      if (dc.code[i] === 1) {
        const bitReliability = 0.85 + (rng.random() - 0.5) * 0.2;
        if (rng.random() < bitReliability) {
          setPixel(bitmap, colorMap, adjustedCol + i, 13 + i, 1, COLORS.GREEN);
        }

        if (rng.random() > 0.7) {
          const errorCorrectionCol = adjustedCol + (Math.floor(rng.random() * 3) - 1);
          if (errorCorrectionCol >= 3 && errorCorrectionCol <= 19) {
            setPixel(bitmap, colorMap, errorCorrectionCol, 14, 1, COLORS.GREEN);
          }
        }
      }
    }

    if (rng.random() > 0.15) {
      setPixel(bitmap, colorMap, adjustedCol, 15, 1, COLORS.GREEN);
    }
  }

  drawBlankLine(bitmap, colorMap, 16);

  const busArchitecture = Math.floor(rng.random() * 4);

  for (let row = 17; row <= 20; row++) {
    switch (busArchitecture) {
      case 0:
        for (let col = 9; col <= 13; col++) {
          setPixel(bitmap, colorMap, col, row, 1, COLORS.GREEN);
        }
        if (row % 2 === 0) {
          setPixel(bitmap, colorMap, 6, row, 1, COLORS.GREEN);
          setPixel(bitmap, colorMap, 7, row, 1, COLORS.GREEN);
          setPixel(bitmap, colorMap, 15, row, 1, COLORS.GREEN);
          setPixel(bitmap, colorMap, 16, row, 1, COLORS.GREEN);
        }
        break;

      case 1:
        const spread = row - 17 + 1;
        for (let col = 11 - spread; col <= 11 + spread; col++) {
          if (col >= 6 && col <= 16) {
            setPixel(bitmap, colorMap, col, row, 1, COLORS.GREEN);
          }
        }
        break;

      case 2:
        if (row === 17 || row === 20) {
          for (let col = 8; col <= 14; col++) {
            setPixel(bitmap, colorMap, col, row, 1, COLORS.GREEN);
          }
        } else {
          setPixel(bitmap, colorMap, 8, row, 1, COLORS.GREEN);
          setPixel(bitmap, colorMap, 11, row, 1, COLORS.GREEN);
          setPixel(bitmap, colorMap, 14, row, 1, COLORS.GREEN);
        }
        break;

      case 3:
        setPixel(bitmap, colorMap, 11, row, 1, COLORS.GREEN);
        if (rng.random() > 0.3) {
          setPixel(bitmap, colorMap, 11 - (row - 16), row, 1, COLORS.GREEN);
        }
        if (rng.random() > 0.3) {
          setPixel(bitmap, colorMap, 11 + (row - 16), row, 1, COLORS.GREEN);
        }
        break;
    }

    if (rng.random() > 0.6) {
      const controlCol = 5 + Math.floor(rng.random() * 13);
      if (controlCol >= 5 && controlCol <= 17) {
        setPixel(bitmap, colorMap, controlCol, row, 1, COLORS.GREEN);
      }
    }
  }

  drawBlankLine(bitmap, colorMap, 21);

  const complexityPattern = Math.floor(rng.random() * 4);

  for (let row = 22; row <= 25; row++) {
    const level = row - 22;

    switch (complexityPattern) {
      case 0:
        for (let col = 8; col <= 8 + level * 3; col++) {
          if (col <= 14) {
            setPixel(bitmap, colorMap, col, row, 1, COLORS.GREEN);
          }
        }
        break;

      case 1:
        const exponentialWidth = Math.pow(2, level);
        for (let col = 11 - exponentialWidth; col <= 11 + exponentialWidth; col++) {
          if (col >= 8 && col <= 14) {
            setPixel(bitmap, colorMap, col, row, 1, COLORS.GREEN);
          }
        }
        break;

      case 2:
        const moduleSize = level + 1;
        for (let module = 0; module < moduleSize; module++) {
          const moduleCol = 8 + module * 2;
          if (moduleCol <= 14) {
            setPixel(bitmap, colorMap, moduleCol, row, 1, COLORS.GREEN);
            if (moduleCol + 1 <= 14) {
              setPixel(bitmap, colorMap, moduleCol + 1, row, 1, COLORS.GREEN);
            }
          }
        }
        break;

      case 3:
        const totalWidth = level * 2 + 2;
        for (let col = 9; col <= 9 + totalWidth; col++) {
          if (col <= 14 && rng.random() > 0.3) {
            setPixel(bitmap, colorMap, col, row, 1, COLORS.GREEN);
          }
        }
        break;
    }
  }

  drawBlankLine(bitmap, colorMap, 26);

  drawDNAHelixBorders(bitmap, colorMap);
}

export function drawGaseousInformation(bitmap: number[], colorMap: number[], lifeForm: string, planetName?: string): void {
  const hash = hashString(lifeForm + (planetName || "Earth") + "quantum");
  const rng = createSeededRandom(hash);

  const quantumConfigurations = [
    [
      { col: 4, state: [0, 0] },
      { col: 8, state: [0, 1] },
      { col: 12, state: [1, 0] },
      { col: 16, state: [1, 1] },
    ],
    [
      { col: 4, state: [1, 0] },
      { col: 8, state: [0, 0] },
      { col: 12, state: [1, 1] },
      { col: 16, state: [0, 1] },
    ],
    [
      { col: 4, state: [0, 1] },
      { col: 8, state: [1, 1] },
      { col: 12, state: [0, 0] },
      { col: 16, state: [1, 0] },
    ],
    [
      { col: 4, state: [1, 1] },
      { col: 8, state: [1, 0] },
      { col: 12, state: [0, 1] },
      { col: 16, state: [0, 0] },
    ],
  ];

  const configIndex = Math.floor(rng.random() * quantumConfigurations.length);
  const quantumStates = quantumConfigurations[configIndex];

  for (const qs of quantumStates) {
    const colVariation = Math.floor(rng.random() * 3) - 1;
    const adjustedCol = Math.max(3, Math.min(19, qs.col + colVariation));

    setPixel(bitmap, colorMap, adjustedCol, 12, 1, COLORS.GREEN);
    setPixel(bitmap, colorMap, adjustedCol + 1, 12, 1, COLORS.GREEN);

    for (let i = 0; i < qs.state.length; i++) {
      if (qs.state[i] === 1) {
        const intensityVariation = rng.random() > 0.3 ? 1 : 0;
        if (intensityVariation) {
          setPixel(bitmap, colorMap, adjustedCol + i, 13 + i, 1, COLORS.GREEN);
        }

        if (rng.random() > 0.6) {
          const interferenceCol = adjustedCol + (Math.floor(rng.random() * 3) - 1);
          if (interferenceCol >= 3 && interferenceCol <= 19) {
            setPixel(bitmap, colorMap, interferenceCol, 14, 1, COLORS.GREEN);
          }
        }
      }
    }

    if (rng.random() > 0.2) {
      setPixel(bitmap, colorMap, adjustedCol, 15, 1, COLORS.GREEN);
    }
  }

  drawBlankLine(bitmap, colorMap, 16);

  const entanglementPattern = Math.floor(rng.random() * 3);

  for (let row = 17; row <= 20; row++) {
    setPixel(bitmap, colorMap, 11, row, 1, COLORS.GREEN);

    const baseSpread = row - 17 + 2;
    const spreadVariation = Math.floor(rng.random() * 2);
    const spread = baseSpread + spreadVariation;

    switch (entanglementPattern) {
      case 0:
        setPixel(bitmap, colorMap, 11 - spread, row, 1, COLORS.GREEN);
        setPixel(bitmap, colorMap, 11 + spread, row, 1, COLORS.GREEN);
        break;

      case 1:
        if (row % 2 === 0) {
          setPixel(bitmap, colorMap, 11 - spread, row, 1, COLORS.GREEN);
          setPixel(bitmap, colorMap, 11 + (spread - 1), row, 1, COLORS.GREEN);
        } else {
          setPixel(bitmap, colorMap, 11 - (spread - 1), row, 1, COLORS.GREEN);
          setPixel(bitmap, colorMap, 11 + spread, row, 1, COLORS.GREEN);
        }
        break;

      case 2:
        for (let i = 1; i <= spread; i++) {
          if (rng.random() > 0.4) {
            setPixel(bitmap, colorMap, 11 - i, row, 1, COLORS.GREEN);
          }
          if (rng.random() > 0.4) {
            setPixel(bitmap, colorMap, 11 + i, row, 1, COLORS.GREEN);
          }
        }
        break;
    }

    if ((row % 2 === 1 && entanglementPattern <= 1) || (entanglementPattern === 2 && rng.random() > 0.5)) {
      for (let col = 11 - spread; col <= 11 + spread; col += Math.floor(rng.random() * 3) + 1) {
        if (col >= 6 && col <= 16) {
          setPixel(bitmap, colorMap, col, row, 1, COLORS.GREEN);
        }
      }
    }
  }

  drawBlankLine(bitmap, colorMap, 21);

  const coherencePattern = Math.floor(rng.random() * 4);

  for (let row = 22; row <= 25; row++) {
    const coherence = row - 22;

    switch (coherencePattern) {
      case 0:
        for (let col = 9; col <= 13; col++) {
          if ((col + row + coherence) % 3 === 0) {
            setPixel(bitmap, colorMap, col, row, 1, COLORS.GREEN);
          }
        }
        break;

      case 1:
        for (let col = 9; col <= 13; col++) {
          if ((col * row + coherence) % 4 === 0) {
            setPixel(bitmap, colorMap, col, row, 1, COLORS.GREEN);
          }
        }
        break;

      case 2:
        const centerCol = 11;
        const distance = Math.abs(coherence - 1.5);
        for (let col = 9; col <= 13; col++) {
          if (Math.abs(col - centerCol) <= 2 - distance) {
            if (rng.random() > 0.3) {
              setPixel(bitmap, colorMap, col, row, 1, COLORS.GREEN);
            }
          }
        }
        break;

      case 3:
        for (let col = 9; col <= 13; col++) {
          if (rng.random() > 0.3 + coherence * 0.1) {
            setPixel(bitmap, colorMap, col, row, 1, COLORS.GREEN);
          }
        }
        break;
    }
  }

  drawBlankLine(bitmap, colorMap, 26);

  drawDNAHelixBorders(bitmap, colorMap);
}

export function drawEnergyInformation(bitmap: number[], colorMap: number[], lifeForm: string, planetName: string): void {
  const energyStates = getNitrogenBases(lifeForm, planetName);

  const stateConfigs = energyStates.map((state, index) => ({
    col: 4 + index * 4,
    state: state,
    freq: getEnergyFrequency(state),
    pattern: getEnergyPattern(state),
  }));

  for (const config of stateConfigs) {
    for (let row = 12; row <= 15; row++) {
      const phase = ((row - 12) * Math.PI) / config.freq;
      const shouldDraw = calculateEnergyPattern(config.pattern, phase, row - 12);

      if (shouldDraw) {
        setPixel(bitmap, colorMap, config.col, row, 1, COLORS.GREEN);
        if (config.freq > 3) {
          setPixel(bitmap, colorMap, config.col + 1, row, 1, COLORS.GREEN);
        }
      }
    }
  }

  drawBlankLine(bitmap, colorMap, 16);

  for (let row = 17; row <= 20; row++) {
    setPixel(bitmap, colorMap, 11, row, 1, COLORS.GREEN);

    const intensity = row - 17;
    for (let i = 1; i <= 2 + intensity; i++) {
      if (11 - i >= 6) setPixel(bitmap, colorMap, 11 - i, row, 1, COLORS.GREEN);
      if (11 + i <= 16) setPixel(bitmap, colorMap, 11 + i, row, 1, COLORS.GREEN);
    }
  }

  drawBlankLine(bitmap, colorMap, 21);

  for (let row = 22; row <= 25; row++) {
    const level = row - 22;
    for (let col = 10 - level; col <= 12 + level; col++) {
      if (col >= 6 && col <= 16) {
        setPixel(bitmap, colorMap, col, row, 1, COLORS.GREEN);
      }
    }
  }

  drawBlankLine(bitmap, colorMap, 26);

  drawDNAHelixBorders(bitmap, colorMap);
}

export function drawDivineInformation(bitmap: number[], colorMap: number[]): void {
  const crossPositions = [4, 8, 12, 16];

  for (const col of crossPositions) {
    for (let row = 12; row <= 15; row++) {
      setPixel(bitmap, colorMap, col, row, 1, COLORS.GREEN);
    }
    setPixel(bitmap, colorMap, col - 1, 13, 1, COLORS.GREEN);
    setPixel(bitmap, colorMap, col + 1, 13, 1, COLORS.GREEN);
  }

  drawBlankLine(bitmap, colorMap, 16);

  for (let row = 17; row <= 20; row++) {
    setPixel(bitmap, colorMap, 11, row, 1, COLORS.GREEN);

    const harmony = row - 17 + 1;
    for (let i = 1; i <= harmony; i++) {
      if (11 - i * 2 >= 6) setPixel(bitmap, colorMap, 11 - i * 2, row, 1, COLORS.GREEN);
      if (11 + i * 2 <= 16) setPixel(bitmap, colorMap, 11 + i * 2, row, 1, COLORS.GREEN);
    }
  }

  drawBlankLine(bitmap, colorMap, 21);

  const fibLevels = [1, 2, 3, 5];

  for (let row = 22; row <= 25; row++) {
    const level = fibLevels[row - 22];
    for (let col = 11 - level; col <= 11 + level; col++) {
      if (col >= 6 && col <= 16) {
        setPixel(bitmap, colorMap, col, row, 1, COLORS.GREEN);
      }
    }
  }

  drawBlankLine(bitmap, colorMap, 26);

  drawDNAHelixBorders(bitmap, colorMap);
}

export function drawNucleotideFormulas(bitmap: number[], colorMap: number[], bases: string[], elements: number[], lifeForm: string): void {
  const nucleotideData = getNucleotideVariation(lifeForm, elements);

  for (let i = 0; i < Math.min(nucleotideData.bases.length, 4); i++) {
    const base = nucleotideData.bases[i];
    const col = 3 + i * 4;

    drawAdaptedNucleotidePattern(bitmap, colorMap, base, col, elements);
  }

  const sugarFormula = nucleotideData.usesRNA ? [9, 5, 0, 4, 0] : [7, 5, 0, 1, 0];
  drawChemicalFormula(bitmap, colorMap, 1, 12, sugarFormula);
}

export function drawAdaptedNucleotidePattern(bitmap: number[], colorMap: number[], base: any, col: number, elements: number[]): void {
  const fifthElement = elements[4];

  for (let elementIdx = 0; elementIdx < Math.min(4, base.formula.length); elementIdx++) {
    const count = base.formula[elementIdx];
    const row = 12 + elementIdx;

    if (count > 0) {
      setPixel(bitmap, colorMap, col, row, 1, COLORS.GREEN);

      if (count >= 4) {
        setPixel(bitmap, colorMap, col + 1, row, 1, COLORS.GREEN);
      }
      if (count >= 7) {
        setPixel(bitmap, colorMap, col - 1, row, 1, COLORS.GREEN);
      }
    }
  }

  const fifthElementCount = base.formula[4] || 0;
  if (fifthElementCount > 0) {
    drawFifthElementPattern(bitmap, colorMap, col, 16, fifthElement, fifthElementCount);
  }
}

export function drawFifthElementPattern(bitmap: number[], colorMap: number[], col: number, row: number, element: number, count: number): void {
  switch (element) {
    case 15:
      setPixel(bitmap, colorMap, col, row, 1, COLORS.GREEN);
      if (count >= 2) setPixel(bitmap, colorMap, col + 1, row, 1, COLORS.GREEN);
      break;

    case 16:
      setPixel(bitmap, colorMap, col, row, 1, COLORS.GREEN);
      setPixel(bitmap, colorMap, col, row + 1, 1, COLORS.GREEN);
      if (count >= 2) setPixel(bitmap, colorMap, col + 1, row, 1, COLORS.GREEN);
      break;

    case 12:
      setPixel(bitmap, colorMap, col, row, 1, COLORS.GREEN);
      setPixel(bitmap, colorMap, col - 1, row, 1, COLORS.GREEN);
      setPixel(bitmap, colorMap, col + 1, row, 1, COLORS.GREEN);
      break;

    case 20:
      setPixel(bitmap, colorMap, col, row, 1, COLORS.GREEN);
      setPixel(bitmap, colorMap, col + 1, row, 1, COLORS.GREEN);
      setPixel(bitmap, colorMap, col, row + 1, 1, COLORS.GREEN);
      setPixel(bitmap, colorMap, col + 1, row + 1, 1, COLORS.GREEN);
      break;

    case 26:
      setPixel(bitmap, colorMap, col, row, 1, COLORS.GREEN);
      setPixel(bitmap, colorMap, col - 1, row, 1, COLORS.GREEN);
      setPixel(bitmap, colorMap, col + 1, row, 1, COLORS.GREEN);
      setPixel(bitmap, colorMap, col, row - 1, 1, COLORS.GREEN);
      setPixel(bitmap, colorMap, col, row + 1, 1, COLORS.GREEN);
      break;

    case 19:
      setPixel(bitmap, colorMap, col, row, 1, COLORS.GREEN);
      if (count >= 2) setPixel(bitmap, colorMap, col + 2, row, 1, COLORS.GREEN);
      break;

    case 11:
      setPixel(bitmap, colorMap, col, row, 1, COLORS.GREEN);
      if (count >= 2) setPixel(bitmap, colorMap, col + 1, row + 1, 1, COLORS.GREEN);
      break;

    default:
      setPixel(bitmap, colorMap, col, row, 1, COLORS.GREEN);
  }
}

export function drawSugarPhosphateBackbone(bitmap: number[], colorMap: number[], elements: number[]): void {
  setPixel(bitmap, colorMap, 11, 18, 1, COLORS.GREEN);
  setPixel(bitmap, colorMap, 11, 19, 1, COLORS.GREEN);

  setPixel(bitmap, colorMap, 10, 17, 1, COLORS.GREEN);
  setPixel(bitmap, colorMap, 12, 17, 1, COLORS.GREEN);
  setPixel(bitmap, colorMap, 10, 20, 1, COLORS.GREEN);
  setPixel(bitmap, colorMap, 12, 20, 1, COLORS.GREEN);

  setPixel(bitmap, colorMap, 6, 18, 1, COLORS.GREEN);
  setPixel(bitmap, colorMap, 7, 18, 1, COLORS.GREEN);
  setPixel(bitmap, colorMap, 15, 18, 1, COLORS.GREEN);
  setPixel(bitmap, colorMap, 16, 18, 1, COLORS.GREEN);
}

export function drawGenomeSize(bitmap: number[], colorMap: number[], elements: number[], lifeForm: string): void {
  const nucleotideData = getNucleotideVariation(lifeForm, elements);
  const genomeSizeData = getGenomeSizeData(lifeForm, "Earth", elements);

  const geneCount = Math.floor(genomeSizeData.genes / 1000);
  for (let col = 8; col <= Math.min(14, 8 + geneCount); col++) {
    setPixel(bitmap, colorMap, col, 22, 1, COLORS.GREEN);
  }

  const gcPattern = genomeSizeData.gcContent;
  for (let col = 9; col <= 13; col++) {
    if (gcPattern === "high" && col % 2 === 1) {
      setPixel(bitmap, colorMap, col, 23, 1, COLORS.GREEN);
    } else if (gcPattern === "moderate" && (col === 10 || col === 12)) {
      setPixel(bitmap, colorMap, col, 23, 1, COLORS.GREEN);
    } else if (gcPattern === "variable") {
      setPixel(bitmap, colorMap, col, 23, 1, COLORS.GREEN);
    }
  }

  const chromosomes = genomeSizeData.chromosomes;
  for (let i = 0; i < Math.min(chromosomes, 7); i++) {
    setPixel(bitmap, colorMap, 8 + i, 24, 1, COLORS.GREEN);
  }

  const totalSize = Math.floor(Math.log10(genomeSizeData.totalBases / 1000000));
  for (let col = 9; col <= Math.min(15, 9 + totalSize); col++) {
    setPixel(bitmap, colorMap, col, 25, 1, COLORS.GREEN);
  }

  setPixel(bitmap, colorMap, 5, 22, 1, COLORS.GREEN);
  setPixel(bitmap, colorMap, 17, 25, 1, COLORS.GREEN);
}

export function drawCarbonBasedElements(bitmap: number[], colorMap: number[], elements: number[]): void {
  const centerCol = 11;
  const startRow = 5;

  drawElementBinary(bitmap, colorMap, elements[0], 9, startRow + 4, 4);
  drawElementBinary(bitmap, colorMap, elements[1], 11, startRow + 3, 5);
  setPixel(bitmap, colorMap, 10, startRow + 1, 1, COLORS.PURPLE);
  setPixel(bitmap, colorMap, 12, startRow + 1, 1, COLORS.PURPLE);
  drawElementBinary(bitmap, colorMap, elements[2], 13, startRow + 4, 4);
  drawElementBinary(bitmap, colorMap, elements[3], 7, startRow + 3, 4);
  drawElementBinary(bitmap, colorMap, elements[4], 15, startRow + 2, 5);
}

export function drawSiliconBasedElements(bitmap: number[], colorMap: number[], elements: number[]): void {
  const centerCol = 11;
  const startRow = 5;

  for (let i = 0; i < elements.length && i < 5; i++) {
    const angles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2, Math.PI / 4];
    const radius = 3 + (i % 2);
    const col = Math.floor(centerCol + radius * Math.cos(angles[i]));
    const rowOffset = Math.floor(radius * Math.sin(angles[i]) * 0.5);

    drawElementBinary(bitmap, colorMap, elements[i], col, startRow + 2 + rowOffset, 4);

    if (i > 0) {
      setPixel(bitmap, colorMap, centerCol, startRow + 2, 1, COLORS.PURPLE);
    }
  }
}

export function drawRoboticElements(bitmap: number[], colorMap: number[], elements: number[]): void {
  const startRow = 5;

  const robotHash = elements.join("");
  const robotRng = createSeededRandom(hashString(robotHash + "robotic"));

  const layoutPatterns = [
    [5, 8, 11, 14, 17],
    [4, 7, 11, 15, 18],
    [6, 9, 11, 13, 16],
    [3, 8, 11, 14, 19],
    [5, 9, 11, 13, 17],
  ];

  const patternIndex = Math.floor(robotRng.random() * layoutPatterns.length);
  const positions = layoutPatterns[patternIndex];

  for (let i = 0; i < elements.length && i < 5; i++) {
    const baseCol = positions[i];
    const colVariation = Math.floor(robotRng.random() * 3) - 1;
    const col = Math.max(3, Math.min(19, baseCol + colVariation));

    const heightVariation = Math.floor(robotRng.random() * 2);
    const componentHeight = 3 + heightVariation;

    drawElementBinary(bitmap, colorMap, elements[i], col, startRow + 2, componentHeight);

    if (i > 0) {
      const prevCol = Math.max(3, Math.min(19, positions[i - 1] + (Math.floor(robotRng.random() * 3) - 1)));
      const connectionType = Math.floor(robotRng.random() * 3);

      switch (connectionType) {
        case 0:
          for (let c = Math.min(prevCol, col) + 1; c < Math.max(prevCol, col); c++) {
            setPixel(bitmap, colorMap, c, startRow + 4, 1, COLORS.PURPLE);
          }
          break;
        case 1:
          const midPoint = Math.floor((prevCol + col) / 2);
          for (let c = prevCol + 1; c <= midPoint; c++) {
            if (c % 2 === 0) setPixel(bitmap, colorMap, c, startRow + 4, 1, COLORS.PURPLE);
          }
          for (let c = midPoint + 1; c < col; c++) {
            if (c % 2 === 1) setPixel(bitmap, colorMap, c, startRow + 4, 1, COLORS.PURPLE);
          }
          break;
        case 2:
          setPixel(bitmap, colorMap, Math.floor((prevCol + col) / 2), startRow + 3, 1, COLORS.PURPLE);
          setPixel(bitmap, colorMap, Math.floor((prevCol + col) / 2), startRow + 4, 1, COLORS.PURPLE);
          setPixel(bitmap, colorMap, Math.floor((prevCol + col) / 2), startRow + 5, 1, COLORS.PURPLE);
          break;
      }
    }

    setPixel(bitmap, colorMap, col, startRow + 4, 1, COLORS.PURPLE);
    setPixel(bitmap, colorMap, col, startRow + 1, 1, COLORS.PURPLE);

    if (elements[i] >= 29) {
      if (robotRng.random() > 0.5) {
        setPixel(bitmap, colorMap, col, startRow, 1, COLORS.PURPLE);
      }
      if (robotRng.random() > 0.5) {
        setPixel(bitmap, colorMap, col, startRow + 5, 1, COLORS.PURPLE);
      }
    }

    if (elements[i] === 14 || elements[i] === 32) {
      if (robotRng.random() > 0.6) {
        setPixel(bitmap, colorMap, col - 1, startRow + 2, 1, COLORS.PURPLE);
        setPixel(bitmap, colorMap, col + 1, startRow + 2, 1, COLORS.PURPLE);
      }
    }
  }
}

export function drawGaseousElements(bitmap: number[], colorMap: number[], elements: number[]): void {
  const centerCol = 11;
  const startRow = 5;

  const gasHash = elements.join("");
  const gasRng = createSeededRandom(hashString(gasHash + "gaseous"));

  for (let i = 0; i < elements.length && i < 5; i++) {
    const baseSpread = 2 + i;
    const spreadVariation = Math.floor(gasRng.random() * 3) - 1;
    const spread = Math.max(1, baseSpread + spreadVariation);

    const baseCol = centerCol + (i % 2 === 0 ? -spread : spread);
    const colVariation = Math.floor(gasRng.random() * 3) - 1;
    const col = Math.max(0, Math.min(22, baseCol + colVariation));

    const baseRowOffset = Math.floor(i / 2);
    const rowVariation = Math.floor(gasRng.random() * 2);
    const rowOffset = baseRowOffset + rowVariation;

    drawElementBinary(bitmap, colorMap, elements[i], col, startRow + rowOffset, 3);

    if (gasRng.random() > 0.3) {
      const particleCol = Math.max(0, Math.min(22, col + Math.floor(gasRng.random() * 3) - 1));
      const particleRow = Math.max(startRow, Math.min(HEIGHT - 1, startRow + rowOffset + Math.floor(gasRng.random() * 3) - 1));
      setPixel(bitmap, colorMap, particleCol, particleRow, 1, COLORS.PURPLE);
    }
  }
}

export function drawEnergyElements(bitmap: number[], colorMap: number[], elements: number[]): void {
  const centerCol = 11;
  const startRow = 5;

  for (let i = 0; i < elements.length && i < 5; i++) {
    const phase = (i * Math.PI) / 2;
    const amplitude = 3;

    for (let step = 0; step < 5; step++) {
      const col = centerCol + Math.floor(amplitude * Math.sin(phase + step * 0.5)) - 2 + i;
      const row = startRow + step;

      if (col >= 0 && col < 23) {
        const binary = elements[i].toString(2);
        if (step < binary.length) {
          const bitValue = parseInt(binary[binary.length - 1 - step]);
          setPixel(bitmap, colorMap, col, row, bitValue, COLORS.PURPLE);
        }
      }
    }
  }
}

export function drawDivineElements(bitmap: number[], colorMap: number[], elements: number[]): void {
  const centerCol = 11;
  const centerRow = 7;

  for (let i = 0; i < elements.length && i < 5; i++) {
    const angle = (i * 2 * Math.PI) / 5;
    const innerRadius = 2;
    const outerRadius = 4;

    const innerCol = Math.floor(centerCol + innerRadius * Math.cos(angle));
    const innerRow = Math.floor(centerRow + innerRadius * Math.sin(angle) * 0.5);

    const outerCol = Math.floor(centerCol + outerRadius * Math.cos(angle));
    const outerRow = Math.floor(centerRow + outerRadius * Math.sin(angle) * 0.5);

    drawElementBinary(bitmap, colorMap, elements[i], innerCol, innerRow, 2);
    drawElementBinary(bitmap, colorMap, elements[i], outerCol, outerRow, 2);

    drawLine(bitmap, colorMap, innerCol, innerRow, outerCol, outerRow, COLORS.PURPLE);
    drawLine(bitmap, colorMap, centerCol, centerRow, innerCol, innerRow, COLORS.PURPLE);
  }
}

export function drawElementBinary(bitmap: number[], colorMap: number[], value: number, col: number, startRow: number, maxBits: number): void {
  const binary = value.toString(2);

  for (let bit = 0; bit < Math.min(binary.length, maxBits); bit++) {
    const row = startRow - bit;
    const bitValue = parseInt(binary[binary.length - 1 - bit]);
    if (row >= 5 && row <= 9) {
      setPixel(bitmap, colorMap, col, row, bitValue, COLORS.PURPLE);
    }
  }
}

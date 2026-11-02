// Utils/arecibo/data.ts — Chemistry tables: which elements, nucleotides and genome sizes a life form gets.
// Lifted verbatim from LifeAreciboTranslator.tsx (05 §3.1 split, 2026-10-29).

import { createSeededRandom, hashString } from "./primitives.ts";

export function getSilicateBonds(element: string): number[] {
  const bondPatterns: { [key: string]: number[] } = {
    Si: [1, 1, 0, 4, 0],
    O: [0, 2, 0, 2, 0],
    Al: [2, 0, 1, 3, 0],
    Fe: [1, 0, 2, 3, 0],
    Mg: [0, 1, 0, 2, 1],
    Ca: [1, 1, 1, 2, 1],
    K: [0, 0, 1, 1, 0],
    Na: [0, 0, 1, 1, 0],
    H: [1, 0, 0, 1, 0],
    S: [0, 1, 1, 2, 2],
    P: [0, 1, 0, 3, 1],
    Ti: [2, 1, 0, 4, 0],
    V: [1, 2, 1, 3, 0],
    Cr: [2, 0, 2, 2, 0],
    Mn: [1, 1, 2, 2, 0],
    Co: [1, 0, 1, 2, 1],
    Ni: [0, 2, 1, 2, 0],
    Cu: [2, 0, 0, 2, 0],
    Zn: [0, 1, 1, 2, 0],
    Li: [0, 0, 0, 1, 0],
    Be: [0, 0, 1, 2, 0],
    B: [0, 1, 2, 3, 0],
    F: [1, 0, 0, 1, 0],
    Cl: [1, 0, 0, 1, 0],
    Sr: [1, 1, 0, 2, 2],
    Y: [2, 1, 1, 3, 0],
    Zr: [2, 2, 0, 4, 0],
  };

  return bondPatterns[element] || [1, 1, 1, 2, 0];
}

export function getEnergyFrequency(state: string): number {
  const freqMap: { [key: string]: number } = {
    α: 1,
    β: 2,
    γ: 3,
    δ: 4,
    ε: 1.5,
    ζ: 2.5,
    η: 3.5,
    θ: 4.5,
    ι: 1.2,
    κ: 2.2,
    λ: 3.2,
    μ: 4.2,
    ν: 1.8,
    ξ: 2.8,
    ο: 3.8,
    π: 4.8,
    ρ: 2.3,
    σ: 3.3,
    τ: 4.3,
    υ: 1.7,
    φ: 2.7,
    χ: 3.7,
    ψ: 4.7,
    ω: 5,
    "∆": 6,
    "∇": 7,
    "∞": 8,
    Ω: 9,
    Φ: 10,
    Ψ: 11,
    "≈": 12,
    "∼": 13,
    "※": 14,
    "⟨⟩": 15,
    "◊": 16,
    "◎": 17,
  };

  return freqMap[state] || Math.abs(state.charCodeAt(0) % 10) + 1;
}

export function getEnergyPattern(state: string): string {
  const patterns: { [key: string]: string } = {
    α: "wave",
    β: "pulse",
    γ: "spiral",
    δ: "zigzag",
    ε: "sine",
    ζ: "square",
    η: "triangle",
    θ: "sawtooth",
    ι: "burst",
    κ: "ripple",
    λ: "vortex",
    μ: "standing",
    ν: "modulated",
    ξ: "interference",
    ο: "resonance",
    π: "harmonic",
    ρ: "quantum",
    σ: "coherent",
    τ: "entangled",
    υ: "superposed",
    φ: "phase",
    χ: "amplitude",
    ψ: "frequency",
    ω: "complex",
    "∆": "dimensional",
    "∇": "gradient",
    "∞": "infinite",
    Ω: "omega",
    Φ: "phi",
    Ψ: "psi",
    "≈": "approximate",
    "∼": "similar",
    "※": "reference",
    "⟨⟩": "bracket",
    "◊": "diamond",
    "◎": "target",
  };

  return patterns[state] || "default";
}

export function calculateEnergyPattern(pattern: string, phase: number, step: number): boolean {
  switch (pattern) {
    case "wave":
      return Math.sin(phase) > 0;
    case "pulse":
      return step % 2 === 0;
    case "spiral":
      return Math.sin(phase) + Math.cos(phase * 1.5) > 0;
    case "zigzag":
      return step % 2 === Math.floor(phase) % 2;
    case "sine":
      return Math.sin(phase * 2) > 0.5;
    case "square":
      return Math.sin(phase) > 0;
    case "triangle":
      return Math.abs(Math.sin(phase)) > 0.5;
    case "burst":
      return step === 0 || step === 3;
    case "ripple":
      return Math.sin(phase + step) > 0.3;
    case "vortex":
      return (step + Math.floor(phase * 2)) % 3 !== 0;
    case "quantum":
      return Math.random() > 0.3;
    case "interference":
      return Math.sin(phase) + Math.sin(phase * 1.7) > 0;
    case "dimensional":
      return step < 2;
    case "infinite":
      return true;
    default:
      return Math.sin(phase) > 0;
  }
}

export function calculateFieldIntensity(pattern: string, phase: number, step: number, side: string): number {
  const baseIntensity = (Math.sin(phase) + 1) / 2;

  switch (pattern) {
    case "wave":
      return baseIntensity;
    case "pulse":
      return step % 3 === 0 ? 1 : 0;
    case "spiral":
      return Math.abs(Math.sin(phase + step * 0.3));
    case "zigzag":
      return side === "left" ? baseIntensity : 1 - baseIntensity;
    case "interference":
      return Math.abs(Math.sin(phase) + Math.sin(phase * 1.618)) / 2;
    case "quantum":
      return Math.random() > 0.4 ? Math.random() : 0;
    case "vortex":
      return Math.abs(Math.cos(phase + step * 0.1)) * baseIntensity;
    case "standing":
      return step % 4 < 2 ? baseIntensity : 0;
    case "dimensional":
      return Math.pow(baseIntensity, 2);
    case "infinite":
      return 0.7;
    case "phase":
      return Math.abs(Math.sin(phase + Math.PI / 4));
    case "resonance":
      return baseIntensity > 0.8 ? 1 : baseIntensity * 0.3;
    default:
      return baseIntensity * 0.6;
  }
}

export function getComplementaryBases(bases: string[]): string[] {
  const complements: { [key: string]: string } = {
    A: "T",
    T: "A",
    G: "C",
    C: "G",
    U: "A",
    X: "X",
  };

  return bases.map((base) => complements[base] || "X");
}

export function getPhosphateEquivalent(elements: number[]): number {
  return elements.includes(15) ? 15 : elements[elements.length - 1];
}

export function getLifeCategory(lifeForm: string): string {
  const categories: { [key: string]: string } = {
    Bacteria: "carbon-based",
    Vegetation: "carbon-based",
    "Animal Life": "carbon-based",
    "Intelligent Life": "carbon-based",
    "Vegetable Animals": "carbon-based",
    "Silicon-Based Life": "silicon-based",
    "Robotic Entities": "robotic",
    "Conscious Gas": "gaseous",
    "Non-Physical Entity": "energy",
    "Have I just found God?": "divine",
  };

  return categories[lifeForm] || "carbon-based";
}

export function getElementsForLifeForm(lifeForm: string, planetName?: string): number[] {
  const elementSets: { [key: string]: number[] } = {
    Bacteria: [1, 6, 7, 8, 15],
    Vegetation: [1, 6, 7, 8, 12],
    "Animal Life": [1, 6, 7, 8, 20],
    "Intelligent Life": [1, 6, 7, 8, 15],
    "Vegetable Animals": [1, 6, 7, 8, 26],

    "Silicon-Based Life": [1, 14, 8, 13, 16],
    "Robotic Entities": [14, 29, 79, 47, 6],
    "Conscious Gas": [1, 2, 10, 18, 36],
    "Non-Physical Entity": [1, 3, 11, 19, 37],
    "Have I just found God?": [1, 2, 3, 4, 5],
  };

  let baseElements = elementSets[lifeForm] || [1, 6, 7, 8, 15];

  if (!planetName || planetName === "Earth") {
    return baseElements;
  }

  const hash = hashString(lifeForm + planetName + "elements");
  const rng = createSeededRandom(hash);

  if (lifeForm === "Intelligent Life") {
    const coreElements = [1, 6, 7, 8];

    const possibleFifthElements = [15, 16, 12, 20, 26, 19, 11];

    const fifthElementIndex = Math.floor(rng.random() * possibleFifthElements.length);
    const fifthElement = possibleFifthElements[fifthElementIndex];

    const variedElements = [...coreElements, fifthElement];
    const elementNames = { 11: "Na", 12: "Mg", 15: "P", 16: "S", 19: "K", 20: "Ca", 26: "Fe" };

    return variedElements;
  }

  if (lifeForm === "Bacteria") {
    const coreElements = [1, 6, 7, 8];

    const possibleBacterialElements = [15, 16, 26, 25, 24, 28, 27, 42, 74];

    const fifthElementIndex = Math.floor(rng.random() * possibleBacterialElements.length);
    const fifthElement = possibleBacterialElements[fifthElementIndex];

    const variedElements = [...coreElements, fifthElement];
    const elementNames = { 15: "P", 16: "S", 24: "Cr", 25: "Mn", 26: "Fe", 27: "Co", 28: "Ni", 42: "Mo", 74: "W" };

    return variedElements;
  }

  if (lifeForm === "Vegetable Animals") {
    const coreElements = [1, 6, 7, 8];

    const possibleHybridElements = [26, 12, 20, 29, 25, 30, 42, 27, 28];

    const fifthElementIndex = Math.floor(rng.random() * possibleHybridElements.length);
    const fifthElement = possibleHybridElements[fifthElementIndex];

    const variedElements = [...coreElements, fifthElement];
    const elementNames = { 12: "Mg", 20: "Ca", 25: "Mn", 26: "Fe", 27: "Co", 28: "Ni", 29: "Cu", 30: "Zn", 42: "Mo" };

    return variedElements;
  }

  if (lifeForm === "Vegetation") {
    const coreElements = [1, 6, 7, 8];

    const possiblePlantElements = [12, 26, 29, 30, 25, 42, 16, 20];

    const fifthElementIndex = Math.floor(rng.random() * possiblePlantElements.length);
    const fifthElement = possiblePlantElements[fifthElementIndex];

    const variedElements = [...coreElements, fifthElement];
    const elementNames = { 12: "Mg", 16: "S", 20: "Ca", 25: "Mn", 26: "Fe", 29: "Cu", 30: "Zn", 42: "Mo" };

    return variedElements;
  }

  if (lifeForm === "Silicon-Based Life") {
    const coreElements = [14, 8];

    const possibleSiliconElements = [
      [1, 13, 16],
      [13, 26, 12],
      [20, 19, 11],
      [26, 24, 28],
      [12, 25, 30],
      [22, 23, 27],
      [40, 39, 38],
      [3, 4, 9],
      [5, 15, 17],
    ];

    const elementSetIndex = Math.floor(rng.random() * possibleSiliconElements.length);
    const additionalElements = possibleSiliconElements[elementSetIndex];

    const variedElements = [...coreElements, ...additionalElements];

    return variedElements;
  }

  if (lifeForm === "Non-Physical Entity") {
    const energyTypeCodes = [
      [1, 2, 7, 10],
      [3, 4, 8, 11],
      [5, 6, 9, 12],
      [13, 14, 15, 16],
      [17, 18, 19, 20],
      [21, 22, 23, 24],
      [25, 26, 27, 28],
      [29, 30, 31, 32],
      [33, 34, 35, 36],
    ];

    const energySetIndex = Math.floor(rng.random() * energyTypeCodes.length);
    const selectedEnergyTypes = energyTypeCodes[energySetIndex];

    return selectedEnergyTypes;
  }

  if (lifeForm === "Conscious Gas") {
    const coreElements = [1, 2];

    const possibleGaseousElements = [10, 18, 36, 54, 7, 8, 9, 17, 35];

    const selectedElements = [...coreElements];
    const shuffledElements = [...possibleGaseousElements];

    for (let i = shuffledElements.length - 1; i > 0; i--) {
      const j = Math.floor(rng.random() * (i + 1));
      [shuffledElements[i], shuffledElements[j]] = [shuffledElements[j], shuffledElements[i]];
    }

    selectedElements.push(...shuffledElements.slice(0, 3));

    const elementNames = {
      1: "H",
      2: "He",
      7: "N",
      8: "O",
      9: "F",
      10: "Ne",
      17: "Cl",
      18: "Ar",
      35: "Br",
      36: "Kr",
      54: "Xe",
    };
    const selectedNames = selectedElements.map((e) => elementNames[e] || e).join(", ");

    return selectedElements;
  }

  if (lifeForm === "Robotic Entities") {
    const coreElements = [14, 6];

    const possibleRoboticElements = [29, 79, 47, 13, 26, 28, 22, 31, 32, 33, 49, 50, 74];

    const selectedElements = [...coreElements];
    const shuffledElements = [...possibleRoboticElements];

    for (let i = shuffledElements.length - 1; i > 0; i--) {
      const j = Math.floor(rng.random() * (i + 1));
      [shuffledElements[i], shuffledElements[j]] = [shuffledElements[j], shuffledElements[i]];
    }

    selectedElements.push(...shuffledElements.slice(0, 3));

    const elementNames = {
      6: "C",
      13: "Al",
      14: "Si",
      22: "Ti",
      26: "Fe",
      28: "Ni",
      29: "Cu",
      31: "Ga",
      32: "Ge",
      33: "As",
      47: "Ag",
      49: "In",
      50: "Sn",
      74: "W",
      79: "Au",
    };
    const selectedNames = selectedElements.map((e) => elementNames[e] || e).join(", ");

    return selectedElements;
  }

  return baseElements;
}

export function getNitrogenBases(lifeForm: string, planetName?: string): string[] {
  const baseSets: { [key: string]: string[] } = {
    Bacteria: ["A", "T", "G", "C"],
    Vegetation: ["A", "T", "G", "C"],
    "Animal Life": ["A", "T", "G", "C"],
    "Intelligent Life": ["A", "T", "G", "C"],
    "Vegetable Animals": ["A", "T", "G", "C"],

    "Silicon-Based Life": ["Si", "Al", "O", "S"],
    "Robotic Entities": ["0", "1", "X", "Z"],
    "Conscious Gas": ["|0⟩", "|1⟩", "|+⟩", "|-⟩"],
    "Non-Physical Entity": ["α", "β", "γ", "δ"],
    "Have I just found God?": ["∞", "Ω", "Φ", "Ψ"],
  };

  let baseBases = baseSets[lifeForm] || ["A", "T", "G", "C"];

  if (!planetName || planetName === "Earth") {
    return baseBases;
  }

  if (lifeForm === "Silicon-Based Life") {
    const planetElements = getElementsForLifeForm(lifeForm, planetName);

    const elementSymbols: { [key: number]: string } = {
      1: "H",
      3: "Li",
      4: "Be",
      5: "B",
      8: "O",
      9: "F",
      11: "Na",
      12: "Mg",
      13: "Al",
      14: "Si",
      15: "P",
      16: "S",
      17: "Cl",
      19: "K",
      20: "Ca",
      22: "Ti",
      23: "V",
      24: "Cr",
      25: "Mn",
      26: "Fe",
      27: "Co",
      28: "Ni",
      29: "Cu",
      30: "Zn",
      38: "Sr",
      39: "Y",
      40: "Zr",
    };

    const silicateBases = planetElements.slice(0, 4).map((atomicNumber) => elementSymbols[atomicNumber] || atomicNumber.toString());

    while (silicateBases.length < 4) {
      silicateBases.push("Si");
    }

    return silicateBases;
  }

  if (lifeForm === "Non-Physical Entity") {
    const energyTypes = getElementsForLifeForm(lifeForm, planetName);

    const energyStateSymbols: { [key: number]: string } = {
      1: "α",
      2: "β",
      3: "γ",
      4: "δ",
      5: "ε",
      6: "ζ",
      7: "η",
      8: "θ",
      9: "ι",
      10: "κ",
      11: "λ",
      12: "μ",
      13: "ν",
      14: "ξ",
      15: "ο",
      16: "π",
      17: "ρ",
      18: "σ",
      19: "τ",
      20: "υ",
      21: "φ",
      22: "χ",
      23: "ψ",
      24: "ω",
      25: "∆",
      26: "∇",
      27: "∞",
      28: "Ω",
      29: "Φ",
      30: "Ψ",
      31: "≈",
      32: "∼",
      33: "※",
      34: "⟨⟩",
      35: "◊",
      36: "◎",
    };

    const energyStates = energyTypes.slice(0, 4).map((code) => energyStateSymbols[code] || `E${code}`);

    while (energyStates.length < 4) {
      energyStates.push("∅");
    }

    return energyStates;
  }

  if (lifeForm === "Intelligent Life") {
    const hash = hashString(lifeForm + planetName + "bases");
    const rng = createSeededRandom(hash);

    const standardBases = ["A", "T", "G", "C"];

    const alternativeBases = ["U", "I", "X", "D", "P", "M"];

    if (rng.random() < 0.85) {
      return standardBases;
    } else {
      const numReplacements = Math.floor(rng.random() * 2) + 1;
      const modifiedBases = [...standardBases];

      for (let i = 0; i < numReplacements; i++) {
        const indexToReplace = Math.floor(rng.random() * 4);
        const alternativeIndex = Math.floor(rng.random() * alternativeBases.length);
        modifiedBases[indexToReplace] = alternativeBases[alternativeIndex];
      }

      return modifiedBases;
    }
  }

  return baseBases;
}

export function getNucleotideVariation(lifeForm: string, elements: number[]): any {
  const elementMap = createElementMap(elements);

  const nucleotideData = generateElementBasedNucleotides(elementMap, lifeForm);

  return nucleotideData;
}

export function createElementMap(elements: number[]): { [key: string]: boolean } {
  const elementNames: { [key: number]: string } = {
    1: "H",
    6: "C",
    7: "N",
    8: "O",
    15: "P",
    16: "S",
    14: "Si",
    13: "Al",
    20: "Ca",
    26: "Fe",
    12: "Mg",
    32: "Ge",
    31: "Ga",
    49: "In",
    73: "Ta",
    11: "Na",
    2: "He",
    10: "Ne",
    18: "Ar",
    36: "Kr",
    54: "Xe",
    115: "Mc",
    118: "Og",
    119: "Uue",
    120: "Ubn",
    126: "Ubh",
  };

  const elementMap: { [key: string]: boolean } = {};

  for (const atomicNumber of elements) {
    const elementSymbol = elementNames[atomicNumber];
    if (elementSymbol) {
      elementMap[elementSymbol] = true;
    }
  }

  return elementMap;
}

export function generateElementBasedNucleotides(elementMap: { [key: string]: boolean }, lifeForm: string): any {
  if (elementMap["C"] && elementMap["N"] && elementMap["O"] && elementMap["H"]) {
    return generateCarbonBasedNucleotides(elementMap, lifeForm);
  } else if (elementMap["Si"] && elementMap["O"] && !elementMap["C"]) {
    return generateSiliconBasedNucleotides(elementMap);
  } else if (elementMap["Ga"] || elementMap["Ge"] || elementMap["In"] || elementMap["Ta"]) {
    return generateMetallicNucleotides(elementMap);
  } else if (elementMap["He"] || elementMap["Ne"] || elementMap["Ar"] || elementMap["Kr"] || elementMap["Xe"]) {
    return generateGaseousInformation(elementMap);
  } else if (elementMap["Mc"] || elementMap["Og"] || elementMap["Uue"]) {
    return generateExoticInformation(elementMap);
  }

  return generateGenericInformation(elementMap);
}

export function generateCarbonBasedNucleotides(elementMap: { [key: string]: boolean }, lifeForm: string): any {
  const hasPhosphorus = elementMap["P"];
  const hasSulfur = elementMap["S"];
  const hasMagnesium = elementMap["Mg"];

  const bases = [
    { name: "A", formula: adaptFormulaToElements([5, 5, 5, 0, 1], elementMap) },
    { name: elementMap["O"] && lifeForm !== "Vegetation" ? "T" : "U", formula: adaptFormulaToElements(elementMap["O"] ? [6, 5, 2, 2, 1] : [4, 4, 2, 2, 1], elementMap) },
    { name: "G", formula: adaptFormulaToElements([5, 5, 5, elementMap["O"] ? 1 : 0, 1], elementMap) },
    { name: "C", formula: adaptFormulaToElements([5, 4, 3, elementMap["O"] ? 1 : 0, 1], elementMap) },
  ];

  return {
    bases: bases,
    usesRNA: !elementMap["O"] || lifeForm === "Vegetation",
    gcContent: hasSulfur ? "high" : "moderate",
    backbone: hasPhosphorus ? "phosphate" : hasSulfur ? "sulfate" : "alternative",
    sugarType: elementMap["O"] ? "deoxyribose" : "modified_ribose",
  };
}

export function generateSiliconBasedNucleotides(elementMap: { [key: string]: boolean }): any {
  const siliconBases = [
    { name: "SiO4", formula: [0, 0, 0, 4, 0, 1] },
    { name: "Si2O3", formula: [0, 0, 0, 3, 0, 2] },
    { name: "SiO3Al", formula: [0, 0, 0, 3, 0, 1, 1] },
    { name: "SiO2", formula: [0, 0, 0, 2, 0, 1] },
  ];

  return {
    bases: siliconBases,
    usesRNA: false,
    gcContent: "crystalline",
    backbone: "silicate_chain",
    sugarType: "silicon_cage",
  };
}

export function generateMetallicNucleotides(elementMap: { [key: string]: boolean }): any {
  const metallicBases = [
    { name: "00", formula: [0, 0, 0, 0, 0, 0, 0, 1] },
    { name: "01", formula: [0, 0, 0, 0, 0, 0, 1, 0] },
    { name: "10", formula: [0, 0, 0, 0, 0, 0, 0, 0, 1] },
    { name: "11", formula: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1] },
  ];

  return {
    bases: metallicBases,
    usesRNA: false,
    gcContent: "digital",
    backbone: "metallic_conductor",
    sugarType: "none",
  };
}

export function generateGaseousInformation(elementMap: { [key: string]: boolean }): any {
  const gasStates = [
    { name: "|0⟩", formula: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1] },
    { name: "|1⟩", formula: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1] },
    { name: "|+⟩", formula: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1] },
    { name: "|-⟩", formula: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1] },
  ];

  return {
    bases: gasStates,
    usesRNA: false,
    gcContent: "quantum",
    backbone: "field_interaction",
    sugarType: "none",
  };
}

export function generateExoticInformation(elementMap: { [key: string]: boolean }): any {
  const exoticStates = [
    { name: "α", formula: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1] },
    { name: "β", formula: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1] },
    { name: "γ", formula: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1] },
    { name: "δ", formula: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1] },
  ];

  return {
    bases: exoticStates,
    usesRNA: false,
    gcContent: "cosmic",
    backbone: "spacetime_fabric",
    sugarType: "none",
  };
}

export function generateGenericInformation(elementMap: { [key: string]: boolean }): any {
  const availableElements = Object.keys(elementMap);
  const genericBases = [];

  for (let i = 0; i < Math.min(4, availableElements.length); i++) {
    const formula = new Array(15).fill(0);
    formula[i] = 1;

    genericBases.push({
      name: availableElements[i],
      formula: formula,
    });
  }

  return {
    bases: genericBases,
    usesRNA: false,
    gcContent: "variable",
    backbone: "elemental",
    sugarType: "adapted",
  };
}

export function adaptFormulaToElements(baseFormula: number[], elementMap: { [key: string]: boolean }): number[] {
  const elementOrder = ["H", "C", "N", "O", "P"];
  const adaptedFormula = [...baseFormula];

  if (adaptedFormula[4] > 0) {
    const substitutions: { [key: string]: number } = {
      S: 1,
      Mg: 0.5,
      Ca: 0.5,
      Fe: 1,
      K: 1,
      Na: 1,
    };

    for (const [element, multiplier] of Object.entries(substitutions)) {
      if (elementMap[element] && !elementMap["P"]) {
        const originalP = adaptedFormula[4];
        adaptedFormula[4] = Math.max(1, Math.floor(originalP * multiplier));
        break;
      }
    }
  }

  if (elementMap["S"] && adaptedFormula[4] > 0) {
    adaptedFormula[3] = Math.max(1, adaptedFormula[3] - 1);
    adaptedFormula[4] = adaptedFormula[4] + 1;
  }

  if (elementMap["Mg"] && adaptedFormula[3] > 0) {
    adaptedFormula[3] = adaptedFormula[3] + 1;
  }

  return adaptedFormula;
}

export function getGenomeSizeData(lifeForm: string, planetName: string, elements: number[]): any {
  const genomicData: { [key: string]: any } = {
    Bacteria: {
      totalBases: 4641652,
      genes: 4288,
      gcContent: "high",
      chromosomes: 1,
      complexity: "simple",
      modification: "methylation",
      plasmids: true,
      repetitiveElements: 3.2,
    },

    Vegetation: {
      totalBases: 125000000,
      genes: 27416,
      gcContent: "moderate",
      chromosomes: 5,
      complexity: "moderate",
      modification: "chloroplast",
      mitochondrial: 367808,
      repetitiveElements: 14,
    },

    "Animal Life": {
      totalBases: 3200000000,
      genes: 19969,
      gcContent: "variable",
      chromosomes: 23,
      complexity: "very_high",
      modification: "epigenetic",
      introns: 95,
      repetitiveElements: 45,
    },

    "Intelligent Life": {
      totalBases: 3200000000,
      genes: 19969,
      gcContent: "optimized",
      chromosomes: 23,
      complexity: "enhanced",
      modification: "advanced_epigenetic",
      enhancedRegulation: true,
      repetitiveElements: 35,
    },

    "Vegetable Animals": {
      totalBases: 600000000,
      genes: 23000,
      gcContent: "mixed",
      chromosomes: 16,
      complexity: "chimeric",
      modification: "dual_system",
      chloroplasts: true,
      repetitiveElements: 25,
    },
  };

  const speculativeData: { [key: string]: any } = {
    "Silicon-Based Life": {
      totalBases: 2000000,
      genes: 8000,
      gcContent: "crystalline",
      chromosomes: 3,
      complexity: "moderate",
      modification: "doping",
      repetitiveElements: 60,
    },

    "Robotic Entities": {
      totalBases: 2147483647,
      genes: 65536,
      gcContent: "binary",
      chromosomes: 8,
      complexity: "digital",
      modification: "compilation",
      repetitiveElements: 20,
    },

    "Conscious Gas": {
      totalBases: 1048576,
      genes: 256,
      gcContent: "quantum",
      chromosomes: 4,
      complexity: "quantum",
      modification: "entanglement",
      repetitiveElements: 0,
    },

    "Non-Physical Entity": {
      totalBases: 299792458,
      genes: 2000,
      gcContent: "energy",
      chromosomes: 7,
      complexity: "energetic",
      modification: "resonance",
      repetitiveElements: 10,
    },

    "Have I just found God?": {
      totalBases: 3141592653,
      genes: 137,
      gcContent: "infinite",
      chromosomes: 11,
      complexity: "cosmic",
      modification: "omnipresence",
      repetitiveElements: 0,
    },
  };

  let baseData: any;
  if (genomicData[lifeForm]) {
    baseData = genomicData[lifeForm];
  } else if (speculativeData[lifeForm]) {
    baseData = speculativeData[lifeForm];
  } else {
    const complexity = elements.reduce((sum, atomic) => sum + atomic, 0);
    if (complexity < 100) baseData = genomicData["Bacteria"];
    else if (complexity < 200) baseData = genomicData["Vegetation"];
    else baseData = genomicData["Animal Life"];
  }

  const hash = hashString(lifeForm + planetName);
  const rng = createSeededRandom(hash);

  const variedData = { ...baseData };

  const variationRange = lifeForm === "Intelligent Life" ? 0.1 : 0.2;
  const baseVariation = (rng.random() - 0.5) * 2 * variationRange;
  variedData.totalBases = Math.floor(baseData.totalBases * (1 + baseVariation));

  const geneVariation = (rng.random() - 0.5) * 2 * 0.15;
  variedData.genes = Math.floor(baseData.genes * (1 + geneVariation));

  if (typeof baseData.repetitiveElements === "number") {
    const repVariation = (rng.random() - 0.5) * 2 * 0.05;
    variedData.repetitiveElements = Math.max(0, baseData.repetitiveElements * (1 + repVariation));
  }

  return variedData;
}

export function getGenomeSize(elements: number[]): number {
  const complexity = elements.reduce((sum, atomic) => sum + atomic, 0);

  if (complexity < 50) return 4000000;
  if (complexity < 100) return 150000000;
  if (complexity < 150) return 1000000000;
  if (complexity < 200) return 3000000000;
  if (complexity < 250) return 3200000000;
  if (complexity < 500) return 2147483647;
  return 4294967295;
}

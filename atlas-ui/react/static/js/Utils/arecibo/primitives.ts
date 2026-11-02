// Utils/arecibo/primitives.ts — Pixel primitives, seeded RNG, and the 23×73 grid constants.
// Lifted verbatim from LifeAreciboTranslator.tsx (05 §3.1 split, 2026-10-29).

export const WIDTH = 23;
export const HEIGHT = 73;
export const COLORS = {
  BLACK: 0,
  WHITE: 1,
  PURPLE: 2,
  GREEN: 3,
  BLUE: 4,
  ORANGE: 5,
  RED: 6,
  YELLOW: 7,
  LILAC: 8,
};


export function setPixel(bitmap: number[], colorMap: number[], col: number, row: number, value: number = 1, color: number = 1): void {
  if (col >= 0 && col < WIDTH && row >= 0 && row < HEIGHT) {
    const index = row * WIDTH + col;
    bitmap[index] = value;
    if (value > 0) {
      colorMap[index] = color;
    }
  }
}

export function drawChemicalFormula(bitmap: number[], colorMap: number[], col: number, startRow: number, formula: number[]): void {
  for (let i = 0; i < formula.length; i++) {
    const count = formula[i];
    const row = startRow + i;

    if (count > 0) {
      setPixel(bitmap, colorMap, col, row, 1, COLORS.GREEN);
      if (count >= 3) {
        setPixel(bitmap, colorMap, col + 1, row, 1, COLORS.GREEN);
      }
      if (count >= 5) {
        setPixel(bitmap, colorMap, col - 1, row, 1, COLORS.GREEN);
      }
    }
  }
}

export function drawCompactBlock(bitmap: number[], colorMap: number[], startCol: number, startRow: number, width: number, height: number): void {
  for (let row = startRow; row < startRow + height; row++) {
    for (let col = startCol; col < startCol + width; col++) {
      setPixel(bitmap, colorMap, col, row, 1, COLORS.GREEN);
    }
  }
}

export function drawLine(bitmap: number[], colorMap: number[], x1: number, y1: number, x2: number, y2: number, color: number): void {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1;
  const sy = y1 < y2 ? 1 : -1;
  let err = dx - dy;

  let x = x1;
  let y = y1;

  while (true) {
    if (x >= 0 && x < 23 && y >= 5 && y <= 9) {
      setPixel(bitmap, colorMap, x, y, 1, color);
    }

    if (x === x2 && y === y2) break;

    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

export function drawBinaryNumber(bitmap: number[], colorMap: number[], value: number, startCol: number, row: number, color: number): void {
  const binary = value.toString(2);
  const maxLength = Math.min(binary.length, 23 - startCol);

  for (let bit = 0; bit < maxLength; bit++) {
    const bitValue = parseInt(binary[bit]);
    setPixel(bitmap, colorMap, startCol + bit, row, bitValue, color);
  }
}

export function drawBlankLine(bitmap: number[], colorMap: number[], row: number): void {
  for (let col = 0; col < WIDTH; col++) {
    setPixel(bitmap, colorMap, col, row, 0);
  }
}

export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

export function createSeededRandom(seed: number): { random: () => number } {
  return {
    random: () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    },
  };
}

export function createPlanetRNG(planetName: string): { random: () => number } {
  let seed = 0;
  for (let i = 0; i < planetName.length; i++) {
    seed += planetName.charCodeAt(i);
  }

  return {
    random: () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    },
  };
}

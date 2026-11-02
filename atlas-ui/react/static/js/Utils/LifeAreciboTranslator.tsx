// atlas-ui/react/static/js/Utils/LifeAreciboTranslator.tsx
//
// The Arecibo message generator: 23×73 monochrome bitmap + colour map.
// This file is now only the score — the page layout of the 10 sections and the
// canvas export. Everything that draws lives in Utils/arecibo/*:
//
//   primitives.ts            23×73 grid, setPixel/drawLine, seeded RNG, hash
//   data.ts                  elements / nucleotides / genome size per life form
//   sections.ts              sections 1..10 (numbers, chemistry, genetic code)
//   structures.ts            DNA helix, crystal lattice, data/quantum/energy fields
//   figures/lifeForm*.ts     the organism silhouette, height, population
//   figures/creatures.ts     animal / plant / bacteria variants
//   figures/transmission.ts  planetary system, antenna, exotic channels
//
// Split 2026-10-29 (05 §3.1): 4,515 → 8 modules ≤ 930 lines each, zero pixel
// change proven by scripts/arecibo_snapshot.ts.

import { WIDTH, HEIGHT, drawBlankLine } from "./arecibo/primitives.ts";
import { drawChemicalElements, drawNucleotides, drawNumbers } from "./arecibo/sections.ts";
import { drawDNADoubleHelix } from "./arecibo/structures.ts";
import { drawLifeFormSection } from "./arecibo/figures/lifeForm.ts";
import { drawSolarSystem, drawTransmissionMethod } from "./arecibo/figures/transmission.ts";

export interface AreciboConfig {
  lifeForm: string;
  planetName: string;
  width: number;
  height: number;
}

export interface AreciboMessage {
  bitmap: number[];
  colorMap: number[];
  width: number;
  height: number;
  lifeForm: string;
  planetName: string;
}

/** Palette index → CSS colour (index 0 is background). */
const PALETTE = ["#000000", "#FFFFFF", "#9966CC", "#00FF00", "#0066FF", "#FF6600", "#FF0000", "#FFFF00", "#B19CD9"];

export class AreciboGenerator {
  public static async generate(config: AreciboConfig): Promise<AreciboMessage> {
    const bitmap = new Array(WIDTH * HEIGHT).fill(0);
    const colorMap = new Array(WIDTH * HEIGHT).fill(0);

    drawNumbers(bitmap, colorMap);

    drawBlankLine(bitmap, colorMap, 4);

    drawChemicalElements(bitmap, colorMap, config.lifeForm, config.planetName);

    drawBlankLine(bitmap, colorMap, 10);

    drawBlankLine(bitmap, colorMap, 11);

    drawNucleotides(bitmap, colorMap, config.lifeForm, config.planetName);

    drawBlankLine(bitmap, colorMap, 28);

    drawDNADoubleHelix(bitmap, colorMap, config.lifeForm, config.planetName, 29, 15);

    drawBlankLine(bitmap, colorMap, 44);

    drawLifeFormSection(bitmap, colorMap, config.lifeForm, config.planetName, 45, 9);

    drawBlankLine(bitmap, colorMap, 54);

    await drawSolarSystem(bitmap, colorMap, config.planetName, 55);

    drawBlankLine(bitmap, colorMap, 63);

    drawTransmissionMethod(bitmap, colorMap, config.lifeForm, config.planetName, 64, 9);

    return {
      bitmap,
      colorMap,
      width: WIDTH,
      height: HEIGHT,
      lifeForm: config.lifeForm,
      planetName: config.planetName,
    };
  }

  public static renderToCanvas(message: AreciboMessage, canvas: HTMLCanvasElement, scale: number = 10): void {
    canvas.width = message.width * scale;
    canvas.height = message.height * scale;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < message.height; y++) {
      for (let x = 0; x < message.width; x++) {
        const index = y * message.width + x;
        if (message.bitmap[index] === 1) {
          const colorIndex = message.colorMap[index] || 1;
          ctx.fillStyle = PALETTE[colorIndex] || "#FFFFFF";
          ctx.fillRect(x * scale, y * scale, scale, scale);
        }
      }
    }
  }

  public static exportToPNG(message: AreciboMessage, scale: number = 10): string {
    const canvas = document.createElement("canvas");
    this.renderToCanvas(message, canvas, scale);
    return canvas.toDataURL("image/png");
  }
}

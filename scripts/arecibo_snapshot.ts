// scripts/arecibo_snapshot.ts
// Golden check for the Arecibo generator: prints one SHA-1 per (life form,
// planet) pair. Used before/after the 2026-10-29 file split to prove the 4.5k
// line extraction changed zero pixels.
//
// Run: npx esbuild scripts/arecibo_snapshot.ts --bundle --platform=node --format=esm \
//        --outfile=.tmp/arecibo.mjs --log-level=warning && node .tmp/arecibo.mjs

import { createHash } from "node:crypto";
import { AreciboGenerator } from "../atlas-ui/react/static/js/Utils/LifeAreciboTranslator.tsx";

const LIFE_FORMS = [
  "Bacteria",
  "Vegetation",
  "Animal Life",
  "Intelligent Life",
  "Vegetable Animals",
  "Silicon-Based Life",
  "Robotic Entities",
  "Conscious Gas",
  "Non-Physical Entity",
  "Have I just found God?",
  "Something Unknown",
];

const PLANETS = ["Kepler_442b", "Trappist_1e"];

const digest = (message: { bitmap: number[]; colorMap: number[] }) =>
  createHash("sha1").update(message.bitmap.join(",")).update("|").update(message.colorMap.join(",")).digest("hex").slice(0, 16);

const run = async () => {
  const rows: string[] = [];
  for (const lifeForm of LIFE_FORMS) {
    for (const planetName of PLANETS) {
      const message = await AreciboGenerator.generate({ lifeForm, planetName, width: 23, height: 73 });
      rows.push(`${lifeForm}@${planetName} ${digest(message)}`);
    }
  }
  console.log(rows.join("\n"));
};

void run();

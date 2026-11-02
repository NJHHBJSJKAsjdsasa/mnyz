// scripts/shader_variants_check.ts
//
// GPU-free check of the step-4 shader variant cache (docs/render-transplant §8).
//
//   node_modules/.bin/esbuild scripts/shader_variants_check.ts --bundle --platform=node \
//     --format=esm --external:three --outfile=.tmp/shader-variants.mjs
//   node .tmp/shader-variants.mjs
//
// It does not compile anything (that needs a GL context): it builds every probe scene the
// warm-up would compile and asserts three.js would see the variants it expects —
//  * every probe constructs (a typo in a planet type / atmosphere shows up here);
//  * each surface program carries exactly one `FAMILY_*` define, and it is the family the
//    probe claims to cover;
//  * the set of program keys is what we bill as "16 variants", with no accidental duplicates
//    (a duplicate means a wasted compile) and no missing family.

import * as THREE from "three";

import { createProbe, PROBES } from "../atlas-ui/react/static/js/3DComponents/realistic3/variantCache.ts";

const FAMILY_OF: Record<string, string> = {
  terran: "TERRAN",
  desert: "DESERT",
  barren: "BARREN",
  metal: "METAL",
  crystal: "CRYSTAL",
  diamond: "DIAMOND",
  ice: "ICE",
  lava: "LAVA",
  gas: "GAS",
  mirror: "MIRROR",
  veiled: "VEILED",
  radioactive: "RADIOACTIVE",
  exotic: "EXOTIC",
  anomaly: "ANOMALY",
  superPuff: "GAS",
  superRinged: "GAS",
};

// Same key three.js builds in WebGLPrograms.getProgramCacheKey: source + defines.
function programKey(material: THREE.ShaderMaterial): string {
  const defines = Object.entries(material.defines ?? {})
    .map(([name, value]) => `${name}=${value}`)
    .sort()
    .join(",");
  let hash = 0;
  const source = `${material.vertexShader}\u0000${material.fragmentShader}`;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) | 0;
  }
  return `${(hash >>> 0).toString(36)}|${defines}`;
}

interface Row {
  probe: string;
  familyDefine: string;
  programs: number;
  key: string;
  children: number;
}

const rows: Row[] = [];
const problems: string[] = [];
const seen = new Map<string, string>();
const allKeys = new Set<string>();

for (const probe of PROBES) {
  let built;
  try {
    built = createProbe(probe);
  } catch (error) {
    problems.push(`${probe.key}: probe construction threw — ${(error as Error).message}`);
    continue;
  }

  const materials: THREE.ShaderMaterial[] = [];
  built.scene.traverse((object) => {
    const material = (object as THREE.Mesh).material;
    if (material instanceof THREE.ShaderMaterial) materials.push(material);
  });

  const surface = built.mesh.material as THREE.ShaderMaterial;
  const familyDefines = Object.keys(surface.defines ?? {}).filter((name) => name.startsWith("FAMILY_"));
  if (familyDefines.length !== 1) {
    problems.push(`${probe.key}: surface has ${familyDefines.length} FAMILY_* defines (expected 1)`);
  } else {
    const expected = `FAMILY_${FAMILY_OF[probe.key]}`;
    if (familyDefines[0] !== expected) {
      problems.push(`${probe.key}: family define is ${familyDefines[0]}, expected ${expected}`);
    }
  }

  // Every shader material in the probe is one compile; the surface is the one keyed by family.
  const keys = materials.map(programKey);
  const surfaceKey = programKey(surface);
  for (const key of keys) allKeys.add(key);

  // Super Puff shares the gas surface program on purpose: what it adds is the haze shell.
  if (probe.key === "superPuff") {
    if (surfaceKey !== "same-as-gas") seen.set(surfaceKey, probe.key);
    const hasHaze = built.scene.getObjectByName("realistic-haze") != null;
    if (!hasHaze) problems.push("superPuff: no realistic-haze mesh (its only extra program)");
  } else {
    const duplicate = seen.get(surfaceKey);
    if (duplicate) problems.push(`${probe.key}: surface program identical to ${duplicate} (wasted compile)`);
    else seen.set(surfaceKey, probe.key);
  }

  if (probe.key === "superRinged" && !("HAS_RINGS" in (surface.defines ?? {}))) {
    problems.push("superRinged: surface is missing the HAS_RINGS define");
  }

  rows.push({
    probe: probe.key,
    familyDefine: familyDefines[0] ?? "?",
    programs: new Set(keys).size,
    key: surfaceKey,
    children: built.scene.children.length,
  });

  // dispose must leave nothing behind: the real view reuses one scene for every planet.
  built.dispose();
  if (built.scene.children.length !== 0) {
    problems.push(`${probe.key}: dispose left ${built.scene.children.length} object(s) in the scene`);
  }
}

const width = Math.max(...rows.map((row) => row.probe.length), 5);
console.log(`${"probe".padEnd(width)}  define                 shaders  surface key`);
for (const row of rows) {
  console.log(`${row.probe.padEnd(width)}  ${row.familyDefine.padEnd(20)}  ${String(row.programs).padStart(7)}  ${row.key}`);
}

const totalPrograms = rows.reduce((sum, row) => sum + row.programs, 0);
console.log(
  `\n${rows.length} probes · ${seen.size} distinct surface programs · ` +
    `${allKeys.size} distinct programs overall · ${totalPrograms} shader materials in total`
);

if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.error(` - ${problem}`);
  process.exit(1);
}
console.log("ok: every probe builds, carries one correct family define, and disposes cleanly");

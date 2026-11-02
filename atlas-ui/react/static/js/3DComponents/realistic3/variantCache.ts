// atlas-ui/react/static/js/3DComponents/realistic3/variantCache.ts
//
// Step 4 of docs/render-transplant: shader variant warm-up.
//
// Why this exists: every family of surface (terran / gas / lava / ...) is the *same* pair of
// shader sources compiled with a different `FAMILY_*` define, so three.js keeps one
// WebGLProgram per (source, defines) pair in a per-renderer cache. three.js already reuses
// a program when a material with the same key is built again — what it cannot do is compile
// it *before* you need it. The first planet of a family therefore stalls for 50–300 ms while
// the driver compiles the program.
//
// This module compiles one throwaway probe per family during idle time on a renderer that is
// already alive, so the real planet that arrives later is a pure program-cache hit. Nothing
// here touches the vendored files: a probe is a normal RealisticPlanet of radius 1 in a
// private scene, compiled and thrown away.
//
// Scope: surface / cloud / haze / atmosphere / ring programs (the ones a family owns).
// Planet effects (aurora, plumes, …) are built per planet type as well, but each is a tiny
// shader: leave them to the first real frame unless `includeEffects` is asked for.

import * as THREE from "three";

import { RealisticPlanet } from "./RealisticPlanet.ts";
import { planetLook } from "./looks.ts";
import { lookInputFromPlanet } from "./adapter.ts";

export interface Probe {
  /** Stable id: also the key of the per-renderer "already warmed" set. */
  key: string;
  /** A 2.x planet type that lands in the family this probe covers. */
  type: string;
  atmosphere: string;
  temperature: number;
  /** Add a ring set, to compile the `HAS_RINGS` define of that family's surface. */
  rings?: boolean;
}

/**
 * One representative per family in `looks.ts`, plus the two odd shapes that need a program
 * of their own: `Super Puff` (extra haze shell) and `Super Ringed` (surface with rings).
 * 16 probes ≈ the whole family space of the renderer.
 */
export const PROBES: readonly Probe[] = [
  { key: "terran", type: "Oceanic", atmosphere: "Nitrogen", temperature: 14 },
  { key: "desert", type: "Desert", atmosphere: "Thin", temperature: 45 },
  { key: "barren", type: "Rocky", atmosphere: "None", temperature: -20 },
  { key: "metal", type: "Metallic", atmosphere: "None", temperature: 120 },
  { key: "crystal", type: "Crystalline", atmosphere: "None", temperature: -40 },
  { key: "diamond", type: "Diamond", atmosphere: "None", temperature: -80 },
  { key: "ice", type: "Icy", atmosphere: "Frozen", temperature: -140 },
  { key: "lava", type: "Lava", atmosphere: "Sulfur Dioxide", temperature: 900 },
  { key: "gas", type: "Gas Giant", atmosphere: "Hydrogen", temperature: -120 },
  { key: "mirror", type: "Mirror", atmosphere: "Thin", temperature: 1000 },
  { key: "veiled", type: "Toxic", atmosphere: "Toxic", temperature: 300 },
  { key: "radioactive", type: "Radioactive", atmosphere: "Ionic", temperature: 200 },
  { key: "exotic", type: "Exotic", atmosphere: "Exotic Gases", temperature: 40 },
  { key: "anomaly", type: "Anomaly", atmosphere: "None", temperature: 0 },
  { key: "superPuff", type: "Super Puff", atmosphere: "Methane", temperature: -100 },
  { key: "superRinged", type: "Super Ringed", atmosphere: "Hydrogen", temperature: -150, rings: true },
];

// Ring bands in the backend's units (planet_radius 100 → bands at 1.4–2.6 R):
// RealisticRings normalises by planet_radius, so the numbers only need to be plausible.
const RING_PROBE = {
  has_rings: true,
  inner_radius: 140,
  outer_radius: 260,
  planet_radius: 100,
  tilt_factor: 0.24,
  shape_seed: 421,
  bands: [
    { inner: 140, outer: 178 },
    { inner: 186, outer: 232 },
    { inner: 240, outer: 260 },
  ],
};

export interface WarmProgress {
  done: number;
  total: number;
  key: string;
}

export interface WarmReport {
  /** Probes in the queue this run (before skipping). */
  total: number;
  /** Programs compiled by this call. */
  warmed: number;
  /** Probes skipped because this renderer had already warmed them. */
  skipped: number;
  /** Probes whose compile threw (a driver that rejects a variant must not break the page). */
  failed: number;
  /** Wall time of the whole call, including idle yields. */
  ms: number;
  /** `renderer.info.programs.length` after the call: the real measure of what is cached. */
  programs: number;
}

export interface WarmOptions {
  signal?: AbortSignal;
  probes?: readonly Probe[];
  onProgress?: (progress: WarmProgress) => void;
}

// The program cache lives inside the renderer, so "already warm" is per renderer, not global.
const warmedPerRenderer = new WeakMap<THREE.WebGLRenderer, Set<string>>();

export function programCount(renderer: THREE.WebGLRenderer): number {
  return renderer.info?.programs?.length ?? 0;
}

export function warmedKeys(renderer: THREE.WebGLRenderer): string[] {
  return [...(warmedPerRenderer.get(renderer) ?? [])];
}

/** Compile every probe this renderer has not seen yet. Resolves when the queue is done or aborted. */
export async function warmShaderVariants(
  renderer: THREE.WebGLRenderer,
  options: WarmOptions = {}
): Promise<WarmReport> {
  const started = performance.now();
  let done = warmedPerRenderer.get(renderer);
  if (!done) {
    done = new Set<string>();
    warmedPerRenderer.set(renderer, done);
  }
  const probes = options.probes ?? PROBES;
  let warmed = 0;
  let skipped = 0;
  let failed = 0;

  for (let index = 0; index < probes.length; index += 1) {
    if (options.signal?.aborted) break;
    const probe = probes[index];
    if (done.has(probe.key)) {
      skipped += 1;
      continue;
    }
    options.onProgress?.({ done: index, total: probes.length, key: probe.key });
    try {
      await compileProbe(renderer, probe, options.signal);
      done.add(probe.key);
      warmed += 1;
    } catch {
      // A driver that refuses one variant is a reason to skip it, not to fail the page.
      failed += 1;
    }
    await yieldToMain();
  }

  return { total: probes.length, warmed, skipped, failed, ms: performance.now() - started, programs: programCount(renderer) };
}

/** Undo the memo — only useful when a renderer is reused after a context loss. */
export function forgetWarmCache(renderer: THREE.WebGLRenderer): void {
  warmedPerRenderer.delete(renderer);
}

/**
 * The throwaway scene a probe compiles, exposed so a Node script can build every variant
 * without a GPU (see `scripts/check_shader_variants.mjs`). `dispose()` must be called.
 */
export function createProbe(probe: Probe): { scene: THREE.Scene; camera: THREE.PerspectiveCamera; mesh: THREE.Mesh; dispose: () => void } {
  const data = lookInputFromPlanet({
    name: `probe-${probe.key}`,
    planet_type: probe.type,
    atmosphere: probe.atmosphere,
    surface_temperature: probe.temperature,
    seed: `probe|${probe.key}`,
  });
  const look = planetLook(data);

  const scene = new THREE.Scene();
  // Geometry does not affect the program: keep it cheap (the real one is 128×64).
  const geometry = new THREE.SphereGeometry(1, 12, 8);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  scene.add(mesh);

  const superRings = probe.type === "Super Ringed";
  const hazeHeight = probe.type === "Super Puff" ? 0.035 : 0;
  const planet = new RealisticPlanet(
    look,
    mesh,
    scene,
    1,
    probe.rings ? RING_PROBE : null,
    new Set(),
    superRings,
    hazeHeight
  );

  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 50);
  camera.position.set(0, 0.45, 3.4);
  camera.updateMatrixWorld();

  return {
    scene,
    camera,
    mesh,
    dispose: () => {
      planet.dispose();
      geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      scene.remove(mesh);
    },
  };
}

async function compileProbe(renderer: THREE.WebGLRenderer, probe: Probe, signal?: AbortSignal): Promise<void> {
  const built = createProbe(probe);

  if (typeof renderer.compileAsync !== "function") {
    try {
      renderer.compile(built.scene, built.camera);
    } finally {
      built.dispose();
    }
    return;
  }

  // Always wait for `compileAsync` to settle, even when `signal` is aborted.
  //
  // Aborting here used to return immediately via `raceAbort`, which let the
  // caller release the renderer while three was still polling its
  // material→program map from a timer — that throws
  // "Cannot read properties of undefined (reading 'isReady')" from inside the
  // library, where no `catch` in this module can reach it. `signal` still stops
  // the *loop* between probes; it just no longer cuts a probe in half.
  // Surfaced by P2 of 16-shell-unification: cross-view navigation unmounts the
  // view mid-warm, which the old full-page reload never did.
  const compiled = renderer
    .compileAsync(built.scene, built.camera)
    .catch(() => undefined)
    .finally(() => built.dispose());

  void signal;
  await compiled;
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    const idle = (globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
      .requestIdleCallback;
    if (typeof idle === "function") idle(() => resolve(), { timeout: 120 });
    else setTimeout(resolve, 0);
  });
}

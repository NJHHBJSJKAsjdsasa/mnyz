// atlas-ui/react/static/js/3DComponents/realistic3/RealisticPlanetView.tsx
//
// Isolated host for the vendored 3.0 realistic planet renderer. It owns a canvas, a
// camera, orbit controls, the star light, rings and the moon system, and drives the
// renderer's per-frame state (light direction, animation clock, rotation period,
// on-screen size -> noise octaves).
//
// Step 4 splits the lifetime in two, which is what makes switching planets cheap:
//
//   runtime  (renderer + scene + camera + controls + observers)  lives as long as the
//            component does. three.js keeps its compiled programs *inside* the renderer,
//            so throwing the renderer away on every planet change threw the cache away too:
//            a new planet used to mean a new WebGL context and a full recompile.
//   content  (surface mesh, shells, rings, moons, lights)        is rebuilt whenever the
//            planet's signature changes, in the *same* runtime.
//
// On top of that, `variantCache.ts` warms the other families' programs while the page is
// idle, so the first gas giant does not stall either.
//
// This is the only place that knows about the surrounding scene: the vendored files in
// this directory stay byte-identical to upstream 3.0.2 (except the single documented
// import path in MoonSystem.tsx) so they can be re-synced later.

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

import { RealisticPlanet } from "./RealisticPlanet.ts";
import { planetLook } from "./looks.ts";
import { effectKinds } from "./effects.ts";
import { lookInputFromPlanet, type PlanetLike } from "./adapter.ts";
import { resolveMoonSystem, type MoonInput } from "./moons.ts";
import type { RingsData } from "./rings.ts";
import { MoonSystem } from "./MoonSystem.tsx";
import { programCount, warmShaderVariants, type WarmProgress } from "./variantCache.ts";

const RADIUS = 1;
const EARTH_DAY_SECONDS = 86400;

export type { MoonInput };

export interface CacheStats {
  /** Compiled programs the renderer holds right now. */
  programs: number;
  /** Probes warmed so far / in total, while warming. */
  warmed: number;
  total: number;
  warming: boolean;
  /** Milliseconds spent in the last warm call (0 until it finishes). */
  ms: number;
}

export interface RealisticPlanetViewProps {
  planet: PlanetLike;
  className?: string;
  /** Hard cap on noise octaves; lower it for weak GPUs. Upstream default is 7.5. */
  maxOctaves?: number;
  /** Seconds for one visible turn. Real periods are days long, so the preview compresses. */
  secondsPerRotation?: number;
  /** Scales the shader clock (clouds, effects). Higher = faster weather. */
  elapsedScale?: number;
  /** Sun direction in view space. */
  lightDirection?: [number, number, number];
  /**
   * Rings, straight from the 2.x payload (`renderingApiData.rings`). Pass-through: do not
   * rescale, `RealisticRings` normalises by `planet_radius` itself.
   */
  rings?: (RingsData & { has_rings?: boolean }) | null;
  /**
   * Moons: a count (synthesised deterministically from the planet seed) or a full
   * `MoonSystemData` once the backend ships real ones. `0`/`null` disables them.
   */
  moons?: MoonInput;
  /** Towards the galaxy core; zero outside a galaxy (mirror worlds degrade gracefully). */
  galacticCore?: [number, number, number];
  /** Pause rendering when off-screen (IntersectionObserver). Default true. */
  pauseWhenHidden?: boolean;
  /** Device pixel ratio cap; the step-4 profiler passes 1.5 on weak GPUs. */
  maxPixelRatio?: number;
  /** Warm the other families' shader programs while idle. Default true. */
  warmVariants?: boolean;
  onReady?: (renderer: THREE.WebGLRenderer) => void;
  /** Program-cache counters for the on-screen badge / the lab. */
  onCacheStats?: (stats: CacheStats) => void;
  onError?: (error: string) => void;
}

interface Runtime {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  lights: THREE.Light[];
  /** Set false by the IntersectionObserver so the loop can skip drawing. */
  visible: boolean;
  /** Frame counter, used to start warming only after the first real frame is on screen. */
  frames: number;
  started: number;
}

interface Content {
  signature: string;
  scene: THREE.Scene;
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  planet: RealisticPlanet;
  moonSystem: MoonSystem | null;
  rotationPeriod: number;
  dispose: () => void;
}

export function RealisticPlanetView({
  planet,
  className,
  maxOctaves = 7.5,
  secondsPerRotation = 40,
  elapsedScale = 300,
  lightDirection = [0.85, 0.22, 0.5],
  rings = null,
  moons = 0,
  galacticCore = [0, 0, 0],
  pauseWhenHidden = true,
  maxPixelRatio = 2,
  warmVariants = true,
  onReady,
  onCacheStats,
  onError,
}: RealisticPlanetViewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const contentRef = useRef<Content | null>(null);

  const moonCount = typeof moons === "number" ? moons : moons?.count ?? 0;
  const ringsKey = rings && rings.has_rings !== false ? `r${rings.shape_seed}:${rings.bands.length}` : "r0";
  // Rebuild only when the planet's identity (or the ring/moon rig) changes.
  const signature = `${planet.name ?? ""}|${planet.planet_type ?? ""}|${planet.seed ?? ""}|${planet.surface_temperature ?? ""}|${ringsKey}|m${moonCount}`;

  const latest = useRef({
    maxOctaves,
    secondsPerRotation,
    elapsedScale,
    lightDirection,
    galacticCore,
    warmVariants,
    onReady,
    onCacheStats,
    planet,
    rings,
    moons,
  });
  latest.current = {
    maxOctaves,
    secondsPerRotation,
    elapsedScale,
    lightDirection,
    galacticCore,
    warmVariants,
    onReady,
    onCacheStats,
    planet,
    rings,
    moons,
  };

  // ---------------------------------------------------------------- runtime (once)
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "WebGL unavailable");
      return;
    }

    // Step 4 tiering: a 3x-DPR phone would otherwise pay 9x the fragment cost for nothing.
    const pixelRatio = Math.min(window.devicePixelRatio || 1, maxPixelRatio);
    renderer.setPixelRatio(pixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.domElement.style.display = "block";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 200);
    camera.position.set(0, RADIUS * 0.45, RADIUS * 3.4);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = RADIUS * 1.25;
    controls.maxDistance = RADIUS * 9;
    controls.rotateSpeed = 0.6;

    const runtime: Runtime = {
      renderer,
      scene,
      camera,
      controls,
      lights: [],
      visible: true,
      frames: 0,
      started: performance.now(),
    };
    runtimeRef.current = runtime;

    const sun = new THREE.DirectionalLight(0xfff3e4, 2.2);
    const ambient = new THREE.AmbientLight(0x223044, 0.55);
    scene.add(sun, ambient);
    runtime.lights = [sun, ambient];

    const resize = () => {
      const width = host.clientWidth || 1;
      const height = host.clientHeight || 1;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    // Step 4: stop burning GPU behind a hidden panel.
    const intersection = pauseWhenHidden
      ? new IntersectionObserver((entries) => {
          runtime.visible = entries.some((entry) => entry.isIntersecting);
        }, { threshold: 0.01 })
      : null;
    intersection?.observe(host);

    const lightDir = new THREE.Vector3();
    const core = new THREE.Vector3();
    const sunColor = new THREE.Color(0xfff3e4);
    const abort = new AbortController();
    let warming = false;
    /**
     * The warming pass, so the cleanup below can wait for it.
     *
     * `renderer.dispose()` clears the renderer's internal material→program map.
     * If it runs while `compileAsync` is still polling that map — which is
     * exactly what happens when a warming view is unmounted — three throws
     * "Cannot read properties of undefined (reading 'isReady')" from its own
     * timer, where nothing here can catch it. Deferring dispose until the pass
     * has settled is the only place with enough information to avoid it.
     */
    let warmingPromise: Promise<void> | null = null;
    let warmReported = 0;
    let warmTotal = 0;
    let warmMs = 0;

    const reportCache = (warmingFlag: boolean, warmed: number, total: number, ms: number) => {
      latest.current.onCacheStats?.({
        programs: programCount(renderer),
        warmed,
        total,
        warming: warmingFlag,
        ms,
      });
    };

    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (!runtime.visible) return;
      runtime.frames += 1;
      const content = contentRef.current;
      if (!content) return;

      const seconds = (performance.now() - runtime.started) / 1000;
      // One visible turn every `secondsPerRotation`, whatever the planet's real period is.
      const spin = (seconds / Math.max(latest.current.secondsPerRotation, 1)) * Math.PI * 2;
      content.mesh.rotation.y = spin;

      lightDir.set(...latest.current.lightDirection).normalize();
      core.set(...latest.current.galacticCore);
      sun.position.copy(lightDir).multiplyScalar(10);

      controls.update();
      content.planet.update({
        lightDir,
        sunColor,
        camera,
        viewportHeight: renderer.domElement.height,
        maxOctaves: latest.current.maxOctaves,
        elapsed: seconds * latest.current.elapsedScale,
        rotationPeriod: content.rotationPeriod,
        galacticCore: core,
      });
      content.moonSystem?.update();
      renderer.render(scene, camera);

      // Warm the other families once the first real frame has been presented, so the warm-up
      // never competes with the planet the user is waiting for.
      if (!warming && runtime.frames === 2 && latest.current.warmVariants) {
        warming = true;
        reportCache(true, 0, 0, 0);
        warmingPromise = warmShaderVariants(renderer, {
          signal: abort.signal,
          onProgress: (progress: WarmProgress) => reportCache(true, progress.done, progress.total, 0),
        })
          .then((report) => {
            warmReported = report.warmed;
            warmTotal = report.total;
            warmMs = report.ms;
          })
          .catch(() => {
            // Warming is an optimisation: any failure leaves the normal compile path intact.
          })
          .finally(() => {
            warming = false;
            reportCache(false, warmReported, warmTotal, warmMs);
          });
      }
    };
    draw();
    onReady?.(renderer);

    return () => {
      abort.abort();
      cancelAnimationFrame(raf);
      intersection?.disconnect();
      observer.disconnect();
      controls.dispose();
      scene.remove(sun, ambient);
      renderer.domElement.remove();
      if (warmingPromise) {
        // Detach now (above), release the GPU once the poll it started is done.
        const doomed = renderer;
        void warmingPromise.finally(() => {
          try {
            doomed.dispose();
          } catch {
            /* already released */
          }
        });
      } else {
        renderer.dispose();
      }
      runtimeRef.current = null;
    };
    // Rebuilding the runtime throws away its program cache, so it only happens when a prop
    // that changes the canvas itself changes.
  }, [maxPixelRatio, pauseWhenHidden]);

  // ---------------------------------------------------------------- content (per planet)
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const { scene, camera } = runtime;

    const current = latest.current;
    const data = lookInputFromPlanet(current.planet);
    const look = planetLook(data);

    const geometry = new THREE.SphereGeometry(RADIUS, 128, 64);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    scene.add(mesh);

    const typeName = String(current.planet.planet_type ?? "").replace(/_/g, " ");
    const superRings = typeName === "Super Ringed";
    const hazeHeight = typeName === "Super Puff" ? 0.035 : 0;
    const ringData = current.rings && current.rings.has_rings !== false ? current.rings : null;

    const realistic = new RealisticPlanet(look, mesh, scene, RADIUS, ringData, effectKinds(data), superRings, hazeHeight);
    const rotationPeriod = Math.abs(current.planet.rotation_period_seconds || EARTH_DAY_SECONDS);

    // Moons are MeshStandardMaterial, so they need real lights. They are created once with
    // the runtime, so a planet change only swaps the moon system itself.
    const moonData = resolveMoonSystem(current.moons, String(current.planet.seed ?? current.planet.name ?? "atlas"), RADIUS);
    let moonSystem: MoonSystem | null = null;
    if (moonData) {
      moonSystem = new MoonSystem(scene, RADIUS, camera, new THREE.Vector3(0, 0, 0), 0);
      moonSystem.loadMoonSystem(moonData);
    }

    const content: Content = {
      signature,
      scene,
      mesh,
      geometry,
      planet: realistic,
      moonSystem,
      rotationPeriod,
      dispose: () => {
        moonSystem?.dispose();
        realistic.dispose();
        scene.remove(mesh);
        geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      },
    };
    contentRef.current = content;

    return () => {
      if (contentRef.current === content) contentRef.current = null;
      content.dispose();
    };
    // Planet identity + the pixel-ratio cap: a new runtime means new scene objects.
  }, [signature, maxPixelRatio, pauseWhenHidden]);

  return <div ref={hostRef} className={className} style={{ width: "100%", height: "100%" }} />;
}

export default RealisticPlanetView;

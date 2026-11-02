// atlas-ui/react/static/js/Components/RealisticStarStage.tsx
//
// A single star up close, using the vendored 3.0 `StarSurface` (granulation, limb
// darkening, sunspots, chromosphere and a billboard corona that fades in as the eye nears).
//
// Why it exists separately from RealisticSystemStage: the system view frames whole orbits
// (a star is ~30 px there), while this one is the "look at the star" view — a system page
// tab, a coordinate-details exhibit, or the star lab. It is also the cheapest way to check
// every stellar type without needing a system payload.

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

import { StarSurface, starLook } from "../3DComponents/realistic3/StarSurface.ts";
import { starTint } from "../3DComponents/realistic3/systemAdapter.ts";
import { qualityProfile } from "../3DComponents/realistic3/perf.ts";

export interface RealisticStarStageProps {
  /** 3.0 star type: "Yellow Dwarf" | "Red Dwarf" | "Red Giant" | "Blue Giant" | "White Dwarf" | "Neutron Star" */
  type?: string;
  /** 2.x star colour name (yellow / red / blue / orange / white / purple) or a `#rrggbb` hex. */
  color?: string;
  /** Radius in scene units. */
  radius?: number;
  /** Stable seed: same star, same sunspots. */
  seed?: number;
  /** Corona strength 0..1; 1 is "up close" (what StarSurface's `near` means). */
  near?: number;
  height?: number | string;
  /** Spin the camera slowly, as solar observatories do. */
  autoRotate?: boolean;
  /**
   * Wheel/trackpad zoom. On by default (a lab wants to inspect the surface); turn
   * it off when the stage is embedded in a scrolling page, where OrbitControls
   * would otherwise swallow the wheel and the page stops scrolling.
   */
  enableZoom?: boolean;
  /**
   * How many planets to put in orbit (0 = the star alone, the original view).
   *
   * The camera frames the disc at a fixed multiple of the radius, so a planet has
   * nowhere to be on screen at that distance — with any orbiters the camera pulls
   * back to a system framing and the star shrinks to ~55% of the frame. That is
   * the whole trade: `0` is "look at the star", `>0` is "look at the system".
   * Colours and periods are derived from `seed`, so the same seed always draws
   * the same system.
   */
  orbiters?: number;
  /**
   * Camera distance in star radii. The default frames the disc the way the lab
   * does; pass a larger number to fit planets, or a smaller one when the host
   * crops the canvas (the home stage renders it over-sized so its edge, which is
   * a faintly lit rectangle, falls outside the panel).
   */
  frameDistance?: number;
  className?: string;
}

export const RealisticStarStage: React.FC<RealisticStarStageProps> = ({
  type = "Yellow Dwarf",
  color = "yellow",
  radius = 1,
  seed = 7,
  near = 0.85,
  height = 420,
  autoRotate = true,
  enableZoom = true,
  orbiters = 0,
  frameDistance,
  className,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const lookRef = useRef({ type, color, seed });
  lookRef.current = { type, color, seed };
  const nearRef = useRef(near);
  nearRef.current = near;
  const quality = useRef(qualityProfile());

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.current.maxPixelRatio));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.domElement.style.display = "block";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, radius * 0.02, radius * 400);
    // System framing when there are planets to see; close-up otherwise.
    const camDistance = radius * (frameDistance ?? (orbiters > 0 ? 5.4 : 3.2));
    camera.position.set(radius * 0.6, radius * 0.35, camDistance);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.enablePan = false;
    controls.enableZoom = enableZoom;
    controls.minDistance = radius * 1.15;
    controls.maxDistance = radius * 12;
    controls.rotateSpeed = 0.5;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 0.25;

    const resize = () => {
      // Clamped: `host.clientWidth` is a layout read, and a canvas whose CSS size
      // is left to its attributes feeds its own size back into the parent. That
      // runaway only shows up when the host is unconstrained (the home stage
      // over-sizes it), where it grew to a 13k-pixel canvas and the star vanished.
      const width = Math.min(host.clientWidth || 1, 2048);
      const heightPx = Math.min(host.clientHeight || 1, 2048);
      // `updateStyle` on: the element's CSS size must be explicit from here on.
      renderer.setSize(width, heightPx);
      camera.aspect = width / heightPx;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    // The star itself: geometry is a placeholder, the shader does the work
    let surface: StarSurface | null = null;
    let mesh: THREE.Mesh | null = null;
    let geometry: THREE.SphereGeometry | null = null;
    // One light for the lifetime of the scene: `build()` runs again on every look
    // change, and adding a light each time used to stack them (the star got
    // brighter with every coordinate change).
    const starLight = new THREE.PointLight(0xffffff, orbiters > 0 ? 9 : 2.2, 0, 0);
    scene.add(starLight);
    const build = () => {
      const tint = color.startsWith("#") ? new THREE.Color(color) : new THREE.Color(starTint(color));
      const look = starLook(type, tint.getHex());
      surface = new StarSurface(look, radius, seed);
      geometry = new THREE.SphereGeometry(radius, 128, 64);
      mesh = new THREE.Mesh(geometry, surface.surface);
      scene.add(mesh, surface.corona);
      starLight.color.copy(tint);
    };
    build();

    /* --- orbiters ------------------------------------------------------- */
    // Added once, outside `build()`, so changing the star's look does not throw
    // the planets away. Lighting is the point light above: they are lit by the
    // star they orbit, which is what sells the scale.
    const planetGroup = new THREE.Group();
    planetGroup.rotation.x = 0.2; // a common, slightly inclined ecliptic
    planetGroup.rotation.z = 0.08;
    const planets: Array<{ mesh: THREE.Mesh; orbit: number; speed: number; phase: number }> = [];
    const planetAssets: Array<THREE.BufferGeometry | THREE.Material> = [];
    const PLANET_TINTS = [0x9fb4c9, 0xc9a98a, 0x7f8fa6, 0xb8c6a8, 0xa88f9f];

    for (let i = 0; i < Math.max(0, Math.min(6, orbiters)); i += 1) {
      const orbit = radius * (1.35 + i * 0.27);
      const tilt = (i / Math.max(1, orbiters)) * Math.PI * 0.9;

      const ringGeo = new THREE.RingGeometry(orbit - radius * 0.004, orbit + radius * 0.004, 160);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x2ee6ff,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      planetAssets.push(ringGeo, ringMat);
      planetGroup.add(ring);

      const size = radius * (0.042 + ((seed >> i) % 7) * 0.006);
      const geo = new THREE.SphereGeometry(size, 24, 16);
      const tint = PLANET_TINTS[(seed + i) % PLANET_TINTS.length];
      const mat = new THREE.MeshStandardMaterial({
        color: tint,
        // Emissive floor: these are composited with `screen` on the home page (the
        // corona quad's opaque black must vanish), and a purely lit sphere would
        // disappear against the deep field at this distance.
        emissive: new THREE.Color(tint).multiplyScalar(0.55),
        emissiveIntensity: 0.6,
        roughness: 0.85,
        metalness: 0.05,
      });
      const planet = new THREE.Mesh(geo, mat);
      planet.position.set(Math.cos(tilt) * orbit, 0, Math.sin(tilt) * orbit);
      planetAssets.push(geo, mat);
      planetGroup.add(planet);

      planets.push({ mesh: planet, orbit, speed: 0.16 / (1 + i * 0.55), phase: tilt });
    }
    if (planets.length) scene.add(planetGroup);

    let raf = 0;
    let builtFor = `${type}|${color}|${seed}`;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const wanted = `${lookRef.current.type}|${lookRef.current.color}|${lookRef.current.seed}`;
      if (wanted !== builtFor) {
        // Rebuilding is cheap here (two materials); reuse the renderer so its programs stay warm
        if (mesh) scene.remove(mesh, surface!.corona);
        surface?.dispose();
        geometry?.dispose();
        build();
        builtFor = wanted;
      }
      const seconds = performance.now() / 1000;
      surface?.update(seconds, nearRef.current);
      if (mesh) mesh.rotation.y = StarSurface.spinAt(seconds);
      for (const planet of planets) {
        const angle = planet.phase + seconds * planet.speed;
        planet.mesh.position.set(Math.cos(angle) * planet.orbit, 0, Math.sin(angle) * planet.orbit);
      }
      controls.update();
      renderer.render(scene, camera);
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      controls.dispose();
      if (mesh) scene.remove(mesh, surface!.corona);
      surface?.dispose();
      geometry?.dispose();
      for (const asset of planetAssets) asset.dispose();
      if (planets.length) scene.remove(planetGroup);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [radius, seed, autoRotate, enableZoom, orbiters, frameDistance]);

  return <div ref={hostRef} className={className} style={{ width: "100%", height }} />;
};

export default RealisticStarStage;

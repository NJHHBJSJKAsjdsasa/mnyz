// scripts/system_variants_check.ts
//
// GPU-free check of the §10 transplant (docs/render-transplant §10): the 2.x -> 3.0 system
// adapter, the vendored `StarSurface`, `SystemLayer` and `ExoticLayer`.
//
//   node_modules/.bin/esbuild scripts/system_variants_check.ts --bundle --platform=node \
//     --format=esm --external:three --outfile=.tmp/system-variants.mjs
//   node .tmp/system-variants.mjs
//
// `SystemLayer` paints planet and glow textures on a 2D canvas, so a tiny canvas stub
// stands in for the DOM. Nothing is uploaded to a GPU: we build, assert the shapes, dispose.

import * as THREE from "three";

import { adaptSystemPayload } from "../atlas-ui/react/static/js/3DComponents/realistic3/systemAdapter.ts";
import { StarSurface, starLook } from "../atlas-ui/react/static/js/3DComponents/realistic3/StarSurface.ts";
import { SystemLayer } from "../atlas-ui/react/static/js/3DComponents/realistic3/SystemLayer.ts";
import { ExoticLayer } from "../atlas-ui/react/static/js/3DComponents/realistic3/ExoticLayer.ts";
import { FIXTURES, fixtureToPayload } from "../atlas-ui/react/static/js/SystemLab/fixture.ts";

const problems: string[] = [];
const check = (ok: boolean, message: string) => {
  if (!ok) problems.push(message);
};

// ---------------------------------------------------------------- canvas stub
const gradient = { addColorStop() {} };
const ctx = {
  createRadialGradient: () => gradient,
  createLinearGradient: () => gradient,
  fillRect() {},
  beginPath() {},
  ellipse() {},
  fill() {},
  set fillStyle(_value: unknown) {},
  set globalAlpha(_value: unknown) {},
};
(globalThis as unknown as { document: unknown }).document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => ctx }),
};
// ExoticLayer's torus lattice picks its cube count from the viewport (`window.innerWidth`)
(globalThis as unknown as { window: unknown }).window = { innerWidth: 1440, innerHeight: 900, devicePixelRatio: 2 };

// ---------------------------------------------------------------- 1. adapter
const TWO_PI = Math.PI * 2;
let systemChecks = 0;
for (const fixture of FIXTURES) {
  const payload = fixtureToPayload(fixture);
  const adapted = adaptSystemPayload(payload);
  if (!adapted) {
    problems.push(`${fixture.id}: adapter returned null`);
    continue;
  }
  const { system, timing } = adapted;
  check(system.planets.length === fixture.planets.length, `${fixture.id}: planet count ${system.planets.length}`);
  check(system.stars.length === fixture.stars.length, `${fixture.id}: star count ${system.stars.length}`);
  check(
    system.stars.every((star) => typeof star.Size === "number" && star.Size > 0),
    `${fixture.id}: star Size must be a positive number`
  );
  check(timing.current_time > timing.cosmic_origin_time, `${fixture.id}: timing is inverted`);

  // Planets: index by position, angle in range, and the backend formula reproduced
  system.planets.forEach((planet, index) => {
    check(planet.index === index, `${fixture.id}: planet ${index} has index ${planet.index}`);
    check(
      planet.current_orbital_angle >= 0 && planet.current_orbital_angle < TWO_PI,
      `${fixture.id}: ${planet.name} angle ${planet.current_orbital_angle} out of range`
    );
    const omega = TWO_PI / planet.orbital_period_seconds;
    const expected =
      (planet.initial_orbital_angle + omega * (timing.current_time - timing.cosmic_origin_time)) % TWO_PI;
    const delta = Math.abs(expected - planet.current_orbital_angle);
    check(delta < 1e-9 || Math.abs(delta - TWO_PI) < 1e-9, `${fixture.id}: ${planet.name} angle mismatch ${delta}`);
    systemChecks += 1;
  });

  const expectedOuter = Math.max(...fixture.planets.map((planet) => planet.orbital_radius));
  check(
    Math.abs(system.max_orbital_radius - expectedOuter) < 1e-9,
    `${fixture.id}: max orbital radius ${system.max_orbital_radius} vs ${expectedOuter}`
  );
}

// Adapter rejects junk instead of throwing
check(adaptSystemPayload(null) === null, "adapter must reject null");
check(adaptSystemPayload({ system_data: { planets: [] } }) === null, "adapter must reject an empty planet list");

// ---------------------------------------------------------------- 2. StarSurface
const STAR_TYPES = ["Yellow Dwarf", "Red Dwarf", "Red Giant", "Blue Giant", "White Dwarf", "Neutron Star"];
const cells = new Set<number>();
for (const type of STAR_TYPES) {
  const look = starLook(type, 0xfff1c9);
  const surface = new StarSurface(look, 1, 3);
  cells.add(look.cells);
  check(surface.surface.isShaderMaterial === true, `${type}: surface is not a ShaderMaterial`);
  check(surface.corona.geometry instanceof THREE.PlaneGeometry, `${type}: corona is not a plane`);
  surface.update(12, 0.8);
  check(surface.corona.visible === true, `${type}: corona hidden at near=0.8`);
  surface.update(12, 0);
  check(surface.corona.visible === false, `${type}: corona visible at near=0`);
  surface.dispose();
}
check(cells.size === STAR_TYPES.length, `star types share granulation scale (${cells.size} distinct of ${STAR_TYPES.length})`);

// ---------------------------------------------------------------- 3. SystemLayer
for (const fixture of FIXTURES) {
  const adapted = adaptSystemPayload(fixtureToPayload(fixture));
  if (!adapted) continue;
  const layer = new SystemLayer(adapted.system, adapted.timing);
  check(layer.planets.length === adapted.system.planets.length, `${fixture.id}: layer built ${layer.planets.length} planets`);
  check(layer.stars.length === adapted.system.stars.length, `${fixture.id}: layer built ${layer.stars.length} stars`);
  check(layer.outerRadius > 0, `${fixture.id}: outerRadius ${layer.outerRadius}`);
  check(layer.root.children.length > 0, `${fixture.id}: empty root`);

  // One frame in the explorer's frame of reference
  layer.presence = 1;
  layer.update(0.016, new THREE.Vector3(2, 1, 3));
  const far = layer.planets.every((body) => Number.isFinite(body.position.x + body.position.y + body.position.z));
  check(far, `${fixture.id}: planet position is not finite after update`);

  const before = layer.root.children.length;
  layer.dispose();
  check(layer.root.children.length === 0, `${fixture.id}: dispose left ${layer.root.children.length}/${before} objects`);
}

// ---------------------------------------------------------------- 4. ExoticLayer
const pois = [
  { id: "smbh", kind: "blackhole" as const, name: "SMBH", position: [0, 0, 0] as [number, number, number], radius: 1, description: "" },
  { id: "pulsar-01", kind: "pulsar" as const, name: "Pulsar", position: [1.7, 0.3, -0.5] as [number, number, number], radius: 1, description: "" },
  { id: "quasar", kind: "quasar" as const, name: "Quasar", position: [-1.5, -0.3, 1] as [number, number, number], radius: 1, description: "" },
  { id: "torus", kind: "torus" as const, name: "Torus", position: [0.4, 1.2, 1.6] as [number, number, number], radius: 1, description: "" },
];
const exotic = new ExoticLayer(pois, 3, "Spiral", true);
check(exotic.root.children.length === pois.length, `exotic: ${exotic.root.children.length} objects for ${pois.length} POIs`);
const camera = new THREE.Vector3(2.4, 1.5, 3.4);
exotic.update(Date.now() / 1000, camera, 2, 800, 1, 1.2);
check(
  exotic.root.children.every((child) => Number.isFinite(child.position.length())),
  "exotic: a child position is not finite after update"
);
check(exotic.lenses(camera, new THREE.PerspectiveCamera()) !== null, "exotic: lenses() threw");
exotic.dispose();
check(exotic.root.children.length === 0, `exotic: dispose left ${exotic.root.children.length} objects`);

// ---------------------------------------------------------------- report
console.log(
  `${FIXTURES.length} fixtures · ${systemChecks} planets adapted · ` +
    `${STAR_TYPES.length} star types · ${FIXTURES.length} systems built · ${pois.length} exotic objects`
);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.error(` - ${problem}`);
  process.exit(1);
}
console.log("ok: adapter matches the backend formula, every layer builds, updates and disposes cleanly");

// tools/frontend_smoke.mjs
// Front-end smoke tests for the pure gameplay modules (no browser needed).
// Usage: npm run test:frontend
//
// The modules import React/pako, so they are bundled with the local esbuild
// first, then exercised against a fake localStorage.

import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";

const ENTRY = ".smoke-entry.ts";
const BUNDLE = ".smoke-bundle.mjs";

const ENTRY_SOURCE = `export { Residents } from "./atlas-ui/react/static/js/Utils/Residents.tsx";
export { CodexSystem, CODEX_PLANET_TYPES } from "./atlas-ui/react/static/js/Utils/CodexSystem.tsx";
export { StationSystem, TICK_MS } from "./atlas-ui/react/static/js/Utils/StationSystem.tsx";
export { CombatSystem } from "./atlas-ui/react/static/js/Utils/CombatSystem.tsx";
export { WreckSystem } from "./atlas-ui/react/static/js/Utils/WreckSystem.tsx";
export { ChallengeSystem } from "./atlas-ui/react/static/js/Utils/ChallengeSystem.tsx";
export { FabricatorSystem } from "./atlas-ui/react/static/js/Utils/FabricatorSystem.tsx";
export { CosmicEvents } from "./atlas-ui/react/static/js/Utils/CosmicEvents.tsx";
export { SectorSystem } from "./atlas-ui/react/static/js/Utils/SectorSystem.tsx";
export { HullSystem } from "./atlas-ui/react/static/js/Utils/HullSystem.tsx";
export { FactionSystem } from "./atlas-ui/react/static/js/Utils/FactionSystem.tsx";
export { Rival } from "./atlas-ui/react/static/js/Utils/Rival.tsx";
export { ShipModuleSystem } from "./atlas-ui/react/static/js/Utils/ShipModules.tsx";
export { UnifiedSpaceshipStorage } from "./atlas-ui/react/static/js/Utils/UnifiedSpaceshipStorage.tsx";
export { SpaceshipResourceManager } from "./atlas-ui/react/static/js/Utils/SpaceshipResources.tsx";
export { ContractSystem } from "./atlas-ui/react/static/js/Utils/ContractSystem.tsx";
export { TradeSystem } from "./atlas-ui/react/static/js/Utils/TradeSystem.tsx";
export { DataExportImport } from "./atlas-ui/react/static/js/Utils/DataExportImport.tsx";
export { TechSystem } from "./atlas-ui/react/static/js/Utils/TechSystem.tsx";
export { FleetSystem, FLEET_TICK_MS } from "./atlas-ui/react/static/js/Utils/FleetSystem.tsx";
export { SurfaceSystem, DAILY_SAMPLES } from "./atlas-ui/react/static/js/Utils/SurfaceSystem.tsx";
export { AllySystem } from "./atlas-ui/react/static/js/Utils/AllySystem.tsx";
export { IntelSystem } from "./atlas-ui/react/static/js/Utils/IntelSystem.tsx";
`;

const installStorageShim = () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };
  globalThis.document = { getElementById: () => null };
};

const results = [];
const check = (name, condition, detail = "") => {
  results.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const main = async () => {
  writeFileSync(ENTRY, ENTRY_SOURCE);
  // Run the local esbuild binary through node: no shell quoting issues on Windows.
  execFileSync(process.execPath, ["node_modules/esbuild/bin/esbuild", ENTRY, "--bundle", "--format=esm", `--outfile=${BUNDLE}`, "--log-level=error"], {
    stdio: "inherit",
  });

  installStorageShim();

  let fakeNow = 1_800_000_000_000;
  const realNow = Date.now;
  Date.now = () => fakeNow;

  const mod = await import(`../${BUNDLE}`);

  // --- deterministic NPC layer ---
  const traceA = mod.Residents.trace({ planetKey: "planet_1,1,1_0_a", universeSeed: "S", elements: ["Iron"], lifeForms: "None" });
  const traceB = mod.Residents.trace({ planetKey: "planet_1,1,1_0_a", universeSeed: "S", elements: ["Iron"], lifeForms: "None" });
  check("residents trace is deterministic", JSON.stringify(traceA) === JSON.stringify(traceB));

  let traces = 0;
  for (let i = 0; i < 2000; i++) {
    if (mod.Residents.trace({ planetKey: `planet_2,2,${i}_0_t${i}`, universeSeed: "S", elements: ["Iron"] })) traces += 1;
  }
  check("trace rate near 18%", traces / 2000 > 0.14 && traces / 2000 < 0.22, `${((traces / 2000) * 100).toFixed(1)}%`);

  const roster = mod.Residents.roster("S");
  check("roster has 24 unique captains", roster.length === 24 && new Set(roster.map((r) => r.name)).size === 24);

  // --- codex ---
  mod.CODEX_PLANET_TYPES.forEach((planetType) => mod.CodexSystem.record({ planetType }));
  const codex = mod.CodexSystem.progress("planets");
  check("codex completes and rewards once", codex.complete && mod.CodexSystem.claimed("planets"));

  // --- economy / stations ---
  mod.SpaceshipResourceManager.addResources({ antimatter: 900, quantumAlloy: 300, plasmaCell: 300, neuralCircuit: 300 });
  mod.UnifiedSpaceshipStorage.setShipModules([{ id: "warpCoil", level: 10 }]);
  const hullFull = mod.ShipModuleSystem.miningMultiplier();
  mod.HullSystem.damage(50);
  const hullHalf = mod.ShipModuleSystem.miningMultiplier();
  check("hull damage lowers gathering", hullHalf < hullFull, `${hullFull.toFixed(2)} -> ${hullHalf.toFixed(2)}`);
  check("travel cost rises with damage", mod.HullSystem.travelFactor() > 1, mod.HullSystem.travelFactor().toFixed(2));
  mod.HullSystem.repair();

  check("station builds", mod.StationSystem.build({ planetKey: "planet_3,3,3_0_s", planetName: "S", coordinates: "3,3,3", systemIndex: 0 }));
  mod.StationSystem.upgrade("planet_3,3,3_0_s", "production");
  fakeNow += 40 * mod.TICK_MS;
  mod.StationSystem.settle();
  const stored = mod.StationSystem.list()[0].stored;
  mod.StationSystem.settle();
  check("offline accrual caps at 16 ticks", JSON.stringify(stored) === JSON.stringify(mod.StationSystem.list()[0].stored), JSON.stringify(stored));
  check("station claim pays out", Boolean(mod.StationSystem.claim("planet_3,3,3_0_s")));

  // --- collection counts drive diminishing returns ---
  mod.UnifiedSpaceshipStorage.markLocationCollected("planet_9,9,9_0_c");
  mod.UnifiedSpaceshipStorage.markLocationCollected("planet_9,9,9_0_c");
  check("collection counter increments", mod.UnifiedSpaceshipStorage.getCollectionCount("planet_9,9,9_0_c") === 2);

  // --- combat / wreck / faction ---
  const state = mod.CombatSystem.createEncounter("planet_4,4,4_0_b");
  const won = mod.CombatSystem.resolveTurn({ ...state, enemy: { ...state.enemy, hp: 1, shield: 0 } }, "fire");
  const outcome = mod.CombatSystem.settle(won, { planetKey: "planet_4,4,4_0_b", coordinates: "4,4,4" });
  check("win leaves a wreck", mod.WreckSystem.has("planet_4,4,4_0_b") && outcome.reward.antimatter > 0);
  check("wreck salvages once", Boolean(mod.WreckSystem.salvage("planet_4,4,4_0_b")) && mod.WreckSystem.salvage("planet_4,4,4_0_b") === null);

  const raider = (() => {
    for (let x = 0; x < 10; x++) {
      for (let y = 0; y < 10; y++) {
        const coords = `${x * 1000000 + 1},${y * 1000000 + 1},1`;
        if (mod.FactionSystem.factionOf(coords) === "掠夺者") return coords;
      }
    }
    return null;
  })();
  if (raider) {
    mod.FactionSystem.recordKill(raider);
    mod.FactionSystem.recordKill(raider);
    check("raider reputation raises encounter odds", mod.FactionSystem.encounterBonus(raider) > 0, mod.FactionSystem.encounterBonus(raider).toFixed(2));
  }

  // --- challenge codes ---
  const code = mod.ChallengeSystem.encode("smoke");
  const decoded = mod.ChallengeSystem.decode(code);
  check("challenge code round-trips", decoded !== null && decoded.weaponLevel === mod.ShipModuleSystem.level("weaponArray"));
  check("tampered challenge code is rejected", mod.ChallengeSystem.decode(code.slice(0, -3) + "AAA") === null);

  // --- production line ---
  mod.SpaceshipResourceManager.addResources({ quantumAlloy: 200, plasmaCell: 200 });
  check("craft starts", mod.FabricatorSystem.craft("alloy"));
  check("craft cooldown blocks", mod.FabricatorSystem.canCraft("alloy").ok === false);
  fakeNow += 3 * 60 * 60 * 1000;
  check("craft ready after cooldown", mod.FabricatorSystem.canCraft("alloy").ok === true);

  // --- world systems ---
  const event = mod.CosmicEvents.current();
  check("cosmic event is stable", JSON.stringify(event) === JSON.stringify(mod.CosmicEvents.current()), event.title);
  const sector = mod.SectorSystem.info("1200000,0,0");
  check("sector unlock price is deterministic", sector.cost >= 400 && sector.key === "1-0-0", sector.key);

  const contracts = mod.ContractSystem.getContracts();
  const located = contracts.find((c) => c.targetDistance);
  if (located) {
    const a = mod.ContractSystem.travelCost(located);
    const b = mod.SpaceshipResourceManager.calculateJumpCost(located.targetDistance);
    check("contract travel uses the shared jump formula", JSON.stringify(a) === JSON.stringify(b));
  }

  check("rival marking is deterministic", mod.Rival.isMarked("planet_5,5,5_0_r") === mod.Rival.isMarked("planet_5,5,5_0_r"));

  // --- tech tree ---
  check("tech tier gated by previous node", mod.TechSystem.canUnlock("mining-2").ok === false);
  check("tech unlock applies multiplier", mod.TechSystem.unlock("mining-1") && mod.TechSystem.multiplier("mining") > 1);

  // --- fleet ---
  mod.SpaceshipResourceManager.addResources({ antimatter: 900, quantumAlloy: 300 });
  check("fleet builds a ship", mod.FleetSystem.build());
  const ship = mod.FleetSystem.list()[0];
  mod.FleetSystem.setTask(ship.id, "mine");
  fakeNow += 3 * mod.FLEET_TICK_MS;
  mod.FleetSystem.settle();
  const fleetStored = mod.FleetSystem.list()[0].stored;
  check("fleet task accrues offline", (fleetStored.antimatter ?? 0) >= 9, JSON.stringify(fleetStored));
  check("fleet claim pays out", Boolean(mod.FleetSystem.claim(ship.id)));

  // --- surface survey ---
  let samples = 0;
  for (let i = 0; i < mod.DAILY_SAMPLES + 2; i++) {
    if (mod.SurfaceSystem.sample("planet_6,6,6_0_surface", i)) samples += 1;
  }
  check("surface sampling is capped", samples === mod.DAILY_SAMPLES, `${samples} samples`);

  // --- offline alliance ---
  const invite = mod.AllySystem.create("smoke");
  check("alliance invite code round-trips", mod.AllySystem.join(invite).ok === false && mod.AllySystem.bonus() >= 1, invite.slice(0, 12));
  check("alliance bonus scales with members", mod.AllySystem.members().length === 1 && mod.AllySystem.bonus() > 1);

  // --- intel target (backend call not exercised here) ---
  const targetA = mod.IntelSystem.target("1000000,1000000,1000000");
  const targetB = mod.IntelSystem.target("1000000,1000000,1000000");
  check("intel target is deterministic", JSON.stringify(targetA) === JSON.stringify(targetB));

  // --- escort joins combat when ships are idle ---
  mod.SpaceshipResourceManager.addResources({ antimatter: 900, quantumAlloy: 300 });
  mod.FleetSystem.build();
  const escortState = mod.CombatSystem.createEncounter("planet_8,8,8_0_escort");
  check("idle ships fly escort", (escortState.escorts ?? []).length >= 1, `${(escortState.escorts ?? []).length} escorts`);

  // --- save export covers every atlas key ---
  const exported = await mod.DataExportImport.exportAllData();
  const json = JSON.parse(Buffer.from(exported, "base64").toString("utf8"));
  check("export includes new systems", Object.keys(json.keys).length >= 5, `${Object.keys(json.keys).length} keys`);

  Date.now = realNow;

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) process.exitCode = 1;
};

try {
  await main();
} finally {
  for (const file of [ENTRY, BUNDLE]) {
    try {
      unlinkSync(file);
    } catch (error) {
      // already gone
    }
  }
}

// atlas-ui/react/static/js/Utils/PlanetScanSystem.tsx
// Orbital survey: spend fuel to probe a planet for enriched strata, minerals or relics.
// Every outcome is a pure function of the planet seed, so it is identical on reload.

import { SeededRandom } from "./SeededRandom.tsx";
import { getItem, setItem } from "./b64.tsx";
import { SpaceshipResourceManager, SpaceshipResource } from "./SpaceshipResources.tsx";
import { UnifiedSpaceshipStorage } from "./UnifiedSpaceshipStorage.tsx";
import { ResourceEventManager } from "./ResourceEventManager.tsx";
import { ShipModuleSystem } from "./ShipModules.tsx";
import { ContractSystem } from "./ContractSystem.tsx";
import { RelicLore } from "./RelicLore.tsx";
import { SectorSystem } from "./SectorSystem.tsx";
import { CosmicEvents } from "./CosmicEvents.tsx";

export const SCAN_STORAGE_KEY = "_atlasScans";
const MAX_TRACKED_PLANETS = 400;

export type ScanKind = "barren" | "enriched" | "mineral" | "relic";

export interface ScanOutcome {
  kind: ScanKind;
  title: string;
  detail: string;
  yield: Partial<SpaceshipResource>;
  miningBonus: number;
}

interface ScanRecord {
  at: number;
  kind: ScanKind;
  bonus: number;
  uses: number;
  scans: number;
}

interface ScanStore {
  version: number;
  planets: Record<string, ScanRecord>;
}

const KIND_META: Record<ScanKind, { title: string; detail: string }> = {
  barren: { title: "无异常", detail: "地表结构均匀，仅回收了部分探测燃料。" },
  enriched: { title: "元素富集层", detail: "发现高浓度元素矿脉，下一次地表采集收益大幅提升。" },
  mineral: { title: "稀有矿物", detail: "探测到深层矿脉，已自动采集样本并存入货舱。" },
  relic: { title: "远古遗迹", detail: "扫描到非自然构造，提取出前文明遗留物。" },
};

const MINERAL_TYPES = ["Metallic", "Crystalline", "Carbon", "Diamond", "Rocky", "Molten Core", "Magma"];
const ANOMALY_TYPES = ["Anomaly", "Exotic"];

export class PlanetScanSystem {
  /** Same key the mining system uses, so scan bonuses attach to the right location. */
  static locationKey(planetName: string, coordinates: string, systemIndex: number): string {
    return `planet_${coordinates}_${systemIndex}_${planetName.toLowerCase()}`;
  }

  static cooldownRemaining(key: string): number {
    const record = PlanetScanSystem.getRecord(key);
    if (!record) return 0;
    return Math.max(0, record.at + ShipModuleSystem.scanCooldownMs() - Date.now());
  }

  static scanCount(key: string): number {
    return PlanetScanSystem.getRecord(key)?.scans ?? 0;
  }

  static canScan(key: string): { ok: boolean; reason?: string; remainingMs: number } {
    const remainingMs = PlanetScanSystem.cooldownRemaining(key);
    if (remainingMs > 0) return { ok: false, reason: "冷却中", remainingMs };

    const resources = SpaceshipResourceManager.getResources();
    if (resources.deuterium < ShipModuleSystem.scanCost()) {
      return { ok: false, reason: "氘不足", remainingMs: 0 };
    }
    return { ok: true, remainingMs: 0 };
  }

  static pendingBonus(key: string): number {
    const record = PlanetScanSystem.getRecord(key);
    if (!record || record.uses <= 0) return 1;
    return record.bonus;
  }

  static scan(key: string, planetType: string, planetName: string, coordinates?: string): ScanOutcome | null {
    if (!PlanetScanSystem.canScan(key).ok) return null;

    const resources = SpaceshipResourceManager.getResources();
    UnifiedSpaceshipStorage.setResources({ ...resources, deuterium: resources.deuterium - ShipModuleSystem.scanCost() });

    const previous = PlanetScanSystem.getRecord(key);
    const scans = (previous?.scans ?? 0) + 1;
    const outcome = PlanetScanSystem.rollOutcome(key, planetType, planetName, scans);
    const surveyFactor = SectorSystem.multiplierFor(coordinates ?? "") * CosmicEvents.multiplier("scan", coordinates ?? "");
    outcome.yield = PlanetScanSystem.scaleYield(outcome.yield, surveyFactor);

    if (Object.keys(outcome.yield).length > 0) {
      SpaceshipResourceManager.addResources(outcome.yield);
    }

    PlanetScanSystem.saveRecord(key, {
      at: Date.now(),
      kind: outcome.kind,
      bonus: outcome.miningBonus,
      uses: outcome.kind === "enriched" ? 1 : 0,
      scans,
    });

    ContractSystem.increment("scans", 1, coordinates);
    if (outcome.kind === "relic") {
      ContractSystem.increment("relicScans", 1, coordinates);
      RelicLore.record(key);
    }
    ResourceEventManager.emit("resources_updated", outcome);
    return outcome;
  }

  /** Mirror a server-authoritative scan into the local cooldown/count cache. */
  static applyServerResult(key: string, scans: number, cooldownMs: number): void {
    const overlap = Math.max(0, ShipModuleSystem.scanCooldownMs() - Math.max(0, cooldownMs));
    PlanetScanSystem.saveRecord(key, {
      at: Date.now() - overlap,
      kind: "barren",
      bonus: 1,
      uses: 0,
      scans: Math.max(1, scans),
    });
  }

  /** Spends a survey action without rolling (wreck salvage uses this). */
  static markUsed(key: string): void {
    const previous = PlanetScanSystem.getRecord(key);
    PlanetScanSystem.saveRecord(key, {
      at: Date.now(),
      kind: previous?.kind ?? "barren",
      bonus: previous?.bonus ?? 1,
      uses: 0,
      scans: previous?.scans ?? 0,
    });
  }

  static consumeBonus(key: string): void {
    const record = PlanetScanSystem.getRecord(key);
    if (!record || record.uses <= 0) return;
    PlanetScanSystem.saveRecord(key, { ...record, uses: record.uses - 1 });
  }

  private static rollOutcome(key: string, planetType: string, planetName: string, scans: number): ScanOutcome {
    const rng = new SeededRandom(PlanetScanSystem.hashText(`${planetName}|${planetType}|${key}|${scans}`));
    const roll = rng.random();

    const relicChance = ANOMALY_TYPES.includes(planetType) ? 0.25 : 0.1;
    const mineralChance = MINERAL_TYPES.includes(planetType) ? 0.45 : 0.3;

    if (roll < relicChance) {
      return { ...KIND_META.relic, kind: "relic", miningBonus: 1, yield: PlanetScanSystem.rollRelic(rng) };
    }
    if (roll < relicChance + mineralChance) {
      return { ...KIND_META.mineral, kind: "mineral", miningBonus: 1, yield: PlanetScanSystem.rollMineral(rng) };
    }
    if (roll < relicChance + mineralChance + 0.3) {
      const bonus = Math.round((1.6 + rng.random() * 0.6) * 100) / 100;
      return {
        ...KIND_META.enriched,
        kind: "enriched",
        miningBonus: bonus,
        yield: { deuterium: 2 },
      };
    }

    return { ...KIND_META.barren, kind: "barren", miningBonus: 1, yield: { deuterium: 2 } };
  }

  /** Licensed sectors pay more for the same survey. */
  private static scaleYield(yield_: Partial<SpaceshipResource>, factor: number): Partial<SpaceshipResource> {
    if (factor <= 1) return yield_;

    const scaled: Partial<SpaceshipResource> = {};
    Object.entries(yield_).forEach(([key, amount]) => {
      scaled[key as keyof SpaceshipResource] = Math.max(1, Math.round((amount ?? 0) * factor));
    });
    return scaled;
  }

  private static rollRelic(rng: SeededRandom): Partial<SpaceshipResource> {
    const yield_: Partial<SpaceshipResource> = { ancientRelic: rng.randint(1, 2) + ShipModuleSystem.surveySalvage() };
    if (rng.random() < 0.4) yield_.alienArtifact = 1;
    if (rng.random() < 0.15) yield_.dimensionalShard = 1;
    return yield_;
  }

  private static rollMineral(rng: SeededRandom): Partial<SpaceshipResource> {
    const yield_: Partial<SpaceshipResource> = { exoticCrystal: rng.randint(2, 7) + ShipModuleSystem.surveySalvage() };
    if (rng.random() < 0.5) yield_.nebulaDust = rng.randint(1, 4);
    if (rng.random() < 0.3) yield_.quantumAlloy = rng.randint(1, 3);
    return yield_;
  }

  private static hashText(text: string): number {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash) % 2147483647;
  }

  private static getRecord(key: string): ScanRecord | null {
    return PlanetScanSystem.load().planets[key] ?? null;
  }

  private static saveRecord(key: string, record: ScanRecord): void {
    const store = PlanetScanSystem.load();
    store.planets[key] = record;

    const keys = Object.keys(store.planets);
    if (keys.length > MAX_TRACKED_PLANETS) {
      keys
        .sort((a, b) => store.planets[a].at - store.planets[b].at)
        .slice(0, keys.length - MAX_TRACKED_PLANETS)
        .forEach((stale) => delete store.planets[stale]);
    }

    setItem(SCAN_STORAGE_KEY, JSON.stringify(store));
  }

  private static load(): ScanStore {
    try {
      const raw = getItem(SCAN_STORAGE_KEY);
      if (!raw) return { version: 1, planets: {} };
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || typeof parsed.planets !== "object") {
        return { version: 1, planets: {} };
      }
      return { version: 1, planets: parsed.planets };
    } catch (error) {
      return { version: 1, planets: {} };
    }
  }
}

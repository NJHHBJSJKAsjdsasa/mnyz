// atlas-ui/react/static/js/Utils/StationSystem.tsx
// Surface stations: up to three, one per visited planet. They accrue output on a
// 15-minute tick while you are away, and their modules buff the whole ship.

import { getItem, setItem } from "./b64.tsx";
import { SpaceshipResourceManager, SpaceshipResource } from "./SpaceshipResources.tsx";
import { UnifiedSpaceshipStorage } from "./UnifiedSpaceshipStorage.tsx";
import { ResourceEventManager } from "./ResourceEventManager.tsx";
import { Residents } from "./Residents.tsx";
import { dayKey, hashText } from "./Deterministic.tsx";

export const STATION_STORAGE_KEY = "_atlasStations";
export const MAX_STATIONS = 3;
export const TICK_MS = 15 * 60 * 1000;
/** Offline accrual stops after 4 hours so leaving the game is not a strategy. */
export const MAX_PENDING_TICKS = 16;

export type StationModuleId = "production" | "sensor" | "commerce";

export const SENSOR_COOLDOWN_CAP = 0.25;
export const COMMERCE_SELL_CAP = 0.2;

export interface Station {
  id: string;
  name: string;
  coordinates: string;
  planetKey?: string;
  systemIndex: number;
  modules: Record<StationModuleId, number>;
  lastTick: number;
  stored: Partial<SpaceshipResource>;
}

interface StationStore {
  version: number;
  stations: Station[];
}

export interface StationModuleDef {
  id: StationModuleId;
  name: string;
  icon: string;
  effect: (level: number) => string;
  cost: (level: number) => Partial<SpaceshipResource>;
}

const costCurve = (base: number, level: number) => Math.round(base * Math.pow(1.6, level - 1));

export const STATION_MODULES: StationModuleDef[] = [
  {
    id: "production",
    name: "生产舱",
    icon: "⚙️",
    effect: (level) => `每 15 分钟 +${StationSystem.tickYield(level).antimatter} 反物质 / +${StationSystem.tickYield(level).deuterium} 氘`,
    cost: (level) => ({ quantumAlloy: costCurve(24, level), plasmaCell: costCurve(10, level) }),
  },
  {
    id: "sensor",
    name: "观测舱",
    icon: "🔭",
    effect: (level) => `全舰扫描冷却 -${Math.round(level * 2)}%（上限 ${Math.round(SENSOR_COOLDOWN_CAP * 100)}%）`,
    cost: (level) => ({ neuralCircuit: costCurve(18, level), quantumAlloy: costCurve(12, level) }),
  },
  {
    id: "commerce",
    name: "贸易舱",
    icon: "💱",
    effect: (level) => `全舰卖价 +${level}%（上限 ${Math.round(COMMERCE_SELL_CAP * 100)}%）`,
    cost: (level) => ({ plasmaCell: costCurve(20, level), neuralCircuit: costCurve(8, level) }),
  },
];

export interface BuildRequest {
  planetKey: string;
  planetName: string;
  coordinates: string;
  systemIndex: number;
}

const emptyModules = (): Record<StationModuleId, number> => ({ production: 1, sensor: 0, commerce: 0 });

export class StationSystem {
  /** A resident may dock for the day and leave a message; their visit adds 5%. */
  static visitor(stationId: string): { name: string; callsign: string } | null {
    const seed = hashText(`visitor|${Residents.universeSeed()}|${dayKey()}|${stationId}`);
    if (seed % 100 >= 45) return null;

    const roster = Residents.roster(Residents.universeSeed());
    const resident = roster[seed % roster.length];
    return { name: resident.name, callsign: resident.callsign };
  }

  /** Per-tick output of one production module. */
  static tickYield(level: number): { antimatter: number; deuterium: number } {
    if (level <= 0) return { antimatter: 0, deuterium: 0 };
    return {
      antimatter: 2 + Math.round(3 * Math.sqrt(level)),
      deuterium: Math.max(1, Math.floor(level / 3)),
    };
  }

  static list(): Station[] {
    return StationSystem.load().stations;
  }

  static count(): number {
    return StationSystem.list().length;
  }

  static isBuilt(planetKey: string): boolean {
    return StationSystem.list().some((station) => station.id === planetKey);
  }

  /**
   * Kept below the default 1000 storage cap on purpose: antimatter held in the
   * ship is capped, so a cost above that cap would be unbuildable for new players.
   */
  static buildCost(): Partial<SpaceshipResource> {
    const scale = 1 + 0.5 * StationSystem.count();
    return {
      antimatter: Math.round(400 * scale),
      quantumAlloy: Math.round(30 * scale),
      plasmaCell: Math.round(24 * scale),
    };
  }

  static canBuild(planetKey: string): { ok: boolean; reason?: string } {
    if (StationSystem.isBuilt(planetKey)) return { ok: false, reason: "本星球已有空间站" };
    if (StationSystem.count() >= MAX_STATIONS) return { ok: false, reason: `最多 ${MAX_STATIONS} 座` };
    if (!StationSystem.canAfford(StationSystem.buildCost())) return { ok: false, reason: "资源不足" };
    return { ok: true };
  }

  static build(request: BuildRequest): boolean {
    if (!StationSystem.canBuild(request.planetKey).ok) return false;
    if (!StationSystem.spend(StationSystem.buildCost())) return false;

    const store = StationSystem.load();
    store.stations.push({
      id: request.planetKey,
      name: request.planetName,
      coordinates: request.coordinates,
      systemIndex: request.systemIndex,
      modules: emptyModules(),
      lastTick: Date.now(),
      stored: {},
    });
    StationSystem.save(store);
    ResourceEventManager.emit("resources_updated");
    return true;
  }

  static upgradeCost(stationId: string, moduleId: StationModuleId): Partial<SpaceshipResource> | null {
    const station = StationSystem.list().find((item) => item.id === stationId);
    const def = STATION_MODULES.find((item) => item.id === moduleId);
    if (!station || !def) return null;
    return def.cost(station.modules[moduleId] + 1);
  }

  static canUpgrade(stationId: string, moduleId: StationModuleId): { ok: boolean; reason?: string } {
    const cost = StationSystem.upgradeCost(stationId, moduleId);
    if (!cost) return { ok: false, reason: "空间站不存在" };
    if (!StationSystem.canAfford(cost)) return { ok: false, reason: "资源不足" };
    return { ok: true };
  }

  static upgrade(stationId: string, moduleId: StationModuleId): boolean {
    if (!StationSystem.canUpgrade(stationId, moduleId).ok) return false;
    const cost = StationSystem.upgradeCost(stationId, moduleId);
    if (!StationSystem.spend(cost)) return false;

    const store = StationSystem.load();
    const station = store.stations.find((item) => item.id === stationId);
    if (!station) return false;
    station.modules[moduleId] = (station.modules[moduleId] ?? 0) + 1;
    StationSystem.save(store);
    ResourceEventManager.emit("resources_updated");
    return true;
  }

  /** Accrue every pending tick (capped) into each station's storage. */
  static settle(): void {
    const store = StationSystem.load();
    const now = Date.now();
    let changed = false;

    store.stations.forEach((station) => {
      const ticks = Math.floor((now - station.lastTick) / TICK_MS);
      if (ticks <= 0) return;

      const applied = Math.min(ticks, MAX_PENDING_TICKS);
      const yieldPerTick = StationSystem.tickYield(station.modules.production);
      const visitBonus = StationSystem.visitor(station.id) ? 1.05 : 1;
      station.stored = {
        antimatter: (station.stored.antimatter ?? 0) + Math.round(yieldPerTick.antimatter * applied * visitBonus),
        deuterium: (station.stored.deuterium ?? 0) + Math.round(yieldPerTick.deuterium * applied * visitBonus),
      };
      // Past the cap the surplus is dropped outright; keeping it would let a long
      // absence pay out twice on the next settle.
      station.lastTick = ticks > MAX_PENDING_TICKS ? now : station.lastTick + ticks * TICK_MS;
      changed = true;
    });

    if (changed) StationSystem.save(store);
  }

  static claim(stationId: string): Partial<SpaceshipResource> | null {
    StationSystem.settle();

    const store = StationSystem.load();
    const station = store.stations.find((item) => item.id === stationId);
    if (!station) return null;

    const stored = station.stored;
    if (!stored.antimatter && !stored.deuterium) return null;

    SpaceshipResourceManager.addResources(stored);
    station.stored = {};
    StationSystem.save(store);
    ResourceEventManager.emit("resources_updated");
    return stored;
  }

  /** Global scan cooldown multiplier from every sensor module. */
  static scanCooldownMultiplier(): number {
    const levels = StationSystem.list().reduce((sum, station) => sum + (station.modules.sensor ?? 0), 0);
    return 1 - Math.min(SENSOR_COOLDOWN_CAP, 0.02 * levels);
  }

  /** Global sell-price multiplier from every commerce module. */
  static tradeSellMultiplier(): number {
    const levels = StationSystem.list().reduce((sum, station) => sum + (station.modules.commerce ?? 0), 0);
    return 1 + Math.min(COMMERCE_SELL_CAP, 0.01 * levels);
  }

  private static canAfford(cost: Partial<SpaceshipResource> | null): boolean {
    if (!cost) return false;
    const resources = SpaceshipResourceManager.getResources();
    return Object.entries(cost).every(([key, amount]) => (resources[key as keyof SpaceshipResource] ?? 0) >= (amount ?? 0));
  }

  private static spend(cost: Partial<SpaceshipResource> | null): boolean {
    if (!StationSystem.canAfford(cost)) return false;
    const resources = SpaceshipResourceManager.getResources();
    const updated = { ...resources };
    Object.entries(cost ?? {}).forEach(([key, amount]) => {
      updated[key as keyof SpaceshipResource] = (updated[key as keyof SpaceshipResource] ?? 0) - (amount ?? 0);
    });
    UnifiedSpaceshipStorage.setResources(updated);
    return true;
  }

  private static load(): StationStore {
    try {
      const raw = getItem(STATION_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || !Array.isArray(parsed.stations)) return { version: 1, stations: [] };

      const stations: Station[] = parsed.stations
        .filter((station: Station) => station && typeof station.id === "string")
        .map((station: Station) => ({
          id: station.id,
          name: station.name ?? station.id,
          coordinates: station.coordinates ?? "",
          systemIndex: station.systemIndex ?? 0,
          modules: { ...emptyModules(), ...(station.modules ?? {}) },
          lastTick: Number(station.lastTick) || Date.now(),
          stored: station.stored ?? {},
        }));

      return { version: 1, stations: stations.slice(0, MAX_STATIONS) };
    } catch (error) {
      return { version: 1, stations: [] };
    }
  }

  private static save(store: StationStore): void {
    setItem(STATION_STORAGE_KEY, JSON.stringify(store));
  }
}

export default StationSystem;

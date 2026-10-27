// atlas-ui/react/static/js/Utils/FleetSystem.tsx
// Escort ships. Up to three hulls, each running one automatic task; work accrues
// on a 30-minute tick while you are away, capped so idling is not a strategy.

import { getItem, setItem } from "./b64.tsx";
import { UnifiedSpaceshipStorage } from "./UnifiedSpaceshipStorage.tsx";
import { SpaceshipResourceManager } from "./SpaceshipResources.tsx";
import { ResourceEventManager } from "./ResourceEventManager.tsx";
import type { SpaceshipResource } from "./SpaceshipResources.tsx";

export const FLEET_STORAGE_KEY = "_atlasFleet";
export const MAX_SHIPS = 3;
export const FLEET_TICK_MS = 30 * 60 * 1000;
export const FLEET_MAX_TICKS = 12;

export type FleetTask = "idle" | "mine" | "survey" | "trade";

export const FLEET_TASKS: Array<{ id: FleetTask; label: string; detail: string }> = [
  { id: "idle", label: "待命", detail: "不产出" },
  { id: "mine", label: "采集", detail: "每 tick 反物质 +3 / 氘 +1" },
  { id: "survey", label: "扫测", detail: "每 tick 异星晶体 +1 / 星云尘埃 +1" },
  { id: "trade", label: "贸易", detail: "每 tick 反物质 +6" },
];

export interface FleetShip {
  id: string;
  name: string;
  task: FleetTask;
  lastTick: number;
  stored: Partial<SpaceshipResource>;
}

interface FleetStore {
  version: number;
  ships: FleetShip[];
}

const taskYield = (task: FleetTask): Partial<SpaceshipResource> => {
  if (task === "mine") return { antimatter: 3, deuterium: 1 };
  if (task === "survey") return { exoticCrystal: 1, nebulaDust: 1 };
  if (task === "trade") return { antimatter: 6 };
  return {};
};

export class FleetSystem {
  static list(): FleetShip[] {
    return FleetSystem.load().ships;
  }

  static count(): number {
    return FleetSystem.list().length;
  }

  static buildCost(): Partial<SpaceshipResource> {
    const scale = 1 + 0.5 * FleetSystem.count();
    return { antimatter: Math.round(500 * scale), quantumAlloy: Math.round(25 * scale) };
  }

  static canBuild(): { ok: boolean; reason?: string } {
    if (FleetSystem.count() >= MAX_SHIPS) return { ok: false, reason: `最多 ${MAX_SHIPS} 艘` };

    const cost = FleetSystem.buildCost();
    const resources = UnifiedSpaceshipStorage.getResources();
    const affordable = Object.entries(cost).every(
      ([key, amount]) => (resources[key as keyof SpaceshipResource] ?? 0) >= (amount ?? 0),
    );
    return affordable ? { ok: true } : { ok: false, reason: "资源不足" };
  }

  static build(): boolean {
    if (!FleetSystem.canBuild().ok) return false;

    const cost = FleetSystem.buildCost();
    const resources = UnifiedSpaceshipStorage.getResources();
    const updated = { ...resources };
    Object.entries(cost).forEach(([key, amount]) => {
      updated[key as keyof SpaceshipResource] = (updated[key as keyof SpaceshipResource] ?? 0) - (amount ?? 0);
    });
    UnifiedSpaceshipStorage.setResources(updated);

    const store = FleetSystem.load();
    const index = store.ships.length + 1;
    store.ships.push({
      id: `ship-${Date.now()}-${index}`,
      name: `远星 ${index}`,
      task: "idle",
      lastTick: Date.now(),
      stored: {},
    });
    FleetSystem.save(store);
    ResourceEventManager.emit("resources_updated");
    return true;
  }

  static setTask(shipId: string, task: FleetTask): boolean {
    FleetSystem.settle();
    const store = FleetSystem.load();
    const ship = store.ships.find((item) => item.id === shipId);
    if (!ship) return false;

    ship.task = task;
    ship.lastTick = Date.now();
    FleetSystem.save(store);
    return true;
  }

  /** Accrue capped ticks for every ship; call on entering the fleet panel. */
  static settle(): void {
    const store = FleetSystem.load();
    const now = Date.now();
    let changed = false;

    store.ships.forEach((ship) => {
      if (ship.task === "idle") {
        ship.lastTick = now;
        return;
      }

      const ticks = Math.floor((now - ship.lastTick) / FLEET_TICK_MS);
      if (ticks <= 0) return;

      const applied = Math.min(ticks, FLEET_MAX_TICKS);
      const yield_ = taskYield(ship.task);
      Object.entries(yield_).forEach(([key, amount]) => {
        const field = key as keyof SpaceshipResource;
        ship.stored[field] = (ship.stored[field] ?? 0) + (amount ?? 0) * applied;
      });

      ship.lastTick = ticks > FLEET_MAX_TICKS ? now : ship.lastTick + ticks * FLEET_TICK_MS;
      changed = true;
    });

    if (changed) FleetSystem.save(store);
  }

  static claim(shipId: string): Partial<SpaceshipResource> | null {
    FleetSystem.settle();
    const store = FleetSystem.load();
    const ship = store.ships.find((item) => item.id === shipId);
    if (!ship) return null;

    const stored = ship.stored;
    if (Object.values(stored).every((amount) => !amount)) return null;

    SpaceshipResourceManager.addResources(stored);
    ship.stored = {};
    FleetSystem.save(store);
    ResourceEventManager.emit("resources_updated");
    return stored;
  }

  static pendingTicks(ship: FleetShip): number {
    if (ship.task === "idle") return 0;
    return Math.min(FLEET_MAX_TICKS, Math.floor((Date.now() - ship.lastTick) / FLEET_TICK_MS));
  }

  private static load(): FleetStore {
    try {
      const raw = getItem(FLEET_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || !Array.isArray(parsed.ships)) return { version: 1, ships: [] };
      return { version: 1, ships: parsed.ships.slice(0, MAX_SHIPS) };
    } catch (error) {
      return { version: 1, ships: [] };
    }
  }

  private static save(store: FleetStore): void {
    setItem(FLEET_STORAGE_KEY, JSON.stringify(store));
  }
}

export default FleetSystem;

// atlas-ui/react/static/js/Utils/HullSystem.tsx
// Ship integrity. Combat and accidents eat into it; a damaged hull cuts gathering
// output and makes every jump more expensive until it is repaired.

import { getItem, setItem } from "./b64.tsx";
import { UnifiedSpaceshipStorage } from "./UnifiedSpaceshipStorage.tsx";
import { ResourceEventManager } from "./ResourceEventManager.tsx";
// Type-only: keeps HullSystem free of a runtime cycle with SpaceshipResources.
import type { SpaceshipResource } from "./SpaceshipResources.tsx";

export const HULL_STORAGE_KEY = "_atlasHull";
export const MAX_HULL = 100;

interface HullStore {
  version: number;
  hull: number;
}

const clamp = (value: number) => Math.max(0, Math.min(MAX_HULL, Math.round(value)));

export class HullSystem {
  static applyServerHull(hull: number): void {
    HullSystem.save({ version: 1, hull: clamp(hull) });
  }

  static value(): number {
    return HullSystem.load().hull;
  }

  /** 1.0 with a pristine hull, 0.5 when crippled. */
  static factor(): number {
    return 0.5 + (0.5 * HullSystem.value()) / MAX_HULL;
  }

  /** Extra fuel factor: 1.0 pristine, 1.5 crippled. */
  static travelFactor(): number {
    return 2 - HullSystem.factor();
  }

  static damage(amount: number): number {
    const store = HullSystem.load();
    store.hull = clamp(store.hull - Math.max(0, amount));
    HullSystem.save(store);
    ResourceEventManager.emit("resources_updated");
    return store.hull;
  }

  static repairCost(): Partial<SpaceshipResource> {
    const missing = MAX_HULL - HullSystem.value();
    return {
      antimatter: missing * 4,
      quantumAlloy: Math.ceil(missing / 8),
    };
  }

  static canRepair(): { ok: boolean; reason?: string } {
    if (HullSystem.value() >= MAX_HULL) return { ok: false, reason: "船体完好" };

    const cost = HullSystem.repairCost();
    const resources = UnifiedSpaceshipStorage.getResources();
    const affordable = Object.entries(cost).every(
      ([key, amount]) => (resources[key as keyof SpaceshipResource] ?? 0) >= (amount ?? 0),
    );
    return affordable ? { ok: true } : { ok: false, reason: "资源不足" };
  }

  static repair(): boolean {
    if (!HullSystem.canRepair().ok) return false;

    const cost = HullSystem.repairCost();
    const resources = UnifiedSpaceshipStorage.getResources();
    const updated = { ...resources };
    Object.entries(cost).forEach(([key, amount]) => {
      updated[key as keyof SpaceshipResource] = (updated[key as keyof SpaceshipResource] ?? 0) - (amount ?? 0);
    });
    UnifiedSpaceshipStorage.setResources(updated);
    HullSystem.save({ version: 1, hull: MAX_HULL });
    ResourceEventManager.emit("resources_updated");
    return true;
  }

  private static load(): HullStore {
    try {
      const raw = getItem(HULL_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed.hull !== "number") return { version: 1, hull: MAX_HULL };
      return { version: 1, hull: clamp(parsed.hull) };
    } catch (error) {
      return { version: 1, hull: MAX_HULL };
    }
  }

  private static save(store: HullStore): void {
    setItem(HULL_STORAGE_KEY, JSON.stringify(store));
  }
}

export default HullSystem;

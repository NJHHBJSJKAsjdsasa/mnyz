// atlas-ui/react/static/js/Utils/SectorSystem.tsx
// The universe is cut into 10×10×10 sectors. Unlocking one pays a one-off fee
// and lifts everything you gather or scan inside it by 20%.

import { getItem, setItem } from "./b64.tsx";
import { SpaceshipResourceManager } from "./SpaceshipResources.tsx";
import { UnifiedSpaceshipStorage } from "./UnifiedSpaceshipStorage.tsx";
import { ResourceEventManager } from "./ResourceEventManager.tsx";
import { sectorOf, SECTOR_SPAN } from "./SectorMath.tsx";

export const SECTOR_STORAGE_KEY = "_atlasSectors";
export { SECTOR_SPAN };
export const SECTOR_BONUS = 0.2;

interface SectorStore {
  version: number;
  unlocked: string[];
}

export interface SectorInfo {
  key: string;
  x: number;
  y: number;
  z: number;
  unlocked: boolean;
  cost: number;
}

export class SectorSystem {
  /** Coordinates arrive as "x,y,z"; anything unparsable lands in sector 0-0-0. */
  static sectorOf(coordinates: string): { key: string; x: number; y: number; z: number } {
    return sectorOf(coordinates);
  }

  static info(coordinates: string): SectorInfo {
    const sector = SectorSystem.sectorOf(coordinates);
    const unlocked = SectorSystem.load().unlocked.includes(sector.key);
    return { ...sector, unlocked, cost: SectorSystem.unlockCost() };
  }

  static isUnlocked(coordinates: string): boolean {
    return SectorSystem.load().unlocked.includes(SectorSystem.sectorOf(coordinates).key);
  }

  /** One-off fee that grows with how many sectors are already yours. */
  static unlockCost(): number {
    return 400 + SectorSystem.load().unlocked.length * 120;
  }

  static canUnlock(coordinates: string): { ok: boolean; reason?: string } {
    const store = SectorSystem.load();
    if (store.unlocked.includes(SectorSystem.sectorOf(coordinates).key)) return { ok: false, reason: "本星区已解锁" };
    if (SpaceshipResourceManager.getResources().antimatter < SectorSystem.unlockCost()) return { ok: false, reason: "反物质不足" };
    return { ok: true };
  }

  /** Reflect a server-licensed sector in the local cache. */
  static applyServerUnlock(sectorKey: string): void {
    const store = SectorSystem.load();
    if (!store.unlocked.includes(sectorKey)) {
      store.unlocked = [...store.unlocked, sectorKey];
      SectorSystem.save(store);
    }
  }

  static unlock(coordinates: string): boolean {
    if (!SectorSystem.canUnlock(coordinates).ok) return false;

    const store = SectorSystem.load();
    const resources = SpaceshipResourceManager.getResources();
    UnifiedSpaceshipStorage.setResources({ ...resources, antimatter: resources.antimatter - SectorSystem.unlockCost() });

    store.unlocked = [...store.unlocked, SectorSystem.sectorOf(coordinates).key];
    SectorSystem.save(store);
    ResourceEventManager.emit("resources_updated");
    return true;
  }

  /** Applied to gathering output and scan yield inside licensed sectors. */
  static multiplierFor(coordinates: string): number {
    return SectorSystem.isUnlocked(coordinates) ? 1 + SECTOR_BONUS : 1;
  }

  static count(): number {
    return SectorSystem.load().unlocked.length;
  }

  private static load(): SectorStore {
    try {
      const raw = getItem(SECTOR_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || !Array.isArray(parsed.unlocked)) return { version: 1, unlocked: [] };
      return { version: 1, unlocked: parsed.unlocked.filter((key: string) => typeof key === "string") };
    } catch (error) {
      return { version: 1, unlocked: [] };
    }
  }

  private static save(store: SectorStore): void {
    setItem(SECTOR_STORAGE_KEY, JSON.stringify(store));
  }
}

export default SectorSystem;

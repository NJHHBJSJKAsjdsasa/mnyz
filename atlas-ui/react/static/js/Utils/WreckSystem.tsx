// atlas-ui/react/static/js/Utils/WreckSystem.tsx
// A won fight leaves a wreck behind. Salvaging it costs one survey action
// (the planet's scan cooldown) and pays out part of the enemy's fittings.

import { getItem, setItem } from "./b64.tsx";
import { SpaceshipResourceManager } from "./SpaceshipResources.tsx";
import { ResourceEventManager } from "./ResourceEventManager.tsx";
import type { SpaceshipResource } from "./SpaceshipResources.tsx";

export const WRECK_STORAGE_KEY = "_atlasWrecks";
const MAX_WRECKS = 40;

interface Wreck {
  at: number;
  tier: number;
}

interface WreckStore {
  version: number;
  wrecks: Record<string, Wreck>;
}

export interface SalvageResult {
  yield: Partial<SpaceshipResource>;
  tier: number;
}

export class WreckSystem {
  static record(planetKey: string, tier: number): void {
    const store = WreckSystem.load();
    store.wrecks[planetKey] = { at: Date.now(), tier: Math.max(1, Math.round(tier)) };

    const keys = Object.keys(store.wrecks);
    if (keys.length > MAX_WRECKS) {
      keys
        .sort((a, b) => store.wrecks[a].at - store.wrecks[b].at)
        .slice(0, keys.length - MAX_WRECKS)
        .forEach((stale) => delete store.wrecks[stale]);
    }

    WreckSystem.save(store);
  }

  static has(planetKey: string): boolean {
    return Boolean(WreckSystem.load().wrecks[planetKey]);
  }

  /** Removes the wreck and returns what it held. */
  static salvage(planetKey: string): SalvageResult | null {
    const store = WreckSystem.load();
    const wreck = store.wrecks[planetKey];
    if (!wreck) return null;

    const tier = wreck.tier;
    const yield_: Partial<SpaceshipResource> = {
      exoticCrystal: 4 + tier * 2,
      nebulaDust: 2 + tier,
    };
    if (tier >= 3) yield_.ancientRelic = 1;
    if (tier >= 5) yield_.alienArtifact = 1;

    SpaceshipResourceManager.addResources(yield_);
    delete store.wrecks[planetKey];
    WreckSystem.save(store);
    ResourceEventManager.emit("resources_updated");
    return { yield: yield_, tier };
  }

  private static load(): WreckStore {
    try {
      const raw = getItem(WRECK_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed.wrecks !== "object" || parsed.wrecks === null) return { version: 1, wrecks: {} };
      return { version: 1, wrecks: parsed.wrecks };
    } catch (error) {
      return { version: 1, wrecks: {} };
    }
  }

  private static save(store: WreckStore): void {
    setItem(WRECK_STORAGE_KEY, JSON.stringify(store));
  }
}

export default WreckSystem;

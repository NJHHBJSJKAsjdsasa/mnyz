// atlas-ui/react/static/js/Utils/SurfaceSystem.tsx
// Surface survey minigame: an 8×8 richness grid derived from the planet key.
// Picking a hot cell pays more; each planet allows three samples per day.

import { getItem, setItem } from "./b64.tsx";
import { hashText, dayKey } from "./Deterministic.tsx";
import { SpaceshipResourceManager } from "./SpaceshipResources.tsx";
import { ResourceEventManager } from "./ResourceEventManager.tsx";
import type { SpaceshipResource } from "./SpaceshipResources.tsx";

export const SURFACE_STORAGE_KEY = "_atlasSurface";
export const GRID_SIZE = 8;
export const DAILY_SAMPLES = 3;

interface SurfaceStore {
  version: number;
  planets: Record<string, { day: string; used: number }>;
}

export interface SampleResult {
  yield: Partial<SpaceshipResource>;
  value: number;
  remaining: number;
}

/** 0…1 richness per cell, stable for the planet. */
export const cellValue = (planetKey: string, index: number): number => {
  return (hashText(`surface|${planetKey}|${index}`) % 1000) / 1000;
};

export const surfaceGrid = (planetKey: string): number[] =>
  Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => cellValue(planetKey, index));

export class SurfaceSystem {
  static usedToday(planetKey: string): number {
    const entry = SurfaceSystem.load().planets[planetKey];
    return entry && entry.day === dayKey() ? entry.used : 0;
  }

  static remaining(planetKey: string): number {
    return Math.max(0, DAILY_SAMPLES - SurfaceSystem.usedToday(planetKey));
  }

  /** Keep the local daily counter aligned with a server-authoritative sample. */
  static applyServerSample(planetKey: string, remaining: number): void {
    const store = SurfaceSystem.load();
    store.planets[planetKey] = {
      day: dayKey(),
      used: Math.max(0, Math.min(DAILY_SAMPLES, DAILY_SAMPLES - remaining)),
    };
    SurfaceSystem.save(store);
  }

  static sample(planetKey: string, index: number): SampleResult | null {
    if (SurfaceSystem.remaining(planetKey) <= 0) return null;

    const value = cellValue(planetKey, index);
    const yield_: Partial<SpaceshipResource> = {
      antimatter: Math.round(10 + value * 60),
      deuterium: Math.round(2 + value * 6),
    };
    // Hot cells also cough up a crystal now and then.
    if (value > 0.9) yield_.exoticCrystal = 1 + Math.round((value - 0.9) * 10);

    SpaceshipResourceManager.addResources(yield_);

    const store = SurfaceSystem.load();
    const today = dayKey();
    const previous = store.planets[planetKey];
    const used = (previous && previous.day === today ? previous.used : 0) + 1;
    store.planets[planetKey] = { day: today, used };
    SurfaceSystem.save(store);

    ResourceEventManager.emit("resources_updated");
    return { yield: yield_, value, remaining: SurfaceSystem.remaining(planetKey) };
  }

  private static load(): SurfaceStore {
    try {
      const raw = getItem(SURFACE_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed.planets !== "object" || parsed.planets === null) return { version: 1, planets: {} };
      return { version: 1, planets: parsed.planets };
    } catch (error) {
      return { version: 1, planets: {} };
    }
  }

  private static save(store: SurfaceStore): void {
    setItem(SURFACE_STORAGE_KEY, JSON.stringify(store));
  }
}

export default SurfaceSystem;

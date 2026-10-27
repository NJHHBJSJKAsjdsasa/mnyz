// atlas-ui/react/static/js/Utils/IntelSystem.tsx
// Purchased intel: the client picks a nearby system deterministically and asks
// the server what is really in it. Nothing is invented client-side.

import { getItem, setItem } from "./b64.tsx";
import { hashText, makeRng, dayKey } from "./Deterministic.tsx";
import { UnifiedSpaceshipStorage } from "./UnifiedSpaceshipStorage.tsx";
import { ResourceEventManager } from "./ResourceEventManager.tsx";
import type { SpaceshipResource } from "./SpaceshipResources.tsx";

export const INTEL_STORAGE_KEY = "_atlasIntel";
export const INTEL_COST = 200;
export const INTEL_TTL_MS = 45 * 60 * 1000;

export interface IntelPlanet {
  name: string;
  planet_type: string;
  elements: string[];
  life_forms: string;
}

export interface IntelPayload {
  target: { x: number; y: number; z: number; system: number };
  galaxyName: string;
  systemName: string;
  planets: IntelPlanet[];
  at: number;
  expiresAt: number;
}

interface IntelStore {
  version: number;
  payload: IntelPayload | null;
}

const clamp = (value: number) => Math.max(0, Math.min(10000000, Math.round(value)));

export class IntelSystem {
  /** A system within roughly 1.5M units of here; stable for the day. */
  static target(coordinates: string): { x: number; y: number; z: number; system: number } {
    const [cx, cy, cz] = (coordinates || "0,0,0").split(",").map((value) => Number(value) || 0);
    const rng = makeRng(hashText(`intel|${coordinates}|${dayKey()}`));

    return {
      x: clamp(cx + rng.int(-1500000, 1500000)),
      y: clamp(cy + rng.int(-1500000, 1500000)),
      z: clamp(cz + rng.int(-1500000, 1500000)),
      system: rng.int(0, 3),
    };
  }

  static cached(): IntelPayload | null {
    const payload = IntelSystem.load().payload;
    if (!payload || payload.expiresAt <= Date.now()) return null;
    return payload;
  }

  static async buy(coordinates: string): Promise<{ ok: boolean; reason?: string; payload?: IntelPayload }> {
    const target = IntelSystem.target(coordinates);
    const url = `/api/system-intel?x=${target.x}&y=${target.y}&z=${target.z}&system=${target.system}`;

    let data: any;
    try {
      const response = await fetch(url);
      data = await response.json();
    } catch (error) {
      return { ok: false, reason: "无法连接到本地宇宙服务" };
    }

    if (!data || !data.success) return { ok: false, reason: data?.error ?? "情报获取失败" };
    if (!Array.isArray(data.planets) || data.planets.length === 0) return { ok: false, reason: "该星系没有可报告的行星" };

    const resources = UnifiedSpaceshipStorage.getResources();
    if (resources.antimatter < INTEL_COST) return { ok: false, reason: `反物质不足（需要 ${INTEL_COST}）` };
    UnifiedSpaceshipStorage.setResources({ ...resources, antimatter: resources.antimatter - INTEL_COST } as SpaceshipResource);

    const payload: IntelPayload = {
      target,
      galaxyName: data.galaxy?.name ?? "未知星系",
      systemName: data.system?.name ?? "未知系统",
      planets: data.planets,
      at: Date.now(),
      expiresAt: Date.now() + INTEL_TTL_MS,
    };

    IntelSystem.save({ version: 1, payload });
    ResourceEventManager.emit("resources_updated");
    return { ok: true, payload };
  }

  private static load(): IntelStore {
    try {
      const raw = getItem(INTEL_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || !parsed.payload) return { version: 1, payload: null };
      return { version: 1, payload: parsed.payload };
    } catch (error) {
      return { version: 1, payload: null };
    }
  }

  private static save(store: IntelStore): void {
    setItem(INTEL_STORAGE_KEY, JSON.stringify(store));
  }
}

export default IntelSystem;

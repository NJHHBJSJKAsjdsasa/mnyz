// atlas-ui/react/static/js/Utils/FabricatorSystem.tsx
// Production line: turn mid-tier stock into rare goods on a per-recipe cooldown.
// No new resource types — everything trades inside the existing twelve.

import { getItem, setItem } from "./b64.tsx";
import { ServerApi } from "./ServerApi.tsx";
import { SpaceshipResourceManager } from "./SpaceshipResources.tsx";
import { UnifiedSpaceshipStorage } from "./UnifiedSpaceshipStorage.tsx";
import { ResourceEventManager } from "./ResourceEventManager.tsx";
import type { SpaceshipResource } from "./SpaceshipResources.tsx";

export const CRAFT_STORAGE_KEY = "_atlasCraft";

export interface Recipe {
  id: string;
  name: string;
  icon: string;
  desc: string;
  cost: Partial<SpaceshipResource>;
  output: Partial<SpaceshipResource>;
  cooldownMs: number;
}

const HOUR = 60 * 60 * 1000;

export const RECIPES: Recipe[] = [
  {
    id: "alloy",
    name: "合金压铸",
    icon: "🧱",
    desc: "把常见合金压成可直接上舰的晶体。",
    cost: { quantumAlloy: 30, plasmaCell: 20 },
    output: { exoticCrystal: 6 },
    cooldownMs: 2 * HOUR,
  },
  {
    id: "etch",
    name: "神经蚀刻",
    icon: "🧠",
    desc: "蚀刻旧回路，剥出夹在里面的前文明残留。",
    cost: { neuralCircuit: 24, quantumAlloy: 12 },
    output: { ancientRelic: 2 },
    cooldownMs: 3 * HOUR,
  },
  {
    id: "compress",
    name: "尘埃压缩",
    icon: "🌫",
    desc: "把星云尘埃压成有结构的造物。",
    cost: { nebulaDust: 20, plasmaCell: 15 },
    output: { alienArtifact: 1 },
    cooldownMs: 4 * HOUR,
  },
];

interface CraftStore {
  version: number;
  last: Record<string, number>;
}

/** Cooldowns as reported by the server; the local map is only a render cache. */
let serverCooldowns: Record<string, number> = {};

const applyView = (view: any): void => {
  const next: Record<string, number> = {};
  (view?.recipes || []).forEach((item: any) => {
    const remaining = Number(item.cooldown_remaining_ms || 0);
    if (remaining > 0) next[item.code] = Date.now() + remaining;
  });
  serverCooldowns = next;
};

const hydrate = (balances: Record<string, string> | undefined): void => {
  if (!balances) return;
  const current = { ...SpaceshipResourceManager.getResources() } as unknown as Record<string, number>;
  let touched = false;
  Object.entries(balances).forEach(([code, value]) => {
    if (code in current) {
      current[code] = Math.max(0, Math.round(Number(value)));
      touched = true;
    }
  });
  if (touched) UnifiedSpaceshipStorage.setResources(current as Parameters<typeof UnifiedSpaceshipStorage.setResources>[0]);
};

const formatGain = (bag: Partial<SpaceshipResource>): string =>
  Object.entries(bag)
    .map(([key, amount]) => `${key} ${amount}`)
    .join(" · ");

export class FabricatorSystem {
  static recipes(): Recipe[] {
    return RECIPES;
  }

  /** Pull the authoritative cooldown table (server owns the clock). */
  static async sync(): Promise<void> {
    try {
      applyView(await ServerApi.request("/api/v1/craft"));
    } catch (error) {
      console.warn("[atlas] craft view failed", error);
    }
  }

  static remainingMs(recipeId: string): number {
    const recipe = RECIPES.find((item) => item.id === recipeId);
    if (!recipe) return 0;
    const fromServer = serverCooldowns[recipeId];
    if (fromServer !== undefined) return Math.max(0, fromServer - Date.now());
    const last = FabricatorSystem.load().last[recipeId] ?? 0;
    return Math.max(0, last + recipe.cooldownMs - Date.now());
  }

  static canCraft(recipeId: string): { ok: boolean; reason?: string } {
    const recipe = RECIPES.find((item) => item.id === recipeId);
    if (!recipe) return { ok: false, reason: "配方不存在" };
    if (FabricatorSystem.remainingMs(recipeId) > 0) return { ok: false, reason: "冷却中" };

    const resources = SpaceshipResourceManager.getResources();
    const affordable = Object.entries(recipe.cost).every(
      ([key, amount]) => (resources[key as keyof SpaceshipResource] ?? 0) >= (amount ?? 0),
    );
    return affordable ? { ok: true } : { ok: false, reason: "原料不足" };
  }

  /**
   * Run a recipe on the server. The local wallet is overwritten with the ledger's
   * answer, and the cooldown comes from the response — never from `Date.now()`.
   */
  static async run(recipeId: string): Promise<{ ok: boolean; message: string }> {
    const recipe = RECIPES.find((item) => item.id === recipeId);
    if (!recipe) return { ok: false, message: "配方不存在" };
    try {
      const result = await ServerApi.request(`/api/v1/craft/${encodeURIComponent(recipeId)}/run`, {
        method: "POST",
        headers: { "Idempotency-Key": globalThis.crypto?.randomUUID?.() || `${Date.now()}` },
        body: "{}",
      });
      hydrate(result?.balances);
      const remaining = Number(result?.cooldown_remaining_ms || 0);
      serverCooldowns[recipeId] = Date.now() + remaining;
      const store = FabricatorSystem.load();
      store.last[recipeId] = Date.now();
      FabricatorSystem.save(store);
      ResourceEventManager.emit("resources_updated");
      return { ok: true, message: `${recipe.name} 完成：${formatGain(recipe.output)}` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "生产失败" };
    }
  }

  private static load(): CraftStore {
    try {
      const raw = getItem(CRAFT_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed.last !== "object" || parsed.last === null) return { version: 1, last: {} };
      return { version: 1, last: parsed.last };
    } catch (error) {
      return { version: 1, last: {} };
    }
  }

  private static save(store: CraftStore): void {
    setItem(CRAFT_STORAGE_KEY, JSON.stringify(store));
  }
}

export default FabricatorSystem;

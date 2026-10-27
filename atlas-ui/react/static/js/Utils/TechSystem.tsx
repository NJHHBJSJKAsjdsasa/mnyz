// atlas-ui/react/static/js/Utils/TechSystem.tsx
// Four tech branches, four tiers each. Unlocking a node is a one-off resource
// cost and adds a small permanent multiplier; deeper tiers need the previous one.

import { getItem, setItem } from "./b64.tsx";
import { UnifiedSpaceshipStorage } from "./UnifiedSpaceshipStorage.tsx";
import { ResourceEventManager } from "./ResourceEventManager.tsx";
import type { SpaceshipResource } from "./SpaceshipResources.tsx";

export const TECH_STORAGE_KEY = "_atlasTech";

export type TechBranch = "mining" | "travel" | "survey" | "trade";

export const TECH_BRANCHES: Array<{ id: TechBranch; name: string; icon: string; effect: string }> = [
  { id: "mining", name: "采集", icon: "⛏", effect: "采集收益 +4%/级" },
  { id: "travel", name: "航行", icon: "🚀", effect: "航行燃料 -3%/级（上限 -20%）" },
  { id: "survey", name: "观测", icon: "🔭", effect: "扫描冷却 -3%/级（上限 -20%）" },
  { id: "trade", name: "贸易", icon: "💱", effect: "卖价 +3%/级" },
];

export const TECH_TIERS = 4;

export interface TechNode {
  id: string;
  branch: TechBranch;
  tier: number;
  name: string;
  cost: Partial<SpaceshipResource>;
  requires?: string;
}

const TIER_COST = (tier: number): Partial<SpaceshipResource> => {
  if (tier === 1) return { antimatter: 300 };
  if (tier === 2) return { antimatter: 800, quantumAlloy: 20 };
  if (tier === 3) return { antimatter: 2000, exoticCrystal: 10 };
  return { antimatter: 5000, ancientRelic: 2 };
};

const TIER_NAMES: Record<TechBranch, string[]> = {
  mining: ["矿脉测绘", "深层钻探", "元素分离", "重力选矿"],
  travel: ["航道校准", "惯性补偿", "曲率稳流", "折跃共振"],
  survey: ["阵列微调", "多谱合成", "噪声抑制", "深空解析"],
  trade: ["行情订阅", "议价协议", "结算网络", "信用背书"],
};

export const TECH_NODES: TechNode[] = TECH_BRANCHES.flatMap((branch) =>
  Array.from({ length: TECH_TIERS }, (_, index) => {
    const tier = index + 1;
    return {
      id: `${branch.id}-${tier}`,
      branch: branch.id,
      tier,
      name: TIER_NAMES[branch.id][index],
      cost: TIER_COST(tier),
      requires: tier > 1 ? `${branch.id}-${tier - 1}` : undefined,
    };
  }),
);

interface TechStore {
  version: number;
  unlocked: string[];
}

export class TechSystem {
  static unlocked(): string[] {
    return TechSystem.load().unlocked;
  }

  static applyServerUnlock(nodeId: string): void {
    const store = TechSystem.load();
    if (!store.unlocked.includes(nodeId)) {
      store.unlocked = [...store.unlocked, nodeId];
      TechSystem.save(store);
    }
  }

  static isUnlocked(nodeId: string): boolean {
    return TechSystem.load().unlocked.includes(nodeId);
  }

  /** How many tiers of a branch are unlocked. */
  static level(branch: TechBranch): number {
    const unlocked = TechSystem.load().unlocked;
    return TECH_NODES.filter((node) => node.branch === branch && unlocked.includes(node.id)).length;
  }

  static canUnlock(nodeId: string): { ok: boolean; reason?: string } {
    const node = TECH_NODES.find((item) => item.id === nodeId);
    if (!node) return { ok: false, reason: "节点不存在" };
    if (TechSystem.isUnlocked(nodeId)) return { ok: false, reason: "已解锁" };
    if (node.requires && !TechSystem.isUnlocked(node.requires)) return { ok: false, reason: "需要先解锁上一级" };

    const resources = UnifiedSpaceshipStorage.getResources();
    const affordable = Object.entries(node.cost).every(
      ([key, amount]) => (resources[key as keyof SpaceshipResource] ?? 0) >= (amount ?? 0),
    );
    return affordable ? { ok: true } : { ok: false, reason: "资源不足" };
  }

  static unlock(nodeId: string): boolean {
    const node = TECH_NODES.find((item) => item.id === nodeId);
    if (!node || !TechSystem.canUnlock(nodeId).ok) return false;

    const resources = UnifiedSpaceshipStorage.getResources();
    const updated = { ...resources };
    Object.entries(node.cost).forEach(([key, amount]) => {
      updated[key as keyof SpaceshipResource] = (updated[key as keyof SpaceshipResource] ?? 0) - (amount ?? 0);
    });
    UnifiedSpaceshipStorage.setResources(updated);

    const store = TechSystem.load();
    store.unlocked = [...store.unlocked, nodeId];
    TechSystem.save(store);
    ResourceEventManager.emit("resources_updated");
    return true;
  }

  /** Multiplier handed to the matching gameplay system. */
  static multiplier(branch: TechBranch): number {
    const level = TechSystem.level(branch);
    if (branch === "mining") return 1 + 0.04 * level;
    if (branch === "trade") return 1 + 0.03 * level;
    return 1 - Math.min(0.2, 0.03 * level);
  }

  private static load(): TechStore {
    try {
      const raw = getItem(TECH_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || !Array.isArray(parsed.unlocked)) return { version: 1, unlocked: [] };
      return { version: 1, unlocked: parsed.unlocked.filter((id: string) => typeof id === "string") };
    } catch (error) {
      return { version: 1, unlocked: [] };
    }
  }

  private static save(store: TechStore): void {
    setItem(TECH_STORAGE_KEY, JSON.stringify(store));
  }
}

export default TechSystem;

// atlas-ui/react/static/js/Utils/ContractSystem.tsx
// Daily expedition contracts: three bounties per day. Basic bounties are always
// available; specialist bounties only enter the pool when the matching ship
// module is installed, so refits unlock new work.

import { SeededRandom } from "./SeededRandom.tsx";
import { getItem, setItem } from "./b64.tsx";
import { SpaceshipResource, SpaceshipResourceManager } from "./SpaceshipResources.tsx";
import { SHIP_MODULES, ShipModuleSystem } from "./ShipModules.tsx";
import { Residents } from "./Residents.tsx";
import { dayKey } from "./Deterministic.tsx";

export const CONTRACT_STORAGE_KEY = "_atlasContracts";
export const CONTRACTS_PER_DAY = 3;
export const MAX_ACTIVE_CONTRACTS = 2;
export const CONTRACT_TTL_MS = 12 * 60 * 60 * 1000;
/** Global payout trim, keeps contract income around 40-45% of the daily mix. */
const CONTRACT_REWARD_SCALE = 0.8;

export type ContractMetric = "scans" | "trades" | "collections" | "relicScans" | "kills";

export interface ContractRequirement {
  moduleId: string;
  level: number;
}

export interface Contract {
  id: string;
  title: string;
  description: string;
  metric: ContractMetric;
  target: number;
  progress: number;
  reward: Partial<SpaceshipResource>;
  voucherReward?: number;
  requires?: ContractRequirement;
  /** "x,y,z" of the galaxy the work must be done in; undefined means anywhere. */
  targetGalaxy?: string;
  /** Distance from the core in coordinate units; drives the reward multiplier. */
  targetDistance?: number;
  rewardMultiplier?: number;
  accepted: boolean;
  claimed: boolean;
  acceptedAt?: number;
  expiresAt?: number;
  /** Set when a resident captain took the bounty first; such cards cannot be accepted. */
  takenBy?: string;
}

interface ContractStore {
  version: number;
  date: string;
  contracts: Contract[];
}

interface ContractTemplate {
  key: string;
  title: string;
  description: string;
  metric: ContractMetric;
  requires?: ContractRequirement;
  build: (rng: SeededRandom, today: string) => Contract;
}

const reward = (reward_: Partial<SpaceshipResource>, vouchers: number) => ({ reward: reward_, voucherReward: vouchers });

export const CONTRACT_TEMPLATES: ContractTemplate[] = [
  {
    key: "scan",
    title: "深空测绘",
    description: "完成轨道扫描，为星图补充地表数据。",
    metric: "scans",
    build: (rng, today) => ({
      id: `scan_${today}`,
      title: "深空测绘",
      description: "完成轨道扫描，为星图补充地表数据。",
      metric: "scans",
      target: rng.randint(3, 6),
      progress: 0,
      ...reward({ exoticCrystal: rng.randint(8, 18), nebulaDust: rng.randint(3, 8) }, 1),
      accepted: false,
      claimed: false,
    }),
  },
  {
    key: "trade",
    title: "易货跑单",
    description: "在本地市场完成买卖，维持殖民地补给线。",
    metric: "trades",
    build: (rng, today) => ({
      id: `trade_${today}`,
      title: "易货跑单",
      description: "在本地市场完成买卖，维持殖民地补给线。",
      metric: "trades",
      target: rng.randint(4, 8),
      progress: 0,
      ...reward({ plasmaCell: rng.randint(10, 22), quantumAlloy: rng.randint(6, 14) }, 1),
      accepted: false,
      claimed: false,
    }),
  },
  {
    key: "mine",
    title: "地表采样",
    description: "在任意行星完成地表采集，回收样本。",
    metric: "collections",
    build: (rng, today) => ({
      id: `mine_${today}`,
      title: "地表采样",
      description: "在任意行星完成地表采集，回收样本。",
      metric: "collections",
      target: rng.randint(2, 4),
      progress: 0,
      ...reward({ ancientRelic: rng.randint(1, 2), exoticCrystal: rng.randint(6, 12) }, 2),
      accepted: false,
      claimed: false,
    }),
  },
  {
    key: "clear",
    title: "清剿航道",
    description: "在遭遇战中击毁敌对舰船，恢复航道安全。",
    metric: "kills",
    build: (rng, today) => ({
      id: `clear_${today}`,
      title: "清剿航道",
      description: "在遭遇战中击毁敌对舰船，恢复航道安全。",
      metric: "kills",
      target: rng.randint(2, 4),
      progress: 0,
      ...reward({ plasmaCell: rng.randint(18, 30), neuralCircuit: rng.randint(10, 18) }, 1),
      accepted: false,
      claimed: false,
    }),
  },
  {
    key: "survey",
    title: "深空巡检",
    description: "长程扫描多个世界，建立连续观测链。",
    metric: "scans",
    requires: { moduleId: "scanArray", level: 2 },
    build: (rng, today) => ({
      id: `survey_${today}`,
      title: "深空巡检",
      description: "长程扫描多个世界，建立连续观测链。",
      metric: "scans",
      target: rng.randint(6, 10),
      progress: 0,
      ...reward({ nebulaDust: rng.randint(12, 26), exoticCrystal: rng.randint(10, 20) }, 2),
      accepted: false,
      claimed: false,
    }),
  },
  {
    key: "haul",
    title: "满载采样",
    description: "借助跃迁线圈连续采集，把货舱塞满。",
    metric: "collections",
    requires: { moduleId: "warpCoil", level: 1 },
    build: (rng, today) => ({
      id: `haul_${today}`,
      title: "满载采样",
      description: "借助跃迁线圈连续采集，把货舱塞满。",
      metric: "collections",
      target: rng.randint(4, 6),
      progress: 0,
      ...reward({ quantumAlloy: rng.randint(14, 28), exoticCrystal: rng.randint(8, 16) }, 1),
      accepted: false,
      claimed: false,
    }),
  },
  {
    key: "arbitrage",
    title: "精准套利",
    description: "利用货舱折扣压低成本，跑完一轮套利航次。",
    metric: "trades",
    requires: { moduleId: "cargoBay", level: 1 },
    build: (rng, today) => ({
      id: `arbitrage_${today}`,
      title: "精准套利",
      description: "利用货舱折扣压低成本，跑完一轮套利航次。",
      metric: "trades",
      target: rng.randint(6, 10),
      progress: 0,
      ...reward({ plasmaCell: rng.randint(18, 34), neuralCircuit: rng.randint(8, 16) }, 1),
      accepted: false,
      claimed: false,
    }),
  },
  {
    key: "relic",
    title: "遗迹测绘",
    description: "用遗物解析器定位并记录非自然构造。",
    metric: "relicScans",
    requires: { moduleId: "archivist", level: 1 },
    build: (rng, today) => ({
      id: `relic_${today}`,
      title: "遗迹测绘",
      description: "用遗物解析器定位并记录非自然构造。",
      metric: "relicScans",
      target: rng.randint(1, 2),
      progress: 0,
      ...reward({ alienArtifact: rng.randint(1, 2), dimensionalShard: 1 }, 3),
      accepted: false,
      claimed: false,
    }),
  },
];

export class ContractSystem {
  static getContracts(): Contract[] {
    const store = ContractSystem.load();
    if (store.date === ContractSystem.today() && store.contracts.length === CONTRACTS_PER_DAY) {
      return store.contracts;
    }
    return ContractSystem.regenerate();
  }

  static hasModule(requirement?: ContractRequirement): boolean {
    if (!requirement) return true;
    return ShipModuleSystem.level(requirement.moduleId) >= requirement.level;
  }

  static moduleName(moduleId: string): string {
    return SHIP_MODULES.find((module) => module.id === moduleId)?.name ?? moduleId;
  }

  static isExpired(contract: Contract): boolean {
    return !contract.claimed && !!contract.expiresAt && Date.now() > contract.expiresAt;
  }

  static remainingMs(contract: Contract): number | null {
    if (!contract.expiresAt || contract.claimed) return null;
    return Math.max(0, contract.expiresAt - Date.now());
  }

  static activeCount(): number {
    return ContractSystem.getContracts().filter(
      (contract) => contract.accepted && !contract.claimed && !ContractSystem.isExpired(contract)
    ).length;
  }

  static canAccept(id: string): { ok: boolean; reason?: string } {
    const contract = ContractSystem.getContracts().find((item) => item.id === id);
    if (!contract) return { ok: false, reason: "合同不存在" };
    if (contract.takenBy) return { ok: false, reason: `已被 ${contract.takenBy} 接取` };
    if (contract.accepted) {
      return { ok: false, reason: ContractSystem.isExpired(contract) ? "已作废" : "已接取" };
    }
    if (ContractSystem.activeCount() >= MAX_ACTIVE_CONTRACTS) {
      return { ok: false, reason: `同时只能进行 ${MAX_ACTIVE_CONTRACTS} 份` };
    }
    return { ok: true };
  }

  static accept(id: string): boolean {
    if (!ContractSystem.canAccept(id).ok) return false;

    const contracts = ContractSystem.getContracts();
    const contract = contracts.find((item) => item.id === id);
    if (!contract) return false;

    contract.accepted = true;
    // Re-accepting after a pause keeps the original deadline, so dropping a
    // contract is not a way to reset the clock.
    if (!contract.expiresAt) {
      contract.acceptedAt = Date.now();
      contract.expiresAt = Date.now() + CONTRACT_TTL_MS;
    }
    ContractSystem.save({ version: 1, date: ContractSystem.today(), contracts });
    return true;
  }

  /** Drop an accepted contract; progress and deadline are kept. */
  static abandon(id: string): boolean {
    const contracts = ContractSystem.getContracts();
    const contract = contracts.find((item) => item.id === id);
    if (!contract || !contract.accepted || contract.claimed) return false;

    contract.accepted = false;
    ContractSystem.save({ version: 1, date: ContractSystem.today(), contracts });
    return true;
  }

  static matchesLocation(contract: Contract, coordinates?: string): boolean {
    if (!contract.targetGalaxy) return true;
    return contract.targetGalaxy === coordinates;
  }

  static increment(metric: ContractMetric, amount = 1, coordinates?: string): void {
    const contracts = ContractSystem.getContracts();
    let changed = false;

    contracts.forEach((contract) => {
      if (!contract.accepted || contract.claimed || contract.metric !== metric) return;
      if (ContractSystem.isExpired(contract)) return;
      if (!ContractSystem.matchesLocation(contract, coordinates)) return;
      const next = Math.min(contract.target, contract.progress + amount);
      if (next !== contract.progress) {
        contract.progress = next;
        changed = true;
      }
    });

    if (changed) ContractSystem.save({ version: 1, date: ContractSystem.today(), contracts });
  }

  /** Fuel needed to reach the destination; efficiency is applied on spend. */
  static travelCost(contract: Contract): { antimatter: number; element115: number; deuterium: number } {
    if (!contract.targetDistance) return { antimatter: 0, element115: 0, deuterium: 0 };

    // Single source of truth: the same function the manual navigator charges with.
    return SpaceshipResourceManager.calculateJumpCost(contract.targetDistance);
  }

  /** Payout including the bonus from modules related to the contract metric. */
  static previewReward(contract: Contract): { reward: Partial<SpaceshipResource>; bonus: number } {
    const bonus = ShipModuleSystem.contractBonus(contract.metric);
    return { reward: ContractSystem.scaleReward(contract.reward, bonus), bonus };
  }

  static claim(id: string): { reward: Partial<SpaceshipResource>; vouchers: number; bonus: number } | null {
    const contracts = ContractSystem.getContracts();
    const contract = contracts.find((item) => item.id === id);
    if (!contract || contract.claimed || contract.progress < contract.target) return null;
    if (ContractSystem.isExpired(contract)) return null;

    const payout = ContractSystem.previewReward(contract);
    contract.claimed = true;
    ContractSystem.save({ version: 1, date: ContractSystem.today(), contracts });
    return { reward: payout.reward, vouchers: contract.voucherReward ?? 0, bonus: payout.bonus };
  }

  /** Number of specialist bounties per day grows with the installed module count. */
  static specialistSlots(): number {
    const unlocked = SHIP_MODULES.filter((module) => ShipModuleSystem.level(module.id) > 0).length;
    if (unlocked === 0) return 0;
    return unlocked <= 2 ? 1 : 2;
  }

  private static regenerate(): Contract[] {
    const today = ContractSystem.today();
    const rng = new SeededRandom(ContractSystem.hashText(`contracts|${today}`));

    const available = CONTRACT_TEMPLATES.filter((template) => ContractSystem.hasModule(template.requires));
    const basics = available.filter((template) => !template.requires);
    const specialists = available.filter((template) => template.requires);

    const chosen: ContractTemplate[] = [];
    const wanted = Math.min(ContractSystem.specialistSlots(), specialists.length);

    chosen.push(...ContractSystem.pick(specialists, wanted, rng));
    chosen.push(...ContractSystem.pick(basics, CONTRACTS_PER_DAY - chosen.length, rng));

    const contracts = chosen.slice(0, CONTRACTS_PER_DAY).map((template) => {
      const contract = { ...template.build(rng, today), requires: template.requires };

      // Specialist work happens at a fixed destination; the further it sits from
      // the core, the higher the payout.
      if (template.requires) {
        const destination = ContractSystem.rollDestination(rng);
        const multiplier = Math.round((1 + destination.distance / 4000000) * 100) / 100;

        contract.targetGalaxy = `${destination.x},${destination.y},${destination.z}`;
        contract.targetDistance = destination.distance;
        contract.rewardMultiplier = multiplier;
        // Distance scales the payout, but the baseline is trimmed so contracts do
        // not dwarf mining and surveying in the income mix.
        contract.reward = ContractSystem.scaleReward(contract.reward, multiplier * CONTRACT_REWARD_SCALE);
        contract.voucherReward = Math.max(1, Math.round((contract.voucherReward ?? 1) * Math.sqrt(multiplier)));
      }
      return contract;
    });

    // One bounty per day may be claimed by a resident first. Capped at a single
    // card so a bad roll never leaves the player with an empty board.
    const marked = ContractSystem.markTaken(contracts, today);
    ContractSystem.save({ version: 1, date: today, contracts: marked });
    return marked;
  }

  private static markTaken(contracts: Contract[], today: string): Contract[] {
    if (ContractSystem.hashText(`taken|${today}`) % 100 >= 25) return contracts;

    const index = ContractSystem.hashText(`taken-index|${today}`) % contracts.length;
    const roster = Residents.roster(Residents.universeSeed());
    const captain = roster[ContractSystem.hashText(`taken-by|${today}`) % roster.length];

    return contracts.map((contract, position) => (position === index ? { ...contract, takenBy: captain.callsign } : contract));
  }

  /** Random point around the core (5M, 5M, 5M); the quoted distance is measured
   * from the clamped coordinates so it always matches what the player travels. */
  private static rollDestination(rng: SeededRandom): { x: number; y: number; z: number; distance: number } {
    const radius = rng.randint(600000, 7800000);
    const theta = rng.random() * Math.PI * 2;
    const phi = Math.acos(rng.random() * 2 - 1);
    const clamp = (value: number) => Math.min(10000000, Math.max(0, Math.round(value)));

    const x = clamp(5000000 + radius * Math.sin(phi) * Math.cos(theta));
    const y = clamp(5000000 + radius * Math.sin(phi) * Math.sin(theta));
    const z = clamp(5000000 + radius * Math.cos(phi));

    const distance = Math.round(Math.sqrt((x - 5000000) ** 2 + (y - 5000000) ** 2 + (z - 5000000) ** 2));
    return { x, y, z, distance };
  }

  private static scaleReward(reward: Partial<SpaceshipResource>, multiplier: number): Partial<SpaceshipResource> {
    const scaled: Partial<SpaceshipResource> = {};
    Object.entries(reward).forEach(([key, amount]) => {
      scaled[key as keyof SpaceshipResource] = Math.max(1, Math.round((amount ?? 0) * multiplier));
    });
    return scaled;
  }

  private static pick<T>(list: T[], count: number, rng: SeededRandom): T[] {
    const pool = [...list];
    const picked: T[] = [];

    while (picked.length < count && pool.length > 0) {
      const index = rng.randint(0, pool.length - 1);
      picked.push(pool.splice(index, 1)[0]);
    }
    return picked;
  }

  /** Local calendar day, so contracts roll at local midnight instead of 08:00 CST. */
  static today(): string {
    return dayKey();
  }

  private static hashText(text: string): number {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash) % 2147483647;
  }

  private static save(store: ContractStore): void {
    setItem(CONTRACT_STORAGE_KEY, JSON.stringify(store));
  }

  private static load(): ContractStore {
    try {
      const raw = getItem(CONTRACT_STORAGE_KEY);
      if (!raw) return { version: 1, date: "", contracts: [] };
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.contracts)) {
        return { version: 1, date: "", contracts: [] };
      }
      return { version: 1, date: parsed.date ?? "", contracts: parsed.contracts };
    } catch (error) {
      return { version: 1, date: "", contracts: [] };
    }
  }
}

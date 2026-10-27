// atlas-ui/react/static/js/Utils/ShipModules.tsx
// Ship refits. Levels are effectively endless: every level costs exponentially
// more while its benefit approaches an asymptote, so the curve never "finishes"
// but also never runs away numerically.

import { SpaceshipResourceManager, SpaceshipResource } from "./SpaceshipResources.tsx";
import { UnifiedSpaceshipStorage } from "./UnifiedSpaceshipStorage.tsx";
import { ResourceEventManager } from "./ResourceEventManager.tsx";
import { RefitVoucherSystem } from "./RefitVoucher.tsx";
import { StationSystem } from "./StationSystem.tsx";
import { HullSystem } from "./HullSystem.tsx";
import { TechSystem } from "./TechSystem.tsx";

export const BASE_SCAN_COOLDOWN_MS = 8 * 60 * 1000;
export const BASE_SCAN_COST = 6;
export const VOUCHER_DISCOUNT = 0.5;
export const MAX_MODULE_LEVEL = 999;
/** Overclock: after Lv10 a module can be pushed a few times for a flat effect bonus. */
export const OVERCLOCK_MIN_LEVEL = 10;
export const MAX_OVERCLOCK = 3;
export const OVERCLOCK_STEP = 0.05;
/** Keep float maths finite; the exponential curve would overflow past level ~118. */
const COST_CEILING = 1e15;

/** Cost of the level-th refit step, before the global scale is applied. */
const costCurve = (base: number, level: number) =>
  Math.min(COST_CEILING, Math.max(1, Math.round(base * Math.pow(1.35, level - 1))));
/** Effect grows with sqrt(level): always improving, never exploding. */
const sqrtCurve = (perLevel: number, level: number, cap?: number) => {
  const value = Math.round(perLevel * Math.sqrt(level));
  return cap === undefined ? value : Math.min(cap, value);
};

export interface ModuleDef {
  id: string;
  name: string;
  icon: string;
  effect: (level: number) => string;
  cost: (level: number) => Partial<SpaceshipResource>;
}

export interface InstallCheck {
  ok: boolean;
  reason?: string;
  level: number;
}

export const SHIP_MODULES: ModuleDef[] = [
  {
    id: "scanArray",
    name: "深空扫描阵列",
    icon: "📡",
    effect: (level) => `扫描冷却 -${sqrtCurve(9, level, 90)}%，氘耗 -${Math.min(4, level)}`,
    cost: (level) => ({
      quantumAlloy: costCurve(10, level),
      neuralCircuit: costCurve(3, level),
      ...(level >= 4 ? { exoticCrystal: costCurve(2, level) } : {}),
      ...(level >= 8 ? { ancientRelic: Math.round(level / 4) } : {}),
    }),
  },
  {
    id: "cargoBay",
    name: "模块化货舱",
    icon: "📦",
    effect: (level) => `贸易买入价 -${sqrtCurve(5, level, 60)}%`,
    cost: (level) => ({
      plasmaCell: costCurve(8, level),
      quantumAlloy: costCurve(5, level),
      ...(level >= 5 ? { alienArtifact: Math.round(level / 5) } : {}),
    }),
  },
  {
    id: "warpCoil",
    name: "跃迁线圈",
    icon: "🌀",
    effect: (level) => `地表采集收益 +${sqrtCurve(8, level)}%`,
    cost: (level) => ({
      plasmaCell: costCurve(10, level),
      neuralCircuit: costCurve(5, level),
      ...(level >= 4 ? { nebulaDust: costCurve(2, level) } : {}),
    }),
  },
  {
    id: "archivist",
    name: "遗物解析器",
    icon: "🗃️",
    effect: (level) => `扫描产出 +${Math.floor(level / 2)} 个单位`,
    cost: (level) => ({
      neuralCircuit: costCurve(8, level),
      quantumAlloy: costCurve(6, level),
      ...(level >= 4 ? { exoticCrystal: costCurve(2, level) } : {}),
    }),
  },
  {
    id: "weaponArray",
    name: "武器阵列",
    icon: "🔫",
    effect: (level) => `火力 ${6 + level * 4}`,
    cost: (level) => ({
      quantumAlloy: costCurve(14, level),
      neuralCircuit: costCurve(6, level),
      ...(level >= 5 ? { plasmaCell: costCurve(4, level) } : {}),
    }),
  },
  {
    id: "shieldMatrix",
    name: "护盾矩阵",
    icon: "🛡",
    effect: (level) => `护盾 ${4 + level * 3}`,
    cost: (level) => ({
      plasmaCell: costCurve(12, level),
      exoticCrystal: costCurve(3, level),
      ...(level >= 4 ? { nebulaDust: costCurve(2, level) } : {}),
    }),
  },
];

/** Modules that make the matching contract type pay better. */
const CONTRACT_MODULES: Record<string, string[]> = {
  scans: ["scanArray", "archivist"],
  relicScans: ["archivist"],
  trades: ["cargoBay"],
  collections: ["warpCoil"],
};

/** Global cost multiplier on top of the exponential curve. */
const REFIT_COST_SCALE = 3.5;

export class ShipModuleSystem {
  static level(moduleId: string): number {
    const installed = UnifiedSpaceshipStorage.getShipModules();
    return installed.find((module) => module.id === moduleId)?.level ?? 0;
  }

  static nextCost(moduleId: string, useVoucher = false): Partial<SpaceshipResource> | null {
    const def = SHIP_MODULES.find((module) => module.id === moduleId);
    if (!def) return null;

    const target = ShipModuleSystem.level(moduleId) + 1;
    const base: Partial<SpaceshipResource> = {};
    Object.entries(def.cost(target)).forEach(([key, amount]) => {
      base[key as keyof SpaceshipResource] = Math.max(1, Math.round((amount ?? 0) * REFIT_COST_SCALE));
    });

    if (!useVoucher) return base;

    const discounted: Partial<SpaceshipResource> = {};
    Object.entries(base).forEach(([key, amount]) => {
      discounted[key as keyof SpaceshipResource] = Math.max(1, Math.ceil((amount ?? 0) * VOUCHER_DISCOUNT));
    });
    return discounted;
  }

  static canAfford(cost: Partial<SpaceshipResource> | null): boolean {
    if (!cost) return false;
    const resources = SpaceshipResourceManager.getResources();
    return Object.entries(cost).every(([key, amount]) => (resources[key as keyof SpaceshipResource] ?? 0) >= (amount ?? 0));
  }

  static canInstall(moduleId: string, useVoucher = false): InstallCheck {
    const level = ShipModuleSystem.level(moduleId);

    if (level >= MAX_MODULE_LEVEL) return { ok: false, reason: `已达 Lv ${MAX_MODULE_LEVEL} 上限`, level };
    if (useVoucher && RefitVoucherSystem.count() < 1) return { ok: false, reason: "没有改装券", level };
    if (!ShipModuleSystem.canAfford(ShipModuleSystem.nextCost(moduleId, useVoucher))) {
      return { ok: false, reason: "资源不足", level };
    }
    return { ok: true, level };
  }

  static install(moduleId: string, useVoucher = false): boolean {
    if (!ShipModuleSystem.canInstall(moduleId, useVoucher).ok) return false;

    const cost = ShipModuleSystem.nextCost(moduleId, useVoucher);
    if (!ShipModuleSystem.spend(cost)) return false;

    if (useVoucher) RefitVoucherSystem.consume();

    const installed = UnifiedSpaceshipStorage.getShipModules();
    const existing = installed.find((module) => module.id === moduleId);
    if (existing) {
      existing.level += 1;
    } else {
      installed.push({ id: moduleId, level: 1 });
    }
    UnifiedSpaceshipStorage.setShipModules(installed);

    ResourceEventManager.emit("resources_updated");
    return true;
  }

  /** Apply a server-authoritative refit level into the local cache. */
  static applyServerRefit(moduleId: string, level: number): void {
    const installed = UnifiedSpaceshipStorage.getShipModules();
    const existing = installed.find((module) => module.id === moduleId);
    if (existing) {
      existing.level = Math.max(1, Math.min(MAX_MODULE_LEVEL, Math.round(level)));
    } else {
      installed.push({ id: moduleId, level: Math.max(1, Math.min(MAX_MODULE_LEVEL, Math.round(level))) });
    }
    UnifiedSpaceshipStorage.setShipModules(installed);
  }

  /** Apply a server-authoritative overclock charge into the local cache. */
  static applyServerOverclock(moduleId: string, overclock: number): void {
    const installed = UnifiedSpaceshipStorage.getShipModules();
    const existing = installed.find((module) => module.id === moduleId);
    if (existing) {
      existing.oc = Math.max(0, Math.min(MAX_OVERCLOCK, Math.round(overclock)));
      UnifiedSpaceshipStorage.setShipModules(installed);
    }
  }

  static overclock(moduleId: string): number {
    return UnifiedSpaceshipStorage.getShipModules().find((module) => module.id === moduleId)?.oc ?? 0;
  }

  /** Overclock cost scales with the next refit step: ×2, ×4, ×8. */
  static overclockCost(moduleId: string): Partial<SpaceshipResource> | null {
    const base = ShipModuleSystem.nextCost(moduleId);
    if (!base) return null;

    const scale = Math.pow(2, ShipModuleSystem.overclock(moduleId) + 1);
    const cost: Partial<SpaceshipResource> = {};
    Object.entries(base).forEach(([key, amount]) => {
      cost[key as keyof SpaceshipResource] = Math.round((amount ?? 0) * scale);
    });
    return cost;
  }

  static canOverclock(moduleId: string): { ok: boolean; reason?: string; charges: number } {
    const charges = ShipModuleSystem.overclock(moduleId);
    const level = ShipModuleSystem.level(moduleId);

    if (level < OVERCLOCK_MIN_LEVEL) return { ok: false, reason: `需 Lv ${OVERCLOCK_MIN_LEVEL}`, charges };
    if (charges >= MAX_OVERCLOCK) return { ok: false, reason: `已超频 ${MAX_OVERCLOCK} 次`, charges };
    if (!ShipModuleSystem.canAfford(ShipModuleSystem.overclockCost(moduleId))) return { ok: false, reason: "资源不足", charges };
    return { ok: true, charges };
  }

  static applyOverclock(moduleId: string): boolean {
    if (!ShipModuleSystem.canOverclock(moduleId).ok) return false;
    if (!ShipModuleSystem.spend(ShipModuleSystem.overclockCost(moduleId))) return false;

    const installed = UnifiedSpaceshipStorage.getShipModules();
    const existing = installed.find((module) => module.id === moduleId);
    if (!existing) return false;

    existing.oc = (existing.oc ?? 0) + 1;
    UnifiedSpaceshipStorage.setShipModules(installed);
    ResourceEventManager.emit("resources_updated");
    return true;
  }

  static scanCooldownMs(): number {
    const reduction = Math.min(90, sqrtCurve(9, ShipModuleSystem.level("scanArray")) * ShipModuleSystem.overclockFactor("scanArray")) / 100;
    return Math.round(BASE_SCAN_COOLDOWN_MS * (1 - reduction) * StationSystem.scanCooldownMultiplier() * TechSystem.multiplier("survey"));
  }

  static scanCost(): number {
    return Math.max(2, BASE_SCAN_COST - Math.min(4, ShipModuleSystem.level("scanArray")));
  }

  static tradeBuyMultiplier(): number {
    const reduction = Math.min(60, sqrtCurve(5, ShipModuleSystem.level("cargoBay")) * ShipModuleSystem.overclockFactor("cargoBay"));
    return 1 - reduction / 100;
  }

  static miningMultiplier(): number {
    const coils = 1 + (sqrtCurve(8, ShipModuleSystem.level("warpCoil")) * ShipModuleSystem.overclockFactor("warpCoil")) / 100;
    // A battered hull degrades gathering too; see HullSystem.factor().
    return coils * HullSystem.factor();
  }

  /** Combat firepower derived from the weapon array level. */
  static firepower(): number {
    return Math.round((6 + ShipModuleSystem.level("weaponArray") * 4) * ShipModuleSystem.overclockFactor("weaponArray"));
  }

  /** Combat shield derived from the shield matrix level. */
  static shieldStrength(): number {
    return Math.round((4 + ShipModuleSystem.level("shieldMatrix") * 3) * ShipModuleSystem.overclockFactor("shieldMatrix"));
  }

  static surveySalvage(): number {
    return Math.floor((ShipModuleSystem.level("archivist") / 2) * ShipModuleSystem.overclockFactor("archivist"));
  }

  /** Contract payout bonus: +2% per related module level, capped at +100%. */
  static contractBonus(metric: string): number {
    const modules = CONTRACT_MODULES[metric] ?? [];
    const levels = modules.reduce((sum, moduleId) => sum + ShipModuleSystem.level(moduleId) * ShipModuleSystem.overclockFactor(moduleId), 0);
    return 1 + Math.min(1.0, 0.02 * levels);
  }

  /** +5% of the module's own effect per overclock charge. */
  static overclockFactor(moduleId: string): number {
    return 1 + OVERCLOCK_STEP * ShipModuleSystem.overclock(moduleId);
  }

  /** Deduct a cost, returning false when the balance cannot cover it. */
  private static spend(cost: Partial<SpaceshipResource> | null): boolean {
    if (!cost) return false;
    if (!ShipModuleSystem.canAfford(cost)) return false;

    const resources = SpaceshipResourceManager.getResources();
    const updated = { ...resources };
    Object.entries(cost).forEach(([key, amount]) => {
      updated[key as keyof SpaceshipResource] = (updated[key as keyof SpaceshipResource] ?? 0) - (amount ?? 0);
    });
    UnifiedSpaceshipStorage.setResources(updated);
    return true;
  }
}

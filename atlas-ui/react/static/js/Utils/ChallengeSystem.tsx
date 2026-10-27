// atlas-ui/react/static/js/Utils/ChallengeSystem.tsx
// Asynchronous "PvP" without a server: your fleet is encoded into a string,
// anyone can paste it and fight that exact configuration as an NPC.

import { ShipModuleSystem } from "./ShipModules.tsx";
import { HullSystem } from "./HullSystem.tsx";
import { UnifiedSpaceshipStorage } from "./UnifiedSpaceshipStorage.tsx";

export const CHALLENGE_PREFIX = "ATL1-";
const MODULE_ORDER = ["weaponArray", "shieldMatrix", "warpCoil", "scanArray", "cargoBay", "archivist"];

export interface ChallengeSnapshot {
  name: string;
  level: number;
  hull: number;
  weaponLevel: number;
  shieldLevel: number;
}

interface ChallengePayload {
  v: number;
  n: string;
  l: number;
  h: number;
  m: number[];
  c: number;
}

const checksum = (payload: Omit<ChallengePayload, "c">): number => {
  const moduleSum = payload.m.reduce((sum, value, index) => sum + value * (index + 7), 0);
  return (moduleSum + payload.l * 3 + payload.h) % 100000;
};

export class ChallengeSystem {
  static encode(name = "本舰"): string {
    const modules = MODULE_ORDER.map((id) => ShipModuleSystem.level(id));
    const payload: Omit<ChallengePayload, "c"> = {
      v: 1,
      n: name.slice(0, 12),
      l: UnifiedSpaceshipStorage.getUpgrade().level,
      h: HullSystem.value(),
      m: modules,
    };

    const full: ChallengePayload = { ...payload, c: checksum(payload) };
    return CHALLENGE_PREFIX + btoa(encodeURIComponent(JSON.stringify(full)));
  }

  static decode(code: string): ChallengeSnapshot | null {
    const trimmed = (code ?? "").trim();
    if (!trimmed.startsWith(CHALLENGE_PREFIX)) return null;

    try {
      const payload: ChallengePayload = JSON.parse(decodeURIComponent(atob(trimmed.slice(CHALLENGE_PREFIX.length))));
      if (!payload || payload.v !== 1 || !Array.isArray(payload.m) || payload.m.length !== MODULE_ORDER.length) return null;
      if (checksum({ v: 1, n: payload.n, l: payload.l, h: payload.h, m: payload.m }) !== payload.c) return null;

      return {
        name: `${payload.n || "同行者"} Lv${Math.max(1, Math.round(payload.l))}`,
        level: Math.max(1, Math.min(999, Math.round(payload.l))),
        hull: Math.max(1, Math.min(100, Math.round(payload.h))),
        weaponLevel: Math.max(0, Math.min(999, Math.round(payload.m[0]))),
        shieldLevel: Math.max(0, Math.min(999, Math.round(payload.m[1]))),
      };
    } catch (error) {
      return null;
    }
  }
}

export default ChallengeSystem;

// atlas-ui/react/static/js/Utils/FactionSystem.tsx
// Every sector belongs to a faction. Fighting in raider space makes that sector
// more dangerous; helping patrols buys you better prices there.

import { getItem, setItem } from "./b64.tsx";
import { hashText } from "./Deterministic.tsx";
import { sectorOf } from "./SectorMath.tsx";

export const FACTION_STORAGE_KEY = "_atlasFactions";
export const FACTIONS = ["掠夺者", "巡逻队", "无主"] as const;
const MAX_REP = 10;

export type Faction = (typeof FACTIONS)[number];

interface FactionStore {
  version: number;
  rep: Record<string, number>;
}

export class FactionSystem {
  /** Replace the local cache with server-authoritative sector reputation. */
  static applyServerRep(rep: Record<string, number>): void {
    FactionSystem.save({ version: 1, rep: { ...rep } });
  }

  static factionOf(coordinates: string): Faction {
    const sector = sectorOf(coordinates);
    return FACTIONS[hashText(`faction|${sector.key}`) % FACTIONS.length];
  }

  static rep(coordinates: string): number {
    return FactionSystem.load().rep[sectorOf(coordinates).key] ?? 0;
  }

  /** Killing a raider pleases patrols and angers raiders; empty space ignores it. */
  static recordKill(coordinates: string): { faction: Faction; rep: number } {
    const faction = FactionSystem.factionOf(coordinates);
    const key = sectorOf(coordinates).key;
    const store = FactionSystem.load();

    const delta = faction === "掠夺者" ? -1 : faction === "巡逻队" ? 1 : 0;
    const next = Math.max(-MAX_REP, Math.min(MAX_REP, (store.rep[key] ?? 0) + delta));
    store.rep[key] = next;
    FactionSystem.save(store);

    return { faction, rep: next };
  }

  /** Extra encounter chance in hostile raider sectors (0 … +10%). */
  static encounterBonus(coordinates: string): number {
    if (FactionSystem.factionOf(coordinates) !== "掠夺者") return 0;
    const rep = FactionSystem.rep(coordinates);
    return rep >= 0 ? 0 : Math.min(0.1, -rep * 0.02);
  }

  /** Price multiplier inside patrol space you have helped (1.0 … 0.9). */
  static tradeMultiplier(coordinates: string): number {
    if (FactionSystem.factionOf(coordinates) !== "巡逻队") return 1;
    const rep = FactionSystem.rep(coordinates);
    return rep <= 0 ? 1 : 1 - Math.min(0.1, rep * 0.02);
  }

  private static load(): FactionStore {
    try {
      const raw = getItem(FACTION_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed.rep !== "object" || parsed.rep === null) return { version: 1, rep: {} };
      return { version: 1, rep: parsed.rep };
    } catch (error) {
      return { version: 1, rep: {} };
    }
  }

  private static save(store: FactionStore): void {
    setItem(FACTION_STORAGE_KEY, JSON.stringify(store));
  }
}

export default FactionSystem;

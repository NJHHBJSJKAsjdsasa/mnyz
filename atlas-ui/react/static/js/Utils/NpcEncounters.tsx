// atlas-ui/react/static/js/Utils/NpcEncounters.tsx
// Occasional face-to-face meetings with a resident captain. The offer is rolled
// deterministically per planet per day; favor only makes the next deal cheaper.

import { getItem, setItem } from "./b64.tsx";
import { hashText, makeRng, dayKey } from "./Deterministic.tsx";
import { Residents, Resident } from "./Residents.tsx";
import { SpaceshipResourceManager, SpaceshipResource } from "./SpaceshipResources.tsx";
import { UnifiedSpaceshipStorage } from "./UnifiedSpaceshipStorage.tsx";
import { ResourceEventManager } from "./ResourceEventManager.tsx";

export const NPC_STORAGE_KEY = "_atlasNPC";
const ENCOUNTER_RATE = 5;
const MAX_FAVOR = 10;

/** Amount ranges keep rare goods rare: a relic never arrives by the fistful. */
const GIVE_TABLE: Array<{ key: keyof SpaceshipResource; min: number; max: number }> = [
  { key: "exoticCrystal", min: 3, max: 8 },
  { key: "nebulaDust", min: 2, max: 5 },
  { key: "ancientRelic", min: 1, max: 2 },
  { key: "alienArtifact", min: 1, max: 2 },
];

const WANT_TABLE: Array<{ key: keyof SpaceshipResource; min: number; max: number }> = [
  { key: "quantumAlloy", min: 16, max: 36 },
  { key: "plasmaCell", min: 14, max: 32 },
  { key: "neuralCircuit", min: 12, max: 28 },
  { key: "deuterium", min: 24, max: 60 },
];

export interface NpcOffer {
  resident: Resident;
  favor: number;
  give: Partial<SpaceshipResource>;
  want: Partial<SpaceshipResource>;
  ratio: number;
}

interface NpcRecord {
  favor: number;
  trades: number;
  lastMet: number;
}

interface NpcStore {
  version: number;
  residents: Record<string, NpcRecord>;
  declined: Record<string, string>;
}

export interface EncounterOptions {
  planetKey: string;
  universeSeed: string;
  residentId?: string;
}

const emptyStore = (): NpcStore => ({ version: 1, residents: {}, declined: {} });

export class NpcEncounters {
  /** One offer per planet per day; declining hides it until tomorrow. */
  static encounter(options: EncounterOptions): NpcOffer | null {
    const today = dayKey();
    const store = NpcEncounters.load();
    if (store.declined[options.planetKey] === today) return null;

    const seed = hashText(`npc|${options.universeSeed}|${today}|${options.planetKey}`);
    if (seed % 100 >= ENCOUNTER_RATE) return null;

    const rng = makeRng(seed);
    const roster = Residents.roster(options.universeSeed);
    const resident = roster.find((item) => item.id === options.residentId) ?? roster[rng.int(0, roster.length - 1)];
    const favor = store.residents[resident.id]?.favor ?? 0;
    const ratio = Math.max(0.3, 0.7 - favor * 0.02);

    const give = rng.pick(GIVE_TABLE);
    const want = rng.pick(WANT_TABLE);

    return {
      resident,
      favor,
      give: { [give.key]: rng.int(give.min, give.max) },
      want: { [want.key]: Math.max(1, Math.round(rng.int(want.min, want.max) * ratio)) },
      ratio,
    };
  }

  static accept(offer: NpcOffer, planetKey: string): { ok: boolean; reason?: string } {
    const resources = SpaceshipResourceManager.getResources();
    const affordable = Object.entries(offer.want).every(
      ([key, amount]) => (resources[key as keyof SpaceshipResource] ?? 0) >= (amount ?? 0),
    );
    if (!affordable) return { ok: false, reason: "资源不足" };

    const updated = { ...resources };
    Object.entries(offer.want).forEach(([key, amount]) => {
      updated[key as keyof SpaceshipResource] = (updated[key as keyof SpaceshipResource] ?? 0) - (amount ?? 0);
    });
    UnifiedSpaceshipStorage.setResources(updated);
    SpaceshipResourceManager.addResources(offer.give);

    NpcEncounters.recordDeal(offer.resident.id);
    ResourceEventManager.emit("resources_updated");
    return { ok: true };
  }

  static decline(planetKey: string): void {
    const store = NpcEncounters.load();
    const today = dayKey();
    const declined: Record<string, string> = { [planetKey]: today };

    Object.entries(store.declined).forEach(([key, value]) => {
      if (value === today) declined[key] = value;
    });

    store.declined = declined;
    NpcEncounters.save(store);
  }

  /** All favors in one read, for roster-style rendering. */
  static favorMap(): Record<string, number> {
    const store = NpcEncounters.load();
    const map: Record<string, number> = {};
    Object.entries(store.residents).forEach(([id, record]) => {
      map[id] = record.favor;
    });
    return map;
  }

  static favor(residentId: string): number {
    return NpcEncounters.load().residents[residentId]?.favor ?? 0;
  }

  static trades(residentId: string): number {
    return NpcEncounters.load().residents[residentId]?.trades ?? 0;
  }

  private static recordDeal(residentId: string): void {
    const store = NpcEncounters.load();
    const previous = store.residents[residentId] ?? { favor: 0, trades: 0, lastMet: 0 };

    store.residents[residentId] = {
      favor: Math.min(MAX_FAVOR, previous.favor + 1),
      trades: previous.trades + 1,
      lastMet: Date.now(),
    };
    NpcEncounters.save(store);
  }

  private static load(): NpcStore {
    try {
      const raw = getItem(NPC_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== "object") return emptyStore();
      return {
        version: 1,
        residents: parsed.residents ?? {},
        declined: parsed.declined ?? {},
      };
    } catch (error) {
      return emptyStore();
    }
  }

  private static save(store: NpcStore): void {
    setItem(NPC_STORAGE_KEY, JSON.stringify(store));
  }
}

export default NpcEncounters;

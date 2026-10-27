// atlas-ui/react/static/js/Utils/CodexSystem.tsx
// Discovery codex: every planet type / element / life form the player has met.
// Entries are appended the first time a planet is opened; rewards are granted once.

import { getItem, setItem } from "./b64.tsx";
import { ELEMENT_SYMBOLS } from "./ElementSymbols.tsx";
import { SpaceshipResourceManager, SpaceshipResource } from "./SpaceshipResources.tsx";
import { ResourceEventManager } from "./ResourceEventManager.tsx";

export const CODEX_STORAGE_KEY = "_atlasCodex";

/** Planet types the universe generator can produce ("None" is not a real type). */
export const CODEX_PLANET_TYPES = [
  "Gas Giant",
  "Frozen Gas Giant",
  "Rocky",
  "Icy",
  "Anomaly",
  "Oceanic",
  "Desert",
  "Lava",
  "Arid",
  "Swamp",
  "Tundra",
  "Forest",
  "Savannah",
  "Cave",
  "Crystalline",
  "Metallic",
  "Toxic",
  "Radioactive",
  "Magma",
  "Molten Core",
  "Carbon",
  "Diamond",
  "Super Earth",
  "Sub Earth",
  "Nebulous",
  "Aquifer",
  "Exotic",
];

export const CODEX_LIFE_FORMS = [
  "Intelligent Life",
  "Animal Life",
  "Vegetation",
  "Bacteria",
  "Vegetable Animals",
  "Silicon-Based Life",
  "Non-Physical Entity",
  "Conscious Gas",
  "Robotic Entities",
  "Have I just found God?",
];

export const CODEX_ELEMENTS = Object.keys(ELEMENT_SYMBOLS);

export type CodexSection = "planets" | "elements" | "lifeForms";

export const CODEX_SECTIONS: Array<{ id: CodexSection; title: string; icon: string }> = [
  { id: "planets", title: "行星图鉴", icon: "🪐" },
  { id: "elements", title: "元素图鉴", icon: "⚛" },
  { id: "lifeForms", title: "生命形式", icon: "🧬" },
];

const SECTION_TOTALS: Record<CodexSection, number> = {
  planets: CODEX_PLANET_TYPES.length,
  elements: CODEX_ELEMENTS.length,
  lifeForms: CODEX_LIFE_FORMS.length,
};

const SECTION_REWARDS: Record<CodexSection, Partial<SpaceshipResource>> = {
  planets: { antimatter: 4000, exoticCrystal: 25, alienArtifact: 2 },
  elements: { antimatter: 8000, quantumAlloy: 60, ancientRelic: 5 },
  lifeForms: { antimatter: 3000, blackHoleFragment: 2, dimensionalShard: 1 },
};

export interface CodexStore {
  version: number;
  planets: string[];
  elements: string[];
  lifeForms: string[];
  claimed: CodexSection[];
}

export interface CodexProgress {
  found: number;
  total: number;
  percent: number;
  complete: boolean;
}

export interface CodexRecordInput {
  planetType?: string;
  elements?: string[];
  lifeForms?: string;
}

const emptyStore = (): CodexStore => ({ version: 1, planets: [], elements: [], lifeForms: [], claimed: [] });

const unique = (values: string[]): string[] => Array.from(new Set(values.filter(Boolean)));

export class CodexSystem {
  /** Store any newly seen entry; returns sections that just completed. */
  static record(input: CodexRecordInput): CodexSection[] {
    const store = CodexSystem.load();
    const sections: CodexSection[] = ["planets", "elements", "lifeForms"];
    const before = sections.map((section) => CodexSystem.countOf(store, section));
    const lifeForms = input.lifeForms && input.lifeForms !== "None" ? [input.lifeForms] : [];

    store.planets = unique([...store.planets, input.planetType ?? ""]);
    store.elements = unique([...store.elements, ...(input.elements ?? [])]);
    store.lifeForms = unique([...store.lifeForms, ...lifeForms]);

    const completed = sections.filter((section, index) => {
      const after = CodexSystem.countOf(store, section);
      return before[index] < SECTION_TOTALS[section] && after >= SECTION_TOTALS[section];
    });

    const grew = sections.some((section, index) => CodexSystem.countOf(store, section) > before[index]);
    if (grew) CodexSystem.save(store);
    completed.forEach((section) => CodexSystem.grant(section));
    return completed;
  }

  static progress(section: CodexSection): CodexProgress {
    const found = CodexSystem.countOf(CodexSystem.load(), section);
    const total = SECTION_TOTALS[section];
    return { found, total, percent: Math.round((found / total) * 100), complete: found >= total };
  }

  static found(section: CodexSection): string[] {
    return CodexSystem.load()[section];
  }

  static all(): CodexStore {
    return CodexSystem.load();
  }

  static reward(section: CodexSection): Partial<SpaceshipResource> {
    return SECTION_REWARDS[section];
  }

  static claimed(section: CodexSection): boolean {
    return CodexSystem.load().claimed.includes(section);
  }

  static catalog(section: CodexSection): string[] {
    if (section === "planets") return CODEX_PLANET_TYPES;
    if (section === "elements") return CODEX_ELEMENTS;
    return CODEX_LIFE_FORMS;
  }

  private static countOf(store: CodexStore, section: CodexSection): number {
    const list = store[section];
    const catalog = CodexSystem.catalog(section);
    return list.filter((entry) => catalog.includes(entry)).length;
  }

  private static grant(section: CodexSection): void {
    const store = CodexSystem.load();
    if (store.claimed.includes(section)) return;

    SpaceshipResourceManager.addResources(SECTION_REWARDS[section]);
    store.claimed = [...store.claimed, section];
    CodexSystem.save(store);
    ResourceEventManager.emit("codex_completed", { section });
  }

  private static load(): CodexStore {
    try {
      const raw = getItem(CODEX_STORAGE_KEY);
      if (!raw) return emptyStore();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return emptyStore();
      return {
        version: 1,
        planets: unique(Array.isArray(parsed.planets) ? parsed.planets : []),
        elements: unique(Array.isArray(parsed.elements) ? parsed.elements : []),
        lifeForms: unique(Array.isArray(parsed.lifeForms) ? parsed.lifeForms : []),
        claimed: Array.isArray(parsed.claimed) ? parsed.claimed : [],
      };
    } catch (error) {
      return emptyStore();
    }
  }

  private static save(store: CodexStore): void {
    setItem(CODEX_STORAGE_KEY, JSON.stringify(store));
  }
}

export default CodexSystem;

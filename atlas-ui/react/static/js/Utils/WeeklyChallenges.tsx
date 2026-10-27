// atlas-ui/react/static/js/Utils/WeeklyChallenges.tsx
// One weekly goal set, read straight from systems that already exist
// (archive stats, refit levels, codex). Nothing new is written per action.

import { getItem, setItem } from "./b64.tsx";
import { DailyChallengesManager } from "./DailyChallenges.tsx";
import { CodexSystem } from "./CodexSystem.tsx";
import { UnifiedSpaceshipStorage } from "./UnifiedSpaceshipStorage.tsx";
import { SpaceshipResourceManager, SpaceshipResource } from "./SpaceshipResources.tsx";
import { ResourceEventManager } from "./ResourceEventManager.tsx";

export const WEEKLY_STORAGE_KEY = "_atlasWeekly";

export type WeeklyMetric = "planets" | "modules" | "codex";

export interface WeeklyTask {
  id: WeeklyMetric;
  title: string;
  current: number;
  target: number;
  done: boolean;
}

interface WeeklyStore {
  version: number;
  weekKey: string;
  claimed: boolean;
}

export interface WeeklySnapshot {
  weekKey: string;
  tasks: WeeklyTask[];
  allDone: boolean;
  claimed: boolean;
  daysLeft: number;
  reward: Partial<SpaceshipResource>;
}

const WEEKLY_REWARD: Partial<SpaceshipResource> = {
  exoticCrystal: 40,
  nebulaDust: 30,
  ancientRelic: 3,
  dimensionalShard: 1,
};

const TASK_META: Array<{ id: WeeklyMetric; title: string; base: number; step: number }> = [
  { id: "planets", title: "探索行星（累计）", base: 30, step: 8 },
  { id: "modules", title: "改装总等级（累计）", base: 15, step: 5 },
  { id: "codex", title: "图鉴条目（累计）", base: 10, step: 4 },
];

const weekKeyOf = (date: Date = new Date()): string => {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
};

const progressOf = (metric: WeeklyMetric): number => {
  try {
    if (metric === "planets") return DailyChallengesManager.getExplorationStats().planets;
    if (metric === "modules") return UnifiedSpaceshipStorage.getShipModules().reduce((sum, module) => sum + (module.level ?? 0), 0);
    return (
      CodexSystem.progress("planets").found + CodexSystem.progress("elements").found + CodexSystem.progress("lifeForms").found
    );
  } catch (error) {
    return 0;
  }
};

export class WeeklyChallenges {
  static snapshot(): WeeklySnapshot {
    const weekKey = weekKeyOf();
    const store = WeeklyChallenges.load(weekKey);
    const weeksPlayed = Math.max(1, Math.ceil(DailyChallengesManager.getDayInfo().dayNumber / 7));

    const tasks = TASK_META.map((meta) => {
      const current = progressOf(meta.id);
      const target = meta.base + meta.step * (weeksPlayed - 1);
      return { id: meta.id, title: meta.title, current, target, done: current >= target };
    });

    const today = new Date().getDay();
    return {
      weekKey,
      tasks,
      allDone: tasks.every((task) => task.done),
      claimed: store.claimed,
      daysLeft: (7 - today) % 7,
      reward: WEEKLY_REWARD,
    };
  }

  /** Grants the weekly reward once all goals are met. */
  static claim(): boolean {
    const snapshot = WeeklyChallenges.snapshot();
    if (snapshot.claimed || !snapshot.allDone) return false;

    SpaceshipResourceManager.addResources(WEEKLY_REWARD);
    WeeklyChallenges.save({ version: 1, weekKey: snapshot.weekKey, claimed: true });
    ResourceEventManager.emit("resources_updated");
    return true;
  }

  private static load(weekKey: string): WeeklyStore {
    try {
      const raw = getItem(WEEKLY_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || parsed.weekKey !== weekKey) return { version: 1, weekKey, claimed: false };
      return { version: 1, weekKey, claimed: Boolean(parsed.claimed) };
    } catch (error) {
      return { version: 1, weekKey, claimed: false };
    }
  }

  private static save(store: WeeklyStore): void {
    setItem(WEEKLY_STORAGE_KEY, JSON.stringify(store));
  }
}

export default WeeklyChallenges;

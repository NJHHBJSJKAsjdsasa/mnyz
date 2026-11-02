// atlas-ui/react/static/js/Utils/DailyChallenges.tsx
//
// Exploration milestones (T-62). This used to derive galaxies/systems/planets by
// walking every `_atlasArchive*` blob in localStorage and counting bits — slow on a
// long-lived profile, impossible to verify, and a second "today's progress" counter
// living beside `/tasks`.
//
// The server is the source now (`GET /progress/exploration`): it counts distinct
// planets / systems / sectors from `planet_visits` and scales the targets by account
// age. This module is a *render cache* plus the same public surface the panels
// already call, so nothing else had to change.
//
// Division of labour, stated once so it stops drifting:
//   milestones (here)  cumulative, never reset, pay nothing
//   daily tasks        `/tasks` — resets on the server clock, pays rewards

import { ServerApi } from "./ServerApi.tsx";

export interface DailyChallenge {
  type: "galaxies" | "systems" | "planets";
  current: number;
  target: number;
  dayNumber: number;
  completed: boolean;
}

export interface DailyChallenges {
  date: string;
  dayNumber: number;
  challenges: DailyChallenge[];
  lastReset: number;
  totalCompletedDays: number;
  dayCompleted?: boolean;
}

const EMPTY_COUNTS = { galaxies: 0, systems: 0, planets: 0 };

let cache: {
  dayNumber: number;
  counts: { galaxies: number; systems: number; planets: number };
  challenges: DailyChallenge[];
  dayCompleted: boolean;
} | null = null;

const localDay = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

export class DailyChallengesManager {
  /** Pull the milestone scoreboard. Cheap, idempotent, safe to call on mount. */
  static async sync(): Promise<void> {
    try {
      const data = await ServerApi.request("/api/v1/progress/exploration");
      const dayNumber = Number(data?.day_number || 1);
      const counts = { ...EMPTY_COUNTS };
      const challenges: DailyChallenge[] = (data?.challenges || []).map((item: any) => {
        const type = String(item.type) as DailyChallenge["type"];
        if (type in counts) counts[type] = Number(item.current || 0);
        return {
          type,
          current: Number(item.current || 0),
          target: Number(item.target || 0),
          dayNumber,
          completed: Boolean(item.completed),
        };
      });
      cache = { dayNumber, counts, challenges, dayCompleted: Boolean(data?.day_completed) };
    } catch (error) {
      console.warn("[atlas] milestones unavailable", error);
    }
  }

  static getTodaysChallenges(): DailyChallenges {
    const dayNumber = cache?.dayNumber ?? 1;
    return {
      date: localDay(),
      dayNumber,
      challenges: cache?.challenges ?? [],
      lastReset: Date.now(),
      totalCompletedDays: 0,
      dayCompleted: cache?.dayCompleted ?? false,
    };
  }

  /**
   * Kept for the call sites that used to advance the counters here (storage
   * writes, panel mounts). Progress is server-derived now, so this is a read:
   * the next `sync()` is what actually refreshes it.
   */
  static updateProgress(): DailyChallenges {
    return DailyChallengesManager.getTodaysChallenges();
  }

  /** Totals for the residents leaderboard; no archive scanning since T-62. */
  static getExplorationStats(): { galaxies: number; systems: number; planets: number } {
    return { ...(cache?.counts ?? EMPTY_COUNTS) };
  }

  static getCompletedDaysCount(): number {
    // Not tracked server-side: streaks were a client invention with no reward.
    return 0;
  }

  static getCompletionStatus(): { completed: number; total: number; allCompleted: boolean } {
    const challenges = cache?.challenges ?? [];
    const completed = challenges.filter((item) => item.completed).length;
    return { completed, total: challenges.length, allCompleted: challenges.length > 0 && completed === challenges.length };
  }

  static getDayInfo(): { dayNumber: number; multiplier: number } {
    const dayNumber = cache?.dayNumber ?? 1;
    const baseMultiplier = Math.pow(1.1, dayNumber - 1);
    return { dayNumber, multiplier: Math.round(baseMultiplier * 100) / 100 };
  }
}

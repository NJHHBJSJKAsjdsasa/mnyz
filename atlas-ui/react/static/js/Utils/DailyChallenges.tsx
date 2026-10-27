// atlas-ui/react/static/js/Utils/DailyChallenges.tsx

import React from "react";
import { getItem, setItem } from "./b64.tsx";
import { dayKey } from "./Deterministic.tsx";
import * as pako from "pako";

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

export class DailyChallengesManager {
  private static readonly STORAGE_KEY = "_atlasDailyChallenges";
  private static readonly BASE_GOALS = {
    galaxies: 1,
    systems: 3,
    planets: 10,
  };

  public static getTodaysChallenges(): DailyChallenges {
    // Local day: daily goals reset at local midnight, not 08:00 for UTC+8 players.
    const today = dayKey();
    const stored = this.getStoredChallenges();

    if (!stored || stored.date !== today) {
      return this.createNewDayChallenges(today, stored);
    }

    return stored;
  }

  private static getStoredChallenges(): DailyChallenges | null {
    try {
      const data = getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error("Error reading daily challenges:", error);
      return null;
    }
  }

  private static createNewDayChallenges(today: string, previous: DailyChallenges | null): DailyChallenges {
    const dayNumber = previous ? previous.dayNumber + 1 : 1;
    const dailyMultiplier = Math.pow(1.1, dayNumber - 1);
    const stats = this.getCurrentStats();

    const challenges: DailyChallenge[] = [
      {
        type: "galaxies",
        current: stats.galaxies,
        target: Math.ceil(dayNumber * this.BASE_GOALS.galaxies * dailyMultiplier),
        dayNumber,
        completed: false,
      },
      {
        type: "systems",
        current: stats.systems,
        target: Math.ceil(dayNumber * this.BASE_GOALS.systems * dailyMultiplier),
        dayNumber,
        completed: false,
      },
      {
        type: "planets",
        current: stats.planets,
        target: Math.ceil(dayNumber * this.BASE_GOALS.planets * dailyMultiplier),
        dayNumber,
        completed: false,
      },
    ];

    const previousCompletedCount = (previous?.totalCompletedDays || 0) + (previous?.dayCompleted ? 1 : 0);

    const newChallenges: DailyChallenges = {
      date: today,
      dayNumber,
      challenges,
      lastReset: Date.now(),
      totalCompletedDays: previousCompletedCount,
      dayCompleted: false,
    };

    this.saveChallenges(newChallenges);

    return newChallenges;
  }

  private static getCurrentStats(): { galaxies: number; systems: number; planets: number } {
    try {
      let totalSystems = 0;
      let totalPlanets = 0;
      const allGalaxiesSet = new Set<string>();

      const decodeArchiveData = (encodedValue: string): string | null => {
        try {
          if (encodedValue.startsWith("c:") || encodedValue.startsWith("u:")) {
            const base64ToUint8Array = (base64: string): Uint8Array => {
              const binary = atob(base64);
              const len = binary.length;
              const uint8Array = new Uint8Array(len);
              for (let i = 0; i < len; i++) {
                uint8Array[i] = binary.charCodeAt(i);
              }
              return uint8Array;
            };

            let uint8Array: Uint8Array;
            if (encodedValue.startsWith("c:")) {
              const compressed = base64ToUint8Array(encodedValue.slice(2));
              uint8Array = pako.ungzip(compressed);
            } else {
              uint8Array = base64ToUint8Array(encodedValue.slice(2));
            }
            return new TextDecoder().decode(uint8Array);
          }
          return encodedValue;
        } catch (err) {
          console.error("Error decoding archive:", err);
          return null;
        }
      };

      const processArchive = (archiveData: string | null) => {
        if (!archiveData) return;

        try {
          const data = JSON.parse(archiveData);

          Object.entries(data.g || {}).forEach(([galaxyHash, galaxy]: [string, any]) => {
            allGalaxiesSet.add(galaxyHash);
            totalSystems += Object.keys(galaxy).length;
            Object.values(galaxy).forEach((planetBitmap: any) => {
              if (typeof planetBitmap === "string") {
                totalPlanets += (planetBitmap.match(/1/g) || []).length;
              }
            });
          });

          Object.keys(data.gv || {}).forEach((galaxyHash) => {
            allGalaxiesSet.add(galaxyHash);
          });
        } catch (err) {
          console.error("Error parsing archive data:", err);
        }
      };

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          try {
            const decodedKey = decodeURIComponent(atob(key));
            const isArchiveKey = decodedKey === "__atlasArchive" || decodedKey === "_atlasArchive" || decodedKey.startsWith("__atlasArchive_") || decodedKey.startsWith("_atlasArchive_");

            if (isArchiveKey) {
              const rawValue = localStorage.getItem(key);
              if (rawValue) {
                const decodedValue = decodeArchiveData(rawValue);
                if (decodedValue) {
                  processArchive(decodedValue);
                }
              }
            }
          } catch {
            continue;
          }
        }
      }

      return {
        galaxies: allGalaxiesSet.size,
        systems: totalSystems,
        planets: totalPlanets,
      };
    } catch (error) {
      console.error("Error getting current stats:", error);
      return { galaxies: 0, systems: 0, planets: 0 };
    }
  }

  public static updateProgress(): DailyChallenges {
    const challenges = this.getTodaysChallenges();
    const currentStats = this.getCurrentStats();

    challenges.challenges.forEach((challenge) => {
      const newCurrent = currentStats[challenge.type];
      challenge.current = newCurrent;
      challenge.completed = newCurrent >= challenge.target;
    });

    const isNowAllCompleted = challenges.challenges.every((c) => c.completed);

    if (isNowAllCompleted && !challenges.dayCompleted) {
      challenges.dayCompleted = true;
    }

    this.saveChallenges(challenges);
    return challenges;
  }

  /** Public read of the archive-derived totals (used by the residents leaderboard). */
  public static getExplorationStats(): { galaxies: number; systems: number; planets: number } {
    return this.getCurrentStats();
  }

  public static getCompletedDaysCount(): number {
    try {
      const challenges = this.getTodaysChallenges();
      return challenges.totalCompletedDays || 0;
    } catch (error) {
      console.error("Error getting completed days count:", error);
      return 0;
    }
  }

  private static saveChallenges(challenges: DailyChallenges): void {
    try {
      setItem(this.STORAGE_KEY, JSON.stringify(challenges));
    } catch (error) {
      console.error("Error saving daily challenges:", error);
    }
  }

  public static getCompletionStatus(): { completed: number; total: number; allCompleted: boolean } {
    const challenges = this.getTodaysChallenges();
    const completed = challenges.challenges.filter((c) => c.completed).length;
    const total = challenges.challenges.length;

    return {
      completed,
      total,
      allCompleted: completed === total,
    };
  }

  public static getDayInfo(): { dayNumber: number; multiplier: number } {
    const challenges = this.getTodaysChallenges();
    const baseMultiplier = Math.pow(1.1, challenges.dayNumber - 1);
    return {
      dayNumber: challenges.dayNumber,
      multiplier: Math.round(baseMultiplier * 100) / 100,
    };
  }
}

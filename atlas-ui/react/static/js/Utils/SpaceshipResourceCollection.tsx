// atlas-ui/react/static/js/Utils/SpaceshipResourceCollection.tsx

import React from "react";
import { createRoot } from "react-dom/client";
import { calculatePlanetResources } from "./ElementResourceValues.tsx";
import { UnifiedSpaceshipStorage } from "./UnifiedSpaceshipStorage.tsx";
import { SpaceshipResourceManager } from "./SpaceshipResources.tsx";
import { ResourceReward } from "./SpaceshipTypes.tsx";
import { TaskSystem } from "./TaskSystem.tsx";
import { PlanetScanSystem } from "./PlanetScanSystem.tsx";
import { ShipModuleSystem } from "./ShipModules.tsx";
import { ContractSystem } from "./ContractSystem.tsx";
import { SectorSystem } from "./SectorSystem.tsx";
import { CosmicEvents } from "./CosmicEvents.tsx";
import { Rival } from "./Rival.tsx";
import { TechSystem } from "./TechSystem.tsx";
import { AllySystem } from "./AllySystem.tsx";
import AntimatterIcon from "../Icons/AntimatterIcon.tsx";
import DeuteriumIcon from "../Icons/DeuteriumIcon.tsx";
import Element115Icon from "../Icons/Element115Icon.tsx";

export interface PlanetData {
  elements?: string[];
  planet_type?: string;
}

export interface BonusInfo {
  streakBonus: boolean;
  discoveryBonus: number;
  shipMultiplier?: number;
}

const COOLDOWN_HOURS = 1;

export class SpaceshipResourceCollectionManager {
  static generateLocationId(type: "galaxy" | "system" | "planet", coordinates: string, index?: number, planetName?: string): string {
    switch (type) {
      case "galaxy":
        return `galaxy_${coordinates}`;
      case "system":
        return `system_${coordinates}_${index}`;
      case "planet":
        return `planet_${coordinates}_${index}_${planetName?.toLowerCase()}`;
      default:
        return `unknown_${coordinates}`;
    }
  }

  static canCollectFromLocation(locationId: string): boolean {
    return UnifiedSpaceshipStorage.canCollectFromLocation(locationId);
  }

  static getTimeUntilNextCollection(locationId: string): number {
    return UnifiedSpaceshipStorage.getTimeUntilNextCollection(locationId);
  }

  static calculateReward(type: "galaxy" | "system" | "planet", coordinates: string, collectionCount: number = 0, planetData?: PlanetData, includeMultiplier: boolean = false): ResourceReward {
    if (type === "planet" && planetData?.elements && planetData.elements.length > 0) {
      const baseResources = calculatePlanetResources(planetData.elements);
      const diminishingFactor = collectionCount > 3 ? Math.max(0.4, 1 - (collectionCount - 3) * 0.15) : 1;
      const randomFactor = 0.9 + Math.random() * 0.2;
      const finalAntimatter = Math.floor(baseResources.antimatter * diminishingFactor * randomFactor);
      const finalElement115 = Math.floor(baseResources.element115 * diminishingFactor * randomFactor);
      const finalDeuterium = Math.floor(baseResources.deuterium * diminishingFactor * randomFactor);
      let planetReward = {
        antimatter: baseResources.antimatter > 0 && finalAntimatter === 0 ? baseResources.antimatter : finalAntimatter,
        element115: baseResources.element115 > 0 && finalElement115 === 0 ? baseResources.element115 : finalElement115,
        deuterium: baseResources.deuterium > 0 && finalDeuterium === 0 ? baseResources.deuterium : finalDeuterium,
      };
      if (includeMultiplier) {
        const upgrade = UnifiedSpaceshipStorage.getUpgrade();
        const shipMultiplier = upgrade.multiplier;

        planetReward = {
          antimatter: Math.floor(planetReward.antimatter * shipMultiplier),
          element115: Math.floor(planetReward.element115 * shipMultiplier),
          deuterium: Math.floor(planetReward.deuterium * shipMultiplier),
        };
      }

      return planetReward;
    }
    const baseRewards = {
      galaxy: { antimatter: 80, element115: 60, deuterium: 50 },
      system: { antimatter: 50, element115: 60, deuterium: 50 },
      planet: { antimatter: 18, element115: 22, deuterium: 27 },
    };

    const base = baseRewards[type];
    let variationFactor = 1;
    if (type === "planet" && !planetData?.elements && coordinates) {
      const coordHash = this.hashCoordinates(coordinates);
      variationFactor = 0.5 + coordHash * 1.5;
    }
    const diminishingFactor = collectionCount > 3 ? Math.max(0.4, 1 - (collectionCount - 3) * 0.15) : 1;
    const randomFactor = 0.9 + Math.random() * 0.2;

    let finalReward = {
      antimatter: Math.floor(base.antimatter * variationFactor * diminishingFactor * randomFactor),
      element115: Math.floor(base.element115 * variationFactor * diminishingFactor * randomFactor),
      deuterium: Math.floor(base.deuterium * variationFactor * diminishingFactor * randomFactor),
    };
    if (includeMultiplier) {
      const upgrade = UnifiedSpaceshipStorage.getUpgrade();
      const shipMultiplier = upgrade.multiplier;

      finalReward = {
        antimatter: Math.floor(finalReward.antimatter * shipMultiplier),
        element115: Math.floor(finalReward.element115 * shipMultiplier),
        deuterium: Math.floor(finalReward.deuterium * shipMultiplier),
      };
    }

    return finalReward;
  }

  private static hashCoordinates(coordinates: string): number {
    if (!coordinates || typeof coordinates !== "string") {
      return Math.random();
    }

    let hash = 0;
    for (let i = 0; i < coordinates.length; i++) {
      const char = coordinates.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash) / 2147483647;
  }

  private static getDiscoveryBonus(dailyCollections: number): number {
    if (dailyCollections <= 3) {
      return 5.0;
    } else if (dailyCollections <= 5) {
      return 3.0;
    } else if (dailyCollections <= 7) {
      return 2.0;
    } else if (dailyCollections <= 10) {
      return 1.5;
    }
    return 1.0;
  }

  static collectResources(locationId: string, type: "galaxy" | "system" | "planet", coordinates: string, planetData?: PlanetData): ResourceReward | null {
    if (!this.canCollectFromLocation(locationId)) {
      return null;
    }

    const collectionCount = UnifiedSpaceshipStorage.getCollectionCount(locationId);
    const isFirstTime = collectionCount === 0;
    let reward = this.calculateReward(type, coordinates, collectionCount, planetData);
    const upgrade = UnifiedSpaceshipStorage.getUpgrade();
    const shipMultiplier = upgrade.multiplier;
    UnifiedSpaceshipStorage.markLocationCollected(locationId);
    const streakInfo = UnifiedSpaceshipStorage.getCollectionStreakInfo();
    let finalMultiplier = streakInfo.streakMultiplier;
    const discoveryBonus = this.getDiscoveryBonus(streakInfo.dailyCollections);
    finalMultiplier *= discoveryBonus;
    finalMultiplier *= shipMultiplier;
    finalMultiplier *= ShipModuleSystem.miningMultiplier();
    finalMultiplier *= SectorSystem.multiplierFor(coordinates);
    finalMultiplier *= CosmicEvents.multiplier("mining", coordinates);
    finalMultiplier *= TechSystem.multiplier("mining");
    finalMultiplier *= AllySystem.bonus();
    // A rival captain staking the same planet takes a cut.
    if (type === "planet") finalMultiplier *= Rival.multiplier(locationId);

    if (finalMultiplier > 1.0) {
      reward = {
        antimatter: Math.floor(reward.antimatter * finalMultiplier),
        element115: Math.floor(reward.element115 * finalMultiplier),
        deuterium: Math.floor(reward.deuterium * finalMultiplier),
      };
    }

    // Survey bonus: an enriched stratum boosts exactly one collection.
    const surveyBonus = type === "planet" ? PlanetScanSystem.pendingBonus(locationId) : 1;
    if (surveyBonus > 1) {
      reward = {
        antimatter: Math.floor(reward.antimatter * surveyBonus),
        element115: Math.floor(reward.element115 * surveyBonus),
        deuterium: Math.floor(reward.deuterium * surveyBonus),
      };
      PlanetScanSystem.consumeBonus(locationId);
    }

    // Must go through the manager: it fills every resource key, while a bare
    // three-key reward would write NaN into the rare-resource slots.
    SpaceshipResourceManager.addResources(reward);

    // 更新任务进度
    if (type === "planet") {
      TaskSystem.incrementProgress("planetsDiscovered", 1);
      TaskSystem.incrementProgress("antimatterCollected", reward.antimatter);
      ContractSystem.increment("collections", 1, coordinates);
    } else if (type === "galaxy") {
      TaskSystem.incrementProgress("galaxiesVisited", 1);
    }

    return reward;
  }

  static getLocationCollection(locationId: string): { totalCollections: number } | null {
    const count = UnifiedSpaceshipStorage.getCollectionCount(locationId);
    return count > 0 ? { totalCollections: count } : null;
  }

  static showCollectionSuccess(reward: ResourceReward, locationType: string, bonusInfo?: BonusInfo, isFirstTime?: boolean): void {
    const toast = document.createElement("div");
    toast.className = "fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-gradient-to-r from-green-900/90 to-blue-900/90 text-white px-4 py-3 rounded-lg shadow-lg border border-green-500/50 w-[90vw] max-w-lg";
    toast.className += " animate-slideInDown";

    const typeEmojis = {
      galaxy: "🌌",
      system: "⭐",
      planet: "🪐",
    };

    const emoji = typeEmojis[locationType as keyof typeof typeEmojis] || "📦";
    const container = document.createElement("div");
    container.className = "flex items-center space-x-3";

    const emojiSpan = document.createElement("span");
    emojiSpan.className = "text-2xl";
    emojiSpan.textContent = emoji;

    const contentDiv = document.createElement("div");

    const titleDiv = document.createElement("div");
    titleDiv.className = "text-sm font-bold text-green-300";
    if (isFirstTime) {
      titleDiv.textContent = "🎉 首次采矿 - 奖励已应用！";
    } else {
      titleDiv.textContent = "资源已收集！";
    }

    const resourceDiv = document.createElement("div");
    resourceDiv.className = "text-xs text-green-200 mt-1 flex gap-3";

    const amSpan = document.createElement("span");
    amSpan.className = "text-purple-300 flex items-center gap-1";
    const amRoot = createRoot(amSpan);
    amRoot.render(
      <>
        <AntimatterIcon size={12} color="currentColor" />+{reward.antimatter} AM
      </>
    );

    const e115Span = document.createElement("span");
    e115Span.className = "text-cyan-300 flex items-center gap-1";
    const e115Root = createRoot(e115Span);
    e115Root.render(
      <>
        <Element115Icon size={12} color="currentColor" />+{reward.element115} E115
      </>
    );

    const deuteriumSpan = document.createElement("span");
    deuteriumSpan.className = "text-orange-300 flex items-center gap-1";
    const deuteriumRoot = createRoot(deuteriumSpan);
    deuteriumRoot.render(
      <>
        <DeuteriumIcon size={12} color="currentColor" />+{reward.deuterium} D
      </>
    );

    resourceDiv.appendChild(amSpan);
    resourceDiv.appendChild(e115Span);
    resourceDiv.appendChild(deuteriumSpan);

    contentDiv.appendChild(titleDiv);
    contentDiv.appendChild(resourceDiv);

    if (bonusInfo?.discoveryBonus > 1.0) {
      const discoveryBonusDiv = document.createElement("div");
      discoveryBonusDiv.className = "text-xs text-yellow-300 mt-1";

      if (bonusInfo.discoveryBonus >= 5.0) {
        discoveryBonusDiv.textContent = "🎉 每日奖励: 5倍 (今日前3个发现)";
      } else if (bonusInfo.discoveryBonus >= 3.0) {
        discoveryBonusDiv.textContent = "✨ 每日奖励: 3倍 (今日第4-5个发现)";
      } else if (bonusInfo.discoveryBonus >= 2.0) {
        discoveryBonusDiv.textContent = "🌟 每日奖励: 2倍 (今日第6-7个发现)";
      } else if (bonusInfo.discoveryBonus >= 1.5) {
        discoveryBonusDiv.textContent = "⭐ 每日奖励: 1.5倍 (今日第8-10个发现)";
      }

      contentDiv.appendChild(discoveryBonusDiv);
    }

    if (bonusInfo?.shipMultiplier && bonusInfo.shipMultiplier > 1.0) {
      const shipMultiplierDiv = document.createElement("div");
      shipMultiplierDiv.className = "text-xs text-blue-300 mt-1";
      const multiplierText = bonusInfo.shipMultiplier === Math.floor(bonusInfo.shipMultiplier) ? bonusInfo.shipMultiplier.toFixed(0) : bonusInfo.shipMultiplier.toFixed(1);
      shipMultiplierDiv.textContent = `🚀 飞船奖励: ${multiplierText}倍`;
      contentDiv.appendChild(shipMultiplierDiv);
    }

    const hasAnyBonus = bonusInfo?.discoveryBonus > 1.0 || bonusInfo?.streakBonus || (bonusInfo?.shipMultiplier && bonusInfo.shipMultiplier > 1.0);

    if (!hasAnyBonus) {
      const noBonusDiv = document.createElement("div");
      noBonusDiv.className = "text-xs text-gray-400 mt-1";
      noBonusDiv.textContent = "无奖励激活，提升你的飞船";
      contentDiv.appendChild(noBonusDiv);
    }

    container.appendChild(emojiSpan);
    container.appendChild(contentDiv);
    toast.appendChild(container);

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.className = toast.className.replace("animate-slideInDown", "animate-slideOutUp");
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 3000);
  }

  static getCollectionStats(): {
    totalCollections: number;
    uniqueLocations: number;
    totalResourcesGathered: ResourceReward;
  } {
    const stats = UnifiedSpaceshipStorage.getStats();
    return {
      totalCollections: stats.totalCollections,
      uniqueLocations: stats.totalCollections,
      totalResourcesGathered: {
        antimatter: stats.totalResourcesCollected.antimatter,
        element115: stats.totalResourcesCollected.element115,
        deuterium: stats.totalResourcesCollected.deuterium,
      },
    };
  }
}

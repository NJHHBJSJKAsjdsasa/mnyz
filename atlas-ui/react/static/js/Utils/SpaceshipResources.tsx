// atlas-ui/react/static/js/Utils/SpaceshipResources.tsx
import { createRoot } from "react-dom/client";
import { UnifiedSpaceshipStorage } from "./UnifiedSpaceshipStorage.tsx";
import { HullSystem } from "./HullSystem.tsx";
import { CosmicEvents } from "./CosmicEvents.tsx";
import { TechSystem } from "./TechSystem.tsx";
import { getItem } from "./b64.tsx";
import AntimatterIcon from "../Icons/AntimatterIcon.tsx";
import DeuteriumIcon from "../Icons/DeuteriumIcon.tsx";
import Element115Icon from "../Icons/Element115Icon.tsx";

export interface SpaceshipResource {
  // 基础资源
  antimatter: number;
  element115: number;
  deuterium: number;
  // 中级资源
  quantumAlloy: number;
  plasmaCell: number;
  neuralCircuit: number;
  // 稀有资源
  exoticCrystal: number;
  nebulaDust: number;
  blackHoleFragment: number;
  // Artifact资源
  ancientRelic: number;
  alienArtifact: number;
  dimensionalShard: number;
}

export type SpaceshipType = "explorer" | "miner" | "combat" | "trader" | "scientist";

export interface SpaceshipModule {
  id: string;
  name: string;
  type: "engine" | "shield" | "scanner" | "storage" | "weapon";
  level: number;
  effects: {
    efficiency?: number;
    range?: number;
    storage?: number;
    shield?: number;
    scanning?: number;
    damage?: number;
  };
}

export interface SpaceshipUpgrade {
  level: number;
  efficiency: number;
  range: number;
  storage: number;
  multiplier: number;
}

export interface SpaceshipCustomization {
  type: SpaceshipType;
  modules: SpaceshipModule[];
  appearance: {
    color: string;
    pattern: string;
    decal: string;
  };
  skills: {
    [key: string]: number; // 技能名称和等级
  };
}

export interface TravelCost {
  antimatter: number;
  element115: number;
  deuterium: number;
}

export interface PassiveGeneration {
  antimatter: number;
  element115: number;
  deuterium: number;
  sources: {
    planets: number;
    systems: number;
    galaxies: number;
  };
}

export class SpaceshipResourceManager {
  static initialize(): void {
    UnifiedSpaceshipStorage.migrateFromOldStorage();
  }

  static getResources(): SpaceshipResource {
    return UnifiedSpaceshipStorage.getResources();
  }

  static getUpgrade(): SpaceshipUpgrade {
    return UnifiedSpaceshipStorage.getUpgrade();
  }

  static addResources(toAdd: Partial<SpaceshipResource>): void {
    UnifiedSpaceshipStorage.addResources({
      antimatter: toAdd.antimatter || 0,
      element115: toAdd.element115 || 0,
      deuterium: toAdd.deuterium || 0,
      quantumAlloy: toAdd.quantumAlloy || 0,
      plasmaCell: toAdd.plasmaCell || 0,
      neuralCircuit: toAdd.neuralCircuit || 0,
      exoticCrystal: toAdd.exoticCrystal || 0,
      nebulaDust: toAdd.nebulaDust || 0,
      blackHoleFragment: toAdd.blackHoleFragment || 0,
      ancientRelic: toAdd.ancientRelic || 0,
      alienArtifact: toAdd.alienArtifact || 0,
      dimensionalShard: toAdd.dimensionalShard || 0,
    });
  }

  static consumeResources(cost: TravelCost): boolean {
    return UnifiedSpaceshipStorage.consumeResources(cost);
  }

  static calculateTravelCost(locationType: "galaxy" | "system" | "planet", distance: number = 0): TravelCost {
    const baseCosts = {
      galaxy: { antimatter: 25, element115: 20, deuterium: 15 },
      system: { antimatter: 8, element115: 6, deuterium: 10 },
      planet: { antimatter: 2, element115: 1, deuterium: 3 },
    };

    const base = baseCosts[locationType];
    const distanceMultiplier = Math.max(1, distance / 100);
    // A damaged hull costs more to push through warp; cosmic weather moves the
    // price either way (fuel-leak events cost more, gravity waves less).
    const hullFactor = HullSystem.travelFactor() * CosmicEvents.multiplier("fuel");

    return {
      antimatter: Math.floor(base.antimatter * distanceMultiplier * hullFactor),
      element115: Math.floor(base.element115 * distanceMultiplier * hullFactor),
      deuterium: Math.floor(base.deuterium * distanceMultiplier * hullFactor),
    };
  }

  /**
   * Canonical inter-galaxy jump price, in raw coordinate units. Both the manual
   * navigator and expedition contracts go through here, so neither path can
   * undercut the other.
   */
  static calculateJumpCost(distance: number): TravelCost {
    const factor = HullSystem.travelFactor() * CosmicEvents.multiplier("fuel") * TechSystem.multiplier("travel");
    return {
      antimatter: Math.max(20, Math.round((distance / 15000) * factor)),
      element115: Math.max(10, Math.round((distance / 30000) * factor)),
      deuterium: Math.max(15, Math.round((distance / 22000) * factor)),
    };
  }

  static canAffordTravel(locationType: "galaxy" | "system" | "planet", distance: number = 0): boolean {
    const cost = this.calculateTravelCost(locationType, distance);
    const resources = this.getResources();
    const upgrade = this.getUpgrade();

    const actualCost = {
      antimatter: Math.floor(cost.antimatter / upgrade.efficiency),
      element115: Math.floor(cost.element115 / upgrade.efficiency),
      deuterium: Math.floor(cost.deuterium / upgrade.efficiency),
    };

    return resources.antimatter >= actualCost.antimatter && resources.element115 >= actualCost.element115 && resources.deuterium >= actualCost.deuterium && distance <= upgrade.range;
  }

  static getUpgradeCost(currentLevel: number): TravelCost {
    let currentStorage: number;
    if (currentLevel <= 20) {
      currentStorage = 1000 + (currentLevel - 1) * 400;
    } else {
      currentStorage = 1000 + 20 * 400 + Math.floor(Math.log(currentLevel - 20 + 1) * 1200);
    }

    const baseCostRatio = 0.4;
    const baseResourceCost = Math.floor((currentStorage * baseCostRatio) / 1.3);
    // Linear up to 100 (unchanged pacing), then exponential so 999 stays a long haul.
    const levelScaling = currentLevel <= 100 ? 1 + (currentLevel - 1) * 0.01 : 2 * Math.pow(1.03, currentLevel - 100);
    const scaledCost = Math.floor(baseResourceCost * levelScaling);

    return {
      antimatter: scaledCost,
      element115: Math.floor(scaledCost * 1.3),
      deuterium: Math.floor(scaledCost * 0.9),
    };
  }

  static canAffordUpgrade(): boolean {
    const upgrade = this.getUpgrade();
    const MAX_LEVEL = 999;
    if (upgrade.level >= MAX_LEVEL) {
      return false;
    }

    const cost = this.getUpgradeCost(upgrade.level);
    const resources = this.getResources();

    return resources.antimatter >= cost.antimatter && resources.element115 >= cost.element115 && resources.deuterium >= cost.deuterium;
  }

  static upgradeShip(): boolean {
    const upgrade = this.getUpgrade();
    const cost = this.getUpgradeCost(upgrade.level);
    return UnifiedSpaceshipStorage.upgradeShip(cost);
  }

  static calculatePassiveGeneration(): PassiveGeneration {
    const upgrade = this.getUpgrade();
    const savedLocationsData = JSON.parse(getItem("_atlasLocations") || "[]");
    const savedLocations = Array.isArray(savedLocationsData) ? savedLocationsData : savedLocationsData.locations || [];

    let totalGeneration = { antimatter: 0, element115: 0, deuterium: 0 };
    let sources = { planets: 0, systems: 0, galaxies: 0 };

    savedLocations.forEach((location: any) => {
      if (location.type === "planet") {
        sources.planets++;
        totalGeneration.antimatter += 0.07;
        totalGeneration.element115 += 0.05;
        totalGeneration.deuterium += 0.08;
      } else if (location.type === "system") {
        sources.systems++;
        totalGeneration.antimatter += 0.02;
        totalGeneration.element115 += 0.02;
        totalGeneration.deuterium += 0.02;
      }
    });
    totalGeneration.antimatter = totalGeneration.antimatter * upgrade.multiplier;
    totalGeneration.element115 = totalGeneration.element115 * upgrade.multiplier;
    totalGeneration.deuterium = totalGeneration.deuterium * upgrade.multiplier;

    return {
      ...totalGeneration,
      sources,
    };
  }

  static processPassiveGeneration(): void {
    if (UnifiedSpaceshipStorage.shouldProcessPassive()) {
      const generation = this.calculatePassiveGeneration();

      if (generation.antimatter > 0 || generation.element115 > 0 || generation.deuterium > 0) {
        this.addResources({
          antimatter: Math.round(generation.antimatter),
          element115: Math.round(generation.element115),
          deuterium: Math.round(generation.deuterium),
        });

        this.showPassiveGenerationNotification(generation);
      }

      UnifiedSpaceshipStorage.markPassiveProcessed();
    }
  }

  static getAccumulatedResourcesWithLimit(): PassiveGeneration {
    const baseGeneration = this.calculatePassiveGeneration();
    const upgrade = this.getUpgrade();
    const upgradeCost = this.getUpgradeCost(upgrade.level);

    const limit = {
      antimatter: upgradeCost.antimatter * 5,
      element115: upgradeCost.element115 * 5,
      deuterium: upgradeCost.deuterium * 5,
    };

    const data = UnifiedSpaceshipStorage.getData();
    const lastPassive = data.t.lp;
    const now = Date.now();

    if (!lastPassive || lastPassive === 0) {
      return baseGeneration;
    }

    if (baseGeneration.sources.planets === 0 && baseGeneration.sources.systems === 0) {
      return baseGeneration;
    }

    const intervalsPassed = Math.floor((now - lastPassive) / (1 * 60 * 1000));

    if (intervalsPassed < 1) {
      return {
        antimatter: 0,
        element115: 0,
        deuterium: 0,
        sources: baseGeneration.sources,
      };
    } else if (intervalsPassed >= 1) {
      const accumulated = {
        antimatter: Math.min(baseGeneration.antimatter * intervalsPassed, limit.antimatter * 2),
        element115: Math.min(baseGeneration.element115 * intervalsPassed, limit.element115 * 2),
        deuterium: Math.min(baseGeneration.deuterium * intervalsPassed, limit.deuterium * 2),
        sources: baseGeneration.sources,
      };

      return accumulated;
    }

    const accumulated = {
      antimatter: Math.min(baseGeneration.antimatter * intervalsPassed, limit.antimatter * 2),
      element115: Math.min(baseGeneration.element115 * intervalsPassed, limit.element115 * 2),
      deuterium: Math.min(baseGeneration.deuterium * intervalsPassed, limit.deuterium * 2),
      sources: baseGeneration.sources,
    };

    return accumulated;
  }

  static showPassiveGenerationNotification(generation: PassiveGeneration): void {
    if (generation.antimatter + generation.element115 + generation.deuterium === 0) return;

    const toast = document.createElement("div");
    toast.className = "fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-gradient-to-r from-purple-900/90 to-blue-900/90 text-white px-4 py-3 rounded-lg shadow-lg border border-purple-500/50 w-[90vw] max-w-lg";
    toast.className += " animate-slideInDown";

    const container = document.createElement("div");
    container.className = "flex items-center space-x-3";

    const emojiSpan = document.createElement("span");
    emojiSpan.className = "text-2xl";
    emojiSpan.textContent = "⛏️";

    const contentDiv = document.createElement("div");

    const titleDiv = document.createElement("div");
    titleDiv.className = "text-sm font-bold text-purple-300";
    titleDiv.textContent = "采矿操作完成！";

    const resourceDiv = document.createElement("div");
    resourceDiv.className = "text-xs text-purple-200 mt-1 flex gap-3";

    const amSpan = document.createElement("span");
    amSpan.className = "text-purple-300 flex items-center gap-1";
    const amRoot = createRoot(amSpan);
    amRoot.render(
      <>
        <AntimatterIcon size={12} color="currentColor" />+{Math.round(generation.antimatter)} AM
      </>
    );

    const e115Span = document.createElement("span");
    e115Span.className = "text-cyan-300 flex items-center gap-1";
    const e115Root = createRoot(e115Span);
    e115Root.render(
      <>
        <Element115Icon size={12} color="currentColor" />+{Math.round(generation.element115)} E115
      </>
    );

    const deuteriumSpan = document.createElement("span");
    deuteriumSpan.className = "text-orange-300 flex items-center gap-1";
    const deuteriumRoot = createRoot(deuteriumSpan);
    deuteriumRoot.render(
      <>
        <DeuteriumIcon size={12} color="currentColor" />+{Math.round(generation.deuterium)} D
      </>
    );

    resourceDiv.appendChild(amSpan);
    resourceDiv.appendChild(e115Span);
    resourceDiv.appendChild(deuteriumSpan);

    const sourceDiv = document.createElement("div");
    sourceDiv.className = "text-xs text-purple-300 mt-1";
    sourceDiv.textContent = `从 ${generation.sources.planets}🪐 ${generation.sources.systems}⭐ 收集`;

    contentDiv.appendChild(titleDiv);
    contentDiv.appendChild(resourceDiv);
    contentDiv.appendChild(sourceDiv);

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

  static reset(): void {
    UnifiedSpaceshipStorage.reset();
  }

  static getResourcesPercentage(): { antimatter: number; element115: number; deuterium: number } {
    const resources = this.getResources();
    const upgrade = this.getUpgrade();

    return {
      antimatter: (resources.antimatter / upgrade.storage) * 100,
      element115: (resources.element115 / upgrade.storage) * 100,
      deuterium: (resources.deuterium / upgrade.storage) * 100,
    };
  }

  static getPassiveGenerationInfo(): {
    generation: PassiveGeneration;
    perHour: { antimatter: number; element115: number; deuterium: number };
    nextGenerationIn: number;
  } {
    const generation = this.calculatePassiveGeneration();
    const nextGeneration = UnifiedSpaceshipStorage.shouldProcessPassive() ? 0 : (1 * 60 * 1000 - (Date.now() - (UnifiedSpaceshipStorage.getData().t.lp || 0))) / 1000;

    return {
      generation,
      perHour: {
        antimatter: generation.antimatter * 60,
        element115: generation.element115 * 60,
        deuterium: generation.deuterium * 60,
      },
      nextGenerationIn: Math.max(0, nextGeneration),
    };
  }

  static getExchangeRates(): {
    [key: string]: { from: string; to: string; rate: number; available: number }[];
  } {
    const resources = this.getResources();

    return {
      // 基础资源交换
      antimatter: [
        { from: "antimatter", to: "element115", rate: 1.2, available: resources.antimatter },
        { from: "antimatter", to: "deuterium", rate: 0.8, available: resources.antimatter },
      ],
      element115: [
        { from: "element115", to: "antimatter", rate: 0.9, available: resources.element115 },
        { from: "element115", to: "deuterium", rate: 1.1, available: resources.element115 },
      ],
      deuterium: [
        { from: "deuterium", to: "antimatter", rate: 1.3, available: resources.deuterium },
        { from: "deuterium", to: "element115", rate: 0.95, available: resources.deuterium },
      ],
      // 中级资源交换
      quantumAlloy: [
        { from: "quantumAlloy", to: "antimatter", rate: 5, available: resources.quantumAlloy },
        { from: "quantumAlloy", to: "element115", rate: 4, available: resources.quantumAlloy },
      ],
      plasmaCell: [
        { from: "plasmaCell", to: "antimatter", rate: 4, available: resources.plasmaCell },
        { from: "plasmaCell", to: "deuterium", rate: 6, available: resources.plasmaCell },
      ],
      neuralCircuit: [
        { from: "neuralCircuit", to: "antimatter", rate: 6, available: resources.neuralCircuit },
        { from: "neuralCircuit", to: "element115", rate: 5, available: resources.neuralCircuit },
      ],
      // 稀有资源交换
      exoticCrystal: [
        { from: "exoticCrystal", to: "antimatter", rate: 20, available: resources.exoticCrystal },
        { from: "exoticCrystal", to: "quantumAlloy", rate: 3, available: resources.exoticCrystal },
      ],
      nebulaDust: [
        { from: "nebulaDust", to: "antimatter", rate: 15, available: resources.nebulaDust },
        { from: "nebulaDust", to: "plasmaCell", rate: 4, available: resources.nebulaDust },
      ],
      blackHoleFragment: [
        { from: "blackHoleFragment", to: "antimatter", rate: 25, available: resources.blackHoleFragment },
        { from: "blackHoleFragment", to: "neuralCircuit", rate: 3, available: resources.blackHoleFragment },
      ],
      // Artifact资源交换
      ancientRelic: [
        { from: "ancientRelic", to: "antimatter", rate: 100, available: resources.ancientRelic },
        { from: "ancientRelic", to: "exoticCrystal", rate: 4, available: resources.ancientRelic },
      ],
      alienArtifact: [
        { from: "alienArtifact", to: "antimatter", rate: 120, available: resources.alienArtifact },
        { from: "alienArtifact", to: "nebulaDust", rate: 6, available: resources.alienArtifact },
      ],
      dimensionalShard: [
        { from: "dimensionalShard", to: "antimatter", rate: 150, available: resources.dimensionalShard },
        { from: "dimensionalShard", to: "blackHoleFragment", rate: 5, available: resources.dimensionalShard },
      ],
    };
  }

  static exchangeResources(fromResource: "antimatter" | "element115" | "deuterium" | "quantumAlloy" | "plasmaCell" | "neuralCircuit" | "exoticCrystal" | "nebulaDust" | "blackHoleFragment" | "ancientRelic" | "alienArtifact" | "dimensionalShard", toResource: "antimatter" | "element115" | "deuterium" | "quantumAlloy" | "plasmaCell" | "neuralCircuit" | "exoticCrystal" | "nebulaDust" | "blackHoleFragment" | "ancientRelic" | "alienArtifact" | "dimensionalShard", amount: number): boolean {
    const resources = this.getResources();
    const rates = this.getExchangeRates();

    const availableExchanges = rates[fromResource];
    const exchange = availableExchanges.find((e) => e.to === toResource);

    if (!exchange || amount <= 0 || resources[fromResource] < amount) {
      return false;
    }

    const exchangeAmount = Math.floor(amount * exchange.rate);
    const upgrade = this.getUpgrade();

    if (resources[toResource] + exchangeAmount > upgrade.storage) {
      return false;
    }

    const newResources = { ...resources };
    newResources[fromResource] -= amount;
    newResources[toResource] += exchangeAmount;

    UnifiedSpaceshipStorage.setResources(newResources);

    this.showExchangeNotification(fromResource, toResource, amount, exchangeAmount);

    return true;
  }

  private static showExchangeNotification(fromResource: string, toResource: string, sentAmount: number, receivedAmount: number): void {
    const toast = document.createElement("div");
    toast.className = "fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-gradient-to-r from-amber-900/90 to-orange-900/90 text-white px-4 py-3 rounded-lg shadow-lg border border-amber-500/50";
    toast.className += " animate-slideInDown";

    const resourceLabels: { [key: string]: { name: string; color: string } } = {
      // 基础资源
      antimatter: { name: "AM", color: "text-purple-300" },
      element115: { name: "E115", color: "text-cyan-300" },
      deuterium: { name: "D", color: "text-orange-300" },
      // 中级资源
      quantumAlloy: { name: "QA", color: "text-green-300" },
      plasmaCell: { name: "PC", color: "text-red-300" },
      neuralCircuit: { name: "NC", color: "text-yellow-300" },
      // 稀有资源
      exoticCrystal: { name: "EC", color: "text-pink-300" },
      nebulaDust: { name: "ND", color: "text-indigo-300" },
      blackHoleFragment: { name: "BHF", color: "text-gray-300" },
      // Artifact资源
      ancientRelic: { name: "AR", color: "text-amber-300" },
      alienArtifact: { name: "AA", color: "text-blue-300" },
      dimensionalShard: { name: "DS", color: "text-violet-300" },
    };

    const fromLabel = resourceLabels[fromResource];
    const toLabel = resourceLabels[toResource];

    const container = document.createElement("div");
    container.className = "flex items-center space-x-3";

    const emojiSpan = document.createElement("span");
    emojiSpan.className = "text-2xl";
    emojiSpan.textContent = "🔄";

    const contentDiv = document.createElement("div");

    const titleDiv = document.createElement("div");
    titleDiv.className = "text-sm font-bold text-amber-300";
    titleDiv.textContent = "资源交换";

    const exchangeDiv = document.createElement("div");
    exchangeDiv.className = "text-xs text-amber-200 mt-1";

    const fromSpan = document.createElement("span");
    fromSpan.className = `${fromLabel.color} flex items-center gap-1`;

    const toSpan = document.createElement("span");
    toSpan.className = `${toLabel.color} flex items-center gap-1`;

    const arrowSpan = document.createElement("span");
    arrowSpan.className = "text-amber-300 mx-2";
    arrowSpan.textContent = "→";

    const fromRoot = createRoot(fromSpan);
    let fromIcon = null;
    switch(fromResource) {
      case "antimatter":
        fromIcon = <AntimatterIcon size={10} color="currentColor" />;
        break;
      case "element115":
        fromIcon = <Element115Icon size={10} color="currentColor" />;
        break;
      case "deuterium":
        fromIcon = <DeuteriumIcon size={10} color="currentColor" />;
        break;
      default:
        // 为新资源使用默认图标
        fromIcon = <span className="text-xs">●</span>;
    }

    const toRoot = createRoot(toSpan);
    let toIcon = null;
    switch(toResource) {
      case "antimatter":
        toIcon = <AntimatterIcon size={10} color="currentColor" />;
        break;
      case "element115":
        toIcon = <Element115Icon size={10} color="currentColor" />;
        break;
      case "deuterium":
        toIcon = <DeuteriumIcon size={10} color="currentColor" />;
        break;
      default:
        // 为新资源使用默认图标
        toIcon = <span className="text-xs">●</span>;
    }

    fromRoot.render(
      <>
        {fromIcon}-{sentAmount} {fromLabel.name}
      </>
    );

    toRoot.render(
      <>
        {toIcon}+{receivedAmount} {toLabel.name}
      </>
    );

    exchangeDiv.appendChild(fromSpan);
    exchangeDiv.appendChild(arrowSpan);
    exchangeDiv.appendChild(toSpan);

    contentDiv.appendChild(titleDiv);
    contentDiv.appendChild(exchangeDiv);

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
}

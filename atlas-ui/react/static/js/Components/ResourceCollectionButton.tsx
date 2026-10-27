// atlas-ui/react/static/js/Components/ResourceCollectionButton.tsx
import React, { useState, useEffect } from "react";
import { SpaceshipResourceCollectionManager } from "../Utils/SpaceshipResourceCollection.tsx";
import { SpaceshipResourceManager } from "../Utils/SpaceshipResources.tsx";
import { ResourceEventManager } from "../Utils/ResourceEventManager.tsx";
import { ServerApi } from "../Utils/ServerApi.tsx";
import { UnifiedSpaceshipStorage } from "../Utils/UnifiedSpaceshipStorage.tsx";
import AntimatterIcon from "../Icons/AntimatterIcon.tsx";
import DeuteriumIcon from "../Icons/DeuteriumIcon.tsx";
import Element115Icon from "../Icons/Element115Icon.tsx";

interface ResourceCollectionButtonProps {
  locationType: "galaxy" | "system" | "planet";
  locationId: string;
  coordinates: string;
  systemIndex?: number;
  planetName?: string;
  planetElements?: string[];
  className?: string;
}

const ResourceCollectionButton: React.FC<ResourceCollectionButtonProps> = ({ locationType, locationId, coordinates, systemIndex, planetName, planetElements, className = "" }) => {
  const [canCollect, setCanCollect] = useState(false);
  const [timeUntilNext, setTimeUntilNext] = useState(0);
  const [isCollecting, setIsCollecting] = useState(false);
  const [collectionCount, setCollectionCount] = useState(0);
  const [dailyLimitsInfo, setDailyLimitsInfo] = useState<any>(null);

  useEffect(() => {
    import("../Utils/UnifiedSpaceshipStorage").then(({ UnifiedSpaceshipStorage }) => {
      UnifiedSpaceshipStorage.cleanCorruptedTimestamps();
    });

    const fullLocationId = SpaceshipResourceCollectionManager.generateLocationId(locationType, coordinates, systemIndex, planetName);

    const updateState = () => {
      const canCollectNow = SpaceshipResourceCollectionManager.canCollectFromLocation(fullLocationId);
      const timeRemaining = SpaceshipResourceCollectionManager.getTimeUntilNextCollection(fullLocationId);

      setCanCollect(canCollectNow);
      setTimeUntilNext(timeRemaining);

      const collection = SpaceshipResourceCollectionManager.getLocationCollection(fullLocationId);
      setCollectionCount(collection?.totalCollections || 0);

      const limitsInfo = UnifiedSpaceshipStorage.getDailyCollectionInfo();
      setDailyLimitsInfo(limitsInfo);
    };

    updateState();

    const interval = setInterval(updateState, 1000);
    return () => clearInterval(interval);
  }, [locationType, coordinates, systemIndex, planetName]);

  const handleCollect = async () => {
    setIsCollecting(true);

    const fullLocationId = SpaceshipResourceCollectionManager.generateLocationId(locationType, coordinates, systemIndex, planetName);

    const isFirstTime = collectionCount === 0;

    const planetData = planetElements ? { elements: planetElements } : undefined;
    let reward: any = null;

    if (ServerApi.mode() === "server") {
      try {
        const result = await ServerApi.collect(fullLocationId, coordinates);
        reward = result?.gained || null;
        if (reward) {
          SpaceshipResourceManager.addResources(reward);
          UnifiedSpaceshipStorage.markLocationCollected(fullLocationId);
          ResourceEventManager.emit("resources_updated");
        }
      } catch (error) {
        console.warn("[atlas-server] collect failed", error);
        setIsCollecting(false);
        return;
      }
    } else {
      reward = SpaceshipResourceCollectionManager.collectResources(fullLocationId, locationType, coordinates, planetData);
      if (ServerApi.mode() === "shadow") ServerApi.scheduleShadow("collect");
    }

    if (reward) {
      const { UnifiedSpaceshipStorage } = await import("../Utils/UnifiedSpaceshipStorage");
      const streakInfo = UnifiedSpaceshipStorage.getCollectionStreakInfo();

      const discoveryBonus = streakInfo.dailyCollections <= 3 ? 5.0 : streakInfo.dailyCollections <= 5 ? 3.0 : streakInfo.dailyCollections <= 7 ? 2.0 : streakInfo.dailyCollections <= 10 ? 1.5 : 1.0;

      SpaceshipResourceCollectionManager.showCollectionSuccess(
        reward,
        locationType,
        {
          streakBonus: streakInfo.streakMultiplier > 1.0,
          discoveryBonus: discoveryBonus,
          shipMultiplier: UnifiedSpaceshipStorage.getUpgrade().multiplier,
        },
        isFirstTime
      );

      setCanCollect(false);
      setTimeUntilNext(SpaceshipResourceCollectionManager.getTimeUntilNextCollection(fullLocationId));
      setCollectionCount((prev) => prev + 1);

      ResourceEventManager.emit("resources_updated");
      ResourceEventManager.emit("mining_completed", reward);
    }

    setTimeout(() => setIsCollecting(false), 1000);
  };

  const getButtonText = () => {
    if (isCollecting) return "Mining...";
    if (!canCollect && timeUntilNext > 0) {
      const totalSeconds = Math.ceil(timeUntilNext * 3600);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;

      if (minutes >= 60) {
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        return `${hours}h ${remainingMinutes}m`;
      } else if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
      } else {
        return `${seconds}s`;
      }
    }
    if (isDailyLimitReached()) {
      return "Max";
    }
    return "Mine";
  };

  const getButtonIcon = () => {
    if (isCollecting) {
      return (
        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      );
    }
    if (!canCollect && timeUntilNext > 0) {
      return (
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8z" />
          <path d="M13 7h-2v5.414l3.293 3.293 1.414-1.414L13 11.586z" />
        </svg>
      );
    }
    return (
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" />
      </svg>
    );
  };

  const getRewardPreview = () => {
    const planetData = planetElements ? { elements: planetElements } : undefined;
    const reward = SpaceshipResourceCollectionManager.calculateReward(locationType, coordinates, collectionCount, planetData, true);
    return (
      <span className="inline-flex items-center gap-1">
        <AntimatterIcon size={8} color="#c084fc" />
        {reward.antimatter}AM |
        <Element115Icon size={8} color="#67e8f9" />
        {reward.element115}E115 |
        <DeuteriumIcon size={8} color="#fb923c" />
        {reward.deuterium}D
      </span>
    );
  };

  const getTooltipText = () => {
    if (!dailyLimitsInfo) return canCollect ? `Mine: ${getRewardPreview()}` : `Cooldown: ${getButtonText()} remaining`;

    const typeInfo = locationType === "planet" ? dailyLimitsInfo.planets : locationType === "system" ? dailyLimitsInfo.systems : dailyLimitsInfo.galaxies;

    const limitText = typeInfo.unlimited ? "" : ` | Daily: ${typeInfo.used}/${typeInfo.limit}`;

    if (canCollect) {
      const reward = SpaceshipResourceCollectionManager.calculateReward(locationType, coordinates, collectionCount, planetElements ? { elements: planetElements } : undefined, true);
      return `Mine: ${reward.antimatter}AM | ${reward.element115}E115 | ${reward.deuterium}D${limitText}`;
    } else {
      if (!typeInfo.unlimited && typeInfo.used >= typeInfo.limit) {
        return `Daily limit reached: ${typeInfo.used}/${typeInfo.limit} ${locationType}s today`;
      } else {
        const reward = SpaceshipResourceCollectionManager.calculateReward(locationType, coordinates, collectionCount, planetElements ? { elements: planetElements } : undefined, true);
        return `Cooldown: ${getButtonText()} remaining | Next: ${reward.antimatter}AM | ${reward.element115}E115 | ${reward.deuterium}D${limitText}`;
      }
    }
  };

  const isDailyLimitReached = () => {
    if (!dailyLimitsInfo) return false;

    const typeInfo = locationType === "planet" ? dailyLimitsInfo.planets : locationType === "system" ? dailyLimitsInfo.systems : dailyLimitsInfo.galaxies;

    return !typeInfo.unlimited && typeInfo.used >= typeInfo.limit;
  };

  return (
    <button onClick={handleCollect} disabled={!canCollect || isCollecting} className={`relative inline-flex items-center space-x-1 px-1.5 py-0.5 rounded transition-all duration-200 text-[10px] font-medium h-[21px] box-border ${isCollecting ? "bg-blue-500/20 border border-blue-500/50 text-blue-400" : canCollect ? "bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/40 text-white hover:text-blue-300" : isDailyLimitReached() ? "bg-red-500/20 border border-red-500/50 text-red-400" : "bg-gray-500/20 border border-gray-500/50 text-gray-400"} ${className}`} title={getTooltipText()}>
      {getButtonIcon()}
      <span className="text-[10px] uppercase">{getButtonText()}</span>

      {isDailyLimitReached() && <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] px-1 py-0.5 rounded-full font-bold leading-none min-w-[16px] text-center z-10">MAX</div>}
    </button>
  );
};

export default ResourceCollectionButton;

// atlas-ui/react/static/js/Components/GalaxyInfo.tsx
import React, { useState, useEffect } from "react";
import Universe3DViewer from "./Universe3DViewer.tsx";
import SaveLocationButton from "./SaveLocationButton.tsx";
import ResourceCollectionButton from "./ResourceCollectionButton.tsx";
import MiningIndicator from "./MiningIndicator.tsx";
import { SpaceshipResourceCollectionManager } from "../Utils/SpaceshipResourceCollection.tsx";
import { LocationBookmarks } from "../Utils/LocationBookmarks.tsx";
import { StargateGenerator } from "../Utils/StargateGenerator.tsx";
import { ResourceEventManager } from "../Utils/ResourceEventManager.tsx";
import { subscribeClock } from "../Utils/clock.tsx";

interface Galaxy {
  name: string;
  coordinates: number[];
  galaxy_type: string;
  num_systems: number;
  black_holes: number;
  pulsars: number;
  quasars: number;
}

interface GalaxyInfoProps {
  galaxy: Galaxy;
}

const GalaxyInfo: React.FC<GalaxyInfoProps> = ({ galaxy }) => {
  const [miningState, setMiningState] = useState({
    isOnCooldown: false,
    isSaved: false,
    isCollecting: false,
    timeUntilNext: 0,
  });

  useEffect(() => {
    let collectingTimeout: NodeJS.Timeout;

    const updateMiningState = () => {
      const fullLocationId = SpaceshipResourceCollectionManager.generateLocationId("galaxy", galaxy.coordinates.join(","), undefined, undefined);

      const canCollect = SpaceshipResourceCollectionManager.canCollectFromLocation(fullLocationId);
      const timeRemaining = SpaceshipResourceCollectionManager.getTimeUntilNextCollection(fullLocationId);

      const galaxyCoords = galaxy.coordinates;
      const stargateUrl = StargateGenerator.generateGalaxyUrl(galaxyCoords, StargateGenerator.getCurrentPage());
      const savedLocations = LocationBookmarks.getLocations();
      const isSaved = savedLocations.some((loc) => loc.stargateUrl === stargateUrl);

      setMiningState((prev) => ({
        isOnCooldown: !canCollect && timeRemaining > 0,
        isSaved: isSaved,
        isCollecting: prev.isCollecting,
        timeUntilNext: timeRemaining,
      }));
    };

    const handleMiningCompleted = () => {
      setMiningState((prev) => ({
        ...prev,
        isCollecting: true,
      }));

      collectingTimeout = setTimeout(() => {
        setMiningState((prev) => ({
          ...prev,
          isCollecting: false,
        }));
      }, 1000);
    };

    updateMiningState();
    const stopClock = subscribeClock(updateMiningState);

    const unsubscribe = ResourceEventManager.subscribe("mining_completed", handleMiningCompleted);

    return () => {
      stopClock();
      if (collectingTimeout) clearTimeout(collectingTimeout);
      unsubscribe();
    };
  }, [galaxy.name, galaxy.coordinates]);

  const formatName = (name: string) => {
    return name.replace(/_/g, " ");
  };

  return (
    <div className="h-full flex flex-col relative">
      <div className="absolute top-0 right-0 flex gap-2 z-10">
        <ResourceCollectionButton locationType="galaxy" locationId={galaxy.name} coordinates={galaxy.coordinates.join(",")} className="text-xs" />
        <SaveLocationButton type="galaxy" name={galaxy.name} coordinates={galaxy.coordinates.join(",")} className="text-xs" />
        <div className="inline-flex items-center bg-green-500/20 border border-green-500/50 text-green-400 text-[10px] font-medium px-1.5 py-0.5 rounded h-[21px] box-border">已访问</div>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <MiningIndicator isOnCooldown={miningState.isOnCooldown} isSaved={miningState.isSaved} isCollecting={miningState.isCollecting} />
        <h3 className="text-lg sm:text-xl font-bold text-white">详细信息</h3>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-plate-2 rounded-lg p-2 border border-blue-500/30">
          <div className="text-xs text-gray-200">类型</div>
          <div className="text-sm font-bold text-blue-300">{galaxy.galaxy_type}</div>
        </div>
        <div className="bg-plate-2 rounded-lg p-2 border border-purple-500/30">
          <div className="text-xs text-gray-200">恒星系统</div>
          <div className="text-sm font-bold text-purple-300">{galaxy.num_systems.toLocaleString()}</div>
        </div>
      </div>

      <div className="bg-plate-2 rounded-lg p-3 border border-gray-500/30 mb-3 col-span-2">
        <Universe3DViewer coordinates={galaxy.coordinates} galaxyName={galaxy.name} />
      </div>

      <div className="bg-plate-2 rounded-lg p-2 border border-gray-500/30">
        <div className="text-xs text-gray-200 mb-2">宇宙天体</div>
        <div className="grid grid-cols-3 gap-1">
          <div className="bg-white/[0.04] rounded p-1.5 border border-pink-500/20">
            <div className="text-xs text-gray-300">黑洞</div>
            <div className="text-xs font-bold text-pink-300">{galaxy.black_holes.toLocaleString()}</div>
          </div>
          <div className="bg-white/[0.04] rounded p-1.5 border border-cyan-500/20">
            <div className="text-xs text-gray-300">脉冲星</div>
            <div className="text-xs font-bold text-cyan-300">{galaxy.pulsars.toLocaleString()}</div>
          </div>
          <div className="bg-white/[0.04] rounded p-1.5 border border-indigo-500/20">
            <div className="text-xs text-gray-300">类星体</div>
            <div className="text-xs font-bold text-indigo-300">{galaxy.quasars.toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-white/10">
        <div className="text-xs text-gray-400 mb-2">技术数据</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          <div className="bg-white/[0.04] rounded px-1.5 py-0.5">
            <span className="text-gray-400">状态:</span>
            <div className="text-green-400 font-medium">已访问</div>
          </div>
          <div className="bg-white/[0.04] rounded px-1.5 py-0.5">
            <span className="text-gray-400">星系:</span>
            <div className="text-white truncate font-medium">{formatName(galaxy.name)}</div>
          </div>
          <div className="bg-white/[0.04] rounded px-1.5 py-0.5">
            <span className="text-gray-400">坐标:</span>
            <div className="text-white font-medium">{galaxy.coordinates.join(", ")}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GalaxyInfo;

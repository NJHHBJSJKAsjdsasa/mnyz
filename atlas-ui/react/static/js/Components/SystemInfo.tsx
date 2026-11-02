// atlas-ui/react/static/js/Components/SystemInfo.tsx
import React, { useState, useEffect } from "react";
import SolarSystem3DViewer from "./SolarSystem3DViewer.tsx";
import SaveLocationButton from "./SaveLocationButton.tsx";
import ResourceCollectionButton from "./ResourceCollectionButton.tsx";
import MiningIndicator from "./MiningIndicator.tsx";
import { SpaceshipResourceCollectionManager } from "../Utils/SpaceshipResourceCollection.tsx";
import { LocationBookmarks } from "../Utils/LocationBookmarks.tsx";
import { StargateGenerator } from "../Utils/StargateGenerator.tsx";
import { ResourceEventManager } from "../Utils/ResourceEventManager.tsx";
import { subscribeClock } from "../Utils/clock.tsx";

interface Star {
  Type: string;
  Size: string;
  Color: string;
}

interface System {
  name: string;
  index: number;
  star_system_type: string;
  num_planets: number;
  stars: Star[];
  planets: Array<{
    name: string;
    planet_type: string;
    diameter: number;
    orbital_radius: number;
    orbital_period_seconds: number;
    orbital_speed: number;
    axial_tilt: number;
    rotation_period_seconds: number;
    initial_orbital_angle: number;
    eccentricity_factor: number;
    mass: number;
  }>;
}

interface Galaxy {
  name: string;
  coordinates: number[];
}

interface SystemInfoProps {
  system: System;
  galaxy: Galaxy;
  systemIndex: number;
  cosmicOriginTime: number;
}

const SystemInfo: React.FC<SystemInfoProps> = ({ system, galaxy, systemIndex, cosmicOriginTime }) => {
  const [miningState, setMiningState] = useState({
    isOnCooldown: false,
    isSaved: false,
    isCollecting: false,
    timeUntilNext: 0,
  });

  useEffect(() => {
    let collectingTimeout: NodeJS.Timeout;

    const updateMiningState = () => {
      const fullLocationId = SpaceshipResourceCollectionManager.generateLocationId("system", galaxy.coordinates.join(","), systemIndex, undefined);

      const canCollect = SpaceshipResourceCollectionManager.canCollectFromLocation(fullLocationId);
      const timeRemaining = SpaceshipResourceCollectionManager.getTimeUntilNextCollection(fullLocationId);

      const galaxyCoords = galaxy.coordinates;
      const stargateUrl = StargateGenerator.generateSystemUrl(galaxyCoords, systemIndex, StargateGenerator.getCurrentPage());
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
  }, [system.name, systemIndex, galaxy.coordinates]);

  const formatName = (name: string) => {
    return name.replace(/_/g, " ");
  };

  return (
    <div className="h-full flex flex-col relative">
      <div className="absolute top-0 right-0 flex gap-2 z-10">
        <ResourceCollectionButton locationType="system" locationId={system.name} coordinates={galaxy.coordinates.join(",")} systemIndex={systemIndex} className="text-xs" />
        <SaveLocationButton type="system" name={system.name} coordinates={galaxy.coordinates.join(",")} systemIndex={systemIndex} className="text-xs" />
        <div className="inline-flex items-center bg-green-500/20 border border-green-500/50 text-green-400 text-[10px] font-medium px-1.5 py-0.5 rounded h-[21px] box-border">已访问</div>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <MiningIndicator isOnCooldown={miningState.isOnCooldown} isSaved={miningState.isSaved} isCollecting={miningState.isCollecting} />
        <h3 className="text-lg sm:text-xl font-bold text-white">详细信息</h3>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-plate-2 rounded-lg p-2 border border-blue-500/30">
          <div className="text-xs text-gray-200">系统类型</div>
          <div className="text-sm font-bold text-blue-300 capitalize">{system.star_system_type}</div>
        </div>
        <div className="bg-plate-2 rounded-lg p-2 border border-purple-500/30">
          <div className="text-xs text-gray-200">行星</div>
          <div className="text-sm font-bold text-purple-300">{system.num_planets}</div>
        </div>
        <div className="bg-plate-2 rounded-lg p-2 border border-orange-500/30">
          <div className="text-xs text-gray-200">恒星</div>
          <div className="text-sm font-bold text-orange-300">{system.stars.length}</div>
        </div>
      </div>

      <div className="bg-plate-2 rounded-lg p-3 border border-gray-500/30 mb-3 col-span-3">
        <SolarSystem3DViewer planets={system.planets} stars={system.stars} systemName={system.name} cosmicOriginTime={cosmicOriginTime} />
      </div>

      <div className="bg-plate-2 rounded-lg p-2 border border-yellow-500/30">
        <div className="text-xs text-gray-200 mb-2">恒星组成</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
          {system.stars.map((star, index) => (
            <div key={index} className="bg-white/[0.04] rounded p-1.5 border border-yellow-500/20">
              <div className="text-xs text-gray-300 flex items-center gap-2">
                <span>恒星 {index + 1}</span>
                <span className="font-bold text-yellow-300">{star.Type}</span>
              </div>
              <div className="text-xs text-gray-300">
                {star.Color} • {star.Size}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-white/10">
        <div className="text-xs text-gray-400 mb-2">技术数据</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-xs">
          <div className="bg-white/[0.04] rounded px-1.5 py-0.5">
            <span className="text-gray-400">状态:</span>
            <div className="text-green-400 font-medium">已访问</div>
          </div>
          <div className="bg-white/[0.04] rounded px-1.5 py-0.5">
            <span className="text-gray-400">系统:</span>
            <div className="text-white truncate font-medium">{formatName(system.name)}</div>
          </div>
          <div className="bg-white/[0.04] rounded px-1.5 py-0.5">
            <span className="text-gray-400">系统ID:</span>
            <div className="text-white font-medium">#{systemIndex + 1}</div>
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

export default SystemInfo;

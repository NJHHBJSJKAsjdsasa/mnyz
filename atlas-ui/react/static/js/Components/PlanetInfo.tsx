// atlas-ui/react/static/js/Components/PlanetInfo.tsx
import React, { useState, useEffect, useMemo } from "react";
import SaveLocationButton from "./SaveLocationButton.tsx";
import ResourceCollectionButton from "./ResourceCollectionButton.tsx";
import EffectsControl from "./EffectsControl.tsx";
import MiningIndicator from "./MiningIndicator.tsx";
import { PlanetOverview } from "./planet/PlanetOverview.tsx";
import { PlanetOwnership } from "./planet/PlanetOwnership.tsx";
import { PlanetMoonCard, type MoonData } from "./planet/PlanetMoonCard.tsx";
import { PlanetTechData } from "./planet/PlanetTechData.tsx";
import AreciboModal from "./AreciboModal.tsx";
import { SpaceshipResourceCollectionManager } from "../Utils/SpaceshipResourceCollection.tsx";
import { LocationBookmarks } from "../Utils/LocationBookmarks.tsx";
import { StargateGenerator } from "../Utils/StargateGenerator.tsx";
import { ResourceEventManager } from "../Utils/ResourceEventManager.tsx";
import { PlanetScanSystem } from "../Utils/PlanetScanSystem.tsx";
import { Residents } from "../Utils/Residents.tsx";
import { CodexSystem } from "../Utils/CodexSystem.tsx";
import { ServerApi } from "../Utils/ServerApi.tsx";
import NpcEncounterCard from "./NpcEncounterCard.tsx";
import CombatPanel from "./CombatPanel.tsx";
import { CombatSystem } from "../Utils/CombatSystem.tsx";
import { Rival } from "../Utils/Rival.tsx";
import { subscribeClock } from "../Utils/clock.tsx";

interface Planet {
  name: string;
  planet_type: string;
  atmosphere: string;
  life_forms: string;
  mass: number;
  diameter: number;
  density: number;
  gravity: number;
  orbital_radius: number;
  orbital_period_seconds: number;
  orbital_speed: number;
  axial_tilt: number;
  rotation_period_seconds: number;
  surface_temperature: number;
  elements: string[];
}

interface System {
  name: string;
  index: number;
}

interface Galaxy {
  name: string;
  coordinates: number[];
}

interface EffectInfo {
  id: string;
  type: string;
  enabled: boolean;
}

interface PlanetInfoProps {
  planet: Planet;
  system: System;
  galaxy: Galaxy;
  cosmicOriginTime?: number;
  initialAngleRotation?: number;
  effects?: EffectInfo[];
  onToggleEffect?: (effectId: string, enabled: boolean) => void;
  selectedMoon?: MoonData | null;
}

const PlanetInfo: React.FC<PlanetInfoProps> = ({ planet, system, galaxy, cosmicOriginTime, initialAngleRotation, effects, onToggleEffect, selectedMoon }) => {
  const [showAllElements, setShowAllElements] = useState(false);
  const [showAreciboModal, setShowAreciboModal] = useState(false);
  const [combatKey, setCombatKey] = useState<string | null>(null);
  const [world, setWorld] = useState<any>(null);
  const [miningState, setMiningState] = useState({
    isOnCooldown: false,
    isSaved: false,
    isCollecting: false,
    timeUntilNext: 0,
  });

  // Deterministic NPC trace: same planet + same week always yields the same visitor.
  const planetKey = PlanetScanSystem.locationKey(planet.name, galaxy.coordinates.join(","), system.index);
  const residentTrace = useMemo(
    () => Residents.trace({ planetKey, universeSeed: Residents.universeSeed(), elements: planet.elements, lifeForms: planet.life_forms }),
    [planetKey, planet.life_forms, planet.elements.length],
  );

  useEffect(() => {
    let collectingTimeout: NodeJS.Timeout;

    const updateMiningState = () => {
      const fullLocationId = SpaceshipResourceCollectionManager.generateLocationId("planet", galaxy.coordinates.join(","), system.index, planet.name);

      const canCollect = SpaceshipResourceCollectionManager.canCollectFromLocation(fullLocationId);
      const timeRemaining = SpaceshipResourceCollectionManager.getTimeUntilNextCollection(fullLocationId);

      const galaxyCoords = galaxy.coordinates;
      const stargateUrl = StargateGenerator.generatePlanetUrl(galaxyCoords, system.index, planet.name, StargateGenerator.getCurrentPage());
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
  }, [planet.name, system.index, galaxy.coordinates]);

  useEffect(() => {
    if (ServerApi.mode() === "server") {
      void ServerApi.visitPlanet(planetKey).catch((error) =>
        console.warn("[atlas-server] codex visit failed", error),
      );
      return;
    }
    CodexSystem.record({ planetType: planet.planet_type, elements: planet.elements, lifeForms: planet.life_forms });
  }, [planet.name, system.index, galaxy.coordinates.join(",")]);

  useEffect(() => {
    if (residentTrace) Residents.markMet(residentTrace.resident.id);
  }, [residentTrace?.resident.id]);

  useEffect(() => {
    if (ServerApi.accountStatus() === "guest") {
      setWorld(null);
      return;
    }
    let cancelled = false;
    ServerApi.worldPlanet(planetKey)
      .then((data) => {
        if (!cancelled) setWorld(data);
      })
      .catch(() => {
        if (!cancelled) setWorld(null);
      });
    return () => {
      cancelled = true;
    };
  }, [planetKey]);

  const rivalMarked = Rival.isMarked(planetKey);
  const rival = rivalMarked ? Rival.identity() : null;

  // 5% chance per planet per day; the system remembers today's fights so a
  // refresh cannot re-roll for a different outcome.
  useEffect(() => {
    if (CombatSystem.shouldEncounter(planetKey)) setCombatKey(planetKey);
  }, [planetKey]);

  return (
    <div className="h-full flex flex-col relative">
      <div className="absolute top-0 right-0 flex gap-2 z-10">
        <ResourceCollectionButton locationType="planet" locationId={planet.name} coordinates={galaxy.coordinates.join(",")} systemIndex={system.index} planetName={planet.name} planetElements={planet.elements} className="text-xs" />
        <SaveLocationButton type="planet" name={planet.name} coordinates={galaxy.coordinates.join(",")} systemIndex={system.index} planetName={planet.name} className="text-xs" />
        <div className="inline-flex items-center bg-green-500/20 border border-green-500/50 text-green-400 text-[10px] font-medium px-1.5 py-0.5 rounded h-[21px] box-border">已访问</div>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <MiningIndicator isOnCooldown={miningState.isOnCooldown} isSaved={miningState.isSaved} isCollecting={miningState.isCollecting} />
        <h3 className="text-lg sm:text-xl font-bold text-white">详细信息</h3>
      </div>

      <PlanetOwnership world={world} guest={ServerApi.accountStatus() === "guest"} />

      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-plate-2 rounded-lg p-2 border border-blue-500/30">
          <div className="text-xs text-gray-200">类型</div>
          <div className="text-sm font-bold text-blue-300 capitalize">{planet.planet_type}</div>
        </div>
        <div className="bg-plate-2 rounded-lg p-2 border border-purple-500/30">
          <div className="text-xs text-gray-200">大气</div>
          <div className="text-sm font-bold text-purple-300 capitalize">{planet.atmosphere}</div>
        </div>
        {planet.life_forms !== "None" ? (
          <div className="relative">
            {/* Notification dot */}
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-pulse z-20 border border-green-300">
              <div className="w-full h-full bg-green-400 rounded-full animate-ping absolute"></div>
            </div>
            {/* Clickable Life Forms div */}
            <button onClick={() => setShowAreciboModal(true)} className="w-full bg-plate-2 hover:bg-green-500/20 rounded-lg p-2 border border-green-500/30 hover:border-green-400 transition-all duration-300 animate-pulse-glow hover:animate-bounce-subtle group cursor-pointer text-left" title="点击查看阿雷西博信息">
              <div className="text-xs text-gray-200 group-hover:text-green-200 transition-colors">生命形式</div>
              <div className="text-sm font-bold text-green-300 group-hover:text-green-200 capitalize transition-colors">{planet.life_forms}</div>
            </button>
          </div>
        ) : (
          <div className="bg-plate-2 rounded-lg p-2 border border-green-500/30">
            <div className="text-xs text-gray-200">生命形式</div>
            <div className="text-sm font-bold text-green-300 capitalize">{planet.life_forms}</div>
          </div>
        )}
      </div>

      <PlanetOverview planet={planet} showAllElements={showAllElements} onToggleElements={() => setShowAllElements(!showAllElements)} />

      {/* 同行者痕迹：让行星看起来「有人来过」 */}
      {residentTrace && (
        <div className="mt-3 bg-emerald-500/10 rounded-lg p-2 border border-emerald-500/30">
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs text-gray-200">同行者痕迹</div>
            <div className="text-[10px] text-emerald-300/80">{residentTrace.daysAgo} 天前</div>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="font-bold text-emerald-300">{residentTrace.resident.callsign}</span>
            <span className="text-gray-300">{residentTrace.resident.name}</span>
            <span className="text-gray-500">/</span>
            <span className="text-gray-400">{residentTrace.resident.ship}</span>
            <span className="text-gray-500">/</span>
            <span className="text-gray-400">{residentTrace.resident.trait}</span>
          </div>
          <div className="mt-1 text-xs text-gray-300">
            <span className="text-emerald-300">{residentTrace.kind}</span>
            <span className="text-gray-500"> · 取样 </span>
            <span className="text-yellow-300">{residentTrace.element}</span>
          </div>
          <div className="mt-1 text-xs text-gray-400 italic">“{residentTrace.note}”</div>
        </div>
      )}

      {rivalMarked && (
        <div className="mt-2 text-[11px] text-red-300/90">已被 {rival?.callsign} 抢先标记 · 本行星采集产出 −15%</div>
      )}

      <NpcEncounterCard planetKey={planetKey} residentId={residentTrace?.resident.id} />

      {/* 选中的月球信息 */}
      {selectedMoon && <PlanetMoonCard moon={selectedMoon} />}

      <PlanetTechData planetName={planet.name} systemName={system.name} systemIndex={system.index} galaxyName={galaxy.name} coordinates={galaxy.coordinates} />

      {effects && onToggleEffect && <EffectsControl effects={effects} onToggleEffect={onToggleEffect} />}

      {/* Arecibo Modal */}
      {planet.life_forms !== "None" && <AreciboModal isOpen={showAreciboModal} onClose={() => setShowAreciboModal(false)} lifeForm={planet.life_forms} planetName={planet.name} />}

      {combatKey && <CombatPanel planetKey={combatKey} coordinates={galaxy.coordinates.join(",")} onClose={() => setCombatKey(null)} />}
    </div>
  );
};

export default PlanetInfo;

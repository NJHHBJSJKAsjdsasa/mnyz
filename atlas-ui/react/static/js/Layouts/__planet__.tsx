// atlas-ui/react/static/js/Layouts/__planet__.tsx
import React, { useState, useEffect } from "react";
import Header from "../Components/Header.tsx";
import PlanetInfo from "../Components/PlanetInfo.tsx";
import PlanetVisualization from "../Components/PlanetVisualization.tsx";
import PlanetVisualizationUniversal from "../Components/PlanetVisualizationUniversal.tsx";
import PlanetNavigation from "../Components/PlanetNavigation.tsx";
import VersionFooter from "../Components/VersionFooter.tsx";
import SpaceshipPanel from "../Components/SpaceshipPanel.tsx";
import TreasureChest from "../Components/TreasureChest.tsx";
import FuelBars from "../Components/FuelBars.tsx";
import MultiverseBanner from "../Components/MultiverseBanner.jsx";
import TaskPanel from "../Components/TaskPanel.tsx";
import { markPlanetAsVisited, markSystemAsVisited } from "../Utils/VisitHistory.tsx";
import { debugConfig } from "../Utils/DebugConfig.tsx";
import { useAtlasKeySequence } from "../Hooks/useAtlasKeySequence.tsx";
import DidYouKnow from "../Components/DidYouKnow.tsx";
import ExplorationLab from "../Components/ExplorationLab.tsx";
import SystemIcon from "../Icons/SystemIcon.tsx";
import GalaxyIcon from "../Icons/GalaxyIcon.tsx";
import CoordinatesIcon from "../Icons/CoordinatesIcon.tsx";

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
  initial_orbital_angle?: number;
}

interface System {
  name: string;
  index: number;
  planets?: Array<{
    name: string;
  }>;
}

interface Galaxy {
  name: string;
  coordinates: number[];
}

interface PlanetLayoutProps {
  planet: Planet;
  system: System;
  galaxy: Galaxy;
  planet_url: string;
  version: string;
  image_url?: string;
  cosmic_origin_time: number;
  initial_angle_rotation: number;
}

const PlanetLayout: React.FC<PlanetLayoutProps> = ({ planet, system, galaxy, planet_url, version, image_url, cosmic_origin_time, initial_angle_rotation }) => {
  const [coordinates] = useState<string>(galaxy.coordinates.join(","));
  const [effects, setEffects] = useState<any[]>([]);
  const [effectsControlEnabled, setEffectsControlEnabled] = useState(debugConfig.ENABLE_EFFECTS_CONTROL);
  const [selectedMoon, setSelectedMoon] = useState<any | null>(null);

  useAtlasKeySequence();

  const handleEffectsCreated = (newEffects: any[]) => {
    setEffects(newEffects);
  };

  const handleToggleEffect = (effectId: string, enabled: boolean) => {
    setEffects((prev) => prev.map((e) => (e.id === effectId ? { ...e, enabled } : e)));
  };

  const handleMoonSelected = (moon: any | null) => {
    setSelectedMoon(moon);
  };

  useEffect(() => {
    document.body.setAttribute("data-coordinates", coordinates);
    document.body.setAttribute("data-system-index", system.index.toString());
    document.body.setAttribute("data-planet-name", planet.name.toLowerCase());

    markPlanetAsVisited(coordinates, system.index, planet.name, system.planets || []);
    markSystemAsVisited(coordinates, system.index);
  }, [coordinates, system.index, planet.name]);

  useEffect(() => {
    const handleConfigChange = () => {
      setEffectsControlEnabled(debugConfig.ENABLE_EFFECTS_CONTROL);
    };

    debugConfig.addListener(handleConfigChange);

    return () => {
      debugConfig.removeListener(handleConfigChange);
    };
  }, []);

  const formatPlanetName = (name: string) => {
    return name.replace(/_/g, " ");
  };

  const formatSystemName = (name: string) => {
    return name.replace(/_/g, " ");
  };

  const formatGalaxyName = (name: string) => {
    return name.replace(/_/g, " ");
  };

  return (
    <>
      <MultiverseBanner />
      <div className="w-full min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white flex flex-col">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.1'%3E%3Ccircle cx='30' cy='30' r='1'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        ></div>

        <FuelBars />

        <div className="relative z-10 pt-1 flex-1 flex flex-col">
          <Header />

          <div className="w-full px-2 sm:px-4 lg:px-6 py-4 sm:py-8 flex-1">
            <div className="text-center mb-2">
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-2">行星 '{formatPlanetName(planet.name)}'</h1>
              <p className="text-[10px] sm:text-xs text-gray-300 flex items-center justify-center gap-x-4 gap-y-1 flex-wrap">
                <span className="flex items-center gap-1">
                  <SystemIcon size={15} color="#ffffffff" />
                  {formatSystemName(system.name)}
                </span>
                <span className="flex items-center gap-1">
                  <GalaxyIcon size={15} color="#ffffffff" />
                  {formatGalaxyName(galaxy.name)}
                </span>
                <span className="flex items-center gap-1">
                  <CoordinatesIcon size={15} color="#ffffffff" />
                  {galaxy.coordinates.join(", ")}
                </span>
              </p>
            </div>

            <PlanetNavigation currentPlanet={planet.name} system={system} galaxy={galaxy} systemPlanets={system.planets || []} />

            <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 mb-8 shadow-2xl p-4 sm:p-6">
              <div className="flex flex-col lg:grid lg:grid-cols-[400px_1fr] gap-6 lg:gap-8 relative">
                <div className="order-1 lg:order-1">
                  <PlanetVisualizationUniversal planetUrl={planet_url} planet={{ ...planet, name: formatPlanetName(planet.name) }} cosmicOriginTime={cosmic_origin_time} initialAngleRotation={initial_angle_rotation} onEffectsCreated={handleEffectsCreated} effects={effects} onToggleEffect={handleToggleEffect} onMoonSelected={handleMoonSelected} />
                </div>

                <div className="hidden lg:block absolute left-[416px] top-0 bottom-0 w-1 rounded-full bg-white/10 -translate-x-1.5"></div>

                <div className="order-2 lg:order-2">
                  <PlanetInfo planet={planet} system={system} galaxy={galaxy} cosmicOriginTime={cosmic_origin_time} initialAngleRotation={initial_angle_rotation} effects={effectsControlEnabled ? effects : undefined} onToggleEffect={effectsControlEnabled ? handleToggleEffect : undefined} selectedMoon={selectedMoon} />
                </div>
              </div>
            </div>

            <ExplorationLab planetName={planet.name} planetType={planet.planet_type} systemIndex={system.index} coordinates={coordinates} />

            <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 mb-8 shadow-2xl p-4 sm:p-6 text-center">
              <button onClick={() => (window.location.href = `/system/${system.index}`)} className="w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-gray-600 via-gray-700 to-gray-600 hover:from-gray-700 hover:via-gray-800 hover:to-gray-700 text-white font-bold rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg backdrop-blur-sm">
                <span className="text-base sm:text-lg">← 返回系统 '{formatSystemName(system.name)}'</span>
              </button>
            </div>
          </div>

          <VersionFooter version={version} />
        </div>

        <TreasureChest />
        <SpaceshipPanel
          currentLocation={{
            type: "planet",
            name: planet.name,
            coordinates: galaxy.coordinates.join(","),
            systemIndex: system.index,
            planetName: planet.name,
          }}
        />
        <TaskPanel />
        <DidYouKnow currentView="planet" />
      </div>
    </>
  );
};

export default PlanetLayout;

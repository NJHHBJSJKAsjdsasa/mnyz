// atlas-ui/react/static/js/Layouts/__planet__.tsx — a planet, as a view in the
// shell.
//
// 2026-10-31 (P1 of 16-shell-unification). Same surgery as the other two inner
// pages: own header, own centred title, grey "← 返回系统" button and footer all
// gone; the frame owns the chrome. The rail lists the sibling planets of the
// system (the one you are on is lit), which is the first time this page has had
// any sense of *where* the planet sits.
//
// Behavior preserved verbatim: renderer switch (classic / realistic), the
// effects-control debug switch, moon selection, and the key sequence. Nothing in
// this file touches the renderer itself.

import React, { useEffect, useState } from "react";
import GameFrame from "../Shell/GameFrame.tsx";
import GameTopBar from "../Shell/GameTopBar.tsx";
import Breadcrumb from "../Shell/Breadcrumb.tsx";
import { RailHeading, StageHeading } from "../Shell/StageHeading.tsx";
import RailSearch from "../Shell/RailSearch.tsx";
import BackLinks from "../Shell/BackLinks.tsx";
import ModelHover from "../Components/ModelHover.tsx";
import { matchesPlanet, normalizeQuery } from "../Shell/railFilter.ts";
import InfoDrawer from "../Shell/InfoDrawer.tsx";
import PlanetInfo from "../Components/PlanetInfo.tsx";
import PlanetVisualizationUniversal from "../Components/PlanetVisualizationUniversal.tsx";
import RealisticPlanetStage from "../Components/RealisticPlanetStage.tsx";
import PlanetNavigation from "../Components/PlanetNavigation.tsx";
import PlanetsList from "../Components/PlanetsList.tsx";
import SpaceshipPanel from "../Components/SpaceshipPanel.tsx";
import TreasureChest from "../Components/TreasureChest.tsx";
import FuelBars from "../Components/FuelBars.tsx";
import MultiverseBanner from "../Components/MultiverseBanner.jsx";
import TaskPanel from "../Components/TaskPanel.tsx";
import { markPlanetAsVisited, markSystemAsVisited } from "../Utils/VisitHistory.tsx";
import { debugConfig } from "../Utils/DebugConfig.tsx";
import { readRenderer, writeRenderer } from "../Utils/RendererFlag.tsx";
import { useAtlasKeySequence } from "../Hooks/useAtlasKeySequence.tsx";
import DidYouKnow from "../Components/DidYouKnow.tsx";
import ExplorationLab from "../Components/ExplorationLab.tsx";
import EconomyShell from "../economy/EconomyShell.tsx";
import { AuthButton } from "../Components/ServerAuthPanel.tsx";
import { UniverseDetection } from "../Utils/UniverseDetection.tsx";
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
  planets?: Array<{ name: string }>;
}

interface Galaxy {
  name: string;
  coordinates: number[];
}

export interface PlanetLayoutProps {
  planet: Planet;
  system: System;
  galaxy: Galaxy;
  planet_url: string;
  version: string;
  image_url?: string;
  cosmic_origin_time: number;
  initial_angle_rotation: number;
}

const formatName = (name: string) => name.replace(/_/g, " ");

const PlanetLayout: React.FC<PlanetLayoutProps> = ({
  planet,
  system,
  galaxy,
  planet_url,
  version,
  cosmic_origin_time,
  initial_angle_rotation,
}) => {
  const [coordinates] = useState<string>(galaxy.coordinates.join(","));
  const [isRemoteUniverse] = useState(() => UniverseDetection.isRemoteUniverse());
  const [effects, setEffects] = useState<any[]>([]);
  const [effectsControlEnabled, setEffectsControlEnabled] = useState(debugConfig.ENABLE_EFFECTS_CONTROL);
  const [selectedMoon, setSelectedMoon] = useState<any | null>(null);
  // 3.0 realistic renderer is opt-in until step 4 perf sign-off (docs/render-transplant §8).
  const [renderer] = useState(() => readRenderer());
  const [query, setQuery] = useState("");

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

  const needle = normalizeQuery(query);
  const siblings = system.planets || [];
  const matched = needle ? siblings.filter((item) => matchesPlanet(item, needle)).length : siblings.length;
  const [x, y, z] = galaxy.coordinates;

  return (
    <>
      <MultiverseBanner />
      <FuelBars />

      <GameFrame
        topbar={
          <GameTopBar
            coordinates={{ x, y, z }}
            isRemoteUniverse={isRemoteUniverse}
            version={version}
            trail={
              <Breadcrumb
                items={[
                  { label: formatName(galaxy.name), href: "/galaxy" },
                  { label: formatName(system.name), href: `/system/${system.index}` },
                  { label: formatName(planet.name) },
                ]}
              />
            }
            trailing={<AuthButton />}
          />
        }
        rail={
          <>
            <RailHeading label="行星" count={siblings.length} />
            {siblings.length > 6 ? (
              <RailSearch
                value={query}
                onChange={setQuery}
                placeholder="搜索行星…"
                matched={needle ? matched : undefined}
                total={siblings.length}
              />
            ) : null}
            <PlanetsList
              planets={siblings}
              coordinates={coordinates}
              systemIndex={system.index}
              activeName={planet.name}
              query={query}
            />
          </>
        }
        stageRows="1fr"
        stage={
          <section
            className="atlas-hud hud-corners"
            style={{ position: "relative", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}
          >
            <StageHeading
              kicker="PLANET"
              title={formatName(planet.name)}
              leading={
                <BackLinks
                  items={[
                    {
                      label: "返回",
                      icon: "‹",
                      href: `/system/${system.index}`,
                      title: `返回 ${formatName(system.name)}`,
                    },
                    {
                      label: "星系",
                      icon: "‹‹",
                      href: "/galaxy",
                      title: `返回星系 ${formatName(galaxy.name)}`,
                    },
                  ]}
                />
              }
              meta={
                <>
                  <SystemIcon size={11} color="currentColor" />
                  {formatName(system.name)}
                  <span aria-hidden style={{ width: 1, height: 9, background: "var(--atlas-line-strong)" }} />
                  <GalaxyIcon size={11} color="currentColor" />
                  {formatName(galaxy.name)}
                  <span aria-hidden style={{ width: 1, height: 9, background: "var(--atlas-line-strong)" }} />
                  <CoordinatesIcon size={11} color="currentColor" />
                  {galaxy.coordinates.join(", ")}
                </>
              }
            >
              <PlanetNavigation
                currentPlanet={planet.name}
                system={system}
                galaxy={galaxy}
                systemPlanets={system.planets || []}
              />
            </StageHeading>

            <div style={{ position: "relative", flex: 1, minHeight: 0, marginRight: 34 }}>  {/* 34px is the collapsed drawer spine. Reserved as margin so the 3D view's
      own corner controls (speed buttons, expand, download) are not covered. It is
      a fixed reserve, not conditional on the drawer state: changing it would resize
      the canvas, and the renderers only listen for window resizes.
      `margin`, not `padding`: absolutely positioned children resolve against the
      padding box, so padding would leave them sitting *under* the spine. */}
              {renderer === "realistic" ? (
                <RealisticPlanetStage
                  planet={{
                    name: planet.name,
                    planet_type: planet.planet_type,
                    atmosphere: planet.atmosphere,
                    life_forms: planet.life_forms,
                    surface_temperature: planet.surface_temperature,
                    rotation_period_seconds: planet.rotation_period_seconds,
                  }}
                  seedKey={planet.name}
                  cosmicOriginTime={cosmic_origin_time}
                  height="100%"
                />
              ) : (
                <PlanetVisualizationUniversal
                  fill
                  planetUrl={planet_url}
                  planet={{ ...planet, name: formatName(planet.name) }}
                  cosmicOriginTime={cosmic_origin_time}
                  initialAngleRotation={initial_angle_rotation}
                  onEffectsCreated={handleEffectsCreated}
                  effects={effects}
                  onToggleEffect={handleToggleEffect}
                  onMoonSelected={handleMoonSelected}
                />
              )}
              {/* Station preview: hover the chip, the mesh loads on first use. */}
              <div style={{ position: "absolute", left: 10, bottom: 10, zIndex: 6 }}>
                <ModelHover url="/static/models/station.glb" label="轨道空间站" icon="◈" />
              </div>

              <InfoDrawer
                label="行星档案"
                width={440}
                tabs={[
                  {
                    id: "info",
                    label: "档案",
                    content: (
                      <>
                        {renderer !== "realistic" ? (
                          <button
                            type="button"
                            onClick={() => writeRenderer("realistic")}
                            className="mb-2 text-xs text-cyan-300/70 hover:text-cyan-200 transition-colors"
                            title="试用 3.0 真实渲染（可随时切回）"
                          >
                            试用真实渲染 →
                          </button>
                        ) : null}
                        <PlanetInfo
                          planet={planet}
                          system={system}
                          galaxy={galaxy}
                          cosmicOriginTime={cosmic_origin_time}
                          initialAngleRotation={initial_angle_rotation}
                          effects={effectsControlEnabled ? effects : undefined}
                          onToggleEffect={effectsControlEnabled ? handleToggleEffect : undefined}
                          selectedMoon={selectedMoon}
                        />
                      </>
                    ),
                  },
                  {
                    id: "lab",
                    label: "实验舱",
                    // The lab was a full-width panel under the planet, and it is tall:
                    // twelve tool tabs plus whatever tab is open. Under the planet it
                    // ate 46% of the stage and squeezed the planet into a strip. It is
                    // an action surface, so it belongs beside the thing, one click away.
                    content: (
                      <ExplorationLab
                        embedded
                        planetName={planet.name}
                        planetType={planet.planet_type}
                        systemIndex={system.index}
                        coordinates={coordinates}
                      />
                    ),
                  },
                ]}
              />
            </div>
          </section>
        }
        dock={<EconomyShell />}
      />

      <TreasureChest />
      <SpaceshipPanel
        currentLocation={{
          type: "planet",
          name: planet.name,
          coordinates,
          systemIndex: system.index,
          planetName: planet.name,
        }}
      />
      <TaskPanel />
      <DidYouKnow currentView="planet" />
    </>
  );
};

export default PlanetLayout;

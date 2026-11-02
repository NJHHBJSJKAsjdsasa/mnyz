// atlas-ui/react/static/js/Layouts/__system__.tsx — a star system, as a view in
// the shell.
//
// 2026-10-31 (P1 of 16-shell-unification). Same surgery as `__galaxy__`: the
// page drew its own header, its own centred title, a full-width panel, a card
// grid of planets and a grey "← 返回星系" button. The planet list is now the
// rail's content (planets are the children of a system), the stage is the system.
//
// `PlanetsList` gets `activeName` support but this view passes nothing: you are
// looking at the system, not at one of its planets. The planet view uses it.

import React, { useEffect, useState } from "react";
import GameFrame from "../Shell/GameFrame.tsx";
import GameTopBar from "../Shell/GameTopBar.tsx";
import Breadcrumb from "../Shell/Breadcrumb.tsx";
import { RailHeading, StageHeading } from "../Shell/StageHeading.tsx";
import RailSearch from "../Shell/RailSearch.tsx";
import BackLinks from "../Shell/BackLinks.tsx";
import { matchesPlanet, normalizeQuery } from "../Shell/railFilter.ts";
import InfoDrawer from "../Shell/InfoDrawer.tsx";
import SystemInfo from "../Components/SystemInfo.tsx";
import SystemVisualizationUniversal from "../Components/SystemVisualizationUniversal.tsx";
import PlanetsList from "../Components/PlanetsList.tsx";
import SystemNavigation from "../Components/SystemNavigation.tsx";
import SpaceshipPanel from "../Components/SpaceshipPanel.tsx";
import TreasureChest from "../Components/TreasureChest.tsx";
import FuelBars from "../Components/FuelBars.tsx";
import MultiverseBanner from "../Components/MultiverseBanner.jsx";
import TaskPanel from "../Components/TaskPanel.tsx";
import DidYouKnow from "../Components/DidYouKnow.tsx";
import EconomyShell from "../economy/EconomyShell.tsx";
import { AuthButton } from "../Components/ServerAuthPanel.tsx";
import { UniverseDetection } from "../Utils/UniverseDetection.tsx";
import { markSystemAsVisited } from "../Utils/VisitHistory.tsx";
import GalaxyIcon from "../Icons/GalaxyIcon.tsx";
import CoordinatesIcon from "../Icons/CoordinatesIcon.tsx";

interface Planet {
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
}

interface System {
  name: string;
  index: number;
  star_system_type: string;
  num_planets: number;
  stars: Array<{ Type: string; Size: string; Color: string }>;
  planets: Planet[];
}

interface Galaxy {
  name: string;
  coordinates: number[];
}

export interface SystemLayoutProps {
  system: System;
  galaxy: Galaxy;
  system_url: string;
  version: string;
  system_index: number;
  image_url?: string;
  page: number;
  cosmic_origin_time: number;
}

const formatName = (name: string) => name.replace(/_/g, " ");

const SystemLayout: React.FC<SystemLayoutProps> = ({
  system,
  galaxy,
  system_url,
  version,
  system_index,
  page,
  cosmic_origin_time,
}) => {
  const [coordinates] = useState<string>(galaxy.coordinates.join(","));
  const [isRemoteUniverse] = useState(() => UniverseDetection.isRemoteUniverse());
  const [query, setQuery] = useState("");

  useEffect(() => {
    setQuery("");
  }, [system_index]);

  useEffect(() => {
    document.body.setAttribute("data-coordinates", coordinates);
    document.body.setAttribute("data-system-index", system_index.toString());
    markSystemAsVisited(coordinates, system_index);
  }, [coordinates, system_index]);

  const needle = normalizeQuery(query);
  const planets = system.planets || [];
  const matched = needle ? planets.filter((planet) => matchesPlanet(planet, needle)).length : planets.length;
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
                  { label: formatName(galaxy.name), href: `/galaxy/${page}` },
                  { label: formatName(system.name) },
                ]}
              />
            }
            trailing={<AuthButton />}
          />
        }
        rail={
          <>
            <RailHeading label="行星" count={planets.length || system.num_planets} />
            {planets.length > 6 ? (
              <RailSearch
                value={query}
                onChange={setQuery}
                placeholder="搜索行星…"
                matched={needle ? matched : undefined}
                total={planets.length}
              />
            ) : null}
            <PlanetsList planets={planets} coordinates={coordinates} systemIndex={system_index} query={query} />
          </>
        }
        stageRows="1fr"
        stage={
          <section
            className="atlas-hud hud-corners"
            style={{ position: "relative", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}
          >
            <StageHeading
              kicker="SYSTEM"
              title={formatName(system.name)}
              leading={
                <BackLinks
                  items={[
                    { label: "星系", icon: "‹", href: "/galaxy", title: `返回星系 ${formatName(galaxy.name)}` },
                  ]}
                />
              }
              meta={
                <>
                  <GalaxyIcon size={11} color="currentColor" />
                  {formatName(galaxy.name)}
                  <span aria-hidden style={{ width: 1, height: 9, background: "var(--atlas-line-strong)" }} />
                  <CoordinatesIcon size={11} color="currentColor" />
                  {galaxy.coordinates.join(", ")}
                </>
              }
            >
              <SystemNavigation currentSystem={{ name: system.name, index: system_index }} galaxy={galaxy} />
            </StageHeading>

            <div style={{ position: "relative", flex: 1, minHeight: 0, marginRight: 34 }}>  {/* 34px is the collapsed drawer spine. Reserved as margin so the 3D view's
      own corner controls (speed buttons, expand, download) are not covered. It is
      a fixed reserve, not conditional on the drawer state: changing it would resize
      the canvas, and the renderers only listen for window resizes.
      `margin`, not `padding`: absolutely positioned children resolve against the
      padding box, so padding would leave them sitting *under* the spine. */}
              <SystemVisualizationUniversal fill systemUrl={system_url} system={system} cosmicOriginTime={cosmic_origin_time} />
              <InfoDrawer label="恒星系档案">
                <SystemInfo system={system} galaxy={galaxy} systemIndex={system_index} cosmicOriginTime={cosmic_origin_time} />
              </InfoDrawer>
            </div>
          </section>
        }
        dock={<EconomyShell />}
      />

      <TreasureChest />
      <SpaceshipPanel
        currentLocation={{ type: "system", name: system.name, coordinates, systemIndex: system.index }}
      />
      <TaskPanel />
      <DidYouKnow currentView="system" />
    </>
  );
};

export default SystemLayout;

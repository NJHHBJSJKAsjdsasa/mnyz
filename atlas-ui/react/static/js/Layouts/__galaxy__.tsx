// atlas-ui/react/static/js/Layouts/__galaxy__.tsx — a galaxy, as a view inside
// the shell.
//
// 2026-10-31 (P1 of docs/frontend-redesign/16-shell-unification.md). What this
// replaces: a document-flow page with its own `Header`, a 90px centred title
// block, a full-width panel, a card-grid list, a 7-button pager and a giant grey
// "← 返回行星索引" button at the bottom. Changing level cost a full reload and the
// screen changed shape on arrival.
//
// Now the frame supplies the top bar, the rail and the dock; this file only says
// what goes in each slot. The system list moved into the rail — it is the
// children of *this* galaxy — so the stage is the galaxy itself.
//
// Deliberately left alone: the two-column panel with `GalaxyVisualization` +
// `GalaxyInfo`. Collapsing the info panel into a corner card is P1b; it has to
// keep its mining / bookmark interactions alive and that is a separate change.

import React, { useEffect, useState } from "react";
import GameFrame from "../Shell/GameFrame.tsx";
import GameTopBar from "../Shell/GameTopBar.tsx";
import Breadcrumb from "../Shell/Breadcrumb.tsx";
import RailPager from "../Shell/RailPager.tsx";
import RailSearch from "../Shell/RailSearch.tsx";
import RailNote from "../Shell/RailNote.tsx";
import ModelHover from "../Components/ModelHover.tsx";
import { MIN_QUERY_LENGTH, searchSystems, type SystemSearchResult } from "../Utils/universeSearch.ts";
import { RailHeading, StageHeading } from "../Shell/StageHeading.tsx";
import InfoDrawer from "../Shell/InfoDrawer.tsx";
import GalaxyInfo from "../Components/GalaxyInfo.tsx";
import GalaxyVisualization from "../Components/GalaxyVisualization.tsx";
import GalaxyNavigation from "../Components/GalaxyNavigation.tsx";
import SystemsList from "../Components/SystemsList.tsx";
import SpaceshipPanel from "../Components/SpaceshipPanel.tsx";
import TreasureChest from "../Components/TreasureChest.tsx";
import FuelBars from "../Components/FuelBars.tsx";
import MultiverseBanner from "../Components/MultiverseBanner.jsx";
import TaskPanel from "../Components/TaskPanel.tsx";
import DidYouKnow from "../Components/DidYouKnow.tsx";
import EconomyShell from "../economy/EconomyShell.tsx";
import { AuthButton } from "../Components/ServerAuthPanel.tsx";
import { UniverseDetection } from "../Utils/UniverseDetection.tsx";
import { markGalaxyAsVisited } from "../Utils/VisitHistory.tsx";
import CoordinatesIcon from "../Icons/CoordinatesIcon.tsx";

interface Galaxy {
  name: string;
  coordinates: number[];
  galaxy_type: string;
  num_systems: number;
  black_holes: number;
  pulsars: number;
  quasars: number;
  seed: number;
}

interface System {
  index: number;
  number: number;
  name: string;
}

export interface GalaxyLayoutProps {
  galaxy: Galaxy;
  systems: System[];
  galaxy_url: string;
  version: string;
  page: number;
  prev_page?: number;
  next_page?: number;
  finish: number;
  image_url?: string;
}

const formatGalaxyName = (name: string) => name.replace(/_/g, " ");

const GalaxyLayout: React.FC<GalaxyLayoutProps> = ({ galaxy, systems, galaxy_url, version, page, finish }) => {
  const [coordinates] = useState<string>(galaxy.coordinates.join(","));
  const [isRemoteUniverse] = useState(() => UniverseDetection.isRemoteUniverse());
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SystemSearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const coordsKey = galaxy.coordinates.join(",");

  useEffect(() => {
    // A new page of systems means the old query no longer describes what is on
    // screen; keeping it silently hides rows the player never filtered out.
    setQuery("");
    setHits(null);
  }, [page]);

  // Debounced, and the search covers the whole galaxy rather than the 150 rows on
  // this page — that is the difference between "filter" and "find".
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setHits(null);
      setSearching(false);
      return;
    }

    let alive = true;
    setSearching(true);
    const timer = setTimeout(() => {
      searchSystems(galaxy.coordinates, trimmed)
        .then((result) => {
          if (alive) setHits(result);
        })
        .catch(() => {
          if (alive) setHits(null);
        })
        .finally(() => {
          if (alive) setSearching(false);
        });
    }, 240);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, coordsKey]);

  useEffect(() => {
    document.body.setAttribute("data-coordinates", coordinates);
    markGalaxyAsVisited(coordinates);
  }, [coordinates]);


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
            trail={<Breadcrumb items={[{ label: formatGalaxyName(galaxy.name) }]} />}
            trailing={<AuthButton />}
          />
        }
        rail={
          <>
            <RailHeading label="系统" count={galaxy.num_systems} />
            <RailSearch
              value={query}
              onChange={setQuery}
              placeholder="搜索全星系（名称或 #编号）…"
              busy={searching}
              matched={hits?.matched}
              total={hits?.total}
            />
            {hits ? (
              hits.systems.length > 0 ? (
                <>
                  <SystemsList systems={hits.systems} coordinates={coordinates} />
                  <RailNote
                    title={`${hits.matched} 个匹配`}
                    detail={
                      hits.complete
                        ? `已扫描全部 ${hits.scanned.toLocaleString()} 个系统`
                        : `扫描了其中 ${hits.scanned.toLocaleString()} 个，结果可能不全`
                    }
                  />
                </>
              ) : (
                <RailNote
                  tone="warn"
                  title="本星系没有匹配"
                  detail={
                    searching
                      ? "搜索中…"
                      : hits.complete
                        ? `已扫描全部 ${hits.scanned.toLocaleString()} 个系统`
                        : `只扫描了 ${hits.scanned.toLocaleString()} / ${hits.total.toLocaleString()}，换个更常见的词试试`
                  }
                />
              )
            ) : (
              <>
                <SystemsList systems={systems} coordinates={coordinates} />
                <RailPager page={page} finish={finish} hrefFor={(target) => `/galaxy/${target}`} label="系统" />
              </>
            )}
          </>
        }
        stageRows="1fr"
        stage={
          <section
            className="atlas-hud hud-corners"
            style={{ position: "relative", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}
          >
            <StageHeading
              kicker="GALAXY"
              title={formatGalaxyName(galaxy.name)}
              meta={
                <>
                  <CoordinatesIcon size={11} color="currentColor" />
                  {galaxy.coordinates.join(", ")}
                </>
              }
            >
              <GalaxyNavigation currentGalaxy={galaxy} />
            </StageHeading>

            {/* Stage: the galaxy fills the area; the readouts float over its right
                edge in a drawer. The 3D canvas is absolutely irrelevant to the
                drawer's width — nothing re-layouts when it opens. */}
            <div style={{ position: "relative", flex: 1, minHeight: 0, marginRight: 34 }}>  {/* 34px is the collapsed drawer spine. Reserved as margin so the 3D view's
      own corner controls (speed buttons, expand, download) are not covered. It is
      a fixed reserve, not conditional on the drawer state: changing it would resize
      the canvas, and the renderers only listen for window resizes.
      `margin`, not `padding`: absolutely positioned children resolve against the
      padding box, so padding would leave them sitting *under* the spine. */}
              <GalaxyVisualization
                fill
                galaxyUrl={galaxy_url}
                galaxyType={galaxy.galaxy_type}
                numSystems={galaxy.num_systems}
                blackHoles={galaxy.black_holes}
                pulsars={galaxy.pulsars}
                quasars={galaxy.quasars}
                galaxyName={formatGalaxyName(galaxy.name)}
                seed={galaxy.seed}
              />
              <div style={{ position: "absolute", left: 10, bottom: 10, zIndex: 6 }}>
                <ModelHover url="/static/models/station.glb" label="星系哨站" icon="◈" />
              </div>

              <InfoDrawer label="星系档案">
                <GalaxyInfo galaxy={galaxy} />
              </InfoDrawer>
            </div>
          </section>
        }
        dock={<EconomyShell />}
      />

      <TreasureChest />
      <SpaceshipPanel currentLocation={{ type: "galaxy", name: galaxy.name, coordinates }} />
      <TaskPanel />
      <DidYouKnow currentView="galaxy" />
    </>
  );
};

export default GalaxyLayout;

// atlas-ui/react/static/js/Layouts/main/HomeScreen.tsx — composition only.
//
// 2026-10-30 (third pass): `HeroPanel` + `Components/CoordinateSelector` were
// replaced by a bridge layout — codex rail, star stage, jump console.
//
// 2026-10-31 (P0 of docs/frontend-redesign/16-shell-unification.md): the 840-line
// file was the page — own top bar, own rail, own `<main>` grid, own content — and
// none of it was reachable from galaxy / system / planet, which is why those
// pages drifted into document-flow websites. It is now four slots in `GameFrame`:
//
//   GameTopBar  · header, identical on every page from P1 on
//   UniverseRail· rail content — in P1 the rail becomes "children of where you are"
//   UniverseStage· the star map + jump console
//   EconomyShell· the fixed dock, mounted here so it survives view changes
//
// Add nothing else to this file. A page that needs a new region needs a new slot
// in `GameFrame`, otherwise the frames diverge again.

import React from "react";
import EconomyShell from "../../economy/EconomyShell.tsx";
import GameFrame from "../../Shell/GameFrame.tsx";
import GameTopBar from "../../Shell/GameTopBar.tsx";
import UniverseRail from "./UniverseRail.tsx";
import UniverseStage from "./UniverseStage.tsx";
import type { Coordinates } from "./format.ts";
import type { UniverseConfig } from "./useUniverseBootstrap.ts";

export interface HomeScreenProps {
  isRemoteUniverse: boolean;
  universeConfig: UniverseConfig | null;
  universeAge: string;
  universeDevelopment: string;
  showNavigationText: boolean;
  show3DViewer: boolean;
  coordinates: Coordinates;
  on3DUserInteraction: (isInteracting: boolean) => void;
  onCoordinatesChange: (next: Coordinates) => void;
  travelCost?: { antimatter?: number | string; element115?: number | string; deuterium?: number | string } | null;
  canAfford: boolean;
  /** Drive is charging; the launch button stays down until the page hands over. */
  busy?: boolean;
  efficiency?: number;
  range?: number;
  inRange?: boolean;
  onSubmit: () => void;
  error: string | null;
  version: string;
  trailing?: React.ReactNode;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  isRemoteUniverse,
  universeConfig,
  universeAge,
  universeDevelopment,
  show3DViewer,
  coordinates,
  onCoordinatesChange,
  travelCost,
  canAfford,
  busy,
  efficiency,
  range,
  inRange,
  onSubmit,
  error,
  version,
  trailing,
}) => (
  <GameFrame
    topbar={
      <GameTopBar coordinates={coordinates} isRemoteUniverse={isRemoteUniverse} version={version} trailing={trailing} />
    }
    rail={
      <UniverseRail
        universeConfig={universeConfig}
        universeAge={universeAge}
        universeDevelopment={universeDevelopment}
        isRemoteUniverse={isRemoteUniverse}
      />
    }
    stage={
      <UniverseStage
        isRemoteUniverse={isRemoteUniverse}
        show3DViewer={show3DViewer}
        coordinates={coordinates}
        onCoordinatesChange={onCoordinatesChange}
        travelCost={travelCost}
        canAfford={canAfford}
        busy={busy}
        efficiency={efficiency}
        range={range}
        inRange={inRange}
        onSubmit={onSubmit}
        error={error}
      />
    }
    dock={<EconomyShell />}
  />
);

export default HomeScreen;

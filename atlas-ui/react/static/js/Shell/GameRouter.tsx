// atlas-ui/react/static/js/Shell/GameRouter.tsx — one React tree, three views.
//
// 2026-10-31 (P2 of 16-shell-unification). Each game page used to own a
// `createRoot` and render exactly one layout, so the only way to change level was
// to load another document. This component holds the tree instead: the initial
// view comes from the document the server rendered, and `navigate()` swaps it in
// place. The mounts below it stay identical — `GameFrame`, the economy dock, its
// `ShellProvider` state and the 3D canvas container survive the change.
//
// No `key` on the layouts. Moving system 3 → system 4 must reuse the same
// component instance so the renderer can keep its runtime (see 16 §3.3); the
// layouts already rebuild their content when props change. Changing *kind*
// unmounts naturally because the element type is different.

import React, { useEffect, useState } from "react";
import GalaxyLayout from "../Layouts/__galaxy__.tsx";
import SystemLayout from "../Layouts/__system__.tsx";
import PlanetLayout from "../Layouts/__planet__.tsx";
import { subscribe, startHistorySync } from "../Utils/PageNavigation.ts";
import type { GameView } from "./viewData.ts";

export interface GameRouterProps {
  initial: GameView;
}

const GameRouter: React.FC<GameRouterProps> = ({ initial }) => {
  const [view, setView] = useState<GameView>(initial);

  useEffect(() => {
    const stopNavigate = subscribe(setView);
    const stopHistory = startHistorySync();
    return () => {
      stopNavigate();
      stopHistory();
    };
  }, []);

  switch (view.kind) {
    case "galaxy":
      return <GalaxyLayout {...view.props} />;
    case "system":
      return <SystemLayout {...view.props} />;
    case "planet":
      return <PlanetLayout {...view.props} />;
    default:
      return null;
  }
};

export default GameRouter;

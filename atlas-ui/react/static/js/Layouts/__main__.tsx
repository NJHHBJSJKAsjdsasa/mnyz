// atlas-ui/react/static/js/Layouts/__main__.tsx — composition only.
//
// 2026-10-29: split into hooks (`useUniverseBootstrap` / `useCosmicClock` /
// `useTravelCost` / `useViewerStage`) + `HeroPanel`.
// 2026-10-30 (third pass): `HeroPanel` and `Components/CoordinateSelector` are
// **gone**, replaced by `main/HomeScreen.tsx` — a bridge layout with a codex
// rail, a star stage and a jump console. This file is now purely ordering: hooks
// in, screen out, and the one navigation side effect (fuel quote → POST).

import React, { Suspense, lazy, useCallback, useState } from "react";
import ServerAuthPanel, { AuthButton } from "../Components/ServerAuthPanel.tsx";
import HomeScreen from "./main/HomeScreen.tsx";
import { useCosmicClock } from "./main/useCosmicClock.ts";
import { useTravelCost } from "./main/useTravelCost.ts";
import { useUniverseBootstrap } from "./main/useUniverseBootstrap.ts";
import { useViewerStage } from "./main/useViewerStage.ts";
import { SpaceshipTravelManager } from "../Utils/SpaceshipTravelCosts.tsx";
import { ServerApi } from "../Utils/ServerApi.tsx";
import { toast } from "../ui/Toast.tsx";

const SpaceshipPanel = lazy(() => import("../Components/SpaceshipPanel.tsx"));
const StarfieldWarpReveal = lazy(() => import("../Components/StarfieldWarpReveal.tsx"));
const WarpTunnelFX = lazy(() => import("../Components/WarpTunnelFX.tsx"));
const MultiverseBanner = lazy(() => import("../Components/MultiverseBanner.jsx"));
const TaskPanel = lazy(() => import("../Components/TaskPanel.tsx"));

interface MainLayoutProps {
  error: string | null;
  version: string;
}

const ORIGIN = { x: 1_000_000, y: 1_000_000, z: 1_000_000 };

/** How long the drive charges before the page hands over to `/navigate`. */
const JUMP_WARP_MS = 950;

const MainLayout: React.FC<MainLayoutProps> = ({ error, version }) => {
  const { isRemoteUniverse, universeConfig, seedData, showWarpReveal, finishWarpReveal } = useUniverseBootstrap();
  const { age: universeAge, development: universeDevelopment } = useCosmicClock(universeConfig?.cosmic_origin_time);
  const { coordinates, show3DViewer, showNavigationText, handleCoordinateChange, handle3DUserInteraction } =
    useViewerStage(ORIGIN);
  const { travelCost, canAfford, range, inRange } = useTravelCost(coordinates);
  /** Drive charging: 0 when idle, otherwise the elapsed fraction used for the FX. */
  const [jumping, setJumping] = useState(false);

  /**
   * Depart. `executeTravel` charges the fuel (server quote → commit in server
   * mode) and returns "emergency" when it must not proceed; only then do we hand
   * the coordinates to the server-side navigation route, exactly once.
   *
   * 2026-10-30: the hand-over used to be instantaneous, so pressing 跳跃 looked
   * like a page reload — the one moment in the game that should feel like a jump
   * was the least animated. The tunnel now runs for a beat before the form is
   * posted; the post itself is unchanged (2.x navigates by page load).
   */
  const handleSubmit = useCallback(() => {
    if (jumping) return;

    const distance = Math.floor(
      Math.sqrt(
        Math.pow(coordinates.x - ORIGIN.x, 2) +
          Math.pow(coordinates.y - ORIGIN.y, 2) +
          Math.pow(coordinates.z - ORIGIN.z, 2),
      ),
    );

    // A jump to where you already are is not a jump.
    //
    // The server refuses it ("起点与终点相同") but only after a round trip, and the
    // drive had already started charging — the player paid, saw an error, and
    // stayed put. Reject it here, before anything is spent.
    if (distance <= 0) {
      toast("当前就在起点坐标，请先在跳跃控制台选择目标星系", "warn");
      return;
    }

    // Charge through the ledger, not the local wallet.
    //
    // This used to call `executeTravel`, which only debits `SpaceshipResources` in
    // localStorage. In server mode the next `/state` sync then overwrote that cache
    // from the ledger, so the fuel came back on reload and every jump was free.
    // `chargeTravel` is the async one: it quotes and commits on the server, and
    // only falls back to `executeTravel` when the server is off.
    setJumping(true);

    void (async () => {
      // Watchdog. `jumping` disables the button and swaps its label to
      // "驱动充能…"; if the charge request hangs (slow API, dead network) the
      // player is left with a dead button and no explanation. Give up after 15s
      // and hand control back.
      const guard = window.setTimeout(() => setJumping(false), 15_000);
      // A guest has no ledger to charge, and `chargeTravel` would answer with a
      // 401 and pop the sign-in dialog in their face. They keep the old local
      // debit; a signed-in player goes through quote → commit on the server, so
      // the fuel cannot be restored by reloading.
      const outcome = ServerApi.hasSession()
        ? await SpaceshipTravelManager.chargeTravel(
            "galaxy",
            [ORIGIN.x, ORIGIN.y, ORIGIN.z],
            [coordinates.x, coordinates.y, coordinates.z],
            distance,
          )
        : SpaceshipTravelManager.executeTravel("galaxy", distance);
      window.clearTimeout(guard);
      if (outcome === "emergency") {
        // Fuel refused or the server turned it down; the drive never lights up.
        setJumping(false);
        return;
      }

      const form = document.createElement("form");
      form.method = "POST";
      form.action = "/navigate";
      Object.entries(coordinates).forEach(([key, value]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = value.toString();
        form.appendChild(input);
      });
      document.body.appendChild(form);

      window.setTimeout(() => form.submit(), JUMP_WARP_MS);
    })();
  }, [coordinates, jumping]);

  return (
    <Suspense fallback={null}>
      {showWarpReveal ? <StarfieldWarpReveal seedData={seedData} onComplete={finishWarpReveal} /> : null}
      {showWarpReveal ? <WarpTunnelFX active intensity={0.92} opacity={0.85} /> : null}
      {jumping ? <div className="atlas-jump-veil" aria-hidden /> : null}
      {jumping ? <WarpTunnelFX active intensity={1} streaks={260} opacity={1} className="atlas-jump-warp" /> : null}
      <MultiverseBanner />

      <HomeScreen
        isRemoteUniverse={isRemoteUniverse}
        universeConfig={universeConfig}
        universeAge={universeAge}
        universeDevelopment={universeDevelopment}
        showNavigationText={showNavigationText}
        show3DViewer={show3DViewer}
        coordinates={coordinates}
        on3DUserInteraction={handle3DUserInteraction}
        onCoordinatesChange={(next) => handleCoordinateChange(next)}
        travelCost={travelCost}
        canAfford={canAfford}
        busy={jumping}
        efficiency={SpaceshipTravelManager.getTravelEfficiency()}
        range={range}
        inRange={inRange}
        onSubmit={handleSubmit}
        error={error}
        version={version}
        trailing={<AuthButton />}
      />

      <ServerAuthPanel />
      <SpaceshipPanel />
      <TaskPanel />
      {/* EconomyShell moved into HomeScreen's `dock` slot (P0 of 16-shell-unification):
          the frame owns it so it stays mounted across view changes. */}
    </Suspense>
  );
};

export default MainLayout;

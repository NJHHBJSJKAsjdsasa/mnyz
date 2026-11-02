// atlas-ui/react/static/js/Shell/GameFrame.tsx — the one frame every game page
// lives in.
//
// Why this exists (2026-10-31, P0 of docs/frontend-redesign/16-shell-unification.md):
// the home screen was a single-screen HUD while galaxy / system / planet were
// document-flow websites wearing the same skin. Eight layouts each drew their own
// header, their own page width and their own footer, so the game changed shape
// every time you moved. This file is the shape. Pages supply slot content and
// nothing else — no page may reintroduce its own top bar or its own page padding.
//
// Regions, in DOM order:
//
//   topbar ─────────────────────────────────────────────
//   ┌ rail ┐ ┌ stage ────────────────────────────────┐
//   │      │ │  the ONLY region that changes per view │
//   └──────┘ └────────────────────────────────────────┘
//   status ─────────────────────────────────────────────
//   dock  (fixed, outside flow — see .hud-dock in tokens.css)
//
// The dock is passed in as a node but is *not* laid out by this component: it is
// `position: fixed` and reserves its own width through
// `body:has(.hud-dock) .atlas-page { padding-right: 424px }`. Keeping it inside
// the frame keeps it mounted across view changes, which is the whole point —
// its ShellProvider state must survive navigation.
//
// Frozen: nothing here touches 3D. The stage is a plain scroll container.

import React from "react";

export interface GameFrameProps {
  /** Top bar strip. Must be `GameTopBar` (or a future variant of it). */
  topbar: React.ReactNode;
  /** Left rail content. Container, width and divider are owned by the frame. */
  rail?: React.ReactNode;
  /** Rail width in px. 264 on the universe screen (codex), 232 from P1 on. */
  railWidth?: number;
  /** The view. Everything view-specific goes in here. */
  stage: React.ReactNode;
  /** Grid rows for the stage. Home = `minmax(300px, 1fr) auto` (map + console). */
  stageRows?: string;
  /** Stage padding. Pages that fill the stage edge-to-edge pass `0`. */
  stagePadding?: string;
  /** Bottom status strip. Optional — the home screen keeps its readouts inside the stage. */
  status?: React.ReactNode;
  /** Fixed economy dock. Always mounted, never re-created on view change. */
  dock?: React.ReactNode;
}

const RAIL_MIN = "1px solid rgba(46,230,255,.16)";

const GameFrame: React.FC<GameFrameProps> = ({
  topbar,
  rail,
  railWidth = 264,
  stage,
  stageRows = "minmax(300px, 1fr) auto",
  stagePadding = "16px 20px 20px",
  status,
  dock,
}) => (
  <div
    className="atlas-page atlas-vignette"
    data-shell="game"
    // `height`, not `minHeight`. With min-height the frame has no definite
    // height, so a 150-row rail grows the whole document instead of scrolling
    // inside itself — the stage then stretches to that height and its content
    // floats in a 4500px box. Fixed height makes every region's `minHeight: 0`
    // meaningful, and the regions scroll individually. This is what "one screen"
    // means physically: pages do not get taller, regions do.
    style={{ height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column" }}
  >
    {topbar}

    <div style={{ flex: 1, display: "flex", minHeight: 0, position: "relative", zIndex: 1 }}>
      {rail ? (
        <aside
          className="atlas-scroll"
          data-zone="rail"
          style={{
            width: railWidth,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            padding: 12,
            borderRight: RAIL_MIN,
            background: "linear-gradient(180deg, rgba(46,230,255,.05), transparent 30%), rgba(5,9,18,.72)",
            overflowY: "auto",
            // Required. A flex item's default `min-height: auto` refuses to be
            // shorter than its content, so a 150-row system list stretched the
            // whole frame to 4500px and the stage — stretched to match — left
            // its content floating in a tall empty box. Same reason `main` sets
            // minHeight below.
            minHeight: 0,
          }}
        >
          {rail}
        </aside>
      ) : null}

      <main
        className="atlas-scroll"
        data-zone="stage"
        style={{
          flex: 1,
          minWidth: 0,
          padding: stagePadding,
          display: "grid",
          gap: 12,
          gridTemplateRows: stageRows,
          minHeight: 0,
        }}
      >
        {stage}
      </main>
    </div>

    {status}
    {dock}
  </div>
);

export default GameFrame;

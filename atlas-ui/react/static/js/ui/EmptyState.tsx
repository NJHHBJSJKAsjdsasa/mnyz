// ui/EmptyState.tsx — one empty state for every list/table (05 §5.3).
//
// Game HUD: an empty slot is not a dashed placeholder box, it is a *dead channel*
// — hairline frame, faint grid, corner ticks, a slowly breathing reticle and a
// mono "NO SIGNAL" label. Same component, so all 30+ empty lists change together.

import React from "react";

export interface EmptyStateProps {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ title, hint, action }) => (
  <div
    className="hud-corners"
    style={{
      position: "relative",
      padding: "22px 20px",
      border: "1px solid rgba(46, 230, 255, 0.16)",
      background:
        "repeating-linear-gradient(0deg, transparent 0 23px, rgba(46,230,255,.05) 23px 24px), " +
        "repeating-linear-gradient(90deg, transparent 0 23px, rgba(46,230,255,.05) 23px 24px), " +
        "rgba(4, 6, 15, 0.5)",
      textAlign: "center",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "var(--atlas-2)",
    }}
  >
    <span
      aria-hidden
      style={{
        width: 18,
        height: 18,
        border: "1px solid rgba(46, 230, 255, 0.45)",
        borderRadius: "50%",
        boxShadow: "0 0 12px -4px rgba(46,230,255,.8)",
        // Three cycles, then still.
        //
        // `infinite` here was the single biggest source of perpetual animation in
        // the app: the dock renders one `EmptyState` per blank panel, so fourteen
        // of them breathed out of phase forever — measurable as 14 of the ~24
        // always-running animations on every page. An empty panel does not need to
        // keep announcing itself; three breaths catch the eye and then stop.
        animation: "hud-breathe 2.8s ease-in-out 3",
      }}
    />
    <span
      className="atlas-display"
      style={{
        color: "var(--atlas-n-950)",
        fontSize: "var(--atlas-t-small)",
        letterSpacing: "0.18em",
        textShadow: "0 0 12px rgba(46,230,255,.35)",
      }}
    >
      {title}
    </span>
    {hint ? (
      <span style={{ color: "var(--atlas-n-600)", fontSize: "var(--atlas-t-small)", maxWidth: 420 }}>{hint}</span>
    ) : null}
    {action}
  </div>
);

export default EmptyState;

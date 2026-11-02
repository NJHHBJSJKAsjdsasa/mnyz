// atlas-ui/react/static/js/Shell/GameAtoms.tsx — the readout atoms every HUD
// zone shares.
//
// Extracted from `Layouts/main/HomeScreen.tsx` on 2026-10-31 (P0 of
// docs/frontend-redesign/16-shell-unification.md). The three atoms were local to
// the home screen; the shell needs them too (top bar labels, rail readouts,
// stage status strip), and copying them per page is how the eight layouts drifted
// apart in the first place.
//
// Styling is deliberately *not* parameterised: these three shapes are the visual
// contract of a HUD readout (mono label above a lit tabular value, or an
// inline label/value pair divided by a hairline). If a page needs a different
// shape it is not this atom — do not add a `variant` prop here.

import React from "react";

/** Small letterspaced caps. The one way a HUD says "this is a field name". */
export const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span
    style={{
      fontFamily: "var(--atlas-mono)",
      fontSize: 9.5,
      letterSpacing: "0.22em",
      textTransform: "uppercase",
      color: "var(--atlas-n-600)",
    }}
  >
    {children}
  </span>
);

/**
 * Icon + label + value, left-edged by the value's own tone.
 *
 * `tone` colours both the icon and the left rule, so a rail of readouts reads as
 * a legend without a separate colour key.
 */
export const Readout: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: string;
}> = ({ icon, label, value, tone = "var(--atlas-signal)" }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "6px 9px",
      border: "1px solid rgba(46,230,255,.16)",
      borderLeft: `2px solid ${tone}`,
      background: "linear-gradient(90deg, rgba(46,230,255,.07), transparent 72%)",
    }}
  >
    <span style={{ display: "inline-flex", color: tone, filter: "drop-shadow(0 0 6px currentColor)" }}>{icon}</span>
    <span style={{ display: "grid", gap: 1, minWidth: 0 }}>
      <Label>{label}</Label>
      <span
        className="atlas-tabular"
        style={{
          fontSize: 12,
          color: "var(--atlas-n-950)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={value}
      >
        {value}
      </span>
    </span>
  </div>
);

/** One cell in a stage's bottom strip. Hairline-divided, never boxed. */
export const StatusCell: React.FC<{ label: string; value: string; tone?: string; last?: boolean }> = ({
  label,
  value,
  tone,
  last,
}) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "baseline",
      gap: 6,
      paddingRight: last ? 0 : 12,
      marginRight: last ? 0 : 12,
      borderRight: last ? "none" : "1px solid rgba(46,230,255,.16)",
      whiteSpace: "nowrap",
    }}
  >
    <span>{label}</span>
    <span className="atlas-tabular" style={{ color: tone ?? "var(--atlas-n-800)", letterSpacing: "0.06em" }}>
      {value}
    </span>
  </span>
);

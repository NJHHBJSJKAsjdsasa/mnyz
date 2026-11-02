// ui/Panel.tsx — the structural block every economy panel is built from
// (05 §5.3). Title / hint / actions live in one header so panels cannot invent
// their own heading rhythm.
//
// Game HUD: the header is a lit title bar (gradient strip that fades right) with
// a glowing chevron, the title in display caps and the hint in dull mono. Panels
// are tiles of one deck — inside `.hud-deck` they lose their outer frame and butt
// against each other, so a screen reads as one console rather than a card wall.

import React from "react";

export interface PanelProps {
  title?: React.ReactNode;
  hint?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  padding?: number | string;
  role?: string;
  /** Tint for the title bar: cyan (default), violet or gold. */
  tone?: "cyan" | "violet" | "gold";
}

const ACCENT: Record<NonNullable<PanelProps["tone"]>, string> = {
  cyan: "var(--atlas-signal)",
  violet: "var(--atlas-signal-2)",
  gold: "var(--atlas-info)",
};

export const Panel: React.FC<PanelProps> = ({
  title,
  hint,
  actions,
  children,
  padding = "10px 12px 12px",
  role,
  tone = "cyan",
}) => {
  const accent = ACCENT[tone];
  return (
    <section
      role={role}
      className="atlas-plate"
      style={{
        padding,
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        minWidth: 0,
      }}
    >
      {title || hint || actions ? (
        <header
          className="hud-titlebar"
          data-tone={tone === "violet" ? "violet" : undefined}
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "var(--atlas-2)",
            flexWrap: "wrap",
            margin: "-10px -12px 0",
            padding: "6px 12px 7px",
          }}
        >
          {title ? (
            <h3
              style={{
                margin: 0,
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                fontFamily: "var(--atlas-display)",
                fontSize: 16.5,
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--atlas-n-950)",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 7,
                  height: 11,
                  background: accent,
                  clipPath: "polygon(0 0, 100% 0, 100% 62%, 50% 100%, 0 62%)",
                  boxShadow: `0 0 10px ${accent}`,
                }}
              />
              {title}
            </h3>
          ) : null}
          {hint ? (
            <span
              style={{
                fontFamily: "var(--atlas-mono)",
                fontSize: "var(--atlas-t-micro)",
                letterSpacing: "0.1em",
                color: "var(--atlas-n-600)",
              }}
            >
              {hint}
            </span>
          ) : null}
          {actions ? (
            <span style={{ marginLeft: "auto", display: "flex", gap: "var(--atlas-2)", alignItems: "center" }}>
              {actions}
            </span>
          ) : null}
        </header>
      ) : null}
      {children}
    </section>
  );
};

export default Panel;

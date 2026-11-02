// atlas-ui/react/static/js/Shell/LevelStepper.tsx — the ‹ › pair that moves one
// step within the current level.
//
// 2026-10-31 (P3). Three components drew this: `GalaxyNavigation` in mono small
// caps, `SystemNavigation` in `rounded-lg` with Tailwind blues, `PlanetNavigation`
// in a third style. Same gesture, three looks, on three screens that now share one
// frame.
//
// This is presentation only. The three keep their own business logic — a galaxy
// step is a `POST /navigate` that charges fuel and earns a 950ms warp, a system
// step is a client-side `go()` that charges fuel, a planet step can cross a system
// boundary — because those differences are real. What should not differ is the
// button.

import React from "react";

export interface LevelStepperProps {
  /** What the previous step goes to. `null` disables the button (edge of the world). */
  prevLabel: string | null;
  nextLabel: string | null;
  prevTitle?: string;
  nextTitle?: string;
  onPrev: () => void;
  onNext: () => void;
  /** True while the step is in flight; both buttons lock and the label says so. */
  busy?: boolean;
  /** Muted text between the buttons, e.g. 相邻星系. */
  hint?: string;
  /**
   * Armed state: the first click on a costly step asks for confirmation, and the
   * button turns amber so "confirm" does not look like "go".
   */
  armedPrev?: boolean;
  armedNext?: boolean;
}

const base: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 26,
  padding: "0 9px",
  border: "1px solid var(--atlas-line-strong)",
  background: "rgba(46,230,255,.07)",
  color: "var(--atlas-n-800)",
  fontFamily: "var(--atlas-mono)",
  fontSize: 10,
  letterSpacing: "0.12em",
  cursor: "pointer",
  whiteSpace: "nowrap",
  transition: "background 120ms, border-color 120ms, color 120ms",
};

const disabled: React.CSSProperties = {
  ...base,
  border: "1px solid var(--atlas-line)",
  background: "transparent",
  color: "var(--atlas-n-600)",
  cursor: "not-allowed",
  opacity: 0.55,
};

const LevelStepper: React.FC<LevelStepperProps> = ({
  prevLabel,
  nextLabel,
  prevTitle,
  nextTitle,
  onPrev,
  onNext,
  busy = false,
  hint,
  armedPrev = false,
  armedNext = false,
}) => {
  const armed: React.CSSProperties = {
    ...base,
    border: "1px solid var(--atlas-warn)",
    background: "rgba(255,176,32,.16)",
    color: "var(--atlas-warn)",
  };
  const prevOff = busy || prevLabel === null;
  const nextOff = busy || nextLabel === null;

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button
        type="button"
        onClick={onPrev}
        disabled={prevOff}
        style={prevOff ? disabled : armedPrev ? armed : base}
        title={prevTitle ?? prevLabel ?? ""}
      >
        <span aria-hidden style={{ fontSize: 11, lineHeight: 1 }}>
          ‹
        </span>
        {busy ? "跳跃中…" : (prevLabel ?? "EDGE")}
      </button>

      {hint ? (
        <span
          style={{
            fontFamily: "var(--atlas-mono)",
            fontSize: 9,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            color: "var(--atlas-n-600)",
            whiteSpace: "nowrap",
          }}
        >
          {hint}
        </span>
      ) : null}

      <button
        type="button"
        onClick={onNext}
        disabled={nextOff}
        style={nextOff ? disabled : armedNext ? armed : base}
        title={nextTitle ?? nextLabel ?? ""}
      >
        {busy ? "跳跃中…" : (nextLabel ?? "EDGE")}
        <span aria-hidden style={{ fontSize: 11, lineHeight: 1 }}>
          ›
        </span>
      </button>
    </div>
  );
};

export default LevelStepper;

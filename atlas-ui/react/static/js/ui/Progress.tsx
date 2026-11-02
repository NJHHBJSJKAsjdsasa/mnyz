// ui/Progress.tsx — thin determinate bar. Undefined `value` renders the sweeping
// indeterminate state (atlas-loading-bar), which respects prefers-reduced-motion.

import React from "react";

export interface ProgressProps {
  value?: number;
  max?: number;
  tone?: "signal" | "warn" | "danger" | "up" | "down";
  height?: number;
  label?: string;
}

const TONE_COLOUR: Record<NonNullable<ProgressProps["tone"]>, string> = {
  signal: "var(--atlas-signal)",
  warn: "var(--atlas-warn)",
  danger: "var(--atlas-danger)",
  up: "var(--atlas-up)",
  down: "var(--atlas-down)",
};

export const Progress: React.FC<ProgressProps> = ({ value, max = 100, tone = "signal", height = 4, label }) => {
  const indeterminate = value === undefined;
  const ratio = indeterminate ? 0 : Math.max(0, Math.min(1, value / (max || 1)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={indeterminate ? undefined : value}
      style={{
        position: "relative",
        height,
        width: "100%",
        background: "var(--atlas-plate-2)",
        borderRadius: 0,
        overflow: "hidden",
      }}
    >
      {indeterminate ? (
        <div className="atlas-loading-bar" style={{ position: "absolute", inset: 0 }} />
      ) : (
        <div
          style={{
            width: `${ratio * 100}%`,
            height: "100%",
            background: TONE_COLOUR[tone],
            borderRadius: 0,
            transition: "width 180ms ease",
          }}
        />
      )}
    </div>
  );
};

export default Progress;

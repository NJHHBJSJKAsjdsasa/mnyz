// ui/Badge.tsx — short status text. For ship/world conditions use ui/Status
// instead (09 §3.2): this one is for counts and categories, not state.

import React from "react";

export type BadgeTone = "neutral" | "signal" | "warn" | "danger" | "up" | "down";

const TONE: Record<BadgeTone, { color: string; background: string; border: string }> = {
  neutral: { color: "var(--atlas-n-800)", background: "var(--atlas-plate-2)", border: "var(--atlas-line)" },
  signal: { color: "var(--atlas-signal)", background: "var(--atlas-signal-dim)", border: "var(--atlas-signal)" },
  warn: { color: "var(--atlas-warn)", background: "rgba(243,168,71,0.12)", border: "var(--atlas-warn)" },
  danger: { color: "var(--atlas-danger)", background: "rgba(255,77,79,0.12)", border: "var(--atlas-danger)" },
  up: { color: "var(--atlas-up)", background: "rgba(255,77,79,0.12)", border: "rgba(255,77,79,0.4)" },
  down: { color: "var(--atlas-down)", background: "rgba(47,191,113,0.12)", border: "rgba(47,191,113,0.4)" },
};

export interface BadgeProps {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
  title?: string;
}

export const Badge: React.FC<BadgeProps> = ({ tone = "neutral", children, className, title }) => {
  const palette = TONE[tone];
  return (
    <span
      title={title}
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        height: 17,
        padding: "0 5px",
        borderRadius: 0,
        border: "none",
        borderLeft: `2px solid ${palette.border}`,
        background: palette.background,
        color: palette.color,
        fontFamily: "var(--atlas-mono)",
        fontSize: "var(--atlas-t-micro)",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
};

export default Badge;

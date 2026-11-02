// atlas-ui/react/static/js/Components/fuel/FuelBar.tsx
// One segment of the top resource strip.
//
// Amber Cockpit (2026-10-30): a telemetry strip, not a light show. Flat accent
// fill, 1px hairline track, mono numerals, and no animation except the `LOW`
// label (which is information, not decoration). Three `animate-pulse` loops and
// a shimmer sweep were removed — twelve bars pulsing at once was the loudest
// thing on the page.

import React from "react";
import { formatResource } from "../../Utils/format.ts";
import type { FuelBarSpec } from "./resourceConfig.tsx";

export interface FuelBarProps {
  spec: FuelBarSpec;
  value: number;
  maxStorage: number;
  expanded: boolean;
  hovered: boolean;
  onHover: (name: string | null) => void;
}

export const FuelBar: React.FC<FuelBarProps> = ({ spec, value, maxStorage, expanded, hovered, onHover }) => {
  const percentage = Math.max(0, Math.min((value / maxStorage) * 100, 100));
  const isHovered = hovered;
  const isCritical = percentage < 20;
  const isAlmostFull = percentage > 90;
  const accent = isCritical ? "var(--atlas-danger)" : spec.accent;

  return (
    <div
      className="flex-1 relative overflow-hidden"
      onMouseEnter={() => onHover(spec.name)}
      onMouseLeave={() => onHover(null)}
      style={{
        background: "var(--atlas-deep)",
        boxShadow: isHovered ? "inset 0 0 0 1px var(--atlas-signal)" : "inset 0 0 0 1px var(--atlas-line)",
      }}
    >
      <div
        className="absolute left-0 top-0 bottom-0 transition-[width] duration-500 ease-out"
        style={{ width: `${percentage}%`, background: accent, opacity: expanded ? 0.55 : 0.9 }}
      />

      {expanded && (
        <div className="absolute inset-0 flex items-center justify-between px-2 sm:px-3 z-10">
          <div className="flex items-center gap-1.5 min-w-0" style={{ color: accent }}>
            <span className="hidden sm:block shrink-0">{spec.icon}</span>
            <span className="text-[9px] sm:text-[10px] font-mono tracking-[0.12em] uppercase text-[var(--atlas-n-800)] truncate">
              {spec.name}
            </span>
            <span className="text-[10px] sm:text-[11px] font-mono text-[var(--atlas-n-950)] tabular-nums">
              {formatResource(value)}
            </span>
            <span className="hidden sm:inline text-[9px] font-mono text-[var(--atlas-n-600)]">
              /{formatResource(maxStorage)}
            </span>
          </div>
          {isCritical ? (
            <span className="text-[9px] font-mono uppercase tracking-[0.14em] text-[var(--atlas-danger)]">LOW</span>
          ) : isAlmostFull ? (
            <span className="text-[9px] font-mono uppercase tracking-[0.14em] text-[var(--atlas-n-600)]">FULL</span>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default FuelBar;

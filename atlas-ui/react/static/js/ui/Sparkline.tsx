// ui/Sparkline.tsx — a pure SVG line for index/balance series (05 §5.4).
// No canvas, no chart library, no animation.

import React, { useMemo } from "react";

export interface SparklineProps {
  points: number[];
  width?: number;
  height?: number;
  tone?: string;
  ariaLabel?: string;
}

export const Sparkline: React.FC<SparklineProps> = ({
  points,
  width = 220,
  height = 44,
  tone = "var(--atlas-signal)",
  ariaLabel,
}) => {
  const path = useMemo(() => {
    if (points.length < 2) return null;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = max - min || Math.abs(max) * 0.02 || 1;
    const step = width / (points.length - 1);
    return points
      .map((value, index) => {
        const x = index * step;
        const y = height - ((value - min) / span) * (height - 4) - 2;
        return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  }, [points, width, height]);

  if (!path) {
    return <div style={{ height, color: "var(--atlas-n-600)", fontSize: "var(--atlas-t-micro)" }}>暂无点位</div>;
  }

  return (
    <svg role="img" aria-label={ariaLabel} viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none">
      <path d={path} fill="none" stroke={tone} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};

export default Sparkline;

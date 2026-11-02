// ui/CandleChart.tsx — pure SVG candlestick chart (05 §5.4).
// Prices follow the domestic convention: up = red, down = green. Both colours are
// tokens, because 06 §2 makes `--atlas-up` / `--atlas-down` the only truth.

import React, { useMemo } from "react";
import { formatAmount, toNumber } from "./Money.tsx";

export interface Candle {
  t: string;
  o: string;
  h: string;
  l: string;
  c: string;
  v?: number;
}

export interface CandleChartProps {
  candles: Candle[];
  height?: number;
  intervalLabel?: string;
}

export const CandleChart: React.FC<CandleChartProps> = ({ candles, height = 260, intervalLabel }) => {
  const geometry = useMemo(() => {
    if (!candles.length) return null;
    const highs = candles.map((bar) => toNumber(bar.h));
    const lows = candles.map((bar) => toNumber(bar.l));
    const max = Math.max(...highs);
    const min = Math.min(...lows);
    const span = max - min || Math.abs(max) * 0.02 || 1;
    const width = 640;
    const slot = width / candles.length;
    const bodyWidth = Math.max(1.5, slot * 0.6);
    const y = (price: number): number => height - ((price - min) / span) * (height - 20) - 10;
    const bars = candles.map((bar, index) => {
      const open = toNumber(bar.o);
      const close = toNumber(bar.c);
      const x = index * slot + slot / 2;
      const top = y(Math.max(open, close));
      const bottom = y(Math.min(open, close));
      return {
        key: `${bar.t}-${index}`,
        x,
        top,
        bottom: Math.max(bottom, top + 1),
        high: y(toNumber(bar.h)),
        low: y(toNumber(bar.l)),
        colour: close >= open ? "var(--atlas-up)" : "var(--atlas-down)",
        bodyWidth,
      };
    });
    return { width, height, bars, max, min };
  }, [candles, height]);

  if (!geometry) {
    return (
      <div style={{ padding: "var(--atlas-5)", textAlign: "center", color: "var(--atlas-n-600)", fontSize: "var(--atlas-t-small)" }}>
        暂无成交，等待第一笔撮合
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "var(--atlas-1)" }}>
      <svg
        role="img"
        aria-label={intervalLabel ? `${intervalLabel} K 线` : "K 线"}
        viewBox={`0 0 ${geometry.width} ${geometry.height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
      >
        {geometry.bars.map((bar) => (
          <g key={bar.key}>
            <line x1={bar.x} y1={bar.high} x2={bar.x} y2={bar.low} stroke={bar.colour} strokeWidth={1} />
            <rect
              x={bar.x - bar.bodyWidth / 2}
              y={bar.top}
              width={bar.bodyWidth}
              height={bar.bottom - bar.top}
              fill={bar.colour}
            />
          </g>
        ))}
      </svg>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          color: "var(--atlas-n-600)",
          fontSize: "var(--atlas-t-micro)",
        }}
      >
        <span>低 {formatAmount(geometry.min)}</span>
        <span>高 {formatAmount(geometry.max)}</span>
        <span>{candles.length} 根</span>
      </div>
    </div>
  );
};

export default CandleChart;

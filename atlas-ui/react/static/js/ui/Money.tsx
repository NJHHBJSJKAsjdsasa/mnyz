// Money + number formatting. Single implementation for the whole economy shell —
// panels must not format amounts themselves (docs/frontend-redesign/06 §0.3).

import React from "react";

export const toNumber = (value: unknown): number => {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number(String(value));
  return Number.isFinite(n) ? n : 0;
};

export const formatAmount = (value: unknown): string => {
  const n = toNumber(value);
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (abs > 0 && abs < 1) return n.toFixed(4);
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const formatPct = (value: unknown): string => {
  const n = toNumber(value);
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
};

export const toneOf = (value: unknown): string => {
  const n = toNumber(value);
  if (n > 0) return "var(--atlas-up)";
  if (n < 0) return "var(--atlas-down)";
  return "var(--atlas-n-700)";
};

interface MoneyProps {
  value: unknown;
  currency?: string;
  delta?: unknown;
  size?: number | string;
  muted?: boolean;
}

/** `<Money value="12345.6789" currency="cc4" />` → `12,346 cc4` */
export const Money: React.FC<MoneyProps> = ({ value, currency, delta, size, muted }) => {
  const colour = delta !== undefined ? toneOf(delta) : muted ? "var(--atlas-n-800)" : "var(--atlas-n-950)";
  return (
    <span className="atlas-tabular" style={{ color: colour, fontSize: size ?? "var(--atlas-t-body)", whiteSpace: "nowrap" }}>
      {formatAmount(value)}
      {currency ? <span style={{ color: "var(--atlas-n-700)", marginLeft: 4 }}>{currency}</span> : null}
    </span>
  );
};

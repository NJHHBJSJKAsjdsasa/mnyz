// panels/Market/_constants.ts — the only place that names up/down colours
// (06 §2). Values are tokens; no hex belongs in a panel.

import { toNumber } from "../../ui/Money.tsx";

export const UP = "var(--atlas-up)";
export const DOWN = "var(--atlas-down)";

export const INTERVALS = ["1m", "5m", "15m", "1h", "1d"] as const;
export type Interval = (typeof INTERVALS)[number];

export const toneOfChange = (value: unknown): string => {
  const n = toNumber(value);
  if (n > 0) return UP;
  if (n < 0) return DOWN;
  return "var(--atlas-n-700)";
};

export const labelOfSide = (side: string): string => (side === "buy" ? "买入" : "卖出");

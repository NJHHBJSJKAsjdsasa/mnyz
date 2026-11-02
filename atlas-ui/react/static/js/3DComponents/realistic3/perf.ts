// atlas-ui/react/static/js/3DComponents/realistic3/perf.ts
//
// Step 4 of docs/render-transplant: one place that decides how much quality the device
// gets. Everything is a guess from cheap signals (no GPU string sniffing, no benchmark),
// and every value can be overridden from the URL: ?quality=low|mid|high.

export type QualityTier = "low" | "mid" | "high";

export interface QualityProfile {
  tier: QualityTier;
  maxOctaves: number;
  maxPixelRatio: number;
  reason: string;
}

const PROFILES: Record<QualityTier, Omit<QualityProfile, "tier" | "reason">> = {
  low: { maxOctaves: 5, maxPixelRatio: 1.5 },
  mid: { maxOctaves: 6.5, maxPixelRatio: 2 },
  high: { maxOctaves: 7.5, maxPixelRatio: 2 },
};

export function readQualityOverride(): QualityTier | null {
  try {
    const value = new URLSearchParams(window.location.search).get("quality");
    return value === "low" || value === "mid" || value === "high" ? value : null;
  } catch {
    return null;
  }
}

/**
 * Heuristic tier:
 * - `low`: ≤ 4 logical cores, or a small viewport with DPR > 2 (phones) — the fragment
 *   shader is fill-rate bound, so DPR matters far more than core count there;
 * - `high`: ≥ 8 cores and DPR ≤ 2;
 * - otherwise `mid`.
 */
export function qualityProfile(): QualityProfile {
  const override = readQualityOverride();
  if (override) {
    return { tier: override, ...PROFILES[override], reason: "url override" };
  }
  const cores = (navigator as Navigator & { hardwareConcurrency?: number }).hardwareConcurrency ?? 4;
  const dpr = window.devicePixelRatio || 1;
  const smallScreen = Math.min(window.innerWidth, window.innerHeight) < 500;

  if (cores <= 4 || (smallScreen && dpr > 2)) {
    return { tier: "low", ...PROFILES.low, reason: `cores=${cores} dpr=${dpr} small=${smallScreen}` };
  }
  if (cores >= 8 && dpr <= 2) {
    return { tier: "high", ...PROFILES.high, reason: `cores=${cores} dpr=${dpr}` };
  }
  return { tier: "mid", ...PROFILES.mid, reason: `cores=${cores} dpr=${dpr}` };
}

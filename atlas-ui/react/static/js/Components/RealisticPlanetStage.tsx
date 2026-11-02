// atlas-ui/react/static/js/Components/RealisticPlanetStage.tsx
//
// Step 3 of docs/render-transplant: the 3.0 realistic planet inside the real planet page,
// behind the `renderer=realistic` flag. It replaces only the 3D column of
// PlanetVisualizationUniversal; every panel, tab and backend call around it stays as-is.
//
// Data comes from the same place the classic renderer reads it:
//   GET /api/planet/<name>/rendering-data -> { rings: RingsData | null, ... }
// Missing rings (or a failed fetch) degrade to a planet without rings; the surface never
// depends on that request.

import React, { useEffect, useMemo, useRef, useState } from "react";

import { RealisticPlanetView, type CacheStats } from "../3DComponents/realistic3/RealisticPlanetView.tsx";
import type { PlanetLike } from "../3DComponents/realistic3/adapter.ts";
import { writeRenderer } from "../Utils/RendererFlag.tsx";
import { qualityProfile } from "../3DComponents/realistic3/perf.ts";

interface StagePlanet {
  name: string;
  planet_type?: string;
  atmosphere?: string;
  life_forms?: string;
  surface_temperature?: number;
  rotation_period_seconds?: number;
  base_color?: string;
}

interface Props {
  planet: StagePlanet;
  /** Stable seed: the planet key, so terrain survives reloads. */
  seedKey: string;
  cosmicOriginTime?: number | string;
  /** 0 disables moons; the backend has no moon payload yet. */
  moonCount?: number;
  height?: number | string;
}

const asEpochSeconds = (value: number | string | undefined): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed / 1000;
  }
  return Date.now() / 1000;
};

export const RealisticPlanetStage: React.FC<Props> = ({
  planet,
  seedKey,
  cosmicOriginTime,
  moonCount = 0,
  height = 520,
}) => {
  const [rings, setRings] = useState<any>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [fps, setFps] = useState<number | null>(null);
  const [cache, setCache] = useState<CacheStats | null>(null);
  /**
   * The overlay (tier / octaves / fps / program cache) and the "切回旧渲染"
   * button were transplant-era instrumentation. In a shipped view they read as
   * "unfinished"; keep them behind `?dev=1` so step-4 comparisons still work.
   */
  const [dev] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("dev") === "1";
    } catch {
      return false;
    }
  });
  const quality = useRef(qualityProfile());
  const frames = useRef(0);
  const windowStart = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    fetch(`/api/planet/${encodeURIComponent(planet.name)}/rendering-data`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled) setRings(data?.rings ?? null);
      })
      .catch(() => {
        // Rings are decoration: a failure here must not blank the planet.
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [planet.name]);

  const like: PlanetLike = useMemo(
    () => ({
      name: planet.name,
      planet_type: planet.planet_type,
      atmosphere: planet.atmosphere,
      life_forms: planet.life_forms,
      surface_temperature: planet.surface_temperature,
      base_color: planet.base_color,
      rotation_period_seconds: planet.rotation_period_seconds,
      seed: seedKey,
    }),
    [planet, seedKey]
  );

  // FPS meter for the step-4 comparison (README §8 阶段 3 观测埋点).
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      frames.current += 1;
      const now = performance.now();
      if (!windowStart.current) windowStart.current = now;
      if (now - windowStart.current >= 1000) {
        setFps(Math.round((frames.current * 1000) / (now - windowStart.current)));
        frames.current = 0;
        windowStart.current = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    // `height: 100%` on the wrapper, not just on the canvas box: the canvas box
    // takes `height` (= "100%" from the shell stage), and a percentage resolves
    // against this wrapper. Without it the wrapper is content-sized, the 100%
    // resolves to auto, and the planet renders in a 200px strip with the rest of
    // the stage empty — which reads as "the planet disappeared".
    <div style={{ display: "grid", gap: 8, height: "100%", minHeight: 0 }}>
      <div
        style={{
          position: "relative",
          height,
          borderRadius: 14,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,.12)",
          background: "radial-gradient(120% 90% at 50% 40%, #0d1524 0%, #05070c 70%)",
        }}
      >
        <RealisticPlanetView
          planet={like}
          rings={rings}
          moons={moonCount}
          elapsedScale={300}
          maxOctaves={quality.current.maxOctaves}
          maxPixelRatio={quality.current.maxPixelRatio}
          onCacheStats={setCache}
          onError={(message) => setFailed(message)}
        />
        {dev ? (
          <div
            style={{
              position: "absolute",
              left: 10,
              top: 10,
              display: "flex",
              gap: 8,
              alignItems: "center",
              fontSize: 11,
              color: "rgba(230,240,255,.72)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <span style={{ border: "1px solid rgba(61,220,255,.5)", color: "#3ddcff", borderRadius: 4, padding: "2px 6px" }}>
              realistic 3.0
            </span>
            {rings ? <span>环 ✓</span> : <span style={{ opacity: 0.5 }}>环 —</span>}
            <span style={{ opacity: 0.6 }}>
              {quality.current.tier} · {quality.current.maxOctaves} oct
            </span>
            {fps != null ? <span>{fps} fps</span> : null}
            {cache ? (
              <span title={cache.warming ? "预热其他星体类型的着色器" : "着色器程序缓存"}>
                prog {cache.programs}
                {cache.warming && cache.total > 0 ? ` · ${cache.warmed}/${cache.total}` : ""}
              </span>
            ) : null}
          </div>
        ) : null}
        {dev ? (
          <button
            type="button"
            onClick={() => writeRenderer("classic")}
            style={{
              position: "absolute",
              right: 10,
              top: 10,
              background: "rgba(8,13,20,.7)",
              border: "1px solid rgba(255,255,255,.18)",
              borderRadius: 4,
              color: "rgba(230,240,255,.82)",
              fontSize: 11,
              padding: "3px 8px",
              cursor: "pointer",
            }}
          >
            切回旧渲染
          </button>
        ) : null}
        {failed ? (
          <div
            role="alert"
            style={{
              position: "absolute",
              inset: "auto 10px 10px 10px",
              background: "rgba(255,77,79,.12)",
              border: "1px solid rgba(255,77,79,.45)",
              color: "#ffd7d7",
              fontSize: 12,
              padding: "6px 8px",
              borderRadius: 6,
            }}
          >
            渲染失败：{failed}（可切回旧渲染）
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default RealisticPlanetStage;

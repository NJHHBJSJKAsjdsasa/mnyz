// atlas-ui/react/static/js/Components/RealisticSystemStage.tsx
//
// 3.0 star system inside the 2.x system page. It replaces the 3D square of
// SystemVisualizationUniversal; the planets list, panels, stargate button and every backend
// call around it stay as-is. `?renderer=classic` is the escape hatch (see RendererFlag).
//
// Data: `GET /api/system/rendering-data` (what the classic viewer already reads), mapped by
// `realistic3/systemAdapter.ts` onto the vendored 3.0 `SystemDetail` shape.
//
// Three deliberate deviations from the explorer, all recorded in docs/render-transplant §10:
//   * the floating origin is cancelled (`root.position` is put back to zero after
//     `SystemLayer.update`), because a 2.x page is one square with a normal orbit camera;
//   * planets get an extra display scale (`planetScale`, default 4) on top of upstream's
//     80x: at true scale a planet is ~4 px wide from the system's edge;
//   * the star's `near` follows the camera distance (upstream), so from afar only its glow
//     sprite shows -- 3.0's own behaviour, not a bug.
//
// Interactions: screen-space labels on every planet, click (or label click) to inspect one,
// and the two `SystemLayer` hooks that exist for exactly this -- `setDetailed()` hides the
// stand-in sphere while the real planet is drawn on top, `setPlanetColor()` repaints it with
// the planet's own base colour once its rendering data arrives, so closing the inspector does
// not change the sphere's colour.

import React, { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

import { SystemLayer } from "../3DComponents/realistic3/SystemLayer.ts";
import { adaptSystemPayload, type RawSystemResponse } from "../3DComponents/realistic3/systemAdapter.ts";
import { RealisticPlanetView } from "../3DComponents/realistic3/RealisticPlanetView.tsx";
import type { PlanetDetail } from "../3DComponents/realistic3/systemTypes.ts";
import { writeRenderer } from "../Utils/RendererFlag.tsx";
import { qualityProfile } from "../3DComponents/realistic3/perf.ts";

interface Props {
  /** The page's system index (the payload has none). */
  systemIndex?: number;
  cosmicOriginTime?: number;
  height?: number | string;
  /** Extra display scale for planet spheres, on top of upstream's 80x. */
  planetScale?: number;
  /** Called when the realistic renderer cannot show this system (fall back to classic). */
  onFallback?: (reason: string) => void;
  /**
   * Pre-fetched `/api/system/rendering-data` payload. When given, the stage skips its own
   * request -- the lab uses this to feed fixtures through the same adapter.
   */
  payload?: RawSystemResponse | null;
  /** Draw a label over every planet. */
  labels?: boolean;
}

const SPEEDS: Array<{ label: string; value: number }> = [
  { label: "实时", value: 1 },
  { label: "1 天/秒", value: 86400 },
  { label: "1 年/秒", value: 31557600 },
];

const planetHref = (name: string) => `/planet/${name.toLowerCase()}`;

export const RealisticSystemStage: React.FC<Props> = ({
  systemIndex = 0,
  cosmicOriginTime,
  height = 520,
  planetScale = 4,
  onFallback,
  payload,
  labels = true,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const labelsRef = useRef<HTMLDivElement | null>(null);
  const layerRef = useRef<SystemLayer | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [reason, setReason] = useState<string | null>(null);
  const [info, setInfo] = useState<{ name: string; stars: number; planets: number; outer: number } | null>(null);
  const [speed, setSpeed] = useState(1);
  const [selected, setSelected] = useState<PlanetDetail | null>(null);
  /** Transplant instrumentation stays behind ?dev=1 (see the overlay below). */
  const [dev] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("dev") === "1";
    } catch {
      return false;
    }
  });
  const speedRef = useRef(1);
  speedRef.current = speed;
  const selectedRef = useRef<PlanetDetail | null>(null);
  selectedRef.current = selected;
  const quality = useRef(qualityProfile());
  // Parent callbacks are usually inline arrows: keep them out of the effect's deps or the
  // whole scene would be rebuilt on every parent render.
  const fallbackRef = useRef(onFallback);
  fallbackRef.current = onFallback;

  // The layer holds three objects, not React state: selection is pushed into it here
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.setDetailed(selected ? [selected.index] : []);
  }, [selected]);

  /** Repaint a stand-in sphere with its real colour once the planet data is known. */
  const recolour = useCallback(async (planet: PlanetDetail) => {
    try {
      const response = await fetch(`/api/planet/${encodeURIComponent(planet.name)}/rendering-data`);
      if (!response.ok) return;
      const data = await response.json();
      const hex = data?.rendering_data?.planet_info?.base_color ?? data?.planet_info?.base_color;
      if (typeof hex === "string" && hex.trim()) {
        const color = new THREE.Color(hex.trim().startsWith("#") ? hex.trim() : `#${hex.trim()}`);
        layerRef.current?.setPlanetColor(planet.index, color);
      }
    } catch {
      // A missing base colour only costs the sphere its tint; the inspector has the real planet
    }
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    const controller = new AbortController();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "WebGL unavailable";
      setStatus("error");
      setReason(message);
      fallbackRef.current?.(message);
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.current.maxPixelRatio));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setClearColor(0x000000, 1);
    renderer.domElement.style.display = "block";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 1e-5, 5e3);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.rotateSpeed = 0.55;

    const resize = () => {
      const width = host.clientWidth || 1;
      const heightPx = host.clientHeight || 1;
      renderer.setSize(width, heightPx, false);
      camera.aspect = width / heightPx;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    let raf = 0;
    let layer: SystemLayer | null = null;
    let last = performance.now();
    // One <span> per planet: created once, moved by transform every frame (no React churn)
    let labelEls: HTMLSpanElement[] = [];
    // Stars get a chip too (T-41). Until now only planets were labelled, so a
    // system's primary — the thing every orbit is drawn around — was the one
    // unlabelled object on screen.
    let starEls: HTMLSpanElement[] = [];
    const projected = new THREE.Vector3();
    const worldPoint = new THREE.Vector3();

    const updateLabels = () => {
      const container = labelsRef.current;
      if (!layer || !container) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const show = labels && !selectedRef.current;

      // Stars first. They carry no name (StarInfo is Type/Color/Size only), so the
      // chip is "主星 · Yellow Dwarf", or "A/B/C · …" in a multiple-star system.
      //
      // Unlike the planet chips these ignore `show`: planets hide their labels while
      // one is selected (the label would sit on top of the panel describing it), but
      // the star is the anchor of the whole view and never has a panel of its own.
      layer.stars.forEach((star, index) => {
        const element = starEls[index];
        if (!element) return;
        // `offset` is the star mesh's own position inside `layer.root`, and
        // `draw()` resets that root to the origin each frame — so it is already a
        // scene coordinate, exactly like a planet's `position`. (Adding
        // camera.position here pushed the projected point out of the frustum and
        // the chip never appeared.)
        projected.copy(star.offset).project(camera);
        const onScreen =
          projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < 1.05 && Math.abs(projected.y) < 1.05;
        if (!onScreen) {
          element.style.opacity = "0";
          return;
        }
        const sx = ((projected.x + 1) / 2) * rect.width;
        const sy = ((1 - projected.y) / 2) * rect.height;
        element.style.opacity = "0.92";
        element.style.transform = `translate3d(${Math.round(sx + 8)}px, ${Math.round(sy - 18)}px, 0)`;
      });

      layer.planets.forEach((body, index) => {
        const element = labelEls[index];
        if (!element) return;
        if (!show) {
          element.style.opacity = "0";
          return;
        }
        projected.copy(body.position).project(camera);
        const onScreen =
          projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < 1.05 && Math.abs(projected.y) < 1.05;
        if (!onScreen) {
          element.style.opacity = "0";
          return;
        }
        const x = ((projected.x + 1) / 2) * rect.width;
        const y = ((1 - projected.y) / 2) * rect.height;
        element.style.opacity = "0.88";
        // Sit the chip just above the planet, in the canvas' own coordinate space
        element.style.transform = `translate3d(${Math.round(x + 6)}px, ${Math.round(y - 16)}px, 0)`;
      });
    };

    /** For `SystemLayer.pickBody`: world offset from the camera -> client coordinates. */
    const project = (relative: THREE.Vector3) => {
      worldPoint.copy(relative).add(camera.position);
      const ndc = worldPoint.clone().project(camera);
      if (ndc.z < -1 || ndc.z > 1) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      return {
        x: rect.left + ((ndc.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - ndc.y) / 2) * rect.height,
      };
    };

    // Click = pointerup without dragging (OrbitControls owns the drag)
    let downAt: { x: number; y: number } | null = null;
    const onPointerDown = (event: PointerEvent) => {
      downAt = { x: event.clientX, y: event.clientY };
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!downAt) return;
      const moved = Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y);
      downAt = null;
      if (moved > 6 || !layer) return;
      const hit = layer.pickBody(event.clientX, event.clientY, project, camera.position);
      if (hit?.kind === "planet") {
        setSelected(hit.body.data);
        void recolour(hit.body.data);
      }
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);

    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (!layer) return;
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      layer.timeScale = speedRef.current;
      layer.update(dt, camera.position);
      // Cancel the explorer's floating origin: the camera orbits the system in this page.
      layer.root.position.set(0, 0, 0);
      controls.update();
      renderer.render(scene, camera);
      updateLabels();
    };

    const boot = (raw: RawSystemResponse | null) => {
      if (disposed) return;
      const adapted = adaptSystemPayload(raw, { index: systemIndex, cosmicOriginTime });
      if (!adapted) {
        const message = (raw as { error?: string } | null)?.error || "系统渲染数据不可用";
        setStatus("error");
        setReason(message);
        fallbackRef.current?.(message);
        return;
      }
      layer = new SystemLayer(adapted.system, adapted.timing);
      layer.presence = 1;
      if (planetScale !== 1) {
        for (const body of layer.planets) {
          body.mesh.scale.setScalar(planetScale);
          // picking uses this radius; keep it in step with what is drawn
          body.radius *= planetScale;
        }
      }
      layerRef.current = layer;
      scene.add(layer.root);

      const container = labelsRef.current;
      if (container) {
        container.innerHTML = "";
        // Star chips use a warm tone so they never read as another planet chip.
        // Not clickable: a star has no detail page of its own.
        starEls = layer.stars.map((star, index) => {
          const element = document.createElement("span");
          const prefix = layer.stars.length > 1 ? String.fromCharCode(65 + index) : "主星";
          element.textContent = `${prefix} · ${star.info.Type}`;
          element.style.cssText =
            "position:absolute;left:0;top:0;transform:translate3d(-9999px,-9999px,0);opacity:0;" +
            "padding:1px 6px;border-radius:3px;background:rgba(28,18,6,.78);border:1px solid rgba(255,197,61,.5);" +
            "color:#ffd98a;font-size:10px;line-height:1.35;white-space:nowrap;pointer-events:none;" +
            "transition:opacity 120ms linear;will-change:transform";
          container.appendChild(element);
          return element;
        });
        labelEls = layer.planets.map((body) => {
          const element = document.createElement("span");
          element.textContent = body.data.name;
          element.style.cssText =
            "position:absolute;left:0;top:0;transform:translate3d(-9999px,-9999px,0);opacity:0;" +
            "padding:1px 5px;border-radius:3px;background:rgba(6,10,18,.72);border:1px solid rgba(126,232,255,.35);" +
            "color:#cfe8ff;font-size:10px;line-height:1.35;white-space:nowrap;pointer-events:auto;cursor:pointer;" +
            "transition:opacity 120ms linear;will-change:transform";
          element.addEventListener("click", (event) => {
            event.stopPropagation();
            const planet = layer?.planet(body.data.index);
            if (!planet) return;
            setSelected(planet.data);
            void recolour(planet.data);
          });
          container.appendChild(element);
          return element;
        });
      }

      const outer = layer.outerRadius;
      // 1.9 → 1.55: at 1.9 the outermost orbit ring sat on the frame edge and the
      // star was a bright pinprick in an empty stage. 1.55 keeps the rings inside
      // the frame and roughly triples the star's apparent size.
      const distance = outer * 1.55;
      camera.position.set(distance * 0.55, distance * 0.42, distance * 0.72);
      controls.minDistance = Math.max(outer * 0.02, 1e-4);
      controls.maxDistance = outer * 6;
      controls.target.set(0, 0, 0);
      controls.update();

      setInfo({
        name: adapted.system.name,
        stars: adapted.system.stars.length,
        planets: adapted.system.planets.length,
        outer,
      });
      setStatus("ready");
      draw();
    };

    if (payload) {
      boot(payload);
    } else {
      fetch("/api/system/rendering-data", { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : null))
        .then((raw) => boot(raw as RawSystemResponse | null))
        .catch((error) => {
          if (disposed) return;
          const message = error instanceof Error ? error.message : "请求失败";
          setStatus("error");
          setReason(message);
          fallbackRef.current?.(message);
        });
    }

    return () => {
      disposed = true;
      controller.abort();
      cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      observer.disconnect();
      controls.dispose();
      layer?.dispose();
      layerRef.current = null;
      labelEls = [];
      starEls = [];
      if (labelsRef.current) labelsRef.current.innerHTML = "";
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [systemIndex, cosmicOriginTime, planetScale, payload, labels, recolour]);

  return (
    <div style={{ position: "relative", width: "100%", height, borderRadius: 14, overflow: "hidden", background: "#000" }}>
      <div ref={hostRef} style={{ width: "100%", height: "100%" }} />
      <div ref={labelsRef} style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }} />
      {/* Transplant instrumentation (tier / orbit radius / renderer switch) is
          behind ?dev=1 — see RealisticPlanetStage for the same reasoning. The
          speed buttons beside it stay: time scale is a game control. */}
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
            pointerEvents: "none",
          }}
        >
          <span style={{ border: "1px solid rgba(61,220,255,.5)", color: "#3ddcff", borderRadius: 4, padding: "2px 6px" }}>
            realistic 3.0
          </span>
          {info ? (
            <span style={{ opacity: 0.65 }}>
              {info.stars} 恒星 · {info.planets} 行星 · 外轨 {info.outer.toFixed(2)} AU
            </span>
          ) : null}
          {status === "loading" ? <span style={{ opacity: 0.5 }}>加载中…</span> : null}
        </div>
      ) : null}
      {/* `right: 44` — the shell's info drawer collapses to a 34px spine pinned to
          this corner, and these buttons were rendering underneath it. The stage
          reserves 34px of margin for exactly this reason, but the button row's
          offset parent is the outer stage box, not the narrowed canvas, so it needs
          the extra clearance itself. */}
      <div style={{ position: "absolute", right: 44, top: 10, display: "flex", gap: 6 }}>
        {SPEEDS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setSpeed(option.value)}
            style={{
              background: speed === option.value ? "rgba(61,220,255,.18)" : "rgba(8,13,20,.7)",
              border: `1px solid ${speed === option.value ? "rgba(61,220,255,.55)" : "rgba(255,255,255,.18)"}`,
              borderRadius: 4,
              color: "rgba(230,240,255,.82)",
              fontSize: 11,
              padding: "3px 8px",
              cursor: "pointer",
            }}
          >
            {option.label}
          </button>
        ))}
        {dev ? (
          <button
            type="button"
            onClick={() => writeRenderer("classic")}
            style={{
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
      </div>

      {/* Planet inspector: the real 3.0 planet on top of its stand-in sphere */}
      {selected ? (
        <div
          style={{
            position: "absolute",
            right: 10,
            bottom: 10,
            width: "min(64%, 380px)",
            height: "min(78%, 320px)",
            background: "rgba(5,8,14,.86)",
            border: "1px solid rgba(126,232,255,.3)",
            borderRadius: 10,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 8px",
              fontSize: 11,
              color: "rgba(230,240,255,.8)",
              borderBottom: "1px solid rgba(255,255,255,.08)",
            }}
          >
            <b style={{ color: "#7ee8ff", fontWeight: 600 }}>{selected.name}</b>
            <span style={{ opacity: 0.6 }}>
              {selected.planet_type} · {Math.round(selected.surface_temperature)} °C
            </span>
            <span style={{ flex: 1 }} />
            <a href={planetHref(selected.name)} style={{ color: "rgba(126,232,255,.8)", textDecoration: "none" }}>
              行星页 →
            </a>
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="关闭"
              style={{
                background: "transparent",
                border: "1px solid rgba(255,255,255,.18)",
                borderRadius: 4,
                color: "rgba(230,240,255,.7)",
                fontSize: 11,
                padding: "0 6px",
                cursor: "pointer",
              }}
            >
              ×
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <RealisticPlanetView
              key={selected.name}
              planet={{
                name: selected.name,
                planet_type: selected.planet_type,
                atmosphere: selected.atmosphere,
                life_forms: selected.life_forms,
                surface_temperature: selected.surface_temperature,
                rotation_period_seconds: selected.rotation_period_seconds,
                seed: selected.name,
              }}
              maxOctaves={quality.current.maxOctaves}
              maxPixelRatio={quality.current.maxPixelRatio}
              secondsPerRotation={30}
              warmVariants={false}
            />
          </div>
        </div>
      ) : null}

      {status === "error" ? (
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
          系统渲染不可用：{reason}（可切回旧渲染）
        </div>
      ) : null}
    </div>
  );
};

export default RealisticSystemStage;

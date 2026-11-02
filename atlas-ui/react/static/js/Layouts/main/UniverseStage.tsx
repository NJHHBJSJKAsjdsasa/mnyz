// atlas-ui/react/static/js/Layouts/main/UniverseStage.tsx — the star stage and
// the jump console, as stage content.
//
// Split out of `HomeScreen.tsx` on 2026-10-31 (P0 of
// docs/frontend-redesign/16-shell-unification.md). The old file was the page:
// its own top bar, its own rail, its own `<main>` grid and its own content — which
// is exactly why the other seven pages could not share any of it. What lives here
// now is only the content: two stage cells. The frame owns the rest.
//
// Behavior is unchanged from the pre-split version, including the two decisions
// that are easy to "fix" by mistake:
//   · the 3D layer is over-scaled (`inset: -20%`) so the renderer's faintly-lit
//     rect never shows an edge inside the panel;
//   · aiming commits on pointer-up, not on pointer-move — the star's shader
//     uniforms rebuild on seed change, so per-pixel commits would rebuild them
//     sixty times a second.

import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Label, StatusCell } from "../../Shell/GameAtoms.tsx";
import { formatResource } from "./format.ts";
import type { Coordinates } from "./format.ts";

const RealisticStarStage = lazy(() => import("../../Components/RealisticStarStage.tsx"));

const MAX = 10_000_000;

/** Origin the fuel is priced from — mirrors `ORIGIN` in `Layouts/__main__.tsx`. */
const HOME_ANCHOR = { x: 1_000_000, y: 1_000_000, z: 1_000_000 };

/** Units of coordinate per pixel dragged: one stage-width sweeps ~1.1% of the grid. */
const AIM_UNITS_PER_PX = MAX / 900;

const clampAxis = (value: number) => Math.max(0, Math.min(MAX, Math.round(value)));

/**
 * The star the player is looking at.
 *
 * A coordinate is a destination, and a destination should look like somewhere —
 * a wireframe box of axes reads like CAD, not like a place to jump to. The seed
 * is derived from (x, y, z), so the same coordinate always shows the same star
 * and nudging an axis visibly changes it, which is the whole feedback loop the
 * cube was missing.
 */
const STAR_KINDS = [
  { type: "Yellow Dwarf", color: "yellow" },
  { type: "Red Dwarf", color: "red" },
  { type: "Red Dwarf", color: "orange" },
  { type: "White Dwarf", color: "white" },
  { type: "Blue Giant", color: "blue" },
  { type: "Red Giant", color: "orange" },
  { type: "Yellow Dwarf", color: "white" },
  { type: "Neutron Star", color: "purple" },
] as const;

const starFor = (c: Coordinates) => {
  let h = 2166136261 ^ (c.x >>> 0);
  h = Math.imul(h ^ (c.y >>> 0), 16777619);
  h = Math.imul(h ^ (c.z >>> 0), 16777619);
  const seed = (h >>> 0) || 1;
  return { seed, ...STAR_KINDS[seed % STAR_KINDS.length] };
};

const STAR_LABELS: Record<string, string> = {
  "Yellow Dwarf": "黄矮星",
  "Red Dwarf": "红矮星",
  "Red Giant": "红巨星",
  "Blue Giant": "蓝巨星",
  "White Dwarf": "白矮星",
  "Neutron Star": "中子星",
};

/* ------------------------------------------------------------------ console */

const JumpConsole: React.FC<{
  coordinates: Coordinates;
  onChange: (next: Coordinates) => void;
  onSubmit: () => void;
  travelCost?: { antimatter?: number | string; element115?: number | string; deuterium?: number | string } | null;
  canAfford: boolean;
  busy?: boolean;
  efficiency?: number;
  /** One-hop limit for this ship (`ship.stats.range`); 0/undefined hides the hint. */
  range?: number;
  /** Chosen coordinates sit inside one hop. */
  inRange?: boolean;
}> = ({ coordinates, onChange, onSubmit, travelCost, canAfford, busy, efficiency, range, inRange = true }) => {
  const [draft, setDraft] = useState(coordinates);

  useEffect(() => setDraft(coordinates), [coordinates.x, coordinates.y, coordinates.z]);

  const commit = (axis: keyof Coordinates, raw: string) => {
    const parsed = Math.max(0, Math.min(MAX, Math.round(Number(raw.replace(/[^\d]/g, "")) || 0)));
    const next = { ...draft, [axis]: parsed };
    setDraft(next);
    onChange(next);
  };

  // Draw inside one hop, along a single axis.
  //
  // This used to pick each axis at random across the whole 10^7 grid, which puts
  // the target millions of units away — a level-1 ship hops 500, so every draw
  // came back "超出当前航程，请先升级飞船". One axis, a step shorter than the
  // range, always produces a jump the server accepts.
  const randomize = () => {
    const span = Math.max(1, Math.floor((range || 500) * 0.8));
    const step = Math.floor(Math.random() * span) + 1;
    const axis: keyof Coordinates = (["x", "y", "z"] as const)[Math.floor(Math.random() * 3)];
    const base = draft[axis];
    const next = { ...draft, [axis]: Math.max(0, Math.min(MAX, base + (Math.random() < 0.5 ? step : -step))) };
    setDraft(next);
    onChange(next);
  };

  const axes: Array<{ key: keyof Coordinates; label: string; tone: string }> = [
    { key: "x", label: "X", tone: "var(--atlas-signal)" },
    { key: "y", label: "Y", tone: "var(--atlas-signal-2)" },
    { key: "z", label: "Z", tone: "var(--atlas-info)" },
  ];

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      style={{ display: "grid", gap: 8 }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
        {axes.map((axis) => (
          <label
            key={axis.key}
            style={{
              display: "grid",
              gap: 3,
              padding: "6px 8px 7px",
              border: "1px solid rgba(46,230,255,.18)",
              borderTop: `2px solid ${axis.tone}`,
              background: "linear-gradient(180deg, rgba(46,230,255,.06), rgba(6,10,20,.7))",
            }}
          >
            <span
              style={{
                fontFamily: "var(--atlas-mono)",
                fontSize: 9,
                letterSpacing: "0.24em",
                color: axis.tone,
                textShadow: `0 0 8px ${axis.tone}`,
              }}
            >
              {axis.label} 轴
            </span>
            <input
              inputMode="numeric"
              value={String(draft[axis.key])}
              onChange={(event) => commit(axis.key, event.target.value)}
              style={{
                width: "100%",
                background: "transparent",
                border: "none",
                outline: "none",
                color: "var(--atlas-n-950)",
                fontFamily: "var(--atlas-mono)",
                fontSize: 15,
                letterSpacing: "0.04em",
                padding: 0,
              }}
            />
          </label>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Label>燃料预估</Label>
          {travelCost ? (
            <span className="atlas-tabular" style={{ fontSize: 11.5, color: canAfford ? "var(--atlas-n-900)" : "var(--atlas-danger)" }}>
              {formatResource(travelCost.antimatter as number)} AM · {formatResource(travelCost.element115 as number)} E115 ·{" "}
              {formatResource(travelCost.deuterium as number)} D
            </span>
          ) : (
            <span style={{ fontSize: 11.5, color: "var(--atlas-n-600)" }}>—</span>
          )}
          {efficiency != null ? (
            <span style={{ fontFamily: "var(--atlas-mono)", fontSize: 10, color: "var(--atlas-info)" }}>
              效率 {(efficiency * 100).toFixed(0)}%
            </span>
          ) : null}
          {range ? (
            <span
              style={{
                fontFamily: "var(--atlas-mono)",
                fontSize: 10,
                color: inRange ? "var(--atlas-n-600)" : "var(--atlas-danger)",
              }}
              title="单次跳跃的最大距离；超出的目标需要多次跳跃或升级飞船"
            >
              航程 {formatResource(range)}
            </span>
          ) : null}
        </span>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="submit"
          disabled={!canAfford || !inRange || busy}
          // A greyed button with no explanation is the worst state to leave a
          // player in — the cost line turning red is easy to miss at 11.5px.
          title={
            !inRange
              ? `超出航程：这艘船一次最多跳 ${formatResource(range || 0)}，请改小坐标或升级飞船`
              : !canAfford
                ? "燃料不足：本次跳跃需要更多 AM / E115 / D"
                : busy
                  ? "驱动充能中…"
                  : undefined
          }
          className="hud-btn hud-cta"
          data-variant="primary"
          data-size="lg"
          style={{ flex: 1 }}
        >
          {busy ? "⚡ 驱动充能…" : !inRange ? "🛰 超出航程" : !canAfford ? "🚀 燃料不足" : "🚀 初始化跳跃"}
        </button>
        <button type="button" onClick={randomize} className="hud-btn" data-variant="secondary" data-size="lg">
          随机坐标
        </button>
      </div>
    </form>
  );
};

/* ------------------------------------------------------------------ stage */

export interface UniverseStageProps {
  isRemoteUniverse: boolean;
  show3DViewer: boolean;
  coordinates: Coordinates;
  onCoordinatesChange: (next: Coordinates) => void;
  travelCost?: { antimatter?: number | string; element115?: number | string; deuterium?: number | string } | null;
  canAfford: boolean;
  busy?: boolean;
  efficiency?: number;
  range?: number;
  inRange?: boolean;
  onSubmit: () => void;
  error: string | null;
}

export const UniverseStage: React.FC<UniverseStageProps> = ({
  isRemoteUniverse,
  show3DViewer,
  coordinates,
  onCoordinatesChange,
  travelCost,
  canAfford,
  busy,
  efficiency,
  range,
  inRange,
  onSubmit,
  error,
}) => {
  // Same coordinate, same star — re-derived only when an axis actually moves.
  const star = useMemo(() => starFor(coordinates), [coordinates.x, coordinates.y, coordinates.z]);

  /* --- aiming --------------------------------------------------------- */
  // `aim` is a *draft* coordinate held while the pointer is down. It is committed
  // on release: the star's shader uniforms are rebuilt whenever the seed changes,
  // so committing per pointer-move would rebuild them 60 times a second.
  const [aim, setAim] = useState<Coordinates | null>(null);
  const dragFrom = useRef<{ x: number; y: number } | null>(null);
  const aiming = aim !== null;

  const onAimDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragFrom.current = { x: event.clientX, y: event.clientY };
    setAim(coordinates);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onAimMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const from = dragFrom.current;
    if (!from) return;
    const dx = event.clientX - from.x;
    const dy = event.clientY - from.y;
    dragFrom.current = { x: event.clientX, y: event.clientY };
    setAim((prev) => {
      const base = prev ?? coordinates;
      return {
        x: clampAxis(base.x + dx * AIM_UNITS_PER_PX),
        y: clampAxis(base.y - dy * AIM_UNITS_PER_PX),
        z: base.z,
      };
    });
  };

  const onAimUp = () => {
    if (!dragFrom.current) return;
    dragFrom.current = null;
    const next = aim;
    setAim(null);
    if (next) onCoordinatesChange(next);
  };

  const distanceFromAnchor = Math.floor(
    Math.sqrt(
      Math.pow(coordinates.x - HOME_ANCHOR.x, 2) +
        Math.pow(coordinates.y - HOME_ANCHOR.y, 2) +
        Math.pow(coordinates.z - HOME_ANCHOR.z, 2),
    ),
  );

  return (
    <>
      {/* star stage: the star map is the subject, the copy is a corner plate.
          2026-10-30 — the layers used to cross-fade; most of the time that left
          the largest area of the page showing one paragraph and empty space. */}
      <section
        className="atlas-hud hud-corners"
        style={{ position: "relative", minHeight: 320, display: "grid", placeItems: "center", overflow: "hidden" }}
      >
        <span className="hud-scanbeam" aria-hidden />
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            zIndex: 2,
            display: "grid",
            gap: 6,
            padding: "14px 16px",
            maxWidth: 420,
            justifyItems: "start",
            textAlign: "left",
            pointerEvents: "none",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontFamily: "var(--atlas-mono)",
              fontSize: 9.5,
              letterSpacing: "0.34em",
              textTransform: "uppercase",
              color: "var(--atlas-signal)",
              textShadow: "0 0 12px rgba(46,230,255,.65)",
            }}
          >
            <span className="hud-lamp" aria-hidden />
            {isRemoteUniverse ? "MULTIVERSE PROTOCOL" : "NAVIGATION SYSTEM"}
          </span>
          <h1
            style={{
              margin: 0,
              fontFamily: "var(--atlas-display)",
              fontWeight: 700,
              fontSize: "clamp(21px, 2.1vw, 30px)",
              letterSpacing: "0.09em",
              lineHeight: 1.1,
              color: "#fff",
              textShadow: "0 0 18px rgba(46,230,255,.45), 0 0 48px rgba(46,230,255,.22)",
            }}
          >
            {isRemoteUniverse ? "阿特拉斯多元宇宙协议" : "阿特拉斯导航系统"}
          </h1>
          <p style={{ margin: 0, maxWidth: 360, fontSize: 12, lineHeight: 1.55, color: "var(--atlas-n-700)" }}>
            穿越无限的星系、太阳系与行星。输入坐标，或在下面的控制台掷一次随机跳跃。
          </p>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              marginTop: 2,
              padding: "2px 7px",
              border: "1px solid rgba(46,230,255,.26)",
              background: "rgba(46,230,255,.07)",
              fontFamily: "var(--atlas-mono)",
              fontSize: 9.5,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--atlas-signal)",
            }}
          >
            目标恒星 · {STAR_LABELS[star.type] ?? star.type}
          </span>
        </div>

        {/* deep field: parallax dots, so the stage reads as space instead of a
            dark panel with a wireframe in it */}
        <span className="atlas-stars" aria-hidden />

        <div
          className="atlas-star-blend"
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            zIndex: 1,
            pointerEvents: show3DViewer ? "auto" : "none",
          }}
        >
          {/* Absolute with negative insets on purpose: a percentage height in a
              grid item is content-sized, which let the canvas grow its own
              parent (13k px). Definite insets break that loop — and because the
              canvas now over-covers the panel, the renderer's faintly-lit rect
              has no edge inside it to give away. */}
          <div
            style={{
              position: "absolute",
              inset: "-20%",
            }}
          >
            <Suspense fallback={null}>
              <RealisticStarStage
                type={star.type}
                color={star.color}
                seed={star.seed}
                near={0.55}
                height="100%"
                autoRotate
                enableZoom={false}
                orbiters={2}
                frameDistance={9}
                className="w-full h-full"
              />
            </Suspense>
          </div>
        </div>

        {/* Aim layer. Dragging here moves the target coordinates instead of the
            camera: it makes the stage something you *do* rather than look at.
            The commit happens on pointer-up — nudging the star once per pixel
            would rebuild its shader uniforms every frame. */}
        <div
          onPointerDown={onAimDown}
          onPointerMove={onAimMove}
          onPointerUp={onAimUp}
          onPointerCancel={onAimUp}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 3,
            cursor: aiming ? "grabbing" : "crosshair",
            touchAction: "none",
          }}
          title="拖动瞄准坐标"
        />

        {aim ? (
          <div
            style={{
              position: "absolute",
              left: "50%",
              bottom: 46,
              zIndex: 4,
              transform: "translateX(-50%)",
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "5px 10px",
              border: "1px solid rgba(46,230,255,.4)",
              background: "rgba(4,8,16,.86)",
              boxShadow: "0 0 26px -10px rgba(46,230,255,.9)",
              fontFamily: "var(--atlas-mono)",
              fontSize: 10,
              letterSpacing: "0.1em",
              color: "var(--atlas-n-900)",
              pointerEvents: "none",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ color: "var(--atlas-signal)" }}>瞄准</span>
            <span className="atlas-tabular">
              {aim.x.toLocaleString()} · {aim.y.toLocaleString()} · {aim.z.toLocaleString()}
            </span>
            <span style={{ color: "var(--atlas-n-600)" }}>松开确认</span>
          </div>
        ) : null}

        {/* Status strip: the four numbers a pilot actually checks before a jump. */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 2,
            display: "flex",
            alignItems: "center",
            gap: 0,
            height: 34,
            padding: "0 12px",
            borderTop: "1px solid rgba(46,230,255,.18)",
            background: "linear-gradient(180deg, rgba(6,12,24,.2), rgba(4,8,16,.85))",
            fontFamily: "var(--atlas-mono)",
            fontSize: 9.5,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--atlas-n-600)",
            pointerEvents: "none",
          }}
        >
          <StatusCell label="目标恒星" value={STAR_LABELS[star.type] ?? star.type} tone="var(--atlas-signal)" />
          <StatusCell label="航程" value={`${(distanceFromAnchor / 1000).toFixed(1)}k`} />
          <StatusCell
            label="燃料"
            value={travelCost ? `${formatResource(travelCost.antimatter as number)} AM` : "—"}
            tone={canAfford ? "var(--atlas-n-900)" : "var(--atlas-danger)"}
          />
          <StatusCell
            label="状态"
            value={busy ? "跳跃中" : canAfford ? "可跳跃" : "燃料不足"}
            tone={canAfford ? "var(--atlas-ok)" : "var(--atlas-danger)"}
            last
          />
          <span
            style={{
              marginLeft: "auto",
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              color: "var(--atlas-n-600)",
            }}
          >
            <span className="hud-lamp" aria-hidden />
            {aiming ? "松开确认坐标" : "拖动瞄准 · 坐标决定恒星"}
          </span>
        </div>
      </section>

      <section
        className="atlas-hud hud-corners"
        style={{ position: "relative", padding: "12px 14px 14px", display: "grid", gap: 10 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="atlas-display" style={{ fontSize: 14, letterSpacing: "0.2em", color: "var(--atlas-n-950)" }}>
            跳跃控制台
          </span>
          <span aria-hidden style={{ flex: 1, height: 1, background: "linear-gradient(90deg, rgba(46,230,255,.5), transparent)" }} />
          <Label>{canAfford ? "燃料充足" : "燃料不足"}</Label>
        </div>

        <JumpConsole
          coordinates={coordinates}
          onChange={onCoordinatesChange}
          onSubmit={onSubmit}
          travelCost={travelCost}
          canAfford={canAfford}
          busy={busy}
          efficiency={efficiency}
          range={range}
          inRange={inRange}
        />

        {error ? (
          <div
            style={{
              display: "flex",
              gap: 8,
              padding: "7px 10px",
              border: "1px solid rgba(255,77,109,.45)",
              borderLeft: "3px solid var(--atlas-danger)",
              background: "rgba(255,77,109,.1)",
              color: "var(--atlas-danger)",
              fontSize: 12,
            }}
            role="alert"
          >
            导航错误：{error}
          </div>
        ) : null}
      </section>
    </>
  );
};

export default UniverseStage;

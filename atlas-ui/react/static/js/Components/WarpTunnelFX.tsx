// atlas-ui/react/static/js/Components/WarpTunnelFX.tsx
//
// The "超空间跳跃" reskin (§10.2 of docs/render-transplant): the 3.0 sequence is a charging
// drive → screen bending → wormhole tunnel → a second aperture at the destination, and it
// lives inside Navigator/Engine/ShipView (76.5 KB tightly coupled to the explorer state
// machine). Porting that is not an increment; this is the artist's pass on top of the 2.x
// warp instead, and it only adds a layer — the existing StarfieldWarpReveal keeps rendering
// exactly as before underneath.
//
// Three things the doc asks for, all in 2D so nothing about the render architecture moves:
//   * tunnel volumetric light  — concentric rings + a pulsing core glow, radially masked;
//   * radial chromatic dispersion — every streak is drawn three times, offset along its own
//     radius, in R/G/B with additive blending (what a cheap lens does at the frame edge);
//   * speed lines — streaks that start mid-frame and accelerate outward as the jump charges.
//
// It is deliberately its own component: mount it next to the warp, give it the same
// lifetime, and delete it if the look does not sell.

import React, { useEffect, useRef } from "react";

export interface WarpTunnelFXProps {
  /** Draw at all. Turning it off also stops the rAF loop. */
  active?: boolean;
  /** 0 at ignition, 1 at full charge. Drives speed and streak length. */
  intensity?: number;
  /** Streaks on screen. 90 is a subtle pass, 220 is a full tunnel. */
  streaks?: number;
  /** Fade the whole layer; the reveal underneath stays visible. */
  opacity?: number;
  className?: string;
}

interface Streak {
  angle: number;
  /** 0..1 along the tunnel: where the streak currently is. */
  t: number;
  speed: number;
  width: number;
  /** Per-streak phase so the rings are not synchronised. */
  phase: number;
}

const TAU = Math.PI * 2;

export const WarpTunnelFX: React.FC<WarpTunnelFXProps> = ({
  active = true,
  intensity = 0.8,
  streaks = 140,
  opacity = 1,
  className,
}) => {
  const hostRef = useRef<HTMLCanvasElement | null>(null);
  const params = useRef({ active, intensity, streaks });
  params.current = { active, intensity, streaks };

  useEffect(() => {
    const canvas = hostRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let width = 0;
    let height = 0;
    let dpr = 1;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    // Streaks live in polar space: `t` runs 0 (centre) → 1 (past the frame corner)
    let pool: Streak[] = [];
    const build = () => {
      const count = Math.max(0, Math.min(400, Math.round(params.current.streaks)));
      pool = Array.from({ length: count }, () => ({
        angle: Math.random() * TAU,
        t: Math.random(),
        speed: 0.25 + Math.random() * 0.85,
        width: 0.6 + Math.random() * 1.8,
        phase: Math.random() * TAU,
      }));
    };
    build();

    let raf = 0;
    let last = performance.now();
    let builtFor = params.current.streaks;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { active: on, intensity: power, streaks: wanted } = params.current;
      if (!on) return;
      if (wanted !== builtFor) {
        builtFor = wanted;
        build();
      }

      const cx = width / 2;
      const cy = height / 2;
      const far = Math.hypot(cx, cy) * 1.1;

      // Trails: a translucent wipe instead of a clear, so the tunnel keeps its smear
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(3, 6, 12, 0.22)";
      ctx.fillRect(0, 0, width, height);

      // --- tunnel volumetric light: rings marching outwards, brighter towards the core
      ctx.globalCompositeOperation = "lighter";
      const rings = 7;
      for (let index = 0; index < rings; index += 1) {
        const phase = ((now / 1000) * (0.55 + 0.9 * power) + index / rings) % 1;
        const radius = far * phase * phase;
        const alpha = (1 - phase) * 0.1 * (0.4 + power);
        const hue = 188 + 40 * phase; // cyan → blue-violet as it recedes
        ctx.strokeStyle = `hsla(${hue}, 92%, 68%, ${alpha.toFixed(3)})`;
        ctx.lineWidth = 1 + 2.6 * (1 - phase);
        ctx.beginPath();
        ctx.ellipse(cx, cy, radius, radius * 0.94, 0, 0, TAU);
        ctx.stroke();
      }

      // --- core: the mouth of the tunnel, plus a hot rim
      const coreRadius = 12 + 26 * power + 3 * Math.sin(now / 140);
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRadius * 4.2);
      core.addColorStop(0, `rgba(190, 240, 255, ${0.5 + 0.3 * power})`);
      core.addColorStop(0.35, `rgba(90, 170, 255, ${0.16 + 0.2 * power})`);
      core.addColorStop(1, "rgba(20, 40, 90, 0)");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, coreRadius * 4.2, 0, TAU);
      ctx.fill();

      // --- speed lines, three passes for the chromatic split
      const speed = (0.35 + 2.4 * power) * dt;
      const channels: Array<[string, number]> = [
        ["rgba(255, 96, 96, ", -1],
        ["rgba(96, 255, 160, ", 0],
        ["rgba(120, 170, 255, ", 1],
      ];
      const spacing = 1.6 + 5 * power;

      for (const streak of pool) {
        streak.t += (speed * streak.speed) / Math.max(0.15, 1 - streak.t * 0.6);
        if (streak.t > 1) {
          streak.t -= 1;
          streak.angle = Math.random() * TAU;
          streak.phase = Math.random() * TAU;
        }
        const t0 = streak.t;
        const t1 = Math.min(1, streak.t + 0.02 + 0.22 * power * streak.speed);
        if (t1 <= t0) continue;

        const cos = Math.cos(streak.angle);
        const sin = Math.sin(streak.angle);
        // Streaks fade in from the core and out at the frame edge
        const alpha = Math.min(1, (1 - t0) * 2) * Math.min(1, t0 * 6) * (0.16 + 0.5 * power);

        for (const [color, channelOffset] of channels) {
          const shift = channelOffset * spacing * (0.4 + t0);
          ctx.strokeStyle = `${color}${(alpha * 0.55).toFixed(3)})`;
          ctx.lineWidth = streak.width * (0.6 + 0.8 * power);
          ctx.beginPath();
          ctx.moveTo(cx + cos * (t0 * far + shift), cy + sin * (t0 * far + shift));
          ctx.lineTo(cx + cos * (t1 * far + shift), cy + sin * (t1 * far + shift));
          ctx.stroke();
        }
      }

      // --- vignette so the edges fall away and the tunnel reads as round
      ctx.globalCompositeOperation = "source-over";
      const vignette = ctx.createRadialGradient(cx, cy, far * 0.28, cx, cy, far);
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(1, "rgba(0,0,0,0.72)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);
    };

    if (reduced) {
      // One still frame: the tunnel shape without the motion
      frame(performance.now());
      cancelAnimationFrame(raf);
      return () => observer.disconnect();
    }

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={hostRef}
      aria-hidden
      className={className}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        opacity: active ? opacity : 0,
        transition: "opacity 240ms linear",
        mixBlendMode: "screen",
        zIndex: 40,
      }}
    />
  );
};

export default WarpTunnelFX;

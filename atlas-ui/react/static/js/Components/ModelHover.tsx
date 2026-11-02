// atlas-ui/react/static/js/Components/ModelHover.tsx — hover a chip, look at a model.
//
// 2026-10-31. The station mesh is 36 MB (an FBX with no textures — see
// `ModelViewer`). Loading it on page load would be absurd for something most
// players never look at, so it loads on first hover and is then kept mounted,
// hidden, for the rest of the visit. Re-hovering is instant; leaving the page
// releases it.
//
// The panel is `position: fixed` and clamped to the viewport: the chip lives at
// the edge of the stage, and a panel anchored inside it would be clipped by the
// frame's `overflow: hidden`.

import React, { useCallback, useEffect, useRef, useState } from "react";
import ModelViewer from "./ModelViewer.tsx";

export interface ModelHoverProps {
  url: string;
  /** Chip text. */
  label: string;
  /** Small glyph before the label. */
  icon?: string;
  /** Panel edge in px. */
  size?: number;
  children?: never;
}

const PANEL = 420;
const GRACE_MS = 220;

const ModelHover: React.FC<ModelHoverProps> = ({ url, label, icon = "◈", size = PANEL }) => {
  const chipRef = useRef<HTMLButtonElement | null>(null);
  const [everOpened, setEverOpened] = useState(false);
  const [visible, setVisible] = useState(false);
  const [anchor, setAnchor] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const enterTimer = useRef<number | null>(null);
  const leaveTimer = useRef<number | null>(null);

  const place = useCallback(() => {
    const rect = chipRef.current?.getBoundingClientRect();
    if (!rect) return;
    const margin = 10;
    // Prefer the space above the chip; flip down when there is not enough.
    const top = rect.top - size - margin >= margin ? rect.top - size - margin : rect.bottom + margin;
    const left = Math.min(Math.max(margin, rect.left), Math.max(margin, window.innerWidth - size - margin));
    setAnchor({ left, top: Math.min(top, Math.max(margin, window.innerHeight - size - margin)) });
  }, [size]);

  const open = useCallback(() => {
    if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    enterTimer.current = window.setTimeout(() => {
      place();
      setEverOpened(true);
      setVisible(true);
    }, GRACE_MS);
  }, [place]);

  const close = useCallback(() => {
    if (enterTimer.current) window.clearTimeout(enterTimer.current);
    // Short grace so the cursor can cross the gap between chip and panel.
    leaveTimer.current = window.setTimeout(() => setVisible(false), 160);
  }, []);

  useEffect(() => {
    return () => {
      if (enterTimer.current) window.clearTimeout(enterTimer.current);
      if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    };
  }, []);

  return (
    <>
      <button
        ref={chipRef}
        type="button"
        onMouseEnter={open}
        onMouseLeave={close}
        onFocus={open}
        onBlur={close}
        title={`悬停查看 ${label}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          height: 24,
          padding: "0 9px",
          border: "1px solid var(--atlas-line-strong)",
          background: "rgba(46,230,255,.07)",
          color: "var(--atlas-n-800)",
          fontFamily: "var(--atlas-mono)",
          fontSize: 9.5,
          letterSpacing: "0.12em",
          cursor: "help",
          whiteSpace: "nowrap",
        }}
      >
        <span aria-hidden style={{ fontSize: 11, lineHeight: 1, color: "var(--atlas-signal)" }}>
          {icon}
        </span>
        {label}
      </button>

      {everOpened ? (
        <div
          onMouseEnter={open}
          onMouseLeave={close}
          style={{
            position: "fixed",
            left: anchor.left,
            top: anchor.top,
            width: size,
            height: size,
            zIndex: 90,
            pointerEvents: visible ? "auto" : "none",
            opacity: visible ? 1 : 0,
            transition: "opacity 160ms ease",
            border: "1px solid rgba(46,230,255,.32)",
            background: "radial-gradient(120% 100% at 50% 20%, rgba(12,24,42,.98), rgba(3,6,12,.99))",
            boxShadow: "0 24px 60px -30px rgba(0,0,0,.95), 0 0 0 1px rgba(46,230,255,.12)",
          }}
        >
          <ModelViewer url={url} spin />
          <span
            style={{
              position: "absolute",
              left: 8,
              bottom: 6,
              fontFamily: "var(--atlas-mono)",
              fontSize: 8.5,
              letterSpacing: "0.24em",
              textTransform: "uppercase",
              color: "var(--atlas-n-600)",
            }}
          >
            {label}
          </span>
          {/* corner ticks, matching the frame language */}
          <span aria-hidden style={{ position: "absolute", left: -1, top: -1, width: 10, height: 1, background: "var(--atlas-signal)" }} />
          <span aria-hidden style={{ position: "absolute", left: -1, top: -1, width: 1, height: 10, background: "var(--atlas-signal)" }} />
          <span aria-hidden style={{ position: "absolute", right: -1, bottom: -1, width: 10, height: 1, background: "var(--atlas-signal)" }} />
          <span aria-hidden style={{ position: "absolute", right: -1, bottom: -1, width: 1, height: 10, background: "var(--atlas-signal)" }} />
        </div>
      ) : null}
    </>
  );
};

export default ModelHover;

// atlas-ui/react/static/js/Shell/BackLinks.tsx — the way back up the hierarchy.
//
// 2026-10-31. The breadcrumb in the top bar already links up, but it renders as
// small caps text among six other items and players do not read it as a control.
// This is the same trip as a button, sitting at the far left of the stage heading
// where the eye lands first.
//
// It goes through `go()` like every other in-world move, so going "up" is as
// instant as going down — no document load, no 3D teardown of the frame.

import React from "react";
import { go } from "../Utils/PageNavigation.ts";

export interface BackLink {
  /** Button text. Kept to one or two characters — space here is tight. */
  label: string;
  href: string;
  title?: string;
  /** Lead glyph: `‹` one level, `‹‹` all the way out. */
  icon?: string;
}

const BackLinks: React.FC<{ items: BackLink[] }> = ({ items }) => (
  <div style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
    {items.map((item) => (
      <button
        key={`${item.href}-${item.label}`}
        type="button"
        onClick={() => void go(item.href)}
        title={item.title ?? item.href}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          height: 20,
          padding: "0 7px",
          border: "1px solid var(--atlas-line-strong)",
          background: "rgba(46,230,255,.06)",
          color: "var(--atlas-n-800)",
          fontFamily: "var(--atlas-mono)",
          fontSize: 9.5,
          letterSpacing: "0.1em",
          cursor: "pointer",
          whiteSpace: "nowrap",
          transition: "background 120ms, border-color 120ms, color 120ms",
        }}
        onMouseEnter={(event) => {
          event.currentTarget.style.background = "rgba(46,230,255,.16)";
          event.currentTarget.style.borderColor = "var(--atlas-signal)";
          event.currentTarget.style.color = "#fff";
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.background = "rgba(46,230,255,.06)";
          event.currentTarget.style.borderColor = "var(--atlas-line-strong)";
          event.currentTarget.style.color = "var(--atlas-n-800)";
        }}
      >
        <span aria-hidden style={{ fontSize: 11, lineHeight: 1 }}>
          {item.icon ?? "‹"}
        </span>
        {item.label}
      </button>
    ))}
  </div>
);

export default BackLinks;

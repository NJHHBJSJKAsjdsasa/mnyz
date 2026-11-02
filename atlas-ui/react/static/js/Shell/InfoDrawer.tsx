// atlas-ui/react/static/js/Shell/InfoDrawer.tsx — the right-hand drawer.
//
// 2026-10-31 (P1b of docs/frontend-redesign/16-shell-unification.md). The three
// inner views put a 320px column of readouts next to the 3D stage, so the thing
// you came to look at — the galaxy, the star, the planet — got half the width and
// the screen read as a spec sheet with a picture on the left.
//
// Now the stage fills the area and this drawer floats over its right edge:
// collapsed to a 34px spine (vertical label), expanding on click. The 3D canvas
// is absolutely positioned under it, so nothing re-lays-out and the renderer
// never sees a resize when the drawer opens.
//
// 2026-10-31 (P1c): the planet view also has the 星舰实验舱 (exploration lab) —
// twelve tool tabs that used to sit in a full-width panel under the planet and
// squeezed it into a strip. It is a drawer tab now, not a page section: the
// planet keeps the screen, the lab is one click away and scrolls inside.

import React, { useState } from "react";

export interface DrawerTab {
  id: string;
  label: string;
  content: React.ReactNode;
}

export interface InfoDrawerProps {
  /** Spine label when collapsed. */
  label?: string;
  defaultOpen?: boolean;
  /** Panel width when open. 380 holds the info readouts; 440 fits the lab's grids. */
  width?: number;
  /** Tabs. When omitted, `children` renders as the single pane. */
  tabs?: DrawerTab[];
  /**
   * Notified on every open/close. The stage uses it to reserve the collapsed
   * spine's width so the 3D view's own corner controls are not covered; once the
   * drawer is open it floats over the canvas as intended.
   */
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}

const InfoDrawer: React.FC<InfoDrawerProps> = ({
  label = "详细信息",
  defaultOpen = false,
  width = 380,
  tabs,
  onOpenChange,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const [active, setActive] = useState(tabs?.[0]?.id ?? "");

  const activeTab = tabs?.find((tab) => tab.id === active) ?? tabs?.[0];

  const toggle = () => {
    const next = !open;
    setOpen(next);
    onOpenChange?.(next);
  };

  return (
    <aside
      data-open={open ? "true" : undefined}
      aria-label={label}
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: open ? width : 34,
        display: "flex",
        flexDirection: "column",
        borderLeft: "1px solid rgba(46,230,255,.28)",
        background: open
          ? "linear-gradient(180deg, rgba(8,14,26,.97), rgba(4,8,16,.99))"
          : "linear-gradient(180deg, rgba(8,14,26,.82), rgba(4,8,16,.92))",
        transition: "width 180ms ease",
        overflow: "hidden",
        zIndex: 5,
        boxShadow: open ? "-14px 0 46px -22px rgba(0,0,0,.95)" : "none",
      }}
    >
      <button
        type="button"
        onClick={toggle}
        title={open ? "收起" : `展开${label}`}
        aria-expanded={open}
        style={{
          flexShrink: 0,
          width: "100%",
          height: open ? 30 : "100%",
          display: "flex",
          flexDirection: open ? "row" : "column",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: open ? 8 : 10,
          padding: open ? "0 10px" : "12px 0",
          background: "linear-gradient(180deg, rgba(46,230,255,.12), transparent)",
          border: "none",
          borderBottom: open ? "1px solid rgba(46,230,255,.22)" : "none",
          color: "var(--atlas-signal)",
          cursor: "pointer",
          fontFamily: "var(--atlas-mono)",
          fontSize: 9.5,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
        }}
      >
        <span aria-hidden style={{ fontSize: 12, lineHeight: 1 }}>
          {open ? "⟩" : "⟨"}
        </span>
        <span
          style={{
            writingMode: open ? "horizontal-tb" : "vertical-rl",
            whiteSpace: "nowrap",
            color: open ? "var(--atlas-n-800)" : "var(--atlas-n-700)",
          }}
        >
          {label}
        </span>
      </button>

      {open && tabs && tabs.length > 1 ? (
        <div
          className="atlas-scroll"
          role="tablist"
          style={{ flexShrink: 0, display: "flex", gap: 3, padding: "6px 8px", overflowX: "auto", borderBottom: "1px solid var(--atlas-line)" }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              type="button"
              aria-selected={tab.id === activeTab?.id}
              onClick={() => setActive(tab.id)}
              className="hud-tab"
              data-selected={tab.id === activeTab?.id ? "true" : undefined}
              style={{ height: 24, padding: "0 10px", fontSize: 11, whiteSpace: "nowrap", flexShrink: 0 }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}

      {open ? (
        <div className="atlas-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 12px 14px" }}>
          {tabs ? activeTab?.content : children}
        </div>
      ) : null}
    </aside>
  );
};

export default InfoDrawer;

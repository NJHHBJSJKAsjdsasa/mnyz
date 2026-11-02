// ui/Drawer.tsx — the side sheet (05 §5.3, T-69).
//
// Presentational on purpose: **no portal, no internal open state**. A drawer is
// always anchored to a host (the launcher, a row, a toolbar) and that host
// usually owns "is it open" plus click-outside handling. Portaling here would
// silently break the host's `ref.contains(event.target)` check — the exact bug
// SpaceshipPanel would have hit.
//
// No blur: a drawer is a solid surface, so it uses `--atlas-deep` rather than
// `.surface-overlay`. The blur budget (12) is for floating modals only.

import React from "react";

export interface DrawerProps {
  open: boolean;
  title: React.ReactNode;
  children: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
  /** Panel width in px; capped to the viewport. */
  width?: number;
  side?: "right" | "left";
  dismissible?: boolean;
  zIndex?: number;
}

export const Drawer: React.FC<DrawerProps> = ({
  open,
  title,
  children,
  onClose,
  footer,
  width = 380,
  side = "right",
  dismissible = true,
  zIndex = 60,
}) => {
  if (!open) return null;

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-label={typeof title === "string" ? title : undefined}
      style={{
        position: "fixed",
        top: 0,
        bottom: 0,
        [side]: 0,
        zIndex,
        width: `min(${width}px, 100vw)`,
        display: "flex",
        flexDirection: "column",
        background: "var(--atlas-deep)",
        borderLeft: side === "right" ? "1px solid var(--atlas-line)" : "none",
        borderRight: side === "left" ? "1px solid var(--atlas-line)" : "none",
        boxShadow: "0 -1px 0 0 var(--atlas-line), 0 24px 48px rgba(0, 0, 0, 0.55)",
        color: "var(--atlas-n-900)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--atlas-2)",
          padding: "var(--atlas-3) var(--atlas-4)",
          borderBottom: "1px solid var(--atlas-line)",
          background: "var(--atlas-plate)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--atlas-mono)",
            fontSize: "var(--atlas-t-micro)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--atlas-n-700)",
          }}
        >
          {title}
        </span>
        {dismissible ? (
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            style={{
              marginLeft: "auto",
              background: "transparent",
              border: "none",
              color: "var(--atlas-n-700)",
              cursor: "pointer",
              fontSize: "var(--atlas-t-title)",
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
        ) : null}
      </header>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "var(--atlas-3) var(--atlas-4)" }}>
        {children}
      </div>
      {footer ? (
        <footer
          style={{
            padding: "var(--atlas-3) var(--atlas-4)",
            borderTop: "1px solid var(--atlas-line)",
            background: "var(--atlas-plate)",
            display: "flex",
            justifyContent: "flex-end",
            gap: "var(--atlas-2)",
          }}
        >
          {footer}
        </footer>
      ) : null}
    </aside>
  );
};

export default Drawer;

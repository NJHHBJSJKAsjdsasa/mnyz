// atlas-ui/react/static/js/Shell/StageHeading.tsx — the two headings every game
// view draws: one at the top of the rail, one at the top of the stage.
//
// 2026-10-31 (P1). Each inner page used to invent its own version of both — the
// stage one was a 90px centred block ("SYSTEM / <name> / galaxy · coordinates"),
// the rail one did not exist because the list had no rail. Two shared components
// instead, so galaxy / system / planet cannot drift apart again.

import React from "react";

/**
 * Rail heading: level name + optional count, with the lit rule that ties it to
 * the frame's accent.
 */
export const RailHeading: React.FC<{ label: string; count?: number }> = ({ label, count }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
    <span
      aria-hidden
      style={{ width: 3, height: 12, background: "var(--atlas-signal)", boxShadow: "0 0 8px rgba(46,230,255,.9)" }}
    />
    <span className="atlas-display" style={{ fontSize: 13, letterSpacing: "0.22em", color: "var(--atlas-n-950)" }}>
      {label}
    </span>
    {count != null ? (
      <span className="atlas-tabular" style={{ marginLeft: "auto", fontSize: 10, color: "var(--atlas-n-600)" }}>
        {count.toLocaleString()}
      </span>
    ) : null}
  </div>
);

/**
 * Stage heading: kicker rule, title, meta on the right of the rule, and a slot
 * for the level stepper next to the title.
 *
 * Deliberately left-aligned and 2 rows tall. The old centred `<h1>` cost ~90px of
 * vertical space on every inner page and made a level change read as a page
 * change; this one costs ~46px and reads as a title bar.
 */
export const StageHeading: React.FC<{
  kicker: string;
  title: string;
  meta?: React.ReactNode;
  /**
   * Slot at the far left of the kicker rule — the way back up the hierarchy.
   * It lives here rather than as its own row so adding a "back" control costs no
   * vertical space: the kicker row already exists and is otherwise empty on the
   * left.
   */
  leading?: React.ReactNode;
  children?: React.ReactNode;
}> = ({ kicker, title, meta, leading, children }) => (
  // Flex column, not grid: as a grid item inside the stage's own grid, an
  // implicit `auto` row stretched this header to the height of its sibling and
  // every child then centred inside a 2000px-tall box. Flex column sizes to
  // content and cannot stretch.
  <header style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 14 }}>
      {leading}
      <span
        style={{
          fontFamily: "var(--atlas-mono)",
          fontSize: 9,
          letterSpacing: "0.3em",
          textTransform: "uppercase",
          color: "var(--atlas-signal)",
          textShadow: "0 0 12px rgba(46,230,255,.6)",
        }}
      >
        {kicker}
      </span>
      <span
        aria-hidden
        style={{ flex: 1, height: 1, background: "linear-gradient(90deg, rgba(46,230,255,.45), transparent)" }}
      />
      {meta ? (
        <span
          style={{
            fontFamily: "var(--atlas-mono)",
            fontSize: 9.5,
            letterSpacing: "0.12em",
            color: "var(--atlas-n-600)",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          {meta}
        </span>
      ) : null}
    </div>

    <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
      <h1
        style={{
          margin: 0,
          fontFamily: "var(--atlas-display)",
          fontWeight: 600,
          fontSize: "clamp(19px, 1.7vw, 26px)",
          letterSpacing: "0.08em",
          lineHeight: 1.1,
          color: "#fff",
          textShadow: "0 0 18px rgba(46,230,255,.4)",
        }}
      >
        {title}
      </h1>
      {children ? <span style={{ marginLeft: "auto" }}>{children}</span> : null}
    </div>
  </header>
);

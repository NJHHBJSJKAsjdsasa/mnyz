// atlas-ui/react/static/js/Shell/RailPager.tsx — page stepping, sized for the rail.
//
// `Components/Pagination.tsx` (deleted in P2) rendered first/prev/7 numbers/next/last in a row
// (~190 lines). That was fine when the system list was the page body; inside a
// 264px rail it is wider than the rail. This is the same navigation expressed as
// one strip: ‹ 3 / 74 ›. Numbered jumps reappear in P3 as a virtual-scroll
// sentinel, at which point this component goes away too.
//
// `/galaxy/<page>` is 150 systems per page — a galaxy can hold 11k+ of them, so
// pagination is not optional and must not be dropped in the name of "less chrome".

import React, { useState } from "react";
import { go } from "../Utils/PageNavigation.ts";

const BTN: React.CSSProperties = {
  width: 22,
  height: 20,
  display: "inline-grid",
  placeItems: "center",
  background: "rgba(46,230,255,.07)",
  border: "1px solid var(--atlas-line-strong)",
  color: "var(--atlas-n-800)",
  fontFamily: "var(--atlas-mono)",
  fontSize: 11,
  lineHeight: 1,
  cursor: "pointer",
  padding: 0,
};

const BTN_OFF: React.CSSProperties = {
  ...BTN,
  background: "transparent",
  color: "var(--atlas-n-600)",
  cursor: "not-allowed",
  opacity: 0.5,
};

export interface RailPagerProps {
  page: number;
  finish: number;
  /** e.g. `p => \`/galaxy/\${p}\`` */
  hrefFor: (page: number) => string;
  /** Row label, e.g. "系统". */
  label?: string;
}

const RailPager: React.FC<RailPagerProps> = ({ page, finish, hrefFor, label }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(page));

  const goTo = (target: number) => {
    void go(hrefFor(target));
  };
  const hasPrev = page > 1;
  const hasNext = page < finish;

  /**
   * Jump straight to a page. An 11,000-system galaxy is 74 pages; walking there
   * with ‹ › is 73 clicks, which is why the number itself is the control.
   */
  const commit = () => {
    setEditing(false);
    const parsed = Number.parseInt(draft, 10);
    if (!Number.isFinite(parsed)) return;
    const target = Math.max(1, Math.min(finish, parsed));
    if (target !== page) goTo(target);
  };

  return (
    <div
      style={{
        // Pinned to the bottom of the rail: a galaxy holds 150 systems per page,
        // so the pager must not scroll out of reach behind 150 rows. Sticky (not
        // fixed) keeps it in flow for the short lists, where there is nothing to
        // scroll and a floating strip would just be extra chrome.
        position: "sticky",
        bottom: -12,
        marginBottom: -12,
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 0 12px",
        borderTop: "1px solid var(--atlas-line)",
        background: "linear-gradient(180deg, rgba(5,9,18,.94) 0%, rgba(5,9,18,.99) 45%)",
        zIndex: 2,
      }}
    >
      <button
        type="button"
        onClick={() => hasPrev && goTo(page - 1)}
        disabled={!hasPrev}
        style={hasPrev ? BTN : BTN_OFF}
        title="上一页"
        aria-label="上一页"
      >
        ‹
      </button>
      {editing ? (
        <span style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
          <input
            autoFocus
            type="number"
            min={1}
            max={finish}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit();
              if (event.key === "Escape") {
                setDraft(String(page));
                setEditing(false);
              }
            }}
            style={{
              width: 46,
              height: 20,
              textAlign: "center",
              background: "rgba(4,9,18,.9)",
              border: "1px solid var(--atlas-signal)",
              color: "var(--atlas-n-950)",
              fontFamily: "var(--atlas-mono)",
              fontSize: 10,
              fontVariantNumeric: "tabular-nums",
              outline: "none",
            }}
          />
          <span style={{ fontFamily: "var(--atlas-mono)", fontSize: 9.5, color: "var(--atlas-n-600)" }}>/ {finish}</span>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraft(String(page));
            setEditing(true);
          }}
          title="输入页码跳转"
          style={{
            flex: 1,
            background: "none",
            border: "none",
            cursor: "text",
            fontFamily: "var(--atlas-mono)",
            fontSize: 9.5,
            letterSpacing: "0.14em",
            color: "var(--atlas-n-600)",
            padding: 0,
          }}
        >
          {label ? `${label} ` : ""}
          <span className="atlas-tabular" style={{ color: "var(--atlas-n-900)" }}>
            {page}
          </span>{" "}
          / {finish}
        </button>
      )}
      <button
        type="button"
        onClick={() => hasNext && goTo(page + 1)}
        disabled={!hasNext}
        style={hasNext ? BTN : BTN_OFF}
        title="下一页"
        aria-label="下一页"
      >
        ›
      </button>
    </div>
  );
};

export default RailPager;

// atlas-ui/react/static/js/Shell/RailSearch.tsx — filter the rail's list.
//
// 2026-10-31 (P3). A galaxy here holds 11,038 systems in 74 pages of 150. The
// list is not slow to render — 150 rows is nothing — it is slow to *search*. The
// old answer was to click ‹ › seventy-three times and read every row.
//
// Scope, stated plainly: this filters the page that is already loaded. There is
// no cross-galaxy search because there is no endpoint for one, and the API is
// frozen. If that changes (`GET /api/v1/systems?q=`), this box is where the call
// goes and the result set replaces `systems` before it reaches the list.
//
// Deliberately not a controlled-from-outside fuzzy matcher: plain substring,
// case-insensitive, and it also matches the system number (`#42`).

import React from "react";

export interface RailSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Rows shown / rows on this page. Hidden when there is no query. */
  matched?: number;
  total?: number;
  /** A remote query is in flight. */
  busy?: boolean;
}

const RailSearch: React.FC<RailSearchProps> = ({ value, onChange, placeholder = "搜索…", matched, total, busy = false }) => (
  <div
    style={{
      position: "relative",
      display: "flex",
      alignItems: "center",
      gap: 6,
      height: 26,
      padding: "0 6px",
      border: "1px solid var(--atlas-line-strong)",
      background: "rgba(4,9,18,.72)",
      flexShrink: 0,
    }}
  >
    <span aria-hidden style={{ fontSize: 11, color: "var(--atlas-n-600)", lineHeight: 1 }}>
      ⌕
    </span>
    <input
      type="search"
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Escape") onChange("");
      }}
      style={{
        flex: 1,
        minWidth: 0,
        background: "transparent",
        border: "none",
        outline: "none",
        color: "var(--atlas-n-950)",
        fontFamily: "var(--atlas-mono)",
        fontSize: 11,
        letterSpacing: "0.04em",
      }}
    />
    {value ? (
      <>
        {busy ? (
          <span
            aria-hidden
            style={{ fontFamily: "var(--atlas-mono)", fontSize: 10, color: "var(--atlas-signal)", whiteSpace: "nowrap" }}
          >
            ⋯
          </span>
        ) : matched != null && total != null ? (
          <span
            className="atlas-tabular"
            title={total > matched ? `全星系 ${total.toLocaleString()} 个系统` : undefined}
            style={{ fontFamily: "var(--atlas-mono)", fontSize: 9.5, color: "var(--atlas-n-600)", whiteSpace: "nowrap" }}
          >
            {matched}
            {total > matched ? `/${total.toLocaleString()}` : ""}
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="清除搜索"
          title="清除"
          style={{
            background: "none",
            border: "none",
            color: "var(--atlas-n-600)",
            cursor: "pointer",
            fontSize: 12,
            lineHeight: 1,
            padding: 0,
          }}
        >
          ×
        </button>
      </>
    ) : null}
  </div>
);

export default RailSearch;

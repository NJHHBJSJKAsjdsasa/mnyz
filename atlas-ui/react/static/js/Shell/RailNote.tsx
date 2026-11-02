// atlas-ui/react/static/js/Shell/RailNote.tsx — a one-line explanation under the
// search box: zero hits, or "these results only cover part of the galaxy".
//
// Separate from a list's empty state because it is not the list's fault: the rail
// is showing *search results*, and a search can honestly come back empty or
// partial. Saying so is the difference between "no such system" and "we looked at
// 60k of 790k".

import React from "react";

export interface RailNoteProps {
  title: string;
  detail?: string;
  tone?: "muted" | "warn";
}

const RailNote: React.FC<RailNoteProps> = ({ title, detail, tone = "muted" }) => (
  <div style={{ display: "grid", gap: 3, padding: "10px 2px" }}>
    <span style={{ fontSize: 11.5, color: tone === "warn" ? "var(--atlas-warn)" : "var(--atlas-n-700)" }}>{title}</span>
    {detail ? (
      <span className="atlas-tabular" style={{ fontSize: 10, lineHeight: 1.45, color: "var(--atlas-n-600)" }}>
        {detail}
      </span>
    ) : null}
  </div>
);

export default RailNote;

// Shell/CommandPalette.tsx — ⌘K / Ctrl+K jump-to-panel (05 §5.1, T-65g).
//
// Deliberately not a general command framework: it lists panels, filters by
// substring, and closes. Anything more (actions, arguments, history) belongs in a
// separate spec, and a half-built command system is worse than none.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "../ui/Input.tsx";

export interface PaletteEntry {
  id: string;
  label: string;
  hint?: string;
}

export interface CommandPaletteProps {
  open: boolean;
  entries: PaletteEntry[];
  onSelect: (id: string) => void;
  onClose: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ open, entries, onSelect, onClose }) => {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter(
      (entry) => entry.label.toLowerCase().includes(needle) || (entry.hint ?? "").toLowerCase().includes(needle),
    );
  }, [entries, query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setCursor(0);
      return;
    }
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (cursor >= matches.length) setCursor(0);
  }, [matches.length, cursor]);

  if (!open) return null;

  const commit = (index: number) => {
    const entry = matches[index];
    if (entry) onSelect(entry.id);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="命令面板"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "12vh",
        background: "rgba(6,8,13,.72)",
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(520px, 92vw)",
          background: "var(--atlas-plate)",
          border: "1px solid var(--atlas-line-strong)",
          borderRadius: 0,
          boxShadow: "0 24px 64px -24px rgba(0,0,0,.9)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: 8, borderBottom: "1px solid var(--atlas-line)" }}>
          <Input
            ref={inputRef}
            value={query}
            placeholder="跳到分区…"
            aria-label="搜索分区"
            onChange={(event) => {
              setQuery(event.target.value);
              setCursor(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") onClose();
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setCursor((value) => (matches.length ? (value + 1) % matches.length : 0));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setCursor((value) => (matches.length ? (value - 1 + matches.length) % matches.length : 0));
              }
              if (event.key === "Enter") {
                event.preventDefault();
                commit(cursor);
              }
            }}
          />
        </div>
        <ul style={{ listStyle: "none", margin: 0, padding: 4, maxHeight: 280, overflowY: "auto" }} className="atlas-scroll">
          {matches.length === 0 ? (
            <li style={{ padding: "10px 12px", color: "var(--atlas-n-600)", fontSize: "var(--atlas-t-small)" }}>
              没有匹配的分区
            </li>
          ) : (
            matches.map((entry, index) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => {
                    onSelect(entry.id);
                    onClose();
                  }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "baseline",
                    gap: 10,
                    padding: "8px 10px",
                    background: index === cursor ? "var(--atlas-plate-2)" : "transparent",
                    border: "none",
                    borderRadius: 0,
                    color: "var(--atlas-n-950)",
                    fontFamily: "var(--atlas-font)",
                    fontSize: "var(--atlas-t-body)",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  {entry.label}
                  {entry.hint ? (
                    <span style={{ color: "var(--atlas-n-600)", fontSize: "var(--atlas-t-micro)" }}>{entry.hint}</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
};

export default CommandPalette;

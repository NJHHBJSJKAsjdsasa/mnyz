// ui/Tabs.tsx — one or two levels (05 §5.2). Controlled only: the shell owns the
// active view so the URL hash stays the single source of truth.
//
// Game HUD: tabs are chips on a rail, not underline links. The active chip is a
// lit slab with a cut corner; inactive chips are transparent with a hairline.

import React from "react";

export interface TabItem {
  id: string;
  label: React.ReactNode;
  badge?: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  active: string;
  onChange: (id: string) => void;
  dense?: boolean;
}

export const Tabs: React.FC<TabsProps> = ({ items, active, onChange, dense = false }) => (
  <div
    role="tablist"
    className="atlas-scroll hud-tabrail"
    style={{
      display: "flex",
      gap: 3,
      padding: "3px 0",
      borderBottom: "1px solid var(--atlas-line)",
      overflowX: "auto",
    }}
  >
    {items.map((item) => {
      const selected = item.id === active;
      return (
        <button
          key={item.id}
          role="tab"
          aria-selected={selected}
          disabled={item.disabled}
          onClick={() => !item.disabled && onChange(item.id)}
          className="hud-tab"
          data-selected={selected ? "true" : undefined}
          style={{ height: dense ? 26 : 31, padding: "0 12px", fontSize: dense ? 11 : 12.5 }}
        >
          {item.label}
          {item.badge}
        </button>
      );
    })}
  </div>
);

export default Tabs;

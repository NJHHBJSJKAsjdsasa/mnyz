// atlas-ui/react/static/js/Components/SystemsList.tsx — the systems of a galaxy,
// as rail rows instead of a grid of cards.
//
// 2026-10-31 (P1 of docs/frontend-redesign/16-shell-unification.md): the list used
// to be the page body — a 2-to-6 column card grid with a hover overlay, sitting
// under a 90px centred title. It is now the left rail's content, so it is a
// single column of rows divided by the deck seam (`.rail-row` in tokens.css).
// Nothing moved out of the component: visit state, the eye markers and the
// click target are all unchanged.
//
// Navigation is still a full page load. P2 replaces this `window.location` with
// the shell's `navigate()`; do not convert it piecemeal before then.

import React, { useEffect, useState } from "react";
import { getSystemVisitStatus } from "../Utils/VisitHistory.tsx";
import { go } from "../Utils/PageNavigation.ts";
import { matchesSystem, normalizeQuery } from "../Shell/railFilter.ts";
import EyeOpenIcon from "../Icons/EyeOpenIcon.tsx";
import EyeClosedIcon from "../Icons/EyeClosedIcon.tsx";

interface System {
  index: number;
  number: number;
  name: string;
  num_planets?: number;
}

interface SystemsListProps {
  systems: System[];
  coordinates: string;
  /** Current system index, when the rail is showing the system you are in. */
  activeIndex?: number;
  /** Substring filter from the rail's search box (P3). Empty shows everything. */
  query?: string;
}

const SystemsList: React.FC<SystemsListProps> = ({ systems, coordinates, activeIndex, query = "" }) => {
  const [systemVisitStates, setSystemVisitStates] = useState<Map<number, "none" | "partial" | "complete">>(new Map());

  useEffect(() => {
    const loadHistoricalData = () => {
      try {
        const states = new Map<number, "none" | "partial" | "complete">();

        systems.forEach((system) => {
          const visitStatus = getSystemVisitStatus(coordinates, system.index, system.num_planets || 1);
          states.set(system.index, visitStatus);
        });

        setSystemVisitStates(states);
      } catch (error) {}
    };

    loadHistoricalData();
  }, [coordinates, systems]);

  const needle = normalizeQuery(query);
  const visible = needle ? systems.filter((system) => matchesSystem(system, needle)) : systems;

  if (systems.length === 0) {
    return (
      <div style={{ display: "grid", gap: 4, padding: "16px 0", textAlign: "center" }}>
        <span style={{ fontSize: 11.5, color: "var(--atlas-n-700)" }}>未找到系统</span>
        <span style={{ fontSize: 10.5, color: "var(--atlas-n-600)" }}>该星系似乎为空</span>
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <div style={{ display: "grid", gap: 4, padding: "16px 0", textAlign: "center" }}>
        <span style={{ fontSize: 11.5, color: "var(--atlas-n-700)" }}>本页无匹配</span>
        <span style={{ fontSize: 10.5, color: "var(--atlas-n-600)" }}>搜索只覆盖当前页的 {systems.length} 个系统</span>
      </div>
    );
  }

  return (
    <div className="rail-list">
      {visible.map((system) => {
        const visitStatus = systemVisitStates.get(system.index) || "none";
        return (
          <button
            key={system.index}
            type="button"
            className="rail-row"
            data-active={system.index === activeIndex ? "true" : undefined}
            onClick={() => void go(`/system/${system.index}`)}
            title={system.name}
          >
            <span className="rail-row__idx">#{system.number}</span>
            <span className="rail-row__name">{system.name}</span>
            {visitStatus === "complete" ? (
              <EyeOpenIcon className="w-3 h-3 text-green-400" />
            ) : visitStatus === "partial" ? (
              <EyeClosedIcon className="w-3 h-3 text-yellow-400" />
            ) : (
              <span aria-hidden style={{ width: 12 }} />
            )}
          </button>
        );
      })}
    </div>
  );
};

export default SystemsList;

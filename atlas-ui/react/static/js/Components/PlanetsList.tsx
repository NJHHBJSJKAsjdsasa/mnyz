// atlas-ui/react/static/js/Components/PlanetsList.tsx — the planets of a system,
// as rail rows.
//
// 2026-10-31 (P1 of 16-shell-unification): same change as `SystemsList` — the
// card grid became a single column of `.rail-row`s. The type swatch survives as
// a 6px disc instead of a 32px bead pinned to the card corner, which is the one
// piece of information the old card carried that a plain name does not.

import React, { useEffect, useState } from "react";
import { getVisitedPlanets, markPlanetAsVisited } from "../Utils/VisitHistory.tsx";
import { go } from "../Utils/PageNavigation.ts";
import { matchesPlanet, normalizeQuery } from "../Shell/railFilter.ts";
import EyeOpenIcon from "../Icons/EyeOpenIcon.tsx";

interface Planet {
  name: string;
  /**
   * Optional: `planet.html` only injects `{name}` into `#system-data` for the
   * sibling planets, so on the planet view every swatch falls back to white.
   * Widening this beats duplicating the list; the template gains the field when
   * P2 unifies the data islands.
   */
  planet_type?: string;
}

interface PlanetsListProps {
  planets: Planet[];
  coordinates: string;
  systemIndex: number;
  /** Current planet name, when the rail is showing the planet you are on. */
  activeName?: string;
  /** Substring filter from the rail's search box (P3). Empty shows everything. */
  query?: string;
}

const PLANET_COLORS: Record<string, string> = {
  "Gas Giant": "#FFA500",
  "气态巨行星": "#FFA500",
  Anomaly: "#FFFFFF",
  "异常行星": "#FFFFFF",
  Rocky: "#808080",
  "岩石行星": "#808080",
  Icy: "#ADD8E6",
  "冰态行星": "#ADD8E6",
  Oceanic: "#0000FF",
  "海洋行星": "#0000FF",
  Desert: "#FFD700",
  "沙漠行星": "#FFD700",
  Lava: "#FF0000",
  "熔岩行星": "#FF0000",
  Arid: "#800000",
  "干旱行星": "#800000",
  Swamp: "#008000",
  "沼泽行星": "#008000",
  Tundra: "#F0F8FF",
  "苔原行星": "#F0F8FF",
  Forest: "#006400",
  "森林行星": "#006400",
  Savannah: "#F4A460",
  "稀树草原行星": "#F4A460",
  Cave: "#D1D1D1",
  "洞穴行星": "#D1D1D1",
  Crystalline: "#00FFFF",
  "结晶行星": "#00FFFF",
  Metallic: "#C0C0C0",
  "金属行星": "#C0C0C0",
  Toxic: "#800080",
  "有毒行星": "#800080",
  Radioactive: "#00FF00",
  "放射性行星": "#00FF00",
  Magma: "#FF4500",
  "岩浆行星": "#FF4500",
  "Molten Core": "#FF8C00",
  "熔融核心行星": "#FF8C00",
  Carbon: "#090909",
  "碳行星": "#090909",
  Diamond: "#87CEFA",
  "钻石行星": "#87CEFA",
  "Super Earth": "#90EE90",
  "超级地球": "#90EE90",
  "Sub Earth": "#006400",
  "亚地球": "#006400",
  "Frozen Gas Giant": "#ADD8E6",
  "冰冻气态巨行星": "#ADD8E6",
  Nebulous: "#FFC0CB",
  "星云行星": "#FFC0CB",
  Aquifer: "#00FFFF",
  "含水层行星": "#00FFFF",
  Exotic: "#FF00FF",
  "奇异行星": "#FF00FF",
  "Super Puff": "#F7C6D9",
  "超蓬松": "#F7C6D9",
  "Super Ringed": "#E3C99A",
  "超环": "#E3C99A",
  "Mirror": "#D9DEE6",
  "镜面": "#D9DEE6",
  "Ruby Cloud": "#9B111E",
  "红宝石云": "#9B111E",
};

const getPlanetColor = (planetType?: string): string => (planetType ? PLANET_COLORS[planetType] : undefined) || "#FFFFFF";

const formatPlanetName = (name: string) => name.replace(/_/g, " ");

const PlanetsList: React.FC<PlanetsListProps> = ({ planets, coordinates, systemIndex, activeName, query = "" }) => {
  const [visitedPlanets, setVisitedPlanets] = useState<Set<string>>(new Set());

  useEffect(() => {
    const loadHistoricalData = () => {
      try {
        const visitedPlanetNames = getVisitedPlanets(coordinates, systemIndex, planets);
        const visited = new Set<string>();
        visitedPlanetNames.forEach((planetName: string) => visited.add(planetName.toLowerCase()));
        setVisitedPlanets(visited);
      } catch (error) {}
    };

    loadHistoricalData();
  }, [coordinates, systemIndex, planets]);

  const handlePlanetClick = (planetName: string) => {
    try {
      markPlanetAsVisited(coordinates, systemIndex, planetName, planets);
    } catch (error) {}
    void go(`/planet/${planetName.toLowerCase()}`);
  };

  const needle = normalizeQuery(query);
  const visible = needle ? planets.filter((planet) => matchesPlanet(planet, needle)) : planets;

  if (planets.length === 0) {
    return (
      <div style={{ display: "grid", gap: 4, padding: "16px 0", textAlign: "center" }}>
        <span style={{ fontSize: 11.5, color: "var(--atlas-n-700)" }}>未找到行星</span>
        <span style={{ fontSize: 10.5, color: "var(--atlas-n-600)" }}>该系统似乎为空</span>
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <div style={{ display: "grid", gap: 4, padding: "16px 0", textAlign: "center" }}>
        <span style={{ fontSize: 11.5, color: "var(--atlas-n-700)" }}>本页无匹配</span>
        <span style={{ fontSize: 10.5, color: "var(--atlas-n-600)" }}>换个关键词试试</span>
      </div>
    );
  }

  return (
    <div className="rail-list">
      {visible.map((planet) => {
        const active = activeName ? planet.name.toLowerCase() === activeName.toLowerCase() : false;
        return (
          <button
            key={planet.name}
            type="button"
            className="rail-row"
            data-active={active ? "true" : undefined}
            onClick={() => handlePlanetClick(planet.name)}
            title={planet.planet_type ? `${formatPlanetName(planet.name)} · ${planet.planet_type}` : formatPlanetName(planet.name)}
          >
            <span
              aria-hidden
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: getPlanetColor(planet.planet_type),
                boxShadow: "0 0 6px currentColor",
                flexShrink: 0,
              }}
            />
            <span className="rail-row__name">{formatPlanetName(planet.name)}</span>
            {visitedPlanets.has(planet.name.toLowerCase()) ? (
              <EyeOpenIcon className="w-3 h-3 text-green-400" />
            ) : (
              <span aria-hidden style={{ width: 12 }} />
            )}
          </button>
        );
      })}
    </div>
  );
};

export default PlanetsList;

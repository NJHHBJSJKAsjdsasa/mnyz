// Components/planet/PlanetOverview.tsx — physical / orbital / surface / element
// stats, extracted verbatim from PlanetInfo (05 §3.1, 2026-10-29).
//
// Pure presentation: the only state it touches is the elements expand/collapse,
// which stays owned by the parent so it survives a re-render of the panel.
// Markup is unchanged — this is a file split, not a redesign.

import React from "react";
import PeriodicElement from "../PeriodicElement.tsx";
import { formatDistance, formatMass, formatPeriod, formatTemperature } from "./format.ts";

export interface PlanetOverviewPlanet {
  mass: number;
  diameter: number;
  density: number;
  gravity: number;
  orbital_radius: number;
  orbital_period_seconds: number;
  orbital_speed: number;
  axial_tilt: number;
  surface_temperature: number;
  rotation_period_seconds: number;
  elements: string[];
}

export interface PlanetOverviewProps {
  planet: PlanetOverviewPlanet;
  showAllElements: boolean;
  onToggleElements: () => void;
}

export const PlanetOverview: React.FC<PlanetOverviewProps> = ({ planet, showAllElements, onToggleElements }) => (
  <>
      <div className="bg-plate-2 rounded-lg p-2 border border-orange-500/30 mb-3">
        <div className="text-xs text-gray-200 mb-2">物理属性</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-1">
          <div className="bg-white/[0.04] rounded p-1.5 border border-orange-500/20">
            <div className="text-xs text-gray-300">质量</div>
            <div className="text-xs font-bold text-orange-300">{formatMass(planet.mass)}</div>
          </div>
          <div className="bg-white/[0.04] rounded p-1.5 border border-orange-500/20">
            <div className="text-xs text-gray-300">直径</div>
            <div className="text-xs font-bold text-orange-300">{formatDistance(planet.diameter)}</div>
          </div>
          <div className="bg-white/[0.04] rounded p-1.5 border border-orange-500/20">
            <div className="text-xs text-gray-300">密度</div>
            <div className="text-xs font-bold text-orange-300">{planet.density.toFixed(2)} kg/m³</div>
          </div>
          <div className="bg-white/[0.04] rounded p-1.5 border border-orange-500/20">
            <div className="text-xs text-gray-300">重力</div>
            <div className="text-xs font-bold text-orange-300">{planet.gravity.toFixed(2)} m/s²</div>
          </div>
        </div>
      </div>

      <div className="bg-plate-2 rounded-lg p-2 border border-cyan-500/30 mb-3">
        <div className="text-xs text-gray-200 mb-2">轨道属性</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-1">
          <div className="bg-white/[0.04] rounded p-1.5 border border-cyan-500/20">
            <div className="text-xs text-gray-300">轨道半径</div>
            <div className="text-xs font-bold text-cyan-300">{planet.orbital_radius.toFixed(2)} AU</div>
          </div>
          <div className="bg-white/[0.04] rounded p-1.5 border border-cyan-500/20">
            <div className="text-xs text-gray-300">轨道周期</div>
            <div className="text-xs font-bold text-cyan-300">{formatPeriod(planet.orbital_period_seconds)}</div>
          </div>
          <div className="bg-white/[0.04] rounded p-1.5 border border-cyan-500/20">
            <div className="text-xs text-gray-300">轨道速度</div>
            <div className="text-xs font-bold text-cyan-300">{planet.orbital_speed.toFixed(2)} m/s</div>
          </div>
          <div className="bg-white/[0.04] rounded p-1.5 border border-cyan-500/20">
            <div className="text-xs text-gray-300">轴倾角</div>
            <div className="text-xs font-bold text-cyan-300">{planet.axial_tilt.toFixed(2)}°</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        <div className="bg-plate-2 rounded-lg p-2 border border-red-500/30">
          <div className="text-xs text-gray-200 mb-2">表面条件</div>
          <div className="grid grid-cols-2 gap-1">
            <div className="bg-white/[0.04] rounded p-1.5 border border-red-500/20">
              <div className="text-xs text-gray-300">温度</div>
              <div className="text-xs font-bold text-red-300">{formatTemperature(planet.surface_temperature)}</div>
            </div>
            <div className="bg-white/[0.04] rounded p-1.5 border border-red-500/20">
              <div className="text-xs text-gray-300">自转周期</div>
              <div className="text-xs font-bold text-red-300">{formatPeriod(planet.rotation_period_seconds)}</div>
            </div>
          </div>
        </div>

        <div className="bg-plate-2 rounded-lg p-2 border border-yellow-500/30">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-gray-200">元素 ({planet.elements.length})</div>
            <button onClick={onToggleElements} className="text-xs text-yellow-400 hover:text-yellow-300 transition-colors duration-300">
              {showAllElements ? "▲ 收起" : "▼ 展开"}
            </button>
          </div>

          {showAllElements ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {planet.elements.map((element, index) => (
                <PeriodicElement key={index} elementName={element} expanded={true} showResources={true} className="min-w-0" />
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1 justify-center">
              {planet.elements.slice(0, 6).map((element, index) => (
                <PeriodicElement key={index} elementName={element} expanded={false} className="" />
              ))}
              {planet.elements.length > 6 && <div className="inline-flex items-center justify-center h-10 w-10 rounded border border-dashed border-yellow-500/50 text-yellow-400 text-xs">+{planet.elements.length - 6}</div>}
            </div>
          )}
        </div>
      </div>
  </>
);

export default PlanetOverview;

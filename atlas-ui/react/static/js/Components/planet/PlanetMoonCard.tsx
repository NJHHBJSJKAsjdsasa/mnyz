// Components/planet/PlanetMoonCard.tsx — the block that appears when a moon is
// selected in the renderer. Extracted verbatim from PlanetInfo (05 §3.1).

import React from "react";
import { formatPeriod } from "./format.ts";

export interface MoonData {
  name: string;
  properties: {
    mass_kg: number;
    radius_km: number;
    density_kg_m3: number;
    type: string;
    origin: string;
  };
  orbit: {
    semi_major_axis_km: number;
    eccentricity: number;
    inclination_deg: number;
    orbital_period_seconds: number;
    orbital_period_days: number;
    current_angle: number;
  };
  rotation: {
    rotation_period_s: number;
    rotation_period_hours: number;
    angular_velocity_rad_s: number;
    is_tidally_locked: boolean;
  };
  visuals: {
    base_color: string;
    roughness: number;
    metalness: number;
    normal_strength: number;
    relative_size: number;
    has_atmosphere: boolean;
    atmosphere_color?: string;
    atmosphere_opacity?: number;
  };
}

export interface PlanetMoonCardProps {
  moon: MoonData;
}

export const PlanetMoonCard: React.FC<PlanetMoonCardProps> = ({ moon }) => (
  <div className="mt-3 p-3 bg-blue-500/10 rounded-lg border border-blue-500/30">
    <div className="flex items-center gap-2 mb-3">
      <span className="text-lg">🌙</span>
      <h4 className="text-sm font-bold text-blue-300">选中的月球: {moon.name}</h4>
    </div>

    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 mb-3">
      <div className="bg-white/[0.04] rounded p-2 border border-blue-500/20">
        <div className="text-xs text-gray-300">类型</div>
        <div className="text-xs font-bold text-blue-300 capitalize">{moon.properties.type}</div>
      </div>
      <div className="bg-white/[0.04] rounded p-2 border border-blue-500/20">
        <div className="text-xs text-gray-300">起源</div>
        <div className="text-xs font-bold text-blue-300 capitalize">{moon.properties.origin.replace("_", " ")}</div>
      </div>
      <div className="bg-white/[0.04] rounded p-2 border border-blue-500/20">
        <div className="text-xs text-gray-300">半径</div>
        <div className="text-xs font-bold text-blue-300">{moon.properties.radius_km.toFixed(1)} km</div>
      </div>
    </div>

    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 mb-2">
      <div className="bg-white/[0.04] rounded p-2 border border-blue-500/20">
        <div className="text-xs text-gray-300">轨道周期</div>
        <div className="text-xs font-bold text-blue-300">{formatPeriod(moon.orbit.orbital_period_seconds)}</div>
      </div>
      <div className="bg-white/[0.04] rounded p-2 border border-blue-500/20">
        <div className="text-xs text-gray-300">距离</div>
        <div className="text-xs font-bold text-blue-300">{(moon.orbit.semi_major_axis_km / 1000).toFixed(0)}k km</div>
      </div>
      <div className="bg-white/[0.04] rounded p-2 border border-blue-500/20">
        <div className="text-xs text-gray-300">偏心率</div>
        <div className="text-xs font-bold text-blue-300">{moon.orbit.eccentricity.toFixed(3)}</div>
      </div>
    </div>

    <div className="bg-white/[0.04] rounded-lg p-2 border border-blue-500/20">
      <div className="text-xs text-gray-200 mb-2">表面条件</div>
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white/[0.04] rounded p-1.5 border border-blue-500/20">
          <div className="text-xs text-gray-300">自转周期</div>
          <div className="text-xs font-bold text-blue-300">{moon.rotation ? formatPeriod(moon.rotation.rotation_period_s) : "未知"}</div>
        </div>
        <div className="bg-white/[0.04] rounded p-1.5 border border-blue-500/20">
          <div className="text-xs text-gray-300">潮汐锁定</div>
          <div className={`text-xs font-bold ${moon.rotation?.is_tidally_locked ? "text-green-300" : "text-orange-300"}`}>{moon.rotation?.is_tidally_locked ? "是" : "否"}</div>
        </div>
      </div>
    </div>

    <div className="mt-2 text-xs text-blue-400/80 text-center">点击行星返回行星视图</div>
  </div>
);

export default PlanetMoonCard;

// Components/planet/PlanetTechData.tsx — the six-cell "技术数据" strip at the
// bottom of the planet panel. Extracted verbatim from PlanetInfo (05 §3.1).

import React from "react";

export interface PlanetTechDataProps {
  planetName: string;
  systemName: string;
  systemIndex: number;
  galaxyName: string;
  coordinates: number[];
}

const formatName = (name: string) => name.replace(/_/g, " ");

export const PlanetTechData: React.FC<PlanetTechDataProps> = ({ planetName, systemName, systemIndex, galaxyName, coordinates }) => (
  <div className="mt-4 pt-3 border-t border-white/10">
    <div className="text-xs text-gray-400 mb-2">技术数据</div>
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
      <div className="bg-white/[0.04] rounded px-1.5 py-0.5">
        <span className="text-gray-400">状态:</span>
        <div className="text-green-400 font-medium">已访问</div>
      </div>
      <div className="bg-white/[0.04] rounded px-1.5 py-0.5">
        <span className="text-gray-400">行星:</span>
        <div className="text-white truncate font-medium">{formatName(planetName)}</div>
      </div>
      <div className="bg-white/[0.04] rounded px-1.5 py-0.5">
        <span className="text-gray-400">系统:</span>
        <div className="text-white truncate font-medium">{formatName(systemName)}</div>
      </div>
      <div className="bg-white/[0.04] rounded px-1.5 py-0.5">
        <span className="text-gray-400">系统ID:</span>
        <div className="text-white font-medium">#{systemIndex + 1}</div>
      </div>
      <div className="bg-white/[0.04] rounded px-1.5 py-0.5">
        <span className="text-gray-400">星系:</span>
        <div className="text-white truncate font-medium">{formatName(galaxyName)}</div>
      </div>
      <div className="bg-white/[0.04] rounded px-1.5 py-0.5">
        <span className="text-gray-400">坐标:</span>
        <div className="text-white font-medium">{coordinates.join(", ")}</div>
      </div>
    </div>
  </div>
);

export default PlanetTechData;

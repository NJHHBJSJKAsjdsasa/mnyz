// Components/planet/PlanetOwnership.tsx — who holds this world, plus the guest
// hint that stands in when the ownership endpoint is unavailable.
// Extracted verbatim from PlanetInfo (05 §3.1, 2026-10-29).

import React from "react";

/** Subset of `GET /api/v1/world/{key}` the panel actually reads. */
export interface PlanetWorld {
  is_owner?: boolean;
  owner_player_id?: string | null;
  owner_name?: string | null;
  level?: number;
  defense_power?: number;
  shield_until?: string | null;
  siege?: unknown;
}

export interface PlanetOwnershipProps {
  world: PlanetWorld | null;
  guest: boolean;
}

export const PlanetOwnership: React.FC<PlanetOwnershipProps> = ({ world, guest }) => {
  if (world) {
    return (
      <div
        className={`rounded-lg p-2 border mb-3 ${
          world.is_owner ? "bg-emerald-500/10 border-emerald-500/40" : world.owner_player_id ? "bg-orange-500/10 border-orange-500/40" : "bg-white/[0.04] border-white/15"
        }`}
      >
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-gray-300">行星归属</span>
          <span className={world.is_owner ? "text-emerald-300 font-semibold" : world.owner_player_id ? "text-orange-300 font-semibold" : "text-gray-400"}>
            {world.is_owner ? "你的领地" : world.owner_name || (world.owner_player_id ? `玩家 ${String(world.owner_player_id).slice(0, 8)}` : "无主")}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-gray-400">
          <span>等级 {world.level ?? 1}</span>
          <span>防御 {world.defense_power ?? 0}</span>
          {world.shield_until && <span className="text-cyan-300">护盾至 {new Date(world.shield_until).toLocaleString()}</span>}
          {world.siege && <span className="text-orange-300">攻城进行中</span>}
        </div>
      </div>
    );
  }

  if (!guest) return null;

  return (
    <div className="rounded-lg p-2 border border-white/10 bg-white/[0.04] mb-3 text-[11px] text-gray-500">登录后查看行星归属、防御和攻城状态。</div>
  );
};

export default PlanetOwnership;

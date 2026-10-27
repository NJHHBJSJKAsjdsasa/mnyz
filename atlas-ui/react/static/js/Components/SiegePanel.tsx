// atlas-ui/react/static/js/Components/SiegePanel.tsx
// Shared-planet ownership and asynchronous sieges. Rendered only in server mode.

import React, { useEffect, useState } from "react";
import { SpaceshipResourceManager } from "../Utils/SpaceshipResources.tsx";
import { ResourceEventManager } from "../Utils/ResourceEventManager.tsx";
import { ServerApi } from "../Utils/ServerApi.tsx";

interface SiegePanelProps {
  planetKey: string;
}

interface WorldView {
  owner_player_id: string | null;
  shield_until: string | null;
  defense_power: number;
  level: number;
  siege: string | null;
}

const formatCountdown = (resolveAt: string | undefined, now: number): string => {
  if (!resolveAt) return "—";
  const remaining = Date.parse(resolveAt) - now;
  if (remaining <= 0) return "结算中";
  const total = Math.floor(remaining / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
};

const SiegePanel: React.FC<SiegePanelProps> = ({ planetKey }) => {
  const [world, setWorld] = useState<WorldView | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [now, setNow] = useState(Date.now());
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const loadDetail = async (siegeId: string) => {
    try {
      setDetail(await ServerApi.siegeDetail(siegeId));
    } catch {
      setDetail(null);
    }
  };

  const refresh = async () => {
    try {
      const data = await ServerApi.worldPlanet(planetKey);
      setWorld(data);
      return data;
    } catch (error) {
      setMessage(error instanceof Error ? `世界行星加载失败：${error.message}` : "世界行星加载失败");
      return null;
    }
  };

  useEffect(() => {
    if (ServerApi.mode() !== "server") return;
    void refresh();
  }, [planetKey]);

  useEffect(() => {
    const siegeId = world?.siege;
    if (!siegeId) {
      setDetail(null);
      return;
    }
    void loadDetail(siegeId);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [world?.siege]);

  if (ServerApi.mode() !== "server") return null;

  const run = async (label: string, action: () => Promise<any>, onYield?: (data: any) => void) => {
    setBusy(true);
    try {
      const result = await action();
      if (onYield) onYield(result);
      setMessage(label);
      const data = await refresh();
      if (data?.siege) await loadDetail(data.siege);
    } catch (error) {
      setMessage(error instanceof Error ? `${label}失败：${error.message}` : `${label}失败`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-purple-500/25 bg-white/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <span className="text-purple-200 font-medium">共享行星 · 攻城</span>
        <span className="text-gray-400">
          {world?.owner_player_id ? `归属 ${world.owner_player_id.slice(0, 8)}` : "无主"} · Lv {world?.level ?? 1} · 防御{" "}
          {world?.defense_power ?? 0}
        </span>
      </div>

      {world?.shield_until && <div className="mt-1 text-[10px] text-cyan-300">护盾至 {world.shield_until}</div>}
      {world?.siege && (
        <div className="mt-1 space-y-0.5 text-[10px] text-orange-300">
          <div>进行中的攻城：{world.siege}</div>
          <div>
            距结算 {formatCountdown(detail?.resolve_at, now)} · 攻方 {detail?.attacker_power ?? "—"} / 守方{" "}
            {detail?.defender_power ?? "—"}
          </div>
          {detail?.participants?.length > 0 && (
            <div className="text-gray-400">
              参战：{detail.participants.map((item: any) => `${item.player_id.slice(0, 6)}(${item.fleet_power})`).join(" · ")}
            </div>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        {!world?.owner_player_id && (
          <button
            onClick={() => void run("已占领行星", () => ServerApi.claimWorldPlanet(planetKey))}
            disabled={busy}
            className="px-2 py-1 rounded text-[11px] bg-purple-600/80 hover:bg-purple-500 text-white disabled:opacity-40"
          >
            占领
          </button>
        )}
        {world?.owner_player_id && !world?.siege && (
          <button
            onClick={() => void run("已宣战", () => ServerApi.declareSiege(planetKey))}
            disabled={busy}
            className="px-2 py-1 rounded text-[11px] bg-red-600/80 hover:bg-red-500 text-white disabled:opacity-40"
          >
            宣战
          </button>
        )}
        {world?.siege && (
          <button
            onClick={() => void run("已加入攻城", () => ServerApi.joinSiege(world.siege as string))}
            disabled={busy}
            className="px-2 py-1 rounded text-[11px] bg-orange-600/80 hover:bg-orange-500 text-white disabled:opacity-40"
          >
            加入攻城
          </button>
        )}
        <button
          onClick={() =>
            void run("战利品已入账", () => ServerApi.siegeLoot(), (data) => {
              SpaceshipResourceManager.addResources(data?.yield || {});
              ResourceEventManager.emit("resources_updated");
            })
          }
          disabled={busy}
          className="px-2 py-1 rounded text-[11px] bg-emerald-600/80 hover:bg-emerald-500 text-white disabled:opacity-40"
        >
          领取战利品
        </button>
      </div>

      {message && <p className="mt-1 text-[11px] text-purple-300">{message}</p>}
    </div>
  );
};

export default SiegePanel;

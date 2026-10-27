// atlas-ui/react/static/js/Components/StationTab.tsx
import React, { useEffect, useState } from "react";
import { MAX_STATIONS, STATION_MODULES, Station, StationModuleId, StationSystem, TICK_MS } from "../Utils/StationSystem.tsx";
import { SectorSystem } from "../Utils/SectorSystem.tsx";
import { ServerApi } from "../Utils/ServerApi.tsx";
import { SpaceshipResourceManager } from "../Utils/SpaceshipResources.tsx";
import { FactionSystem } from "../Utils/FactionSystem.tsx";
import FleetPanel from "./FleetPanel.tsx";
import SiegePanel from "./SiegePanel.tsx";
import IntelPanel from "./IntelPanel.tsx";
import { SpaceshipResource } from "../Utils/SpaceshipResources.tsx";
import { resourceLabel } from "../Utils/ResourceLabels.tsx";

const formatCost = (cost: Partial<SpaceshipResource> | null): string => {
  if (!cost) return "—";
  return Object.entries(cost)
    .map(([key, amount]) => `${resourceLabel(key)} ${amount}`)
    .join(" · ");
};

const pendingTicks = (station: Station): number => Math.min(16, Math.floor((Date.now() - station.lastTick) / TICK_MS));

interface StationCardProps {
  station: Station;
  serverMode: boolean;
  onAction: () => void;
  setMessage: (text: string) => void;
}

const SERVER_MODULE: Record<StationModuleId, string> = {
  production: "production_bay",
  sensor: "observation_deck",
  commerce: "trade_hub",
};

const StationCard: React.FC<StationCardProps> = ({ station, serverMode, onAction, setMessage }) => {
  const stored = station.stored;
  const stocked = (stored.antimatter ?? 0) + (stored.deuterium ?? 0) > 0;
  const visitor = StationSystem.visitor(station.id);

  const upgrade = async (moduleId: StationModuleId) => {
    if (serverMode) {
      try {
        await ServerApi.stationModule(station.id, SERVER_MODULE[moduleId]);
        setMessage("舱室升级完成");
        onAction();
      } catch (error) {
        setMessage(error instanceof Error ? `升级失败：${error.message}` : "升级失败");
      }
      return;
    }
    const check = StationSystem.canUpgrade(station.id, moduleId);
    if (!check.ok) {
      setMessage(check.reason ?? "无法升级");
      return;
    }
    setMessage(StationSystem.upgrade(station.id, moduleId) ? "舱室升级完成" : "升级失败");
    onAction();
  };

  const claim = async () => {
    if (serverMode) {
      try {
        const gained = await ServerApi.stationClaim(station.id);
        SpaceshipResourceManager.addResources(gained?.yield || {});
        setMessage(`领取 ${gained?.yield?.antimatter ?? 0} 反物质 / ${gained?.yield?.deuterium ?? 0} 氘`);
        onAction();
      } catch (error) {
        setMessage(error instanceof Error ? `领取失败：${error.message}` : "暂无可领取产出");
      }
      return;
    }
    const gained = StationSystem.claim(station.id);
    setMessage(gained ? `领取 ${gained.antimatter ?? 0} 反物质 / ${gained.deuterium ?? 0} 氘` : "暂无可领取产出");
    onAction();
  };

  return (
    <div className="rounded-lg border border-orange-500/25 bg-white/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-white font-medium truncate">{station.name.replace(/_/g, " ")}</span>
        <span className="text-[11px] text-gray-500">{station.coordinates}</span>
      </div>

      <div className="mt-2 space-y-1">
        {STATION_MODULES.map((module) => {
          const level = station.modules[module.id] ?? 0;
          const cost = serverMode ? null : StationSystem.upgradeCost(station.id, module.id);
          const check = serverMode ? { ok: true } : StationSystem.canUpgrade(station.id, module.id);

          return (
            <div key={module.id} className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span className="text-gray-300">
                {module.icon} {module.name} <span className="text-gray-500">Lv {level}</span> · {module.effect(level)}
              </span>
              <button
                onClick={() => void upgrade(module.id)}
                disabled={!check.ok}
                title={check.reason ?? formatCost(cost)}
                className="px-2 py-1 rounded text-[11px] bg-orange-600/80 hover:bg-orange-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                升级 · {serverMode ? "服务端计费" : formatCost(cost)}
              </button>
            </div>
          );
        })}
      </div>

      {visitor && (
        <div className="mt-1 text-[11px] text-cyan-300">
          今日访客：{visitor.callsign} · {visitor.name} · 产出 +5%
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-2 text-[11px]">
        <span className="text-gray-400">
          待领取：反物质 {stored.antimatter ?? 0} · 氘 {stored.deuterium ?? 0}
          <span className="text-gray-500">（{pendingTicks(station)}/16 tick）</span>
        </span>
        <button
          onClick={() => void claim()}
          disabled={!stocked}
          className="px-2 py-1 rounded text-[11px] bg-emerald-600/80 hover:bg-emerald-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          领取
        </button>
      </div>
    </div>
  );
};

interface StationTabProps {
  planetKey: string;
  planetName: string;
  systemIndex: number;
  coordinates: string;
}

const StationTab: React.FC<StationTabProps> = ({ planetKey, planetName, systemIndex, coordinates }) => {
  const [version, setVersion] = useState(0);
  const [message, setMessage] = useState("");
  const [serverStations, setServerStations] = useState<Station[]>([]);
  const serverMode = ServerApi.mode() === "server";

  const refresh = async () => {
    if (serverMode) {
      try {
        const data = await ServerApi.assets();
        setServerStations(
          (data?.stations || []).map((row: any) => ({
            id: row.id,
            name: row.planet_name,
            coordinates: row.planet_key,
            planetKey: row.planet_key,
            systemIndex: 0,
            modules: {
              production: Number(row.modules?.production_bay || 0),
              sensor: Number(row.modules?.observation_deck || 0),
              commerce: Number(row.modules?.trade_hub || 0),
            },
            lastTick: row.last_tick_at ? Date.parse(row.last_tick_at) : Date.now(),
            stored: row.stored || {},
          })),
        );
      } catch (error) {
        setMessage(error instanceof Error ? `空间站加载失败：${error.message}` : "空间站加载失败");
      }
    } else {
      StationSystem.settle();
    }
    setVersion((value) => value + 1);
    window.setTimeout(() => setMessage(""), 2400);
  };

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30000);
    return () => window.clearInterval(timer);
  }, [planetKey]);

  const stations = serverMode ? serverStations : StationSystem.list();
  const built = serverMode ? stations.some((item) => item.planetKey === planetKey) : StationSystem.isBuilt(planetKey);
  const check = serverMode ? { ok: stations.length < MAX_STATIONS, reason: `最多 ${MAX_STATIONS} 座` } : StationSystem.canBuild(planetKey);
  const sector = SectorSystem.info(coordinates);

  const unlockSector = async () => {
    if (ServerApi.mode() === "server") {
      try {
        await ServerApi.applySectorLicense(sector.key);
        setMessage(`星区 ${sector.key} 已提交宇宙议会，审核期间资源已冻结`);
        refresh();
      } catch (error) {
        setMessage(error instanceof Error ? `提交失败：${error.message}` : "提交失败");
      }
      return;
    }
    if (!SectorSystem.canUnlock(coordinates).ok) {
      setMessage(SectorSystem.canUnlock(coordinates).reason ?? "无法解锁");
      return;
    }
    setMessage(SectorSystem.unlock(coordinates) ? `星区 ${sector.key} 已取得许可` : "解锁失败");
    refresh();
  };

  const build = async () => {
    if (!check.ok) {
      setMessage(check.reason ?? "无法建造");
      return;
    }
    if (serverMode) {
      try {
        await ServerApi.buildStation(planetKey);
        setMessage("空间站已落成");
        void refresh();
      } catch (error) {
        setMessage(error instanceof Error ? `建造失败：${error.message}` : "建造失败");
      }
      return;
    }
    const ok = StationSystem.build({ planetKey, planetName, coordinates, systemIndex });
    setMessage(ok ? "空间站已落成" : "建造失败");
    void refresh();
  };

  return (
    <div className="space-y-3" data-station-version={version}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <span className="text-gray-400">
          空间站 {stations.length}/{MAX_STATIONS} · 每 15 分钟 1 tick，最多累积 4 小时
        </span>
        <span className="text-orange-300">
          全舰收益：扫描冷却 ×{StationSystem.scanCooldownMultiplier().toFixed(2)} · 卖价 ×{StationSystem.tradeSellMultiplier().toFixed(2)}
        </span>
      </div>

      <div className="rounded-lg border border-cyan-500/20 bg-white/5 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <span className="text-gray-300">
            星区许可 · 当前位于 区 {sector.key}（已解锁 {SectorSystem.count()} 个）
          </span>
          <span className={sector.unlocked ? "text-emerald-300" : "text-cyan-300"}>
            {sector.unlocked
              ? "本区已许可 · 采集/扫描 +20%"
              : `申请需 ${sector.cost} 反物质 · 议会审核`}
          </span>
        </div>
        <div className="mt-1 text-[11px] text-gray-400">
          本星区势力：{FactionSystem.factionOf(coordinates)} · 声望 {FactionSystem.rep(coordinates)}
          {FactionSystem.encounterBonus(coordinates) > 0 && ` · 遭遇率 +${Math.round(FactionSystem.encounterBonus(coordinates) * 100)}%`}
          {FactionSystem.tradeMultiplier(coordinates) < 1 && ` · 买价 ×${FactionSystem.tradeMultiplier(coordinates).toFixed(2)}`}
        </div>

        <button
          onClick={unlockSector}
          disabled={sector.unlocked}
          className="mt-2 px-3 py-1 rounded-md text-[11px] font-semibold bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {sector.unlocked ? "已许可" : "解锁本星区"}
        </button>
      </div>

      {!built && (
        <div className="rounded-lg border border-orange-500/20 bg-white/5 p-3">
          <div className="text-xs text-gray-300">在本行星建造空间站</div>
          <div className="mt-1 text-[11px] text-gray-500">{formatCost(StationSystem.buildCost())}</div>
          <button
            onClick={() => void build()}
            disabled={!check.ok}
            title={check.reason ?? ""}
            className="mt-2 px-3 py-1.5 rounded-md text-xs font-semibold bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            建造
          </button>
        </div>
      )}

      <FleetPanel />
      <IntelPanel coordinates={coordinates} />

      {stations.length === 0 && <p className="text-[11px] text-gray-500">还没有空间站。建站后即使离线也会持续产出。</p>}

      {stations.map((station) => (
        <StationCard key={station.id} station={station} serverMode={serverMode} onAction={refresh} setMessage={setMessage} />
      ))}

      <SiegePanel planetKey={planetKey} />

      {message && <p className="text-xs text-center text-orange-300">{message}</p>}
    </div>
  );
};

export default StationTab;

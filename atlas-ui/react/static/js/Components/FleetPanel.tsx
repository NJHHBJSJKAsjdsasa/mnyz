// atlas-ui/react/static/js/Components/FleetPanel.tsx
import React, { useEffect, useState } from "react";
import { FLEET_MAX_TICKS, FLEET_TASKS, FLEET_TICK_MS, FleetSystem, FleetShip, FleetTask, MAX_SHIPS } from "../Utils/FleetSystem.tsx";
import { SpaceshipResource, SpaceshipResourceManager } from "../Utils/SpaceshipResources.tsx";
import { resourceLabel } from "../Utils/ResourceLabels.tsx";
import { ServerApi } from "../Utils/ServerApi.tsx";
import { ResourceEventManager } from "../Utils/ResourceEventManager.tsx";

const serverMode = () => ServerApi.mode() === "server";

const mapServerFleet = (rows: any[]): FleetShip[] =>
  (rows || []).map((row) => ({
    id: row.id,
    name: row.name,
    task: (row.task || "idle") as FleetTask,
    lastTick: row.last_tick_at ? Date.parse(row.last_tick_at) : Date.now(),
    stored: row.stored || {},
  }));

const formatBag = (bag: Partial<SpaceshipResource>): string => {
  const entries = Object.entries(bag).filter(([, amount]) => (amount ?? 0) > 0);
  return entries.length === 0 ? "—" : entries.map(([key, amount]) => `${resourceLabel(key)} ${amount}`).join(" · ");
};

const FleetPanel: React.FC = () => {
  const [version, setVersion] = useState(0);
  const [message, setMessage] = useState("");
  const [serverShips, setServerShips] = useState<FleetShip[]>([]);

  const refresh = async () => {
    if (serverMode()) {
      try {
        const data = await ServerApi.assets();
        setServerShips(mapServerFleet(data?.fleet));
      } catch (error) {
        setMessage(error instanceof Error ? `舰队加载失败：${error.message}` : "舰队加载失败");
      }
    } else {
      FleetSystem.settle();
    }
    setVersion((value) => value + 1);
  };

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const notify = (text: string) => {
    setMessage(text);
    void refresh();
    window.setTimeout(() => setMessage(""), 2400);
  };

  const build = async () => {
    if (serverMode()) {
      try {
        await ServerApi.recruitFleet(`舰队 ${serverShips.length + 1}`);
        notify("新舰船已入列");
      } catch (error) {
        notify(error instanceof Error ? `建造失败：${error.message}` : "建造失败");
      }
      return;
    }
    const check = FleetSystem.canBuild();
    if (!check.ok) {
      notify(check.reason ?? "无法建造");
      return;
    }
    notify(FleetSystem.build() ? "新舰船已入列" : "建造失败");
  };

  const setTask = async (ship: FleetShip, task: FleetTask) => {
    if (serverMode()) {
      try {
        await ServerApi.fleetTask(ship.id, task);
        notify(`${ship.name} 已切换任务`);
      } catch (error) {
        notify(error instanceof Error ? `切换失败：${error.message}` : "切换失败");
      }
      return;
    }
    FleetSystem.setTask(ship.id, task);
    notify(`${ship.name} 转为${FLEET_TASKS.find((item) => item.id === task)?.label ?? task}`);
  };

  const claim = async (ship: FleetShip) => {
    if (serverMode()) {
      try {
        const result = await ServerApi.fleetClaim(ship.id);
        SpaceshipResourceManager.addResources(result?.yield || {});
        ResourceEventManager.emit("resources_updated");
        notify(`${ship.name} 产出已入账`);
      } catch (error) {
        notify(error instanceof Error ? `领取失败：${error.message}` : "领取失败");
      }
      return;
    }
    notify(FleetSystem.claim(ship.id) ? `${ship.name} 产出已入账` : "暂无可领取产出");
  };

  const ships = serverMode() ? serverShips : FleetSystem.list();
  const check = serverMode()
    ? { ok: ships.length < MAX_SHIPS, reason: `最多 ${MAX_SHIPS} 艘` }
    : FleetSystem.canBuild();

  return (
    <div className="rounded-lg border border-sky-500/20 bg-white/5 p-3" data-fleet-version={version}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <span className="text-gray-300">
          舰队 {ships.length}/{MAX_SHIPS} · 每 30 分钟 1 tick，最多累积 6 小时
        </span>
        <span className="text-gray-500">建造 {formatBag(FleetSystem.buildCost())}</span>
      </div>

      <div className="mt-2 space-y-1">
        {ships.map((ship) => (
          <div key={ship.id} className="rounded border border-sky-500/20 bg-black/20 p-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span className="text-sky-200">{ship.name}</span>
              <span className="text-gray-500">
                待领取 {formatBag(ship.stored)}（{serverMode() ? Math.min(FLEET_MAX_TICKS, Math.floor((Date.now() - ship.lastTick) / FLEET_TICK_MS)) : FleetSystem.pendingTicks(ship)}/12）
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {FLEET_TASKS.map((task) => (
                <button
                  key={task.id}
                  onClick={() => void setTask(ship, task.id as FleetTask)}
                  title={task.detail}
                  className={`px-2 py-0.5 rounded text-[11px] border transition-all ${
                    ship.task === task.id ? "bg-sky-600/70 border-sky-400/50 text-white" : "bg-white/5 border-white/10 text-gray-300 hover:bg-white/10"
                  }`}
                >
                  {task.label}
                </button>
              ))}
              <button
                onClick={() => void claim(ship)}
                className="ml-auto px-2 py-0.5 rounded text-[11px] bg-emerald-600/80 hover:bg-emerald-500 text-white"
              >
                领取
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => void build()}
        disabled={!check.ok}
        title={check.reason ?? ""}
        className="mt-2 px-3 py-1 rounded-md text-[11px] font-semibold bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
      >
        建造舰船
      </button>

      {message && <p className="mt-1 text-[11px] text-sky-300">{message}</p>}
    </div>
  );
};

export default FleetPanel;

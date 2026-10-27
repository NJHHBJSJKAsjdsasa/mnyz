// atlas-ui/react/static/js/Components/ShipyardTab.tsx
import React, { useState } from "react";
import { MAX_MODULE_LEVEL, MAX_OVERCLOCK, OVERCLOCK_MIN_LEVEL, OVERCLOCK_STEP, SHIP_MODULES, ShipModuleSystem } from "../Utils/ShipModules.tsx";
import { SpaceshipResourceManager, SpaceshipResource } from "../Utils/SpaceshipResources.tsx";
import { resourceLabel } from "../Utils/ResourceLabels.tsx";
import { RefitVoucherSystem } from "../Utils/RefitVoucher.tsx";
import { HullSystem, MAX_HULL } from "../Utils/HullSystem.tsx";
import { ResourceEventManager } from "../Utils/ResourceEventManager.tsx";
import { ServerApi } from "../Utils/ServerApi.tsx";

const formatCost = (cost: Partial<SpaceshipResource> | null): string => {
  if (!cost) return "—";
  return Object.entries(cost)
    .map(([key, amount]) => `${resourceLabel(key)} ${amount}`)
    .join(" · ");
};

const ShipyardTab: React.FC = () => {
  const [version, setVersion] = useState(0);
  const [message, setMessage] = useState("");

  const install = async (moduleId: string, useVoucher: boolean) => {
    if (ServerApi.mode() === "server") {
      try {
        const result = await ServerApi.refitModule(moduleId, useVoucher);
        ShipModuleSystem.applyServerRefit(moduleId, Number(result?.applied?.level || 1));
        if (useVoucher && result?.applied?.voucher_used) RefitVoucherSystem.consume();
        setMessage(useVoucher ? "已用改装券完成改装" : "改装完成，参数已更新");
        setVersion((value) => value + 1);
        ResourceEventManager.emit("resources_updated");
      } catch (error) {
        setMessage(error instanceof Error ? `改装失败：${error.message}` : "改装失败");
      }
      window.setTimeout(() => setMessage(""), 2400);
      return;
    }

    const check = ShipModuleSystem.canInstall(moduleId, useVoucher);
    if (!check.ok) {
      setMessage(check.reason ?? "无法改装");
      return;
    }

    const ok = ShipModuleSystem.install(moduleId, useVoucher);
    setMessage(ok ? (useVoucher ? "已用改装券完成改装" : "改装完成，参数已更新") : "改装失败");
    setVersion((value) => value + 1);
    window.setTimeout(() => setMessage(""), 2400);
  };

  const overclockModule = async (moduleId: string) => {
    if (ServerApi.mode() === "server") {
      try {
        const result = await ServerApi.overclockModule(moduleId);
        ShipModuleSystem.applyServerOverclock(moduleId, Number(result?.applied?.overclock || 1));
        setMessage("超频完成，模块效果提升");
        setVersion((value) => value + 1);
        ResourceEventManager.emit("resources_updated");
      } catch (error) {
        setMessage(error instanceof Error ? `超频失败：${error.message}` : "超频失败");
      }
      window.setTimeout(() => setMessage(""), 2400);
      return;
    }

    const check = ShipModuleSystem.canOverclock(moduleId);
    if (!check.ok) {
      setMessage(check.reason ?? "无法超频");
      return;
    }

    const ok = ShipModuleSystem.applyOverclock(moduleId);
    setMessage(ok ? "超频完成，模块效果提升" : "超频失败");
    setVersion((value) => value + 1);
    window.setTimeout(() => setMessage(""), 2400);
  };

  const repairHull = async () => {
    if (ServerApi.mode() === "server") {
      try {
        const result = await ServerApi.repairHull();
        HullSystem.applyServerHull(Number(result?.applied?.hull ?? 100));
        setMessage("船体已修复");
        setVersion((value) => value + 1);
        ResourceEventManager.emit("resources_updated");
      } catch (error) {
        setMessage(error instanceof Error ? `维修失败：${error.message}` : "维修失败");
      }
      window.setTimeout(() => setMessage(""), 2400);
      return;
    }

    const check = HullSystem.canRepair();
    if (!check.ok) {
      setMessage(check.reason ?? "无法维修");
      return;
    }
    setMessage(HullSystem.repair() ? "船体已修复" : "维修失败");
    setVersion((value) => value + 1);
    window.setTimeout(() => setMessage(""), 2400);
  };

  const resources = SpaceshipResourceManager.getResources();
  const vouchers = RefitVoucherSystem.count();
  const hull = HullSystem.value();
  const repairCheck = HullSystem.canRepair();

  return (
    <div className="space-y-3" data-refit-version={version}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400">改装上限 {MAX_MODULE_LEVEL} 级：成本指数增长，收益按平方根增长。</span>
        <span className="text-cyan-300 font-semibold shrink-0">🎫 改装券 ×{vouchers}</span>
      </div>

      <div className="rounded-lg border border-red-500/20 bg-white/5 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <span className="text-gray-300">
            船体 {hull}/{MAX_HULL} · 采集 ×{HullSystem.factor().toFixed(2)} · 航行成本 ×{HullSystem.travelFactor().toFixed(2)}
          </span>
          <button
            onClick={repairHull}
            disabled={!repairCheck.ok}
            title={repairCheck.reason ?? ""}
            className="px-2 py-1 rounded text-[11px] bg-red-600/70 hover:bg-red-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            维修 · {formatCost(HullSystem.repairCost())}
          </button>
        </div>
        <div className="mt-2 h-1.5 rounded bg-white/10 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-red-500 to-amber-500 transition-all" style={{ width: `${hull}%` }} />
        </div>
      </div>

      {SHIP_MODULES.map((module) => {
        const level = ShipModuleSystem.level(module.id);
        const cost = ShipModuleSystem.nextCost(module.id);
        const voucherCost = ShipModuleSystem.nextCost(module.id, true);
        const normal = ShipModuleSystem.canInstall(module.id, false);
        const withVoucher = ShipModuleSystem.canInstall(module.id, true);
        const overclock = ShipModuleSystem.overclock(module.id);
        const overclockCheck = ShipModuleSystem.canOverclock(module.id);
        const overclockCost = ShipModuleSystem.overclockCost(module.id);

        return (
          <div key={module.id} className="rounded-lg border border-green-500/20 bg-white/5 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">{module.icon}</span>
                <div>
                  <div className="text-sm text-white font-medium">{module.name}</div>
                  <div className="text-[11px] text-green-300">{module.effect(level)}</div>
                </div>
              </div>
              <span className="text-[11px] text-gray-400 shrink-0">
                Lv {level}/{MAX_MODULE_LEVEL}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] text-gray-400">{formatCost(cost)}</div>

              <div className="flex gap-2">
                <button
                  onClick={() => install(module.id, false)}
                  disabled={!normal.ok}
                  title={normal.reason ?? ""}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  改装
                </button>
                <button
                  onClick={() => install(module.id, true)}
                  disabled={!withVoucher.ok}
                  title={withVoucher.reason ?? formatCost(voucherCost)}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  用券 -50%
                </button>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-2">
              <div className="text-[11px] text-gray-400">
                <span className="text-amber-300">
                  ⚡ 超频 {overclock}/{MAX_OVERCLOCK}
                </span>
                <span className="ml-2">
                  {overclock > 0
                    ? `效果 +${Math.round(OVERCLOCK_STEP * overclock * 100)}%`
                    : `Lv ${OVERCLOCK_MIN_LEVEL} 解锁 · 每次 +${Math.round(OVERCLOCK_STEP * 100)}%`}
                </span>
                <span className="ml-2 text-gray-500">{formatCost(overclockCost)}</span>
              </div>
              <button
                onClick={() => overclockModule(module.id)}
                disabled={!overclockCheck.ok}
                title={overclockCheck.reason ?? ""}
                className="px-3 py-1 rounded-md text-xs font-semibold bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                超频
              </button>
            </div>
          </div>
        );
      })}

      <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
        {[
          { label: "量子合金", value: resources.quantumAlloy },
          { label: "等离子电池", value: resources.plasmaCell },
          { label: "神经回路", value: resources.neuralCircuit },
        ].map((item) => (
          <div key={item.label} className="bg-white/5 rounded p-2 border border-green-500/20">
            <div className="text-gray-400">{item.label}</div>
            <div className="text-white font-semibold">{Math.round(item.value)}</div>
          </div>
        ))}
      </div>

      {message && <p className="text-xs text-center text-green-400">{message}</p>}
    </div>
  );
};

export default ShipyardTab;

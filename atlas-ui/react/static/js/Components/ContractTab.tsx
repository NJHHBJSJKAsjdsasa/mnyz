// atlas-ui/react/static/js/Components/ContractTab.tsx
import React, { useEffect, useState } from "react";
import { Contract, ContractSystem, MAX_ACTIVE_CONTRACTS, CONTRACT_TTL_MS } from "../Utils/ContractSystem.tsx";
import { SpaceshipResourceManager } from "../Utils/SpaceshipResources.tsx";
import { ResourceEventManager } from "../Utils/ResourceEventManager.tsx";
import { resourceLabel } from "../Utils/ResourceLabels.tsx";
import { RefitVoucherSystem } from "../Utils/RefitVoucher.tsx";
import { ServerApi } from "../Utils/ServerApi.tsx";

const METRIC_LABEL: Record<string, string> = {
  scans: "次扫描",
  trades: "笔交易",
  collections: "次采集",
  relicScans: "次遗迹扫描",
  kills: "次击毁",
};

const formatDistance = (distance: number): string => `${(distance / 1000000).toFixed(1)}M`;

const formatGalaxy = (coordinates: string): string =>
  coordinates
    .split(",")
    .map((value) => Number(value).toLocaleString("en-US"))
    .join(" / ");

const formatRemaining = (ms: number | null): string => {
  if (ms === null) return "—";
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
};

const serverMode = () => ServerApi.mode() === "server";

const mapServerContract = (item: any): Contract => ({
  id: item.id,
  title: item.name || item.template,
  description: `服务端每日合同 · ${item.metric}`,
  metric: item.metric,
  target: Number(item.target || 0),
  progress: Number(item.progress || 0),
  reward: item.reward || {},
  voucherReward: Number(item.vouchers || 0),
  accepted: item.status === "accepted",
  claimed: item.status === "claimed",
  expiresAt: item.expires_at ? Date.parse(item.expires_at) : undefined,
  takenBy: item.taken_by || undefined,
});

const ContractTab: React.FC = () => {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [message, setMessage] = useState("");
  const [, setTick] = useState(0);

  const refresh = async () => {
    if (serverMode()) {
      try {
        const data = await ServerApi.contracts();
        setContracts((data?.contracts || []).map(mapServerContract));
      } catch (error) {
        setMessage(error instanceof Error ? `合同加载失败：${error.message}` : "合同加载失败");
      }
      return;
    }
    setContracts([...ContractSystem.getContracts()]);
  };

  useEffect(() => {
    void refresh();
    const unsubscribe = ResourceEventManager.subscribe("resources_updated", () => void refresh());
    const timer = setInterval(() => setTick((value) => value + 1), 1000);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, []);

  const notify = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2400);
  };

  const accept = async (contract: Contract) => {
    if (serverMode()) {
      try {
        await ServerApi.contractAccept(contract.id);
        await refresh();
        notify(`已接取「${contract.title}」`);
      } catch (error) {
        notify(error instanceof Error ? `接取失败：${error.message}` : "接取失败");
      }
      return;
    }
    const check = ContractSystem.canAccept(contract.id);
    if (!check.ok) {
      notify(check.reason ?? "无法接取");
      return;
    }
    ContractSystem.accept(contract.id);
    void refresh();
    notify(`已接取「${contract.title}」`);
  };

  const abandon = (contract: Contract) => {
    if (serverMode()) {
      notify("服务端合同暂不支持放弃");
      return;
    }
    ContractSystem.abandon(contract.id);
    void refresh();
    notify(`已放弃「${contract.title}」，进度保留`);
  };

  const goTo = async (contract: Contract) => {
    if (!contract.targetGalaxy) return;

    const cost = ContractSystem.travelCost(contract);
    const hasCost = cost.antimatter + cost.element115 + cost.deuterium > 0;

    if (hasCost) {
      if (!SpaceshipResourceManager.consumeResources(cost)) {
        notify("燃料不足，无法启程");
        return;
      }
      ResourceEventManager.emit("resources_updated");
    }

    try {
      await fetch("/navigate", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `coordinates=${encodeURIComponent(contract.targetGalaxy)}&page=1`,
      });
      window.location.href = "/galaxy";
    } catch (error) {
      notify("导航失败，请用坐标选择器手动前往");
    }
  };

  const claim = async (contract: Contract) => {
    if (serverMode()) {
      try {
        const result = await ServerApi.contractClaim(contract.id);
        SpaceshipResourceManager.addResources(result?.reward || {});
        if (Number(result?.vouchers || 0) > 0) RefitVoucherSystem.earn(Number(result.vouchers));
        ResourceEventManager.emit("resources_updated");
        await refresh();
        notify(`「${contract.title}」奖励已入账${Number(result?.vouchers || 0) > 0 ? `，含改装券 ×${result.vouchers}` : ""}`);
      } catch (error) {
        notify(error instanceof Error ? `结算失败：${error.message}` : "结算失败");
      }
      return;
    }
    const result = ContractSystem.claim(contract.id);
    if (!result) {
      notify(ContractSystem.isExpired(contract) ? "合同已作废" : "进度未完成，无法结算");
      return;
    }
    SpaceshipResourceManager.addResources(result.reward);
    if (result.vouchers > 0) RefitVoucherSystem.earn(result.vouchers);
    ResourceEventManager.emit("resources_updated");
    void refresh();
    const bonusText = result.bonus > 1 ? `（模块 +${Math.round((result.bonus - 1) * 100)}%）` : "";
    notify(`「${contract.title}」奖励已入账${bonusText}${result.vouchers > 0 ? `，含改装券 ×${result.vouchers}` : ""}`);
  };

  const activeCount = serverMode()
    ? contracts.filter((item) => item.accepted && !item.claimed).length
    : ContractSystem.activeCount();
  const efficiency = SpaceshipResourceManager.getUpgrade().efficiency;
  const resources = SpaceshipResourceManager.getResources();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-400">
        <span>每日 3 份合同，进度来自扫描、贸易与地表采集。</span>
        <span className="text-orange-300 shrink-0">
          进行中 {activeCount}/{MAX_ACTIVE_CONTRACTS} · 接取后 {CONTRACT_TTL_MS / 3600000} 小时内完成
        </span>
      </div>

      {contracts.map((contract) => {
        const percent = Math.min(100, Math.round((contract.progress / contract.target) * 100));
        const done = contract.progress >= contract.target;
        const expired = contract.expiresAt ? contract.expiresAt <= Date.now() : ContractSystem.isExpired(contract);
        const payout = serverMode()
          ? { reward: contract.reward, bonus: 1 }
          : ContractSystem.previewReward(contract);
        const moduleBonus = payout.bonus;
        const rewardText = Object.entries(payout.reward)
          .map(([key, amount]) => `${resourceLabel(key)} ${amount}`)
          .join(" · ");
        const voucherText = contract.voucherReward ? ` · 改装券 ×${contract.voucherReward}` : "";
        const travel = ContractSystem.travelCost(contract);
        const fuel = {
          antimatter: Math.floor(travel.antimatter / efficiency),
          element115: Math.floor(travel.element115 / efficiency),
          deuterium: Math.floor(travel.deuterium / efficiency),
        };
        const canAffordTrip =
          resources.antimatter >= fuel.antimatter && resources.element115 >= fuel.element115 && resources.deuterium >= fuel.deuterium;

        const cardClass = contract.claimed
          ? "border-gray-600/30 bg-white/[0.02] opacity-60"
          : contract.takenBy
            ? "border-gray-600/30 bg-white/[0.02] opacity-60"
            : expired
              ? "border-red-500/30 bg-red-950/20 opacity-70"
              : "border-purple-500/20 bg-white/5";

        return (
          <div key={contract.id} className={`rounded-lg border p-3 transition-colors ${cardClass}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm text-white font-medium">{contract.title}</span>
                  {contract.requires && (
                    <span className="text-[10px] text-cyan-300 border border-cyan-500/40 rounded px-1 py-0.5">
                      需 {ContractSystem.moduleName(contract.requires.moduleId)} Lv{contract.requires.level}
                    </span>
                  )}
                  {contract.takenBy && (
                    <span className="text-[10px] text-gray-300 border border-gray-600/50 rounded px-1 py-0.5">已被 {contract.takenBy} 接取</span>
                  )}
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5">{contract.description}</div>
                {contract.targetGalaxy && (
                  <div className="mt-1 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-blue-300">
                      <span>目标星系 {formatGalaxy(contract.targetGalaxy)}</span>
                      {contract.targetDistance !== undefined && <span className="text-blue-400/80">距离 {formatDistance(contract.targetDistance)}</span>}
                      {contract.rewardMultiplier !== undefined && <span className="text-yellow-300">奖励 ×{contract.rewardMultiplier}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span className={canAffordTrip ? "text-blue-400/80" : "text-red-400"}>
                        燃料 {fuel.antimatter} AM · {fuel.element115} E115 · {fuel.deuterium} D
                      </span>
                      <button
                        onClick={() => goTo(contract)}
                        disabled={!canAffordTrip}
                        title={canAffordTrip ? "" : "燃料不足"}
                        className="underline hover:text-blue-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline"
                      >
                        前往
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <span className={`text-[11px] shrink-0 ${expired ? "text-red-400" : "text-purple-300"}`}>
                {contract.progress}/{contract.target} {METRIC_LABEL[contract.metric] ?? ""}
              </span>
            </div>

            <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${done ? "bg-green-400" : expired ? "bg-red-500/60" : "bg-gradient-to-r from-purple-500 to-blue-500"}`}
                style={{ width: `${percent}%` }}
              />
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-yellow-300">
                {rewardText}
                <span className="text-cyan-300">{voucherText}</span>
                {moduleBonus > 1 && <span className="text-green-300"> · 模块 +{Math.round((moduleBonus - 1) * 100)}%</span>}
              </span>

              {contract.claimed ? (
                <span className="text-[11px] text-gray-500">已结算</span>
              ) : contract.takenBy ? (
                <span className="text-[11px] text-gray-500">已被接取</span>
              ) : expired ? (
                <span className="text-[11px] text-red-400">已作废</span>
              ) : !contract.accepted ? (
                <button
                  onClick={() => accept(contract)}
                  disabled={activeCount >= MAX_ACTIVE_CONTRACTS}
                  title={activeCount >= MAX_ACTIVE_CONTRACTS ? `同时只能进行 ${MAX_ACTIVE_CONTRACTS} 份` : ""}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  接取
                </button>
              ) : done ? (
                <button
                  onClick={() => claim(contract)}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white transition-all"
                >
                  领取奖励
                </button>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="text-[11px] text-orange-300">
                    剩 {formatRemaining(contract.expiresAt ? contract.expiresAt - Date.now() : ContractSystem.remainingMs(contract))}
                  </span>
                  <button
                    onClick={() => abandon(contract)}
                    className="px-2.5 py-1.5 rounded-md text-[11px] font-medium bg-gray-700/50 hover:bg-gray-700/70 border border-gray-600/50 text-gray-300 transition-all"
                  >
                    放弃
                  </button>
                </span>
              )}
            </div>
          </div>
        );
      })}

      {message && <p className="text-xs text-center text-green-400">{message}</p>}
    </div>
  );
};

export default ContractTab;

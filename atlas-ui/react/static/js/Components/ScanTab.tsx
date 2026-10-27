// atlas-ui/react/static/js/Components/ScanTab.tsx
import React, { useEffect, useState } from "react";
import { PlanetScanSystem, ScanOutcome } from "../Utils/PlanetScanSystem.tsx";
import { SpaceshipResourceManager } from "../Utils/SpaceshipResources.tsx";
import { resourceLabel } from "../Utils/ResourceLabels.tsx";
import { ShipModuleSystem } from "../Utils/ShipModules.tsx";
import { RelicLore } from "../Utils/RelicLore.tsx";
import { WreckSystem } from "../Utils/WreckSystem.tsx";
import { ServerApi } from "../Utils/ServerApi.tsx";
import SurfaceSurvey from "./SurfaceSurvey.tsx";

interface ScanTabProps {
  planetKey: string;
  planetName: string;
  planetType: string;
  coordinates: string;
}

const formatRemaining = (ms: number): string => {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const KIND_STYLE: Record<string, string> = {
  barren: "border-gray-500/40 text-gray-300",
  enriched: "border-green-500/40 text-green-300",
  mineral: "border-cyan-500/40 text-cyan-300",
  relic: "border-purple-500/40 text-purple-300",
};

const ScanTab: React.FC<ScanTabProps> = ({ planetKey, planetName, planetType, coordinates }) => {
  const [remaining, setRemaining] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [bonus, setBonus] = useState(1);
  const [scanCount, setScanCount] = useState(0);
  const [message, setMessage] = useState("");
  const [relicProgress, setRelicProgress] = useState(() => RelicLore.progress());
  const [wreck, setWreck] = useState(() => WreckSystem.has(planetKey));
  const [surveyOpen, setSurveyOpen] = useState(false);

  const refresh = () => {
    setRemaining(PlanetScanSystem.cooldownRemaining(planetKey));
    setBonus(PlanetScanSystem.pendingBonus(planetKey));
    setScanCount(PlanetScanSystem.scanCount(planetKey));
  };

  useEffect(() => {
    refresh();
    if (ServerApi.mode() === "server") {
      ServerApi.wrecks()
        .then((data) => setWreck((data?.wrecks || []).some((row: any) => row.planet_key === planetKey)))
        .catch(() => setWreck(false));
    }
    const timer = setInterval(() => setRemaining(PlanetScanSystem.cooldownRemaining(planetKey)), 1000);
    return () => clearInterval(timer);
  }, [planetKey]);

  const handleScan = async () => {
    if (ServerApi.mode() === "server") {
      setMessage("");
      setScanning(true);
      try {
        const result = await ServerApi.scan(planetKey);
        SpaceshipResourceManager.addResources(result?.yield || {});
        const kind = result?.kind === "relic" ? "relic" : result?.kind === "rich" ? "enriched" : "mineral";
        setOutcome({
          kind,
          title: result?.title || "扫描结果",
          detail: result?.detail || "",
          yield: result?.yield || {},
          miningBonus: 1,
        } as ScanOutcome);
        PlanetScanSystem.applyServerResult(planetKey, Number(result?.scans || 1), Number(result?.cooldown?.ready_in_ms || 0));
        refresh();
        setScanCount(Number(result?.scans || 1));
      } catch (error) {
        setMessage(error instanceof Error ? `扫描失败：${error.message}` : "扫描失败");
      } finally {
        setScanning(false);
      }
      return;
    }

    const check = PlanetScanSystem.canScan(planetKey);
    if (!check.ok) {
      setMessage(check.reason === "氘不足" ? `氘不足，需要 ${ShipModuleSystem.scanCost()}` : "探测器仍在冷却");
      return;
    }

    setMessage("");
    setScanning(true);
    window.setTimeout(() => {
      const result = PlanetScanSystem.scan(planetKey, planetType, planetName, coordinates);
      setScanning(false);
      if (result) {
        setOutcome(result);
        refresh();
        setRelicProgress(RelicLore.progress());
      } else {
        setMessage("扫描失败，请稍后再试");
      }
    }, 1400);
  };

  const salvage = async () => {
    if (remaining > 0) {
      setMessage("探测器冷却中，无法打捞");
      return;
    }

    if (ServerApi.mode() === "server") {
      try {
        const result = await ServerApi.salvage(planetKey);
        SpaceshipResourceManager.addResources(result?.yield || {});
        PlanetScanSystem.markUsed(planetKey);
        setWreck(false);
        refresh();
        setMessage(
          `打捞完成：${Object.entries(result?.yield || {})
            .map(([key, value]) => `${resourceLabel(key)} +${value}`)
            .join(" · ")}`,
        );
      } catch (error) {
        setMessage(error instanceof Error ? `打捞失败：${error.message}` : "打捞失败");
      }
      return;
    }

    const result = WreckSystem.salvage(planetKey);
    if (!result) {
      setWreck(false);
      setMessage("这里没有可打捞的残骸");
      return;
    }

    PlanetScanSystem.markUsed(planetKey);
    setWreck(false);
    refresh();
    setMessage(
      `打捞完成：${Object.entries(result.yield)
        .map(([key, value]) => `${resourceLabel(key)} +${value}`)
        .join(" · ")}`,
    );
  };

  const deuterium = SpaceshipResourceManager.getResources().deuterium;
  const fragment = RelicLore.fragmentFor(planetKey, planetName);

  return (
    <div className="space-y-4">
      <div className="relative h-28 rounded-xl border border-cyan-500/30 bg-black/40 overflow-hidden">
        <div className={`absolute inset-0 ${scanning ? "animate-scan-horizontal" : ""}`}>
          <div className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-cyan-400/80 to-transparent" />
        </div>
        <div className="relative h-full flex flex-col items-center justify-center gap-1">
          <span className="text-3xl">{scanning ? "📡" : outcome?.kind === "relic" ? "🏺" : "🔍"}</span>
          <p className="text-xs text-gray-400">
            {scanning ? "正在穿透地表扫描…" : remaining > 0 ? `冷却中 ${formatRemaining(remaining)}` : "轨道探测阵列就绪"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="bg-white/5 rounded p-2 border border-cyan-500/20">
          <div className="text-gray-400">扫描次数</div>
          <div className="text-white font-semibold">{scanCount}</div>
        </div>
        <div className="bg-white/5 rounded p-2 border border-cyan-500/20">
          <div className="text-gray-400">采集加成</div>
          <div className={bonus > 1 ? "text-green-400 font-semibold" : "text-white font-semibold"}>×{bonus.toFixed(2)}</div>
        </div>
        <div className="bg-white/5 rounded p-2 border border-cyan-500/20">
          <div className="text-gray-400">氘储备</div>
          <div className="text-white font-semibold">{Math.round(deuterium)}</div>
        </div>
      </div>

      {outcome && (
        <div className={`rounded-lg border bg-white/5 p-3 ${KIND_STYLE[outcome.kind] ?? "border-white/10 text-gray-300"}`}>
          <div className="flex items-center justify-between">
            <span className="font-semibold">{outcome.title}</span>
            {outcome.kind === "enriched" && <span className="text-xs">×{outcome.miningBonus.toFixed(2)}</span>}
          </div>
          <p className="text-xs text-gray-400 mt-1">{outcome.detail}</p>
          {Object.keys(outcome.yield).length > 0 && (
            <p className="text-xs mt-2 text-cyan-300">
              {Object.entries(outcome.yield)
                .map(([key, value]) => `${resourceLabel(key)} +${value}`)
                .join(" · ")}
            </p>
          )}

          {outcome.kind === "relic" && (
            <div className="mt-2 border-t border-white/10 pt-2">
              <div className="text-xs text-purple-200">{fragment.title}</div>
              <p className="text-xs text-gray-400 italic mt-1">“{fragment.text}”</p>
              <p className="text-[11px] text-gray-500 mt-1">
                遗迹档案 {relicProgress.found.length}/{relicProgress.total}
                {relicProgress.claimed ? " · 已集齐，奖励已发放" : relicProgress.complete ? " · 奖励待领取" : ""}
              </p>
            </div>
          )}
        </div>
      )}

      {wreck && (
        <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 p-2">
          <div className="text-xs text-orange-200">战斗残骸</div>
          <p className="text-[11px] text-gray-400 mt-0.5">打捞会占用一次扫描冷却。</p>
          <button
            onClick={() => void salvage()}
            disabled={remaining > 0 || scanning}
            className="mt-1 px-3 py-1 rounded-md text-[11px] font-semibold bg-orange-600/80 hover:bg-orange-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            打捞残骸
          </button>
        </div>
      )}

      <button
        onClick={() => setSurveyOpen(true)}
        className="w-full py-1.5 rounded-lg text-xs font-medium bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition-all"
      >
        地表采样（在丰度图上选点，每日 3 次）
      </button>

      <button
        onClick={handleScan}
        disabled={scanning || remaining > 0}
        className="w-full py-2.5 rounded-lg font-semibold text-sm bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {scanning ? "扫描中…" : remaining > 0 ? `冷却 ${formatRemaining(remaining)}` : `启动扫描（消耗 ${ShipModuleSystem.scanCost()} 氘）`}
      </button>

      {message && <p className="text-xs text-orange-400 text-center">{message}</p>}

      {surveyOpen && <SurfaceSurvey planetKey={planetKey} planetName={planetName} onClose={() => setSurveyOpen(false)} />}
    </div>
  );
};

export default ScanTab;

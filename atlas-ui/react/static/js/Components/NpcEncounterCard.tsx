// atlas-ui/react/static/js/Components/NpcEncounterCard.tsx
import React, { useEffect, useState } from "react";
import { NpcEncounters, NpcOffer } from "../Utils/NpcEncounters.tsx";
import { Residents } from "../Utils/Residents.tsx";
import { resourceLabel } from "../Utils/ResourceLabels.tsx";
import { SpaceshipResource, SpaceshipResourceManager } from "../Utils/SpaceshipResources.tsx";
import { UnifiedSpaceshipStorage } from "../Utils/UnifiedSpaceshipStorage.tsx";
import { ResourceEventManager } from "../Utils/ResourceEventManager.tsx";
import { ServerApi } from "../Utils/ServerApi.tsx";

const amounts = (bag: Partial<SpaceshipResource>): string =>
  Object.entries(bag)
    .map(([key, amount]) => `${resourceLabel(key)} ${amount}`)
    .join(" · ");

interface NpcEncounterCardProps {
  planetKey: string;
  residentId?: string;
}

const NpcEncounterCard: React.FC<NpcEncounterCardProps> = ({ planetKey, residentId }) => {
  const serverMode = ServerApi.mode() === "server";
  const [offer, setOffer] = useState<NpcOffer | null>(() =>
    serverMode ? null : NpcEncounters.encounter({ planetKey, universeSeed: Residents.universeSeed(), residentId }),
  );
  const [serverOffer, setServerOffer] = useState<any>(null);
  const [result, setResult] = useState("");

  useEffect(() => {
    if (!serverMode) return;
    ServerApi.residentOffer(planetKey)
      .then((data) => setServerOffer(data?.offer || null))
      .catch((error) => console.warn("[atlas-server] resident offer failed", error));
  }, [planetKey, serverMode]);

  const activeOffer: NpcOffer | null = serverMode
    ? serverOffer
      ? {
          resident: {
            id: serverOffer.resident.id,
            name: serverOffer.resident.name,
            callsign: serverOffer.resident.callsign,
            ship: serverOffer.resident.ship,
            trait: serverOffer.resident.trait,
          },
          favor: serverOffer.favor,
          give: serverOffer.give,
          want: serverOffer.want,
          ratio: serverOffer.ratio,
        }
      : null
    : offer;

  const accept = async () => {
    if (!activeOffer) return;
    if (serverMode) {
      try {
        const traded = await ServerApi.tradeResident(activeOffer.resident.id, planetKey);
        const current = SpaceshipResourceManager.getResources();
        const next = { ...current };
        Object.entries(traded?.spent || {}).forEach(([code, amount]) => {
          if (code in next) (next as any)[code] = Math.max(0, (next as any)[code] - Number(amount));
        });
        Object.entries(traded?.gained || {}).forEach(([code, amount]) => {
          if (code in next) (next as any)[code] = Number(next as any)[code] + Number(amount);
        });
        UnifiedSpaceshipStorage.setResources(next);
        ResourceEventManager.emit("resources_updated");
        setResult(`成交。获得 ${amounts(traded?.gained || {})}，好感 ${traded?.favor ?? 0}`);
        setServerOffer(null);
      } catch (error) {
        setResult(error instanceof Error ? `交易失败：${error.message}` : "交易失败");
      }
      return;
    }
    const outcome = NpcEncounters.accept(activeOffer, planetKey);
    setResult(outcome.ok ? `成交。获得 ${amounts(activeOffer.give)}，好感 +1` : outcome.reason ?? "交易失败");
    setOffer(null);
  };

  const decline = () => {
    if (serverMode) {
      setServerOffer(null);
      setResult("你没有接下这笔买卖，对方收起了货舱灯。");
      return;
    }
    NpcEncounters.decline(planetKey);
    setResult("你没有接下这笔买卖，对方收起了货舱灯。");
    setOffer(null);
  };

  if (!activeOffer && !result) return null;

  return (
    <div className="mt-3 bg-indigo-500/10 rounded-lg p-2 border border-indigo-500/30">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-gray-200">偶遇 · {activeOffer?.resident.callsign ?? "同行者"}</div>
        {activeOffer && <div className="text-[10px] text-indigo-300/80">好感 {activeOffer.favor}</div>}
      </div>

      {activeOffer ? (
        <>
          <div className="text-xs text-gray-300">
            <span className="text-indigo-200">{activeOffer.resident.name}</span>
            <span className="text-gray-500"> · {activeOffer.resident.ship} · </span>
            <span className="text-gray-400">市价 {Math.round(activeOffer.ratio * 100)}%</span>
          </div>
          <div className="mt-1 text-xs">
            <span className="text-gray-400">对方要 </span>
            <span className="text-red-300">{amounts(activeOffer.want)}</span>
            <span className="text-gray-400">，给 </span>
            <span className="text-emerald-300">{amounts(activeOffer.give)}</span>
          </div>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => void accept()}
              className="px-3 py-1 rounded-md text-xs font-semibold bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white transition-all"
            >
              成交
            </button>
            <button onClick={decline} className="px-3 py-1 rounded-md text-xs bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition-all">
              谢绝
            </button>
          </div>
        </>
      ) : (
        <p className="text-xs text-gray-400">{result}</p>
      )}
    </div>
  );
};

export default NpcEncounterCard;

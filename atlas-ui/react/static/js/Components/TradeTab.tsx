// atlas-ui/react/static/js/Components/TradeTab.tsx
import React, { useEffect, useState } from "react";
import { TradeSystem, TradeGood } from "../Utils/TradeSystem.tsx";
import { SpaceshipResourceManager } from "../Utils/SpaceshipResources.tsx";
import { UnifiedSpaceshipStorage } from "../Utils/UnifiedSpaceshipStorage.tsx";
import { resourceLabel } from "../Utils/ResourceLabels.tsx";
import { ServerApi } from "../Utils/ServerApi.tsx";

const GOOD_ICONS: Record<string, string> = {
  quantumAlloy: "⚙️",
  plasmaCell: "🔋",
  neuralCircuit: "🧠",
  exoticCrystal: "💠",
  nebulaDust: "🌫️",
  blackHoleFragment: "🕳️",
  ancientRelic: "🏺",
  alienArtifact: "🛸",
  dimensionalShard: "🔮",
};

const applyBalances = (balances: Record<string, number> | undefined) => {
  if (!balances) return;
  const current = SpaceshipResourceManager.getResources();
  const next = { ...current };
  Object.entries(balances).forEach(([code, amount]) => {
    if (code in next) (next as any)[code] = Number(amount);
  });
  UnifiedSpaceshipStorage.setResources(next);
};

interface TradeTabProps {
  planetKey: string;
  coordinates: string;
}

const TradeTab: React.FC<TradeTabProps> = ({ planetKey, coordinates }) => {
  const [goods, setGoods] = useState<TradeGood[]>([]);
  const [antimatter, setAntimatter] = useState(0);
  const [toast, setToast] = useState("");

  const refresh = async () => {
    if (ServerApi.mode() === "server") {
      try {
        const data = await ServerApi.market(planetKey);
        setGoods(
          (data?.quotes || []).map((quote: any) => ({
            resource: quote.resource_code,
            label: resourceLabel(quote.resource_code),
            icon: GOOD_ICONS[quote.resource_code] || "📦",
            price: quote.buy_price,
            basePrice: quote.buy_price,
            sellPrice: quote.sell_price,
            stock: quote.stock,
          })) as TradeGood[],
        );
        applyBalances(data?.balances);
        setAntimatter(Math.round(Number(data?.balances?.antimatter ?? 0)));
      } catch (error) {
        setGoods([]);
        setToast(error instanceof Error ? `行情加载失败：${error.message}` : "行情加载失败");
        return;
      }
    } else {
      setGoods(TradeSystem.getMarket(planetKey));
      setAntimatter(Math.round(SpaceshipResourceManager.getResources().antimatter));
    }
  };

  useEffect(() => {
    void refresh();
    setToast("");
  }, [planetKey]);

  const notify = (message: string) => {
    setToast(message);
    void refresh();
    window.setTimeout(() => setToast(""), 2600);
  };

  const handleBuy = async (good: TradeGood) => {
    if (ServerApi.mode() === "server") {
      try {
        const result = await ServerApi.marketBuy(planetKey, String(good.resource), 1);
        applyBalances(result?.balances);
        notify(`购入 ${good.label} ×1，花费 ${result?.total ?? good.price} 反物质`);
      } catch (error) {
        notify(error instanceof Error ? `买入失败：${error.message}` : "买入失败");
      }
      return;
    }
    notify(TradeSystem.buy(planetKey, good, 1, coordinates).message);
  };

  const handleSell = async (good: TradeGood) => {
    if (ServerApi.mode() === "server") {
      try {
        const result = await ServerApi.marketSell(planetKey, String(good.resource), 1);
        applyBalances(result?.balances);
        notify(`售出 ${good.label} ×1，获得 ${result?.total ?? good.sellPrice} 反物质`);
      } catch (error) {
        notify(error instanceof Error ? `卖出失败：${error.message}` : "卖出失败");
      }
      return;
    }
    notify(TradeSystem.sell(planetKey, good, 1, coordinates).message);
  };

  const owned = SpaceshipResourceManager.getResources();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>各站行情不同：低价买入，到别的行星按基准价卖出即可获利</span>
        <span className="text-yellow-300 font-semibold">⚛️ {antimatter}</span>
      </div>

      {goods.map((good) => (
        <div key={good.resource} className="rounded-lg border border-yellow-500/20 bg-white/5 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">{good.icon}</span>
              <div>
                <div className="text-sm text-white font-medium">{good.label}</div>
                <div className="text-[11px] text-gray-400">
                  库存 {good.stock} · 持有 {Math.round(owned[good.resource] ?? 0)}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-yellow-300 font-semibold">{good.price} ⚛️</div>
              <div className={`text-[11px] ${good.sellPrice > good.price ? "text-green-400" : "text-gray-500"}`}>卖出 {good.sellPrice} ⚛️</div>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              onClick={() => handleBuy(good)}
              disabled={good.stock <= 0}
              className="py-1.5 rounded-md text-xs font-semibold bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              买入 1
            </button>
            <button
              onClick={() => handleSell(good)}
              disabled={(owned[good.resource] ?? 0) < 1}
              className="py-1.5 rounded-md text-xs font-semibold bg-gray-700/60 hover:bg-gray-600/70 border border-gray-600/50 text-gray-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              卖出 1
            </button>
          </div>
        </div>
      ))}

      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] bg-gray-900/95 border border-yellow-500/40 text-yellow-200 text-xs px-4 py-2 rounded-lg shadow-xl animate-fadeIn">
          {toast}
        </div>
      )}
    </div>
  );
};

export default TradeTab;

// atlas-ui/react/static/js/Components/ExplorationLab.tsx
import React, { useState } from "react";
import ScanTab from "./ScanTab.tsx";
import TradeTab from "./TradeTab.tsx";
import ShipyardTab from "./ShipyardTab.tsx";
import ContractTab from "./ContractTab.tsx";
import ResidentsTab from "./ResidentsTab.tsx";
import CodexTab from "./CodexTab.tsx";
import WeeklyTab from "./WeeklyTab.tsx";
import StationTab from "./StationTab.tsx";
import CosmicBanner from "./CosmicBanner.tsx";
import FabricatorTab from "./FabricatorTab.tsx";
import TechTab from "./TechTab.tsx";
import CouncilTab from "./CouncilTab.tsx";
import StockMarketPanel from "./StockMarketPanel.tsx";
import { PlanetScanSystem } from "../Utils/PlanetScanSystem.tsx";

interface ExplorationLabProps {
  planetName: string;
  planetType: string;
  systemIndex: number;
  coordinates: string;
}

type LabTab =
  | "scan"
  | "trade"
  | "shipyard"
  | "contracts"
  | "station"
  | "craft"
  | "tech"
  | "crew"
  | "codex"
  | "weekly"
  | "council"
  | "market";

const TABS: Array<{ id: LabTab; label: string; icon: string }> = [
  { id: "scan", label: "地质扫描", icon: "🔍" },
  { id: "trade", label: "星际贸易", icon: "🛰" },
  { id: "shipyard", label: "飞船改装", icon: "🛠" },
  { id: "contracts", label: "远征合同", icon: "📜" },
  { id: "station", label: "空间站", icon: "🏗" },
  { id: "craft", label: "生产线", icon: "🏭" },
  { id: "tech", label: "科技树", icon: "🧪" },
  { id: "crew", label: "同行者", icon: "🧭" },
  { id: "codex", label: "图鉴", icon: "📖" },
  { id: "weekly", label: "周目标", icon: "🎯" },
  { id: "council", label: "宇宙议会", icon: "🏛" },
  { id: "market", label: "星际股市", icon: "📈" },
];

const ExplorationLab: React.FC<ExplorationLabProps> = ({ planetName, planetType, systemIndex, coordinates }) => {
  const [tab, setTab] = useState<LabTab>("scan");

  const planetKey = PlanetScanSystem.locationKey(planetName, coordinates, systemIndex);

  const renderTab = () => {
    switch (tab) {
      case "scan":
        return <ScanTab planetKey={planetKey} planetName={planetName} planetType={planetType} coordinates={coordinates} />;
      case "trade":
        return <TradeTab planetKey={planetKey} coordinates={coordinates} />;
      case "shipyard":
        return <ShipyardTab />;
      case "crew":
        return <ResidentsTab />;
      case "codex":
        return <CodexTab />;
      case "weekly":
        return <WeeklyTab />;
      case "council":
        return <CouncilTab />;
      case "market":
        return <StockMarketPanel />;
      case "station":
        return <StationTab planetKey={planetKey} planetName={planetName} systemIndex={systemIndex} coordinates={coordinates} />;
      case "craft":
        return <FabricatorTab />;
      case "tech":
        return <TechTab />;
      default:
        return <ContractTab />;
    }
  };

  return (
    <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 mb-8 shadow-2xl p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-white">星舰实验舱</h2>
          <p className="text-xs text-gray-400 mt-1">
            {planetName.replace(/_/g, " ")} · {planetType}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {TABS.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-all border ${
                tab === item.id
                  ? "bg-gradient-to-r from-blue-600/80 to-purple-600/80 border-blue-400/40 text-white"
                  : "bg-white/5 border-white/10 text-gray-300 hover:bg-white/10"
              }`}
            >
              <span className="mr-1">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3">
        <CosmicBanner coordinates={coordinates} />
      </div>

      <div key={`${planetKey}-${tab}`}>{renderTab()}</div>
    </div>
  );
};

export default ExplorationLab;

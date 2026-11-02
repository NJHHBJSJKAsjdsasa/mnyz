// atlas-ui/react/static/js/Components/ExplorationLab.tsx
// The twelve planet-page tools, now grouped by intent instead of one flat row.
// Splitting them into groups is what keeps the strip readable at 768px: four
// labelled clusters wrap predictably, one 12-button row does not.

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
  /**
   * Rendered inside the shell's drawer instead of as a page section. Drops the
   * `atlas-hud` frame and page margins — the drawer already has both, and a card
   * inside a card is the "one box per block" look this redesign removed.
   */
  embedded?: boolean;
}

type LabTab = "scan" | "trade" | "shipyard" | "contracts" | "station" | "craft" | "tech" | "crew" | "codex" | "weekly" | "council" | "market";

interface TabSpec {
  id: LabTab;
  label: string;
  icon: string;
}

/** Four clusters: what you learn, what you earn, what you build, who you deal with. */
const TAB_GROUPS: Array<{ label: string; tabs: TabSpec[] }> = [
  {
    label: "勘探",
    tabs: [
      { id: "scan", label: "地质扫描", icon: "🔍" },
      { id: "codex", label: "图鉴", icon: "📖" },
    ],
  },
  {
    label: "经营",
    tabs: [
      { id: "trade", label: "星际贸易", icon: "🛰" },
      { id: "contracts", label: "远征合同", icon: "📜" },
      { id: "station", label: "空间站", icon: "🏗" },
      { id: "craft", label: "生产线", icon: "🏭" },
    ],
  },
  {
    label: "成长",
    tabs: [
      { id: "shipyard", label: "飞船改装", icon: "🛠" },
      { id: "tech", label: "科技树", icon: "🧪" },
      { id: "crew", label: "同行者", icon: "🧭" },
      { id: "weekly", label: "周目标", icon: "🎯" },
    ],
  },
  {
    label: "势力",
    tabs: [
      { id: "council", label: "宇宙议会", icon: "🏛" },
      { id: "market", label: "星际股市", icon: "📈" },
    ],
  },
];

const ExplorationLab: React.FC<ExplorationLabProps> = ({ planetName, planetType, systemIndex, coordinates, embedded = false }) => {
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
    <div className={embedded ? "" : "atlas-hud mb-8 shadow-2xl p-4 sm:p-6"}>
      <div className="flex flex-col gap-3 mb-4">
        {embedded ? null : (
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-white">星舰实验舱</h2>
            <p className="text-xs text-gray-400 mt-1">
              {planetName.replace(/_/g, " ")} · {planetType}
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
          {TAB_GROUPS.map((group) => (
            <div key={group.label} className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-gray-500 select-none">{group.label}</span>
              {group.tabs.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  aria-pressed={tab === item.id}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-all border ${
                    tab === item.id
                      ? "bg-blue-600/80 hover:bg-purple-600/80 border-blue-400/40 text-white"
                      : "bg-white/[0.04] border-white/10 text-gray-300 hover:bg-plate-2"
                  }`}
                >
                  <span className="mr-1">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
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

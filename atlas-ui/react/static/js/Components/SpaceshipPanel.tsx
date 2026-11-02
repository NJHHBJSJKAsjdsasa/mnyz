// atlas-ui/react/static/js/Components/SpaceshipPanel.tsx

import React, { useState, useEffect, useRef } from "react";
import { getStorageStats } from "../Utils/VisitHistory.tsx";
import { LocationBookmarks, SavedLocation } from "../Utils/LocationBookmarks.tsx";
import { DailyChallengesManager, DailyChallenges } from "../Utils/DailyChallenges.tsx";
import { SpaceshipResourceManager, SpaceshipResource, SpaceshipUpgrade, TravelCost } from "../Utils/SpaceshipResources.tsx";
import { UnifiedSpaceshipStorage } from "../Utils/UnifiedSpaceshipStorage.tsx";
import { ResourceEventManager } from "../Utils/ResourceEventManager.tsx";
import { getItem, setItem } from "../Utils/b64.tsx";
import { DataExportImport } from "../Utils/DataExportImport.tsx";
import { ServerApi } from "../Utils/ServerApi.tsx";
import ProgressBar from "./ProgressBar.tsx";
import AntimatterIcon from "../Icons/AntimatterIcon.tsx";
import DeuteriumIcon from "../Icons/DeuteriumIcon.tsx";
import Element115Icon from "../Icons/Element115Icon.tsx";
import { UniverseDetection } from "../Utils/UniverseDetection.tsx";
import { useSpaceshipPanel } from "./spaceship/useSpaceshipPanel.ts";
import StatsTab from "./spaceship/StatsTab.tsx";
import ShipTab from "./spaceship/ShipTab.tsx";
import SavedTab from "./spaceship/SavedTab.tsx";
import { Drawer } from "../ui/index.ts";

interface SpaceshipPanelProps {
  currentLocation?: {
    type: "galaxy" | "system" | "planet";
    name: string;
    coordinates: string;
    systemIndex?: number;
    planetName?: string;
  };
}

const SpaceshipPanel: React.FC<SpaceshipPanelProps> = () => {
  const panel = useSpaceshipPanel();
  const {
    serverMode,
    isOpen,
    setIsOpen,
    activeTab,
    setActiveTab,
    stats,
    savedLocations,
    locationStats,
    dailyChallenges,
    spaceshipResources,
    spaceshipUpgrade,
    upgradeCost,
    passiveGeneration,
    baseGeneration,
    showCollectionPopup,
    setShowCollectionPopup,
    isCollectionClosing,
    setSpaceshipResources,
    setPassiveGeneration,
    importError,
    importSuccess,
    isRemoteUniverse,
    panelRef,
    collectionModalRef,
    fileInputRef,
    handleClose,
    handleToggle,
    upgradeShip,
    handleServerImport,
    handleExport,
    handleImport,
    handleRemoveLocation,
    closeCollectionPopup,
    formatBytes,
    formatLocationName,
  } = useSpaceshipPanel();

  return (
    <>
      <div ref={panelRef} className="fixed bottom-4 sm:bottom-6 right-4 sm:right-6 z-50">
        <button onClick={handleToggle} style={{ position: "relative", zIndex: 56 }} aria-expanded={isOpen} className="w-12 h-12 sm:w-14 sm:h-14 bg-blue-600 hover:bg-blue-500 text-white rounded-full shadow-2xl border-2 border-blue-400/30 transition-all duration-300 transform hover:scale-105" title="Spaceship Control Panel">
          <div className="flex items-center justify-center">
            <svg className="flex items-center justify-center" xmlns="http://www.w3.org/2000/svg" width={24} height={24} viewBox="0 0 24 24">
              <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}>
                <path d="M12 3a6.02 6.02 0 0 0-5.923 4.9c-.086.466-.13.699.032 1.005c.161.307.39.409.847.613c1.38.614 3.134.982 5.044.982s3.665-.368 5.044-.982c.457-.204.686-.306.847-.613c.162-.306.118-.54.032-1.005A6.02 6.02 0 0 0 12 3"></path>
                <path d="M17 5.5c2.989.788 5 2.26 5 3.945C22 11.961 17.523 14 12 14S2 11.96 2 9.445C2 7.76 4.011 6.288 7 5.5M12 18v3m5-4l1 4M7 17l-1 4"></path>
              </g>
            </svg>
          </div>

          <div className="absolute inset-0 rounded-full bg-blue-400/20 animate-ping"></div>
        </button>

        <Drawer
          open={isOpen}
          title="🚀 飞船控制"
          onClose={handleClose}
          width={384}
          zIndex={55}
        >
          <div className="flex mb-3 space-x-1 overflow-x-auto">
            <button
              onClick={() => setActiveTab("stats")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors duration-200 whitespace-nowrap ${activeTab === "stats" ? "bg-blue-500/30 text-blue-300 border border-blue-500/50" : "text-gray-400 hover:text-white hover:bg-plate-2"}`}
            >
              📊 统计
            </button>
            <button
              onClick={() => setActiveTab("ship")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors duration-200 whitespace-nowrap ${activeTab === "ship" ? "bg-green-500/30 text-green-300 border border-green-500/50" : "text-gray-400 hover:text-white hover:bg-plate-2"}`}
            >
              🚀 飞船
            </button>
            <button
              onClick={() => setActiveTab("saved")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors duration-200 whitespace-nowrap ${activeTab === "saved" ? "bg-purple-500/30 text-purple-300 border border-purple-500/50" : "text-gray-400 hover:text-white hover:bg-plate-2"}`}
            >
              📍 已保存 ({locationStats?.total || 0})
            </button>
          </div>

          {activeTab === "stats" && <StatsTab {...panel} />}

          {activeTab === "ship" && <ShipTab {...panel} />}

          {activeTab === "saved" && <SavedTab {...panel} />}
        </Drawer>

        {showCollectionPopup && (
          <div className={`fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 ${isCollectionClosing ? "animate-fadeOut" : "animate-fadeIn"}`}>
            <div ref={collectionModalRef} className={`bg-black/90 rounded-none border border-purple-400/30 shadow-2xl w-full max-w-md ${isCollectionClosing ? "animate-slideDown" : "animate-slideUp"}`}>
              <div className="bg-purple-600/20 hover:bg-blue-600/20 px-4 py-3 border-b border-white/10 rounded-t-2xl">
                <div className="flex items-center justify-between">
                  <h3 className="text-white font-bold text-lg flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width={24} height={24} viewBox="0 0 24 24">
                      <path fill="currentColor" fillRule="evenodd" d="M3.5 8V6.5l4-3l3 1.5l4-3l6 4.5V8zm-.476 8.124L1.184 9.5h21.632l-1.84 6.624a4.5 4.5 0 0 0-7.364 4.376h-3.224q.111-.483.112-1a4.5 4.5 0 0 0-7.476-3.376M6 22.5a3 3 0 1 0 0-6a3 3 0 0 0 0 6m12 0a3 3 0 1 0 0-6a3 3 0 0 0 0 6" clipRule="evenodd"></path>
                    </svg>
                    批量收集
                  </h3>
                  <button onClick={closeCollectionPopup} className="text-gray-400 hover:text-white transition-colors duration-200">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="p-4">
                <div className="text-sm text-gray-300 mb-4">一次性从所有保存的采矿位置收集资源。</div>

                <div className="bg-white/[0.04] rounded-lg p-3 mb-4">
                  <div className="text-xs text-gray-400 mb-2">可收集：</div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="text-center">
                      <div className={`font-bold flex items-center justify-center gap-1 ${passiveGeneration.antimatter > 0 ? "text-purple-300" : "text-gray-500"}`}>
                        <AntimatterIcon size={12} color="currentColor" />+{Math.round(passiveGeneration.antimatter)}
                      </div>
                      <div className="text-gray-500">反物质</div>
                    </div>
                    <div className="text-center">
                      <div className={`font-bold flex items-center justify-center gap-1 ${passiveGeneration.element115 > 0 ? "text-cyan-300" : "text-gray-500"}`}>
                        <Element115Icon size={12} color="currentColor" />+{Math.round(passiveGeneration.element115)}
                      </div>
                      <div className="text-gray-500">115号元素</div>
                    </div>
                    <div className="text-center">
                      <div className={`font-bold flex items-center justify-center gap-1 ${passiveGeneration.deuterium > 0 ? "text-orange-300" : "text-gray-500"}`}>
                        <DeuteriumIcon size={12} color="currentColor" />+{Math.round(passiveGeneration.deuterium)}
                      </div>
                      <div className="text-gray-500">氘</div>
                    </div>
                  </div>
                </div>

                <div className="text-xs text-gray-500 mb-4">
                  🌟 来源: {passiveGeneration.sources.planets} 行星, {passiveGeneration.sources.systems} 系统
                </div>

                <div className="flex gap-3">
                  <button onClick={closeCollectionPopup} className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-gray-700/50 text-gray-300 hover:bg-gray-700/70 border border-gray-600/50 transition-all duration-200">
                    取消
                  </button>
                  <button
                    onClick={() => {
                      SpaceshipResourceManager.addResources({
                        antimatter: Math.round(passiveGeneration.antimatter),
                        element115: Math.round(passiveGeneration.element115),
                        deuterium: Math.round(passiveGeneration.deuterium),
                      });

                      SpaceshipResourceManager.showPassiveGenerationNotification(passiveGeneration);

                      const data = JSON.parse(getItem("_atlasSpaceShip") || "{}");
                      if (!data.t) data.t = {};
                      data.t.lp = Date.now();
                      setItem("_atlasSpaceShip", JSON.stringify(data));

                      setSpaceshipResources(SpaceshipResourceManager.getResources());
                      const passiveInfo = SpaceshipResourceManager.getAccumulatedResourcesWithLimit();
                      setPassiveGeneration(passiveInfo);

                      ResourceEventManager.emit("resources_updated");

                      closeCollectionPopup();
                    }}
                    className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-purple-600/30 hover:bg-purple-600/40 text-purple-300 border border-purple-500/50 hover:border-purple-400/70 transition-all duration-200"
                  >
                    🚀 全部收集
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default SpaceshipPanel;

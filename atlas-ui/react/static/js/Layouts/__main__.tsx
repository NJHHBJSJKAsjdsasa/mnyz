// atlas-ui/react/static/js/Layouts/__main__.tsx

import React, { useState, useEffect, useRef, lazy, Suspense } from "react";
import Header from "../Components/Header.tsx";
import CoordinateSelector from "../Components/CoordinateSelector.tsx";
import VersionFooter from "../Components/VersionFooter.tsx";
import ServerAuthPanel from "../Components/ServerAuthPanel.tsx";

const CoordinateViewer3D = lazy(() => import("../Components/CoordinateViewer3D.tsx"));
const SpaceshipPanel = lazy(() => import("../Components/SpaceshipPanel.tsx"));
const FuelBars = lazy(() => import("../Components/FuelBars.tsx"));
const StarfieldWarpReveal = lazy(() => import("../Components/StarfieldWarpReveal.tsx"));
const MultiverseBanner = lazy(() => import("../Components/MultiverseBanner.jsx"));
const TaskPanel = lazy(() => import("../Components/TaskPanel.tsx"));
import { UnifiedSpaceshipStorage } from "../Utils/UnifiedSpaceshipStorage.tsx";
import { SpaceshipTravelManager } from "../Utils/SpaceshipTravelCosts.tsx";
import { SpaceshipResourceManager } from "../Utils/SpaceshipResources.tsx";
import { UniverseDetection } from "../Utils/UniverseDetection.tsx";
import { SeedSanitizer } from "../Utils/SeedSanitizer.tsx";
import { ServerBridge } from "../Utils/ServerBridge.tsx";
import NodeIdIcon from "../Icons/NodeIdIcon.tsx";
import SeedIcon from "../Icons/SeedIcon.tsx";
import BitBangIcon from "../Icons/BitBangIcon.tsx";
import UniverseAgeIcon from "../Icons/UniverseAgeIcon.tsx";
import DevelopmentIcon from "../Icons/DevelopmentIcon.tsx";

interface MainLayoutProps {
  error: string | null;
  version: string;
}

interface Coordinates {
  x: number;
  y: number;
  z: number;
}

const MainLayout: React.FC<MainLayoutProps> = ({ error, version }) => {
  const [currentCoordinates, setCurrentCoordinates] = useState<Coordinates>({
    x: 1000000,
    y: 1000000,
    z: 1000000,
  });
  const [travelCost, setTravelCost] = useState<{ antimatter: number; element115: number; deuterium: number } | null>(null);
  const [canAfford, setCanAfford] = useState(false);
  const [showWarpReveal, setShowWarpReveal] = useState(false);
  const [show3DViewer, setShow3DViewer] = useState(false);
  const [showNavigationText, setShowNavigationText] = useState(true);
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isUser3DInteracting = useRef<boolean>(false);
  const isRandomLocationActive = useRef<boolean>(false);
  const [seedData, setSeedData] = useState<{
    primordial_seed: string;
    sha256_seed: string;
    decimal_seed: string;
    cosmic_origin_time?: number;
    cosmic_origin_datetime?: string;
  } | null>(null);
  const [isRemoteUniverse, setIsRemoteUniverse] = useState(false);
  const [universeConfig, setUniverseConfig] = useState<{
    remote: boolean;
    seed_name: string;
    node_id: string;
    seed_str: string;
    cosmic_origin_time: number;
  } | null>(null);
  const [universeAge, setUniverseAge] = useState<string>("");
  const [universeDevelopment, setUniverseDevelopment] = useState<string>("");

  const MAX_UNIVERSE_AGE_SECONDS = 1_900_000 * 365.25 * 24 * 60 * 60; // 1.9M years in seconds

  useEffect(() => {
    UnifiedSpaceshipStorage.migrateFromOldStorage();
    ServerBridge.start();

    const checkUniverseType = () => {
      const remote = UniverseDetection.isRemoteUniverse();
      setIsRemoteUniverse(remote);

      const configElement = document.getElementById("data-universe-config");
      if (configElement) {
        try {
          const config = JSON.parse(configElement.textContent || "{}");
          setUniverseConfig(config);
        } catch (error) {
          console.error("Error parsing universe config:", error);
        }
      }
    };

    checkUniverseType();
    const interval = setInterval(checkUniverseType, 1000);

    const hasSeenIntro = localStorage.getItem("atlasIntroSeen");
    if (!hasSeenIntro) {
      fetch("/api/universe/config")
        .then((response) => response.json())
        .then((data) => {
          if (data.success) {
            setSeedData({
              primordial_seed: data.seed_str,
              sha256_seed: data.seed_hash,
              decimal_seed: data.seed_decimal,
              cosmic_origin_time: data.cosmic_origin_time,
              cosmic_origin_datetime: data.cosmic_origin_datetime,
            });
            setShowWarpReveal(true);
          }
        })
        .catch((error) => {
          console.error("Error fetching universe config:", error);
        });

      localStorage.setItem("atlasIntroSeen", "true");
    }

    return () => clearInterval(interval);
  }, []);

  const handleWarpRevealComplete = React.useCallback(() => {
    setShowWarpReveal(false);
  }, []);

  const handle3DUserInteraction = React.useCallback((isInteracting: boolean) => {
    isUser3DInteracting.current = isInteracting;

    if (isInteracting) {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    } else {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
      hideTimerRef.current = setTimeout(() => {
        if (!isRandomLocationActive.current) {
          setShow3DViewer(false);
          setShowNavigationText(true);
        }
        hideTimerRef.current = null;
      }, 4000);
    }
  }, []);

  const handleCoordinateChange = React.useCallback((coordinates: Coordinates, isUserInteraction: boolean = false) => {
    setCurrentCoordinates(coordinates);

    if (isUserInteraction) {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }

      setShow3DViewer(true);
      setShowNavigationText(false);

      if (!isUser3DInteracting.current && !isRandomLocationActive.current) {
        hideTimerRef.current = setTimeout(() => {
          setShow3DViewer(false);
          setShowNavigationText(true);
          hideTimerRef.current = null;
        }, 3000);
      }
    }
  }, []);

  useEffect(() => {
    (window as any).setRandomLocationActive = (active: boolean) => {
      isRandomLocationActive.current = active;
      if (active) {
        if (hideTimerRef.current) {
          clearTimeout(hideTimerRef.current);
          hideTimerRef.current = null;
        }
        setShow3DViewer(true);
        setShowNavigationText(false);
      }
    };

    return () => {
      if ((window as any).setRandomLocationActive) {
        delete (window as any).setRandomLocationActive;
      }
    };
  }, []);

  const calculateTravelCost = React.useCallback((coordinates: Coordinates) => {
    const distance = Math.floor(Math.sqrt(Math.pow(coordinates.x - 1000000, 2) + Math.pow(coordinates.y - 1000000, 2) + Math.pow(coordinates.z - 1000000, 2)));

    const cost = SpaceshipTravelManager.getTravelCost("galaxy", distance);
    const efficiency = SpaceshipResourceManager.getUpgrade().efficiency;

    // Efficiency is applied exactly once, in the same place executeTravel does it.
    const actualConsumption = {
      antimatter: Math.max(1, Math.floor(cost.antimatter / efficiency)),
      element115: Math.max(1, Math.floor(cost.element115 / efficiency)),
      deuterium: Math.max(1, Math.floor(cost.deuterium / efficiency)),
    };

    setTravelCost(actualConsumption);

    const resources = SpaceshipResourceManager.getResources();
    const affordable = resources.antimatter >= actualConsumption.antimatter && resources.element115 >= actualConsumption.element115 && resources.deuterium >= actualConsumption.deuterium;
    setCanAfford(affordable);
  }, []);

  useEffect(() => {
    calculateTravelCost(currentCoordinates);
  }, [currentCoordinates.x, currentCoordinates.y, currentCoordinates.z, calculateTravelCost]);

  useEffect(() => {
    const updateTravelCost = () => {
      calculateTravelCost(currentCoordinates);
    };

    const interval = setInterval(updateTravelCost, 5000);

    return () => clearInterval(interval);
  }, [currentCoordinates.x, currentCoordinates.y, currentCoordinates.z, calculateTravelCost]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  const formatResource = React.useCallback((value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(2)}M`;
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}k`;
    }
    return value.toString();
  }, []);

  const formatCosmicTime = React.useCallback((timestamp: number): string => {
    if (!timestamp) return "Unknown Origin";
    const date = new Date(timestamp * 1000);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }, []);

  const calculateUniverseAge = React.useCallback((cosmicOriginTime: number): { age: string; development: string } => {
    const now = Math.floor(Date.now() / 1000);
    const ageInSeconds = now - cosmicOriginTime;

    if (ageInSeconds < 0) return { age: "Not yet born", development: "0%" };

    const years = Math.floor(ageInSeconds / (365.25 * 24 * 60 * 60));
    const days = Math.floor((ageInSeconds % (365.25 * 24 * 60 * 60)) / (24 * 60 * 60));
    const hours = Math.floor((ageInSeconds % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((ageInSeconds % (60 * 60)) / 60);
    const seconds = Math.floor(ageInSeconds % 60);

    const parts: string[] = [];
    if (years > 0) parts.push(`${years}Y`);
    if (days > 0) parts.push(`${days}D`);
    if (hours > 0) parts.push(`${hours}H`);
    if (minutes > 0) parts.push(`${minutes}M`);
    parts.push(`${seconds}S`);

    const percentage = (ageInSeconds / MAX_UNIVERSE_AGE_SECONDS) * 100;
    const development = percentage.toFixed(15).replace(/0+$/, "").replace(/\.$/, "") + "%";

    return { age: parts.join(" "), development };
  }, []);

  useEffect(() => {
    if (!universeConfig?.cosmic_origin_time) return;

    const updateAge = () => {
      const { age, development } = calculateUniverseAge(universeConfig.cosmic_origin_time);
      setUniverseAge(age);
      setUniverseDevelopment(development);
    };

    updateAge();
    const interval = setInterval(updateAge, 1000);

    return () => clearInterval(interval);
  }, [universeConfig?.cosmic_origin_time, calculateUniverseAge]);

  const handleSubmit = React.useCallback(() => {
    const distance = Math.floor(Math.sqrt(Math.pow(currentCoordinates.x - 1000000, 2) + Math.pow(currentCoordinates.y - 1000000, 2) + Math.pow(currentCoordinates.z - 1000000, 2)));

    // One call, one charge: "partial" still departs, "emergency" does not.
    if (SpaceshipTravelManager.executeTravel("galaxy", distance) === "emergency") return;

    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/navigate";

    Object.entries(currentCoordinates).forEach(([key, value]) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = value.toString();
      form.appendChild(input);
    });

    document.body.appendChild(form);
    form.submit();
  }, [currentCoordinates]);

  return (
    <>
      <Suspense fallback={null}>
        {showWarpReveal && <StarfieldWarpReveal seedData={seedData} onComplete={handleWarpRevealComplete} />}
        <MultiverseBanner />

        <div className="w-full min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white flex flex-col">
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.1'%3E%3Ccircle cx='30' cy='30' r='1'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }}
          ></div>

          <FuelBars />

          <div className="relative z-10 pt-1 flex-1 flex flex-col">
            <Header />

            <div className="w-full px-2 sm:px-4 lg:px-6 py-4 sm:py-8 relative flex-1">
              <div className="text-center mb-12 relative min-h-[200px] flex items-center justify-center">
                <div className={`absolute inset-0 flex flex-col items-center justify-center transition-all duration-700 ease-in-out transform ${showNavigationText ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-2"}`} style={{ pointerEvents: showNavigationText ? "auto" : "none" }}>
                  <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-4">{isRemoteUniverse ? "阿特拉斯多元宇宙协议" : "阿特拉斯导航系统"}</h1>
                  {isRemoteUniverse && universeConfig ? (
                    <div className="space-y-3">
                      <div className="w-full px-4">
                        {/* Desktop: una línea */}
                        <div className="hidden sm:flex items-center justify-center gap-2">
                          <NodeIdIcon className="w-5 h-5 text-purple-400 flex-shrink-0" />
                          <span className="text-lg sm:text-xl text-purple-200">探索中</span>
                          <span className="text-lg sm:text-xl text-purple-300 font-mono truncate">{universeConfig.node_id}</span>
                        </div>

                        {/* Mobile: dos líneas */}
                        <div className="flex sm:hidden flex-col items-center justify-center gap-1">
                          <div className="flex items-center gap-2">
                            <NodeIdIcon className="w-5 h-5 text-purple-400 flex-shrink-0" />
                            <span className="text-lg text-purple-200">探索中</span>
                          </div>
                          <div className="text-sm text-purple-300 font-mono text-center w-full" style={{ wordBreak: "break-all", overflowWrap: "anywhere" }}>
                            {universeConfig.node_id}
                          </div>
                        </div>
                      </div>
                      <div className="text-sm text-gray-400 space-y-1 max-w-full px-4">
                        <div className="flex items-center justify-center gap-2 flex-wrap text-xs sm:text-sm">
                          <SeedIcon className="w-4 h-4 text-blue-400 flex-shrink-0" />
                          <span className="text-gray-400">远程种子:</span>
                          <span className="text-blue-400 font-mono truncate max-w-xs">{SeedSanitizer.sanitizeForDisplay(universeConfig.seed_str)}</span>
                        </div>
                        <div className="flex items-center justify-center gap-2 flex-wrap text-xs sm:text-sm">
                          <BitBangIcon className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                          <span className="text-gray-400">远程比特大爆炸:</span>
                          <span className="text-cyan-400 font-mono">{formatCosmicTime(universeConfig.cosmic_origin_time)}</span>
                        </div>
                        {universeAge && (
                          <div className="flex items-center justify-center gap-2 flex-wrap text-xs sm:text-sm">
                            <UniverseAgeIcon className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                            <span className="text-gray-400">比特大爆炸至今:</span>
                            <span className="text-emerald-400 font-mono">{universeAge}</span>
                          </div>
                        )}
                        {universeDevelopment && (
                          <div className="flex items-center justify-center gap-2 flex-wrap text-xs sm:text-sm">
                            <DevelopmentIcon className="w-4 h-4 text-amber-400 flex-shrink-0" />
                            <span className="text-gray-400">宇宙发展:</span>
                            <span className="text-amber-400 font-mono">{universeDevelopment}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-lg sm:text-xl text-gray-300 max-w-4xl mx-auto px-4">穿越无限的星系、太阳系和行星。输入坐标开始你的宇宙之旅。</p>
                      {universeConfig && (
                        <div className="text-sm text-gray-400 space-y-1 max-w-full px-4">
                          <div className="flex items-center justify-center gap-2 flex-wrap text-xs sm:text-sm">
                            <SeedIcon className="w-4 h-4 text-blue-400 flex-shrink-0" />
                            <span className="text-gray-400">本地种子:</span>
                            <span className="text-blue-400 font-mono truncate max-w-xs">{SeedSanitizer.sanitizeForDisplay(universeConfig.seed_str)}</span>
                          </div>
                          <div className="flex items-center justify-center gap-2 flex-wrap text-xs sm:text-sm">
                            <BitBangIcon className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                            <span className="text-gray-400">本地比特大爆炸:</span>
                            <span className="text-cyan-400 font-mono">{formatCosmicTime(universeConfig.cosmic_origin_time)}</span>
                          </div>
                          {universeAge && (
                            <div className="flex items-center justify-center gap-2 flex-wrap text-xs sm:text-sm">
                              <UniverseAgeIcon className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                              <span className="text-gray-400">比特大爆炸至今:</span>
                              <span className="text-emerald-400 font-mono">{universeAge}</span>
                            </div>
                          )}
                          {universeDevelopment && (
                            <div className="flex items-center justify-center gap-2 flex-wrap text-xs sm:text-sm">
                              <DevelopmentIcon className="w-4 h-4 text-amber-400 flex-shrink-0" />
                              <span className="text-gray-400">宇宙发展:</span>
                              <span className="text-amber-400 font-mono">{universeDevelopment}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className={`absolute inset-0 flex items-center justify-center transition-all duration-700 ease-in-out transform ${show3DViewer ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 -translate-y-2"}`} style={{ pointerEvents: show3DViewer ? "auto" : "none" }}>
                  <div className="w-96 h-96">
                    <CoordinateViewer3D coordinates={currentCoordinates} className="w-full h-full" onUserInteraction={handle3DUserInteraction} isVisible={show3DViewer} />
                  </div>
                </div>
              </div>

              {error && (
                <div className="mb-8 bg-red-500/20 border border-red-500 rounded-lg p-4 text-red-200 text-center">
                  <span className="font-semibold">导航错误:</span> {error}
                </div>
              )}

              <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 mb-8 shadow-2xl overflow-hidden">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSubmit();
                  }}
                  className="w-full"
                >
                  <div className="p-3 sm:p-4 lg:p-6">
                    <CoordinateSelector onCoordinateChange={handleCoordinateChange} travelCost={travelCost} canAfford={canAfford} formatResource={formatResource} efficiency={SpaceshipTravelManager.getTravelEfficiency()} />
                  </div>
                </form>
              </div>
            </div>

            <VersionFooter version={version} showBadge />
          </div>

          <ServerAuthPanel />
          <SpaceshipPanel />
          <TaskPanel />
        </div>
      </Suspense>
    </>
  );
};

export default MainLayout;

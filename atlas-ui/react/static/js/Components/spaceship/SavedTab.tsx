// Components/spaceship/SavedTab.tsx — extracted from `SpaceshipPanel.tsx` (2026-10-29).
//
// Markup moved verbatim; only the prop list is new. `Pick<PanelBag, ...>` takes the
// types from the hook instead of redeclaring them, and the parent passes
// `{...panel}` — a spread may carry extra properties, so the tab receives exactly
// what it reads and nothing has to be threaded by hand.

import React from "react";
import AntimatterIcon from "../../Icons/AntimatterIcon.tsx";
import DeuteriumIcon from "../../Icons/DeuteriumIcon.tsx";
import Element115Icon from "../../Icons/Element115Icon.tsx";
import ProgressBar from "../ProgressBar.tsx";
import { DailyChallengesManager } from "../../Utils/DailyChallenges.tsx";
import { DataExportImport } from "../../Utils/DataExportImport.tsx";
import { ServerApi } from "../../Utils/ServerApi.tsx";
import { SpaceshipResourceManager, type TravelCost } from "../../Utils/SpaceshipResources.tsx";
import { UnifiedSpaceshipStorage } from "../../Utils/UnifiedSpaceshipStorage.tsx";
import type { PanelBag } from "./useSpaceshipPanel.ts";

export type SavedTabProps = Pick<PanelBag, "baseGeneration" | "formatLocationName" | "handleRemoveLocation" | "isRemoteUniverse" | "passiveGeneration" | "savedLocations" | "setShowCollectionPopup">;

export const SavedTab: React.FC<SavedTabProps> = (props) => {
  const { baseGeneration, formatLocationName, handleRemoveLocation, isRemoteUniverse, passiveGeneration, savedLocations, setShowCollectionPopup } = props;
  return (
                <div className="space-y-2">
                  <div className="bg-purple-500/20 hover:bg-blue-500/20 rounded-lg p-2 border border-purple-500/30">
                    <h4 className="text-white font-semibold text-xs flex items-center gap-1 mb-1">
                      <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} viewBox="0 0 24 24">
                        <path fill="currentColor" fillRule="evenodd" d="M3.5 8V6.5l4-3l3 1.5l4-3l6 4.5V8zm-.476 8.124L1.184 9.5h21.632l-1.84 6.624a4.5 4.5 0 0 0-7.364 4.376h-3.224q.111-.483.112-1a4.5 4.5 0 0 0-7.476-3.376M6 22.5a3 3 0 1 0 0-6a3 3 0 0 0 0 6m12 0a3 3 0 1 0 0-6a3 3 0 0 0 0 6" clipRule="evenodd"></path>
                      </svg>
                      采矿操作
                    </h4>

                    {passiveGeneration.sources.planets === 0 && passiveGeneration.sources.systems === 0 ? (
                      <div className="text-[10px] text-gray-400">💡 保存行星和系统以启用采矿操作</div>
                    ) : (
                      <div>
                        <div className="flex items-center justify-between text-[10px] mb-1">
                          <span className="text-purple-300">每小时生成:</span>
                          <div className="flex gap-2">
                            <span className="text-purple-300 flex items-center gap-0.5">
                              <AntimatterIcon size={8} color="currentColor" />+{Math.round(baseGeneration.antimatter * 60)} AM
                            </span>
                            <span className="text-cyan-300 flex items-center gap-0.5">
                              <Element115Icon size={8} color="currentColor" />+{Math.round(baseGeneration.element115 * 60)} E115
                            </span>
                            <span className="text-orange-300 flex items-center gap-0.5">
                              <DeuteriumIcon size={8} color="currentColor" />+{Math.round(baseGeneration.deuterium * 60)} D
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[10px] mb-2">
                          <span className="text-gray-400">准备收集:</span>
                          <div className="flex gap-2">
                            <span className="text-purple-300 flex items-center gap-0.5">
                              <AntimatterIcon size={8} color="currentColor" />+{Math.round(passiveGeneration.antimatter)} AM
                            </span>
                            <span className="text-cyan-300 flex items-center gap-0.5">
                              <Element115Icon size={8} color="currentColor" />+{Math.round(passiveGeneration.element115)} E115
                            </span>
                            <span className="text-orange-300 flex items-center gap-0.5">
                              <DeuteriumIcon size={8} color="currentColor" />+{Math.round(passiveGeneration.deuterium)} D
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            setShowCollectionPopup(true);
                          }}
                          disabled={passiveGeneration.antimatter + passiveGeneration.element115 + passiveGeneration.deuterium === 0}
                          className={`w-full px-2 py-1.5 rounded text-[10px] font-medium transition-all duration-200 ${passiveGeneration.antimatter + passiveGeneration.element115 + passiveGeneration.deuterium > 0 ? "bg-purple-600/30 hover:bg-purple-600/40 text-purple-300 border border-purple-500/50 hover:border-purple-400/70 cursor-pointer" : "bg-gray-700/30 text-gray-500 border border-gray-600/30 cursor-not-allowed"}`}
                        >
                          🚀 从 {passiveGeneration.sources.planets}🪐 {passiveGeneration.sources.systems}⭐ 收集
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    {savedLocations.length === 0 ? (
                      <div className="text-center py-4">
                        <div className="text-gray-400 text-xs mb-1">没有保存的位置</div>
                        <div className="text-gray-500 text-[10px]">使用 📍 按钮保存位置</div>
                      </div>
                    ) : (
                      savedLocations.map((location) => {
                        const getLocationIdFromUrl = (url: string, type: string) => {
                          try {
                            const parts = url.split("/stargate/")[1];
                            if (!parts) return "";

                            const decoded = atob(parts.replace(/-/g, "+").replace(/_/g, "/"));
                            const params = new URLSearchParams(decoded);
                            const coords = params.get("coordinates");
                            const system = params.get("system");
                            const planet = params.get("planet");

                            if (!coords) return "";

                            if (type === "galaxy") {
                              return `galaxy_${coords}`;
                            } else if (type === "system" && system) {
                              return `system_${coords}_${system}`;
                            } else if (type === "planet" && system && planet) {
                              return `planet_${coords}_${system}_${planet}`;
                            }
                            return "";
                          } catch (e) {
                            return "";
                          }
                        };

                        const locationId = getLocationIdFromUrl(location.stargateUrl, location.type);
                        const canCollect = locationId ? UnifiedSpaceshipStorage.canCollectFromLocation(locationId) : true;
                        const timeRemaining = locationId ? UnifiedSpaceshipStorage.getTimeUntilNextCollection(locationId) : 0;

                        const cooldowns = {
                          planet: 15 * 60 * 1000,
                          system: 45 * 60 * 1000,
                          galaxy: 8 * 60 * 60 * 1000,
                        };

                        const maxCooldown = cooldowns[location.type] || cooldowns.planet;
                        const timeRemainingMs = timeRemaining * 60 * 60 * 1000;
                        const progress = maxCooldown - timeRemainingMs;
                        const progressPercent = Math.max(0, Math.min(100, (progress / maxCooldown) * 100));

                        const formatTimeRemaining = (hours: number) => {
                          if (hours <= 0) return "就绪";
                          const totalMinutes = Math.floor(hours * 60);
                          const h = Math.floor(totalMinutes / 60);
                          const m = totalMinutes % 60;
                          if (h > 0) {
                            return `${h}小时 ${m}分钟`;
                          }
                          return `${m}分钟`;
                        };

                        const stargateIndex = location.stargateUrl.indexOf("/stargate/");
                        const cleanUrl = stargateIndex !== -1 ? location.stargateUrl.substring(stargateIndex) : location.stargateUrl;
                        const fullUrl = `${window.location.origin}${cleanUrl}`;

                        return isRemoteUniverse ? (
                          <div key={location.id} className="block bg-red-500/10 rounded p-1.5 border border-red-500/30 opacity-60 cursor-not-allowed" title="Cannot travel to saved locations from remote universes - return to local universe first">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center space-x-1">
                                  <div className="text-[8px]">
                                    {location.type === "galaxy" && "🌌"}
                                    {location.type === "system" && "⭐"}
                                    {location.type === "planet" && "🪐"}
                                  </div>
                                  <div className="text-red-300 text-[10px] font-medium truncate">{formatLocationName(location.name)}</div>
                                  <div className="text-red-400 text-[8px] shrink-0">REMOTE</div>
                                </div>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleRemoveLocation(e, location.id);
                                }}
                                className="text-gray-400 hover:text-red-400 transition-all duration-200 ml-1 p-0.5"
                                title="Remove location"
                              >
                                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                            <div className="text-[8px] text-red-400 flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L5.636 5.636" />
                              </svg>
                              Navigation disabled in remote universe
                            </div>
                          </div>
                        ) : (
                          <a key={location.id} href={fullUrl} className="block bg-white/[0.04] hover:bg-plate-2 rounded p-1.5 border border-white/10 hover:border-white/20 transition-all duration-200 hover:text-blue-300" title={`Navigate to ${formatLocationName(location.name)}`}>
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center space-x-1">
                                  <div className="text-[8px]">
                                    {location.type === "galaxy" && "🌌"}
                                    {location.type === "system" && "⭐"}
                                    {location.type === "planet" && "🪐"}
                                  </div>
                                  <div className="text-white text-[10px] font-medium truncate">{formatLocationName(location.name)}</div>
                                  <div className="text-gray-500 text-[8px] shrink-0">
                                    {(() => {
                                      try {
                                        const date = new Date(location.timestamp);
                                        return isNaN(date.getTime()) ? "N/A" : date.toLocaleDateString();
                                      } catch (e) {
                                        return "N/A";
                                      }
                                    })()}
                                  </div>
                                </div>
                              </div>

                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleRemoveLocation(e, location.id);
                                }}
                                className="text-gray-400 hover:text-red-400 transition-all duration-200 ml-1 p-0.5"
                                title="Remove location"
                              >
                                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>

                            {!canCollect && timeRemaining > 0 && (
                              <div className="mt-1">
                                <div className="flex items-center justify-between mb-0.5">
                                  <span className="text-[8px] text-gray-400">手动采矿冷却</span>
                                  <span className="text-[8px] text-orange-400">{formatTimeRemaining(timeRemaining)}</span>
                                </div>
                                <div className="w-full bg-gray-800/50 rounded-full h-1 overflow-hidden">
                                  <div className="h-full bg-orange-500 hover:bg-yellow-500 rounded-full transition-all duration-300" style={{ width: `${progressPercent}%` }} />
                                </div>
                              </div>
                            )}

                            {canCollect && locationId && (
                              <div className="mt-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-[8px] text-green-400">✓ 准备采矿</span>
                                </div>
                              </div>
                            )}
                          </a>
                        );
                      })
                    )}
                  </div>
                </div>
  );
};

export default SavedTab;

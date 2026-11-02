// Components/spaceship/ShipTab.tsx — extracted from `SpaceshipPanel.tsx` (2026-10-29).
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

export type ShipTabProps = Pick<PanelBag, "serverMode" | "spaceshipResources" | "spaceshipUpgrade" | "upgradeCost" | "upgradeShip">;

export const ShipTab: React.FC<ShipTabProps> = (props) => {
  const { serverMode, spaceshipResources, spaceshipUpgrade, upgradeCost, upgradeShip } = props;
  return (
                <div className="space-y-2">
                  <div>
                    <h4 className="text-white font-semibold mb-2 text-xs flex items-center gap-1">
                      ⚡ 资源
                      <div className="text-[10px] text-gray-400">等级.{spaceshipUpgrade.level}</div>
                    </h4>

                    <div className="space-y-1 mb-2">
                      <div className="bg-white/[0.04] rounded p-1.5 border border-purple-500/20">
                        <div className="flex justify-between text-[10px] mb-0.5">
                          <span className="text-purple-300 flex items-center gap-1">
                            <AntimatterIcon size={12} color="currentColor" />
                            反物质
                          </span>
                          <span className="text-white font-mono">
                            {spaceshipResources.antimatter}/{spaceshipUpgrade.storage}
                          </span>
                        </div>
                        <ProgressBar value={spaceshipResources.antimatter} max={spaceshipUpgrade.storage} label="" color="purple" showPercentage={false} />
                      </div>

                      <div className="bg-white/[0.04] rounded p-1.5 border border-cyan-500/20">
                        <div className="flex justify-between text-[10px] mb-0.5">
                          <span className="text-cyan-300 flex items-center gap-1">
                            <Element115Icon size={12} color="currentColor" />
                            115号元素
                          </span>
                          <span className="text-white font-mono">
                            {spaceshipResources.element115}/{spaceshipUpgrade.storage}
                          </span>
                        </div>
                        <ProgressBar value={spaceshipResources.element115} max={spaceshipUpgrade.storage} label="" color="cyan" showPercentage={false} />
                      </div>

                      <div className="bg-white/[0.04] rounded p-1.5 border border-orange-500/20">
                        <div className="flex justify-between text-[10px] mb-0.5">
                          <span className="text-orange-300 flex items-center gap-1">
                            <DeuteriumIcon size={12} color="currentColor" />
                            氘
                          </span>
                          <span className="text-white font-mono">
                            {spaceshipResources.deuterium}/{spaceshipUpgrade.storage}
                          </span>
                        </div>
                        <ProgressBar value={spaceshipResources.deuterium} max={spaceshipUpgrade.storage} label="" color="orange" showPercentage={false} />
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-white font-semibold mb-2 text-xs">🔧 飞船升级</h4>

                    <div className="grid grid-cols-3 gap-1 text-[10px] mb-2">
                      <div className="bg-white/[0.04] rounded p-1 border border-blue-500/20">
                        <div className="text-gray-400 text-[9px]">效率</div>
                        <div className="text-blue-400 font-bold">{spaceshipUpgrade.efficiency.toFixed(1)}x</div>
                      </div>
                      <div className="bg-white/[0.04] rounded p-1 border border-yellow-500/20">
                        <div className="text-gray-400 text-[9px]">存储</div>
                        <div className="text-yellow-400 font-bold">{spaceshipUpgrade.storage}</div>
                      </div>
                      <div className="bg-white/[0.04] rounded p-1 border border-indigo-500/20">
                        <div className="text-gray-400 text-[9px]">倍率</div>
                        <div className="text-indigo-400 font-bold">{spaceshipUpgrade.multiplier.toFixed(1)}x</div>
                      </div>
                    </div>

                    {spaceshipUpgrade.level < 999 && !SpaceshipResourceManager.canAffordUpgrade() && (
                      <div className="bg-red-500/10 border border-red-500/30 rounded p-1.5 mb-2">
                        <div className="text-[10px] text-red-300 font-semibold mb-0.5">缺少资源：</div>
                        <div className="text-[9px] text-red-200 space-y-0.5">
                          {upgradeCost.antimatter > spaceshipResources.antimatter && (
                            <div className="flex items-center gap-1">
                              • 需要 {upgradeCost.antimatter - spaceshipResources.antimatter} 更多 <AntimatterIcon size={10} color="currentColor" /> 反物质
                            </div>
                          )}
                          {upgradeCost.element115 > spaceshipResources.element115 && (
                            <div className="flex items-center gap-1">
                              • 需要 {upgradeCost.element115 - spaceshipResources.element115} 更多 <Element115Icon size={10} color="currentColor" /> 115号元素
                            </div>
                          )}
                          {upgradeCost.deuterium > spaceshipResources.deuterium && (
                            <div className="flex items-center gap-1">
                              • 需要 {upgradeCost.deuterium - spaceshipResources.deuterium} 更多 <DeuteriumIcon size={10} color="currentColor" /> 氘
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <button
                      onClick={() => void upgradeShip()}
                      disabled={!serverMode && !SpaceshipResourceManager.canAffordUpgrade()}
                      className={`w-full px-2 py-1.5 rounded text-[10px] font-medium transition-all duration-200 ${serverMode || SpaceshipResourceManager.canAffordUpgrade() ? "bg-green-600/30 hover:bg-green-600/40 text-green-300 border border-green-500/50 hover:border-green-400/70 cursor-pointer" : "bg-gray-700/30 text-gray-500 border border-gray-600/30 cursor-not-allowed"}`}
                    >
                      {spaceshipUpgrade.level >= 999 ? (
                        <div className="text-yellow-400">🌟 已达等级上限 999</div>
                      ) : (
                        <div>
                          <div className="font-bold">升级到等级 {spaceshipUpgrade.level + 1}</div>
                          <div className="opacity-80 flex gap-2 justify-center mt-0.5">
                            <span className="text-purple-300 flex items-center gap-0.5">
                              <AntimatterIcon size={10} color="currentColor" />
                              {upgradeCost.antimatter}AM
                            </span>
                            <span className="text-cyan-300 flex items-center gap-0.5">
                              <Element115Icon size={10} color="currentColor" />
                              {upgradeCost.element115}E115
                            </span>
                            <span className="text-orange-300 flex items-center gap-0.5">
                              <DeuteriumIcon size={10} color="currentColor" />
                              {upgradeCost.deuterium}D
                            </span>
                          </div>
                        </div>
                      )}
                    </button>
                  </div>
                </div>
  );
};

export default ShipTab;

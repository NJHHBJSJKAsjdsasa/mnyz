// Components/spaceship/StatsTab.tsx — extracted from `SpaceshipPanel.tsx` (2026-10-29).
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

export type StatsTabProps = Pick<PanelBag, "dailyChallenges" | "fileInputRef" | "formatBytes" | "handleExport" | "handleImport" | "handleServerImport" | "importError" | "importSuccess" | "locationStats" | "stats">;

export const StatsTab: React.FC<StatsTabProps> = (props) => {
  const { dailyChallenges, fileInputRef, formatBytes, handleExport, handleImport, handleServerImport, importError, importSuccess, locationStats, stats } = props;
  return (
                <div className="space-y-2">
                  <div>
                    <h4 className="text-white font-semibold mb-2 text-xs">🌟 探索里程碑</h4>

                    <div className="bg-white/[0.04] rounded p-2 border border-indigo-500/20">
                      {dailyChallenges && (
                        <>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] text-gray-400">累计进度</span>
                            <span className="text-[9px] text-indigo-400">
                              Day {dailyChallenges.dayNumber} • x{DailyChallengesManager.getDayInfo().multiplier}
                            </span>
                          </div>

                          <div className="space-y-1.5 mb-2">
                            {dailyChallenges.challenges.map((challenge) => {
                              const colors = {
                                galaxies: "indigo" as const,
                                systems: "blue" as const,
                                planets: "purple" as const,
                              };

                              const labels = {
                                galaxies: "星系",
                                systems: "系统",
                                planets: "行星",
                              };

                              return (
                                <div key={challenge.type} className="relative">
                                  <div className="text-[10px] text-gray-400 mb-0.5">{labels[challenge.type]}</div>
                                  <ProgressBar value={challenge.current} max={challenge.target} label={`${challenge.current}/${challenge.target}`} color={colors[challenge.type]} showPercentage={true} />
                                  {challenge.completed && (
                                    <div className="absolute -right-2 top-1.5">
                                      <svg xmlns="http://www.w3.org/2000/svg" width={12} height={12} viewBox="0 0 128 128">
                                        <path fill="#40c0e7" stroke="#40c0e7" strokeMiterlimit={10} strokeWidth={6} d="M48.3 103.45L12.65 67.99a2.2 2.2 0 0 1 0-3.12l9-9.01c.86-.86 2.25-.86 3.11 0l23.47 23.33c.86.86 2.26.85 3.12-.01l51.86-52.36c.86-.87 2.26-.87 3.13-.01l9.01 9.01c.86.86.86 2.25.01 3.11l-56.5 57.01l.01.01l-7.45 7.49c-.86.86-2.26.86-3.12.01z" />
                                      </svg>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          <p className="text-[9px] text-gray-500 mb-2">里程碑不发奖励，每日奖励在任务页</p>

                          <div className="grid grid-cols-2 gap-1 text-[10px]">
                            <div className="bg-black/30 rounded p-1.5 border border-indigo-500/30">
                              <div className="text-gray-400 text-[9px]">已完成</div>
                              <div className="text-indigo-400 font-bold">
                                {dailyChallenges.challenges.filter((c) => c.completed).length}/{dailyChallenges.challenges.length}
                              </div>
                            </div>
                            <div className="bg-black/30 rounded p-1.5 border border-green-500/30">
                              <div className="text-gray-400 text-[9px]">阿特拉斯大小</div>
                              <div className="text-green-400 font-bold">{stats ? formatBytes(stats.size) : "0 B"}</div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-white font-semibold mb-2 text-xs">📍 已保存位置</h4>

                    <div className="bg-white/[0.04] rounded p-2 border border-purple-500/20">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] text-gray-400">存储使用</span>
                        <span className="text-[9px] text-purple-400">
                          {locationStats?.total || 0}/{locationStats?.maxAllowed || 50} 槽位
                        </span>
                      </div>

                      <div className="mb-2">
                        <ProgressBar value={locationStats?.total || 0} max={locationStats?.maxAllowed || 50} label={`${locationStats?.total || 0}/${locationStats?.maxAllowed || 50}`} color="purple" showPercentage={true} />
                      </div>

                      <div className="grid grid-cols-3 gap-1 text-[10px]">
                        <div className="bg-black/30 rounded p-1 text-center border border-indigo-500/30">
                          <div className="text-gray-400 text-[9px]">星系</div>
                          <div className="text-indigo-400 font-bold">{locationStats?.galaxies || 0}</div>
                        </div>
                        <div className="bg-black/30 rounded p-1 text-center border border-blue-500/30">
                          <div className="text-gray-400 text-[9px]">系统</div>
                          <div className="text-blue-400 font-bold">{locationStats?.systems || 0}</div>
                        </div>
                        <div className="bg-black/30 rounded p-1 text-center border border-purple-500/30">
                          <div className="text-gray-400 text-[9px]">行星</div>
                          <div className="text-purple-400 font-bold">{locationStats?.planets || 0}</div>
                        </div>
                      </div>

                      <div className="text-[8px] text-gray-500 mt-2">完成每日任务以保存更多位置</div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-white font-semibold mb-2 text-xs">💾 数据管理</h4>

                    <div className="space-y-2">
                      <div className="bg-white/[0.04] rounded p-2 border border-blue-500/20">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[10px] text-gray-400">导出/导入阿特拉斯数据</span>
                          <span className="text-[9px] text-blue-400">
                            {(() => {
                              const summary = DataExportImport.getDataSummary();
                              return `${summary.totalKeys} keys · ${Math.round(summary.totalSize / 1024)} KB`;
                            })()}
                          </span>
                        </div>

                        <div className="flex gap-2 mt-2">
                          <button onClick={handleExport} className="flex-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 text-[10px] px-2 py-1.5 rounded border border-blue-500/50 transition-colors duration-200 flex items-center justify-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24">
                              <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={1.5}>
                                <path d="M4 12a8 8 0 1 0 16 0"></path>
                                <path strokeLinejoin="round" d="M12 14V4m0 0l3 3m-3-3L9 7"></path>
                              </g>
                            </svg>
                            <span>导出</span>
                          </button>
                          <button onClick={() => fileInputRef.current?.click()} className="flex-1 bg-green-500/20 hover:bg-green-500/30 text-green-300 text-[10px] px-2 py-1.5 rounded border border-green-500/50 transition-colors duration-200 flex items-center justify-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24">
                              <path fill="currentColor" d="M14.47 10.47a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 1 1 1.06-1.06l1.72 1.72V4a.75.75 0 0 1 1.5 0v8.19z"></path>
                              <path fill="currentColor" d="M20.75 12a.75.75 0 0 0-1.5 0a7.25 7.25 0 1 1-14.5 0a.75.75 0 0 0-1.5 0a8.75 8.75 0 1 0 17.5 0"></path>
                            </svg>
                            <span>导入</span>
                          </button>
                          {ServerApi.mode() === "shadow" && (
                            <button onClick={handleServerImport} className="flex-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 text-[10px] px-2 py-1.5 rounded border border-purple-500/50 transition-colors duration-200 flex items-center justify-center gap-1">
                              <span>服务器</span>
                            </button>
                          )}
                        </div>

                        <input ref={fileInputRef} type="file" accept=".atl" onChange={handleImport} className="hidden" />

                        {importError && <div className="mt-2 text-[9px] text-red-400 bg-red-500/10 p-1 rounded">{importError}</div>}

                        {importSuccess && <div className="mt-2 text-[9px] text-green-400 bg-green-500/10 p-1 rounded">数据导入成功！正在重新加载...</div>}

                        <div className="text-[8px] text-gray-500 mt-2">将所有localStorage键保存到.atl文件</div>
                      </div>
                    </div>
                  </div>
                </div>
  );
};

export default StatsTab;

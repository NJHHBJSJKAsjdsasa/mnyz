// atlas-ui/react/static/js/Layouts/__onboarding__.tsx

import React, { useState, useEffect } from "react";
import VersionFooter from "../Components/VersionFooter.tsx";
import UniverseAnimationCanvas from "../Components/UniverseAnimationCanvas.tsx";
import contentFilter from "../Utils/ContentFilter.jsx";

interface OnboardingLayoutProps {
  version: string;
  versionHash: string;
}

interface UniverseOption {
  value: string;
  title: string;
  description: string;
}

type AnimationState = "selection" | "animating" | "processing" | "redirecting";
type AnimationType = "core" | "multiverse" | "processing" | null;

const OnboardingLayout: React.FC<OnboardingLayoutProps> = ({ version }) => {
  const [selectedUniverse, setSelectedUniverse] = useState<string>("");
  const [animationState, setAnimationState] = useState<AnimationState>("selection");
  const [animationType, setAnimationType] = useState<AnimationType>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(false);
  const [customSeed, setCustomSeed] = useState<string>("");
  const [seedError, setSeedError] = useState<string>("");

  const universeOptions: UniverseOption[] = [
    {
      value: "default",
      title: "核心连续体",
      description: "进入原始宇宙，时间和空间在这里汇聚，探索我们作为一个整体所穿越的广阔宇宙。",
    },
    {
      value: "custom",
      title: "设计多元宇宙",
      description: "生成一个拥有自己种子和宇宙起源时间的个人宇宙，一个完全由你的决定塑造的独特创造。",
    },
  ];

  const handleCardClick = (value: string) => {
    setSelectedUniverse(value);
    if (value !== "custom") {
      setCustomSeed("");
      setSeedError("");
    }
  };

  const validateSeed = (seed: string): string => {
    if (seed.length > 20) {
      return "Maximum 20 characters allowed";
    }
    const filterResult = contentFilter.filterSeed(seed);
    if (filterResult.isBlocked) {
      return filterResult.reason || "Invalid content";
    }
    return "";
  };

  const handleSeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value.length <= 20) {
      setCustomSeed(value);
      const error = validateSeed(value);
      setSeedError(error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUniverse || animationState !== "selection" || isInitializing) return;
    if (selectedUniverse === "custom" && seedError) return;

    setIsInitializing(true);
    const formData = new FormData();
    formData.append("universe_type", selectedUniverse);
    if (selectedUniverse === "custom" && customSeed.trim()) {
      formData.append("custom_seed", customSeed.trim());
    }

    try {
      const createResponse = await fetch("/onboarding", {
        method: "POST",
        body: formData,
      });

      if (createResponse.ok) {
        setAnimationState("animating");
        setAnimationType(selectedUniverse === "default" ? "core" : "multiverse");
      } else {
        console.error("Server responded with error:", createResponse.status);
        setIsInitializing(false);
      }
    } catch (error) {
      console.error("Error creating universe:", error);
      setIsInitializing(false);
    }
  };

  const handleAnimationComplete = async () => {
    window.location.href = "/";
  };

  return (
    <>
      {animationType && (
        <div className="fixed inset-0 bg-black z-50">
          <UniverseAnimationCanvas animationType={animationType} onAnimationComplete={handleAnimationComplete} />
        </div>
      )}

      <div className={`w-full min-h-screen atlas-page text-white transition-opacity duration-500 flex flex-col ${animationState !== "selection" ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.1'%3E%3Ccircle cx='30' cy='30' r='1'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        ></div>

        <div className="relative z-10 flex-1 flex flex-col">
          <header className="bg-black/20 border-b border-white/10 px-4 sm:px-6 py-6">
            <div className="w-full flex flex-col items-center space-y-4">
              <img src="/static/atlas-logo.jpg" alt="Atlas Logo" className="h-16 w-16 sm:h-20 sm:w-20 rounded-full border-2 border-cyan-400 shadow-lg animate-pulse" />
              <div className="text-center">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-[0.04em]">阿特拉斯初始化协议</h1>
              <p className="text-sm sm:text-base text-gray-300 mt-2">量子导航系统启动序列</p>
            </div>
            </div>
          </header>

          <div className="w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12 flex-1">
            <div className="max-w-4xl mx-auto">
              <form onSubmit={handleSubmit} className="space-y-8">
                <div className="text-center mb-12">
                <p className="text-lg sm:text-xl md:text-2xl text-gray-300 max-w-3xl mx-auto leading-relaxed">你是要穿越一个共享的宇宙，还是要打造一个属于自己的新宇宙？</p>
              </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 mb-12">
                  {universeOptions.map((option) => (
                    <div
                      key={option.value}
                      onClick={() => handleCardClick(option.value)}
                      className={`
                        relative group cursor-pointer transition-all duration-500 transform hover:scale-105
                        ${selectedUniverse === option.value ? "shadow-2xl shadow-cyan-400/25 scale-105" : "hover:shadow-xl hover:shadow-blue-500/20"}
                      `}
                    >
                      <div className="bg-slate-800/80 rounded-none border border-white/10 p-6 sm:p-8 h-full">
                        <div className="absolute top-4 right-4">
                          <div
                            className={`
                            w-6 h-6 rounded-full border-2 transition-all duration-300
                            ${selectedUniverse === option.value ? "bg-cyan-400 border-cyan-400 shadow-lg shadow-cyan-400/50" : "border-gray-400 group-hover:border-cyan-400"}
                          `}
                          >
                            {selectedUniverse === option.value && (
                              <div className="w-full h-full flex items-center justify-center">
                                <div className="w-2 h-2 bg-white rounded-full animate-ping"></div>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="space-y-4">
                          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-[0.04em]">{option.title}</h2>
                          <p className="text-gray-300 leading-relaxed text-sm sm:text-base">{option.description}</p>

                          {option.value === "custom" && selectedUniverse === "custom" && (
                            <div className="mt-4 space-y-2" onClick={(e) => e.stopPropagation()}>
                              <label className="block text-sm text-gray-400">自定义种子 (可选)</label>
                              <input type="text" value={customSeed} onChange={handleSeedChange} maxLength={20} placeholder="留空则随机" className={`w-full px-4 py-2 bg-slate-900/80 border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 transition-all ${seedError ? "border-red-500 focus:ring-red-500/50" : "border-white/20 focus:ring-cyan-400/50 focus:border-cyan-400"}`} />
                              <div className="flex justify-between text-xs">
                                <span className={seedError ? "text-red-400" : "text-transparent"}>{seedError || "."}</span>
                                <span className="text-gray-500">{customSeed.length}/20</span>
                              </div>
                            </div>
                          )}
                        </div>

                        <div
                          className={`
                          absolute inset-0 rounded-none opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none
                          bg-cyan-500/10 hover:bg-purple-500/10
                          ${selectedUniverse === option.value ? "opacity-20" : ""}
                        `}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="text-center">
                  <button
                    type="submit"
                    disabled={!selectedUniverse || animationState !== "selection" || isInitializing || (selectedUniverse === "custom" && !!seedError)}
                    className={`
                      relative overflow-hidden group px-8 py-4 rounded-none font-semibold text-lg transition-all duration-500 transform
                      ${selectedUniverse && animationState === "selection" && !isInitializing && !(selectedUniverse === "custom" && seedError) ? "bg-cyan-500 hover:bg-purple-500 text-white shadow-2xl shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-110 active:scale-95" : "bg-gray-600 text-gray-400 cursor-not-allowed"}
                    `}
                  >
                    {selectedUniverse && animationState === "selection" && !isInitializing && !(selectedUniverse === "custom" && seedError) && <div className="absolute inset-0 bg-cyan-400 hover:bg-purple-400 opacity-20 group-hover:opacity-40 transition-opacity duration-300"></div>}

                    <span className="relative z-10 flex items-center justify-center space-x-3">
                      {isInitializing ? (
                        <>
                          <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span>初始化中...</span>
                        </>
                      ) : (
                        <span>{selectedUniverse ? "初始化协议" : "选择宇宙类型"}</span>
                      )}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>

          <VersionFooter version={version} />
        </div>
      </div>
    </>
  );
};

export default OnboardingLayout;

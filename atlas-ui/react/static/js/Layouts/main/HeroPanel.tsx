// Layouts/main/HeroPanel.tsx — the top of the main page: navigation copy stacked
// over the 3D coordinate viewer.
//
// Extracted from `__main__.tsx` (2026-10-29) with the markup unchanged. The two
// layers cross-fade on `showNavigationText` / `show3DViewer`, which the parent
// owns (see useViewerStage).

import React, { lazy, Suspense } from "react";
import BitBangIcon from "../../Icons/BitBangIcon.tsx";
import DevelopmentIcon from "../../Icons/DevelopmentIcon.tsx";
import NodeIdIcon from "../../Icons/NodeIdIcon.tsx";
import SeedIcon from "../../Icons/SeedIcon.tsx";
import UniverseAgeIcon from "../../Icons/UniverseAgeIcon.tsx";
import { SeedSanitizer } from "../../Utils/SeedSanitizer.tsx";
import type { UniverseConfig } from "./useUniverseBootstrap.ts";
import type { Coordinates } from "./format.ts";
import { formatCosmicTime } from "./format.ts";

const CoordinateViewer3D = lazy(() => import("../../Components/CoordinateViewer3D.tsx"));

export interface HeroPanelProps {
  isRemoteUniverse: boolean;
  universeConfig: UniverseConfig | null;
  universeAge: string;
  universeDevelopment: string;
  showNavigationText: boolean;
  show3DViewer: boolean;
  coordinates: Coordinates;
  on3DUserInteraction: (isInteracting: boolean) => void;
}

// A meta row is a readout pod, not a paragraph line: hairline frame, dim label,
// lit value. Same shape as the shell's status strip so the landing page and the
// economy console feel like the same product.
const MetaRow: React.FC<{ icon: React.ReactNode; label: string; value: string; tone: string }> = ({
  icon,
  label,
  value,
  tone,
}) => (
  <div
    className="inline-flex items-center gap-2 px-3 py-1 border rounded-sm"
    style={{
      borderColor: "rgba(46, 230, 255, 0.22)",
      background: "linear-gradient(180deg, rgba(46,230,255,.08), rgba(10,18,34,.6))",
      boxShadow: "inset 0 1px 0 rgba(46,230,255,.16)",
    }}
  >
    {icon}
    <span className="text-gray-500 font-mono tracking-[0.16em] uppercase text-[10px]">{label}</span>
    <span className={`${tone} font-mono text-xs`} style={{ textShadow: "0 0 10px currentColor" }}>
      {value}
    </span>
  </div>
);

export const HeroPanel: React.FC<HeroPanelProps> = ({
  isRemoteUniverse,
  universeConfig,
  universeAge,
  universeDevelopment,
  showNavigationText,
  show3DViewer,
  coordinates,
  on3DUserInteraction,
}) => (
  <div className="text-center mb-12 relative min-h-[200px] flex items-center justify-center">
    <div
      className={`absolute inset-0 flex flex-col items-center justify-center transition-all duration-700 ease-in-out transform ${showNavigationText ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-2"}`}
      style={{ pointerEvents: showNavigationText ? "auto" : "none" }}
    >
      {/* Amber Cockpit: kicker + solid heading + hairline rule. The old gradient
          text was the single loudest "old theme" cue on the landing page. */}
      <div
        className="flex items-center justify-center gap-3 mb-4 font-mono text-[10px] tracking-[0.34em] uppercase"
        style={{ color: "var(--atlas-signal)", textShadow: "0 0 12px rgba(46,230,255,.6)" }}
      >
        <span style={{ width: 34, height: 1, background: "linear-gradient(90deg, transparent, var(--atlas-signal))" }} />
        {isRemoteUniverse ? "MULTIVERSE PROTOCOL" : "NAVIGATION SYSTEM"}
        <span style={{ width: 34, height: 1, background: "linear-gradient(90deg, var(--atlas-signal), transparent)" }} />
      </div>
      <h1
        className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-6"
        style={{
          fontFamily: "var(--atlas-display)",
          letterSpacing: "0.08em",
          color: "#ffffff",
          // Layered bloom instead of a gradient: the glow is what makes a title
          // read as an in-game banner.
          textShadow:
            "0 0 22px rgba(46,230,255,.55), 0 0 60px rgba(46,230,255,.28), 0 2px 0 rgba(0,0,0,.6)",
        }}
      >
        {isRemoteUniverse ? "阿特拉斯多元宇宙协议" : "阿特拉斯导航系统"}
      </h1>

      {isRemoteUniverse && universeConfig ? (
        <div className="space-y-3">
          <div className="w-full px-4">
            {/* Desktop: one line */}
            <div className="hidden sm:flex items-center justify-center gap-2">
              <NodeIdIcon className="w-5 h-5 text-purple-400 flex-shrink-0" />
              <span className="text-lg sm:text-xl text-purple-200">探索中</span>
              <span className="text-lg sm:text-xl text-purple-300 font-mono truncate">{universeConfig.node_id}</span>
            </div>

            {/* Mobile: two lines */}
            <div className="flex sm:hidden flex-col items-center justify-center gap-1">
              <div className="flex items-center gap-2">
                <NodeIdIcon className="w-5 h-5 text-purple-400 flex-shrink-0" />
                <span className="text-lg text-purple-200">探索中</span>
              </div>
              <div
                className="text-sm text-purple-300 font-mono text-center w-full"
                style={{ wordBreak: "break-all", overflowWrap: "anywhere" }}
              >
                {universeConfig.node_id}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 text-sm max-w-full px-4">
            <MetaRow
              icon={<SeedIcon className="w-4 h-4 text-blue-400 flex-shrink-0" />}
              label="远程种子:"
              value={SeedSanitizer.sanitizeForDisplay(universeConfig.seed_str)}
              tone="text-blue-400 truncate max-w-xs"
            />
            <MetaRow
              icon={<BitBangIcon className="w-4 h-4 text-cyan-400 flex-shrink-0" />}
              label="远程比特大爆炸:"
              value={formatCosmicTime(universeConfig.cosmic_origin_time)}
              tone="text-cyan-400"
            />
            {universeAge ? (
              <MetaRow
                icon={<UniverseAgeIcon className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
                label="比特大爆炸至今:"
                value={universeAge}
                tone="text-emerald-400"
              />
            ) : null}
            {universeDevelopment ? (
              <MetaRow
                icon={<DevelopmentIcon className="w-4 h-4 text-amber-400 flex-shrink-0" />}
                label="宇宙发展:"
                value={universeDevelopment}
                tone="text-amber-400"
              />
            ) : null}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-lg sm:text-xl max-w-4xl mx-auto px-4" style={{ color: "var(--atlas-n-800)" }}>
            穿越无限的星系、太阳系和行星。输入坐标开始你的宇宙之旅。
          </p>
          {universeConfig ? (
            <div className="flex flex-wrap items-center justify-center gap-2 text-sm max-w-full px-4">
              <MetaRow
                icon={<SeedIcon className="w-4 h-4 text-blue-400 flex-shrink-0" />}
                label="本地种子:"
                value={SeedSanitizer.sanitizeForDisplay(universeConfig.seed_str)}
                tone="text-blue-400 truncate max-w-xs"
              />
              <MetaRow
                icon={<BitBangIcon className="w-4 h-4 text-cyan-400 flex-shrink-0" />}
                label="本地比特大爆炸:"
                value={formatCosmicTime(universeConfig.cosmic_origin_time)}
                tone="text-cyan-400"
              />
              {universeAge ? (
                <MetaRow
                  icon={<UniverseAgeIcon className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
                  label="比特大爆炸至今:"
                  value={universeAge}
                  tone="text-emerald-400"
                />
              ) : null}
              {universeDevelopment ? (
                <MetaRow
                  icon={<DevelopmentIcon className="w-4 h-4 text-amber-400 flex-shrink-0" />}
                  label="宇宙发展:"
                  value={universeDevelopment}
                  tone="text-amber-400"
                />
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>

    <div
      className={`absolute inset-0 flex items-center justify-center transition-all duration-700 ease-in-out transform ${show3DViewer ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 -translate-y-2"}`}
      style={{ pointerEvents: show3DViewer ? "auto" : "none" }}
    >
      <div className="w-96 h-96">
        <Suspense fallback={null}>
          <CoordinateViewer3D
            coordinates={coordinates}
            className="w-full h-full"
            onUserInteraction={on3DUserInteraction}
            isVisible={show3DViewer}
          />
        </Suspense>
      </div>
    </div>
  </div>
);

export default HeroPanel;

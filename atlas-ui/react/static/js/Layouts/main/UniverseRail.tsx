// atlas-ui/react/static/js/Layouts/main/UniverseRail.tsx — the universe codex,
// as rail content rather than a standalone column.
//
// Split out of `HomeScreen.tsx` on 2026-10-31 (P0). The markup is the same as the
// old `CodexRail` minus its outer `<aside>`: the frame owns the rail container
// (width, divider, scroll), so every page's rail is the same physical strip.
// In P1 this file gains the galaxy / system / planet list and the rail becomes
// "the children of wherever you are".

import React from "react";
import BitBangIcon from "../../Icons/BitBangIcon.tsx";
import DevelopmentIcon from "../../Icons/DevelopmentIcon.tsx";
import NodeIdIcon from "../../Icons/NodeIdIcon.tsx";
import SeedIcon from "../../Icons/SeedIcon.tsx";
import UniverseAgeIcon from "../../Icons/UniverseAgeIcon.tsx";
import { SeedSanitizer } from "../../Utils/SeedSanitizer.tsx";
import { Label, Readout } from "../../Shell/GameAtoms.tsx";
import { formatCosmicTime } from "./format.ts";
import type { UniverseConfig } from "./useUniverseBootstrap.ts";

export interface UniverseRailProps {
  universeConfig: UniverseConfig | null;
  universeAge: string;
  universeDevelopment: string;
  isRemoteUniverse: boolean;
}

const UniverseRail: React.FC<UniverseRailProps> = ({ universeConfig, universeAge, universeDevelopment, isRemoteUniverse }) => (
  <>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span aria-hidden style={{ width: 3, height: 12, background: "var(--atlas-signal)", boxShadow: "0 0 8px rgba(46,230,255,.9)" }} />
      <span className="atlas-display" style={{ fontSize: 13, letterSpacing: "0.22em", color: "var(--atlas-n-950)" }}>
        宇宙档案
      </span>
    </div>

    {universeConfig ? (
      <>
        <Readout
          icon={<SeedIcon className="w-3.5 h-3.5" />}
          label={isRemoteUniverse ? "远程种子" : "本地种子"}
          value={SeedSanitizer.sanitizeForDisplay(universeConfig.seed_str)}
        />
        {isRemoteUniverse ? (
          <Readout icon={<NodeIdIcon className="w-3.5 h-3.5" />} label="节点" value={universeConfig.node_id} tone="var(--atlas-signal-2)" />
        ) : null}
        <Readout
          icon={<BitBangIcon className="w-3.5 h-3.5" />}
          label="比特大爆炸"
          value={formatCosmicTime(universeConfig.cosmic_origin_time)}
          tone="var(--atlas-signal)"
        />
        {universeAge ? (
          <Readout icon={<UniverseAgeIcon className="w-3.5 h-3.5" />} label="大爆炸至今" value={universeAge} tone="var(--atlas-ok)" />
        ) : null}
        {universeDevelopment ? (
          <Readout icon={<DevelopmentIcon className="w-3.5 h-3.5" />} label="宇宙发展" value={universeDevelopment} tone="var(--atlas-info)" />
        ) : null}
      </>
    ) : (
      <span style={{ fontSize: 12, color: "var(--atlas-n-600)" }}>正在读取宇宙配置…</span>
    )}

    <div style={{ marginTop: "auto", display: "grid", gap: 4 }}>
      <Label>坐标即星系</Label>
      <span style={{ fontSize: 11, lineHeight: 1.5, color: "var(--atlas-n-700)" }}>
        每个 (x, y, z) 是一个独立星系。当前页面只显示你所在的那一个。
      </span>
    </div>
  </>
);

export default UniverseRail;

// atlas-ui/react/static/js/Components/CodexTab.tsx
import React, { useEffect, useState } from "react";
import { CODEX_SECTIONS, CodexSection, CodexSystem } from "../Utils/CodexSystem.tsx";
import { ELEMENT_SYMBOLS } from "../Utils/ElementSymbols.tsx";
import { resourceLabel } from "../Utils/ResourceLabels.tsx";
import { ServerApi } from "../Utils/ServerApi.tsx";
import { SpaceshipResourceManager } from "../Utils/SpaceshipResources.tsx";
import { ResourceEventManager } from "../Utils/ResourceEventManager.tsx";

const SERVER_KIND: Record<CodexSection, string> = {
  planets: "planet",
  elements: "element",
  lifeForms: "lifeform",
};

const rewardText = (section: CodexSection): string =>
  Object.entries(CodexSystem.reward(section))
    .map(([key, amount]) => `${resourceLabel(key)} ${amount}`)
    .join(" · ");

interface EntryGridProps {
  section: CodexSection;
  found: Set<string>;
}

/** Locked planet types / life forms stay hidden; element names stay readable as targets. */
const EntryGrid: React.FC<EntryGridProps> = ({ section, found }) => {
  const catalog = CodexSystem.catalog(section);
  const hideLocked = section !== "elements";

  return (
    <div className={`grid gap-1 mt-2 ${section === "elements" ? "grid-cols-3 sm:grid-cols-4 lg:grid-cols-6" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}`}>
      {catalog.map((entry) => {
        const owned = found.has(entry);
        const symbol = ELEMENT_SYMBOLS[entry]?.symbol;

        return (
          <div
            key={entry}
            className={`rounded px-2 py-1 text-[11px] border truncate ${
              owned ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-200" : "bg-white/5 border-dashed border-white/15 text-gray-500"
            }`}
            title={owned || !hideLocked ? entry : "未发现"}
          >
            {owned || !hideLocked ? (
              <>
                {symbol && <span className="text-yellow-300 mr-1">{symbol}</span>}
                {entry}
              </>
            ) : (
              "未发现"
            )}
          </div>
        );
      })}
    </div>
  );
};

const CodexSectionBlock: React.FC<{
  section: (typeof CODEX_SECTIONS)[number];
  serverFound?: Set<string>;
  serverSection?: { found: number; total: number; complete: boolean; claimed: boolean };
  onClaim?: (section: CodexSection) => void;
}> = ({ section, serverFound, serverSection, onClaim }) => {
  const localProgress = CodexSystem.progress(section.id);
  const found = serverFound ?? new Set(CodexSystem.found(section.id));
  const catalog = CodexSystem.catalog(section.id);
  const progress = serverSection
    ? {
        found: serverSection.found,
        total: serverSection.total,
        percent: Math.round((serverSection.found / Math.max(1, serverSection.total)) * 100),
        complete: serverSection.complete,
      }
    : serverFound
      ? {
          found: catalog.filter((entry) => serverFound.has(entry)).length,
          total: catalog.length,
          percent: Math.round((catalog.filter((entry) => serverFound.has(entry)).length / catalog.length) * 100),
          complete: catalog.every((entry) => serverFound.has(entry)),
        }
      : localProgress;
  const claimed = serverSection ? serverSection.claimed : CodexSystem.claimed(section.id);

  return (
    <div className="rounded-lg border border-yellow-500/20 bg-white/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-white font-medium">
          <span className="text-base">{section.icon}</span>
          {section.title}
          <span className="text-[11px] text-gray-400">
            {progress.found}/{progress.total}
          </span>
        </div>
        <span className={`text-[11px] ${claimed ? "text-emerald-300" : "text-gray-400"}`}>
          {claimed ? (
            "奖励已领取"
          ) : progress.complete && onClaim ? (
            <button
              onClick={() => onClaim(section.id)}
              className="px-2 py-0.5 rounded text-[10px] bg-yellow-600/80 hover:bg-yellow-500 text-white"
            >
              领取奖励：{rewardText(section.id)}
            </button>
          ) : (
            `完成奖励：${rewardText(section.id)}`
          )}
        </span>
      </div>

      <div className="mt-2 h-1.5 rounded bg-white/10 overflow-hidden">
        <div className="h-full bg-gradient-to-r from-yellow-500 to-emerald-500 transition-all" style={{ width: `${progress.percent}%` }} />
      </div>

      <EntryGrid section={section.id} found={found} />
    </div>
  );
};

const CodexTab: React.FC = () => {
  const serverMode = ServerApi.mode() === "server";
  const [serverFound, setServerFound] = useState<Record<string, Set<string>>>({});
  const [serverSections, setServerSections] = useState<Record<string, any>>({});

  const refresh = async () => {
    try {
      const data = await ServerApi.codex();
      const grouped: Record<string, Set<string>> = {};
      (data?.entries || []).forEach((entry: any) => {
        grouped[entry.kind] = grouped[entry.kind] || new Set<string>();
        grouped[entry.kind].add(entry.entry_key);
      });
      setServerFound(grouped);
      setServerSections(data?.sections || {});
    } catch (error) {
      console.warn("[atlas-server] codex load failed", error);
    }
  };

  useEffect(() => {
    if (serverMode) void refresh();
  }, [serverMode]);

  const claim = async (section: CodexSection) => {
    try {
      const result = await ServerApi.claimCodex(section);
      SpaceshipResourceManager.addResources(result?.reward || {});
      ResourceEventManager.emit("resources_updated");
      await refresh();
    } catch (error) {
      console.warn("[atlas-server] codex claim failed", error);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-gray-400">
        首次抵达行星时自动记录。{serverMode ? "数据来自服务端图鉴。" : "集齐一类图鉴可领取一次性奖励。"}
      </p>
      {CODEX_SECTIONS.map((section) => (
        <CodexSectionBlock
          key={section.id}
          section={section}
          serverFound={serverMode ? serverFound[SERVER_KIND[section.id]] ?? new Set<string>() : undefined}
          serverSection={serverMode ? serverSections[section.id] : undefined}
          onClaim={serverMode ? (id) => void claim(id) : undefined}
        />
      ))}
    </div>
  );
};

export default CodexTab;

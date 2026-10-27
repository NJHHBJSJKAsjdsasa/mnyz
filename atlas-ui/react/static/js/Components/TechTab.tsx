// atlas-ui/react/static/js/Components/TechTab.tsx
import React, { useState } from "react";
import { TECH_BRANCHES, TECH_NODES, TechBranch, TechSystem } from "../Utils/TechSystem.tsx";
import { SpaceshipResource } from "../Utils/SpaceshipResources.tsx";
import { resourceLabel } from "../Utils/ResourceLabels.tsx";
import { ServerApi } from "../Utils/ServerApi.tsx";
import { ResourceEventManager } from "../Utils/ResourceEventManager.tsx";

const formatCost = (cost: Partial<SpaceshipResource>): string =>
  Object.entries(cost)
    .map(([key, amount]) => `${resourceLabel(key)} ${amount}`)
    .join(" · ");

const BranchCard: React.FC<{ branch: (typeof TECH_BRANCHES)[number]; onUnlocked: (text: string) => void }> = ({ branch, onUnlocked }) => {
  const level = TechSystem.level(branch.id as TechBranch);
  const nodes = TECH_NODES.filter((node) => node.branch === branch.id);

  const unlock = async (nodeId: string, name: string) => {
    if (ServerApi.mode() === "server") {
      try {
        await ServerApi.unlockTech(nodeId);
        TechSystem.applyServerUnlock(nodeId);
        ResourceEventManager.emit("resources_updated");
        onUnlocked(`已解锁「${name}」`);
      } catch (error) {
        onUnlocked(error instanceof Error ? `解锁失败：${error.message}` : "解锁失败");
      }
      return;
    }
    const check = TechSystem.canUnlock(nodeId);
    if (!check.ok) {
      onUnlocked(check.reason ?? "无法解锁");
      return;
    }
    onUnlocked(TechSystem.unlock(nodeId) ? `已解锁「${name}」` : "解锁失败");
  };

  return (
    <div className="rounded-lg border border-indigo-500/20 bg-white/5 p-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-200">
          {branch.icon} {branch.name}
        </span>
        <span className="text-indigo-300">{level}/{nodes.length}</span>
      </div>
      <p className="text-[11px] text-gray-500 mt-0.5">{branch.effect}</p>

      <div className="mt-1 space-y-1">
        {nodes.map((node) => {
          const unlocked = TechSystem.isUnlocked(node.id);
          const check = TechSystem.canUnlock(node.id);

          return (
            <div key={node.id} className={`rounded px-2 py-1 border ${unlocked ? "bg-indigo-500/15 border-indigo-500/40" : "bg-white/5 border-dashed border-white/10"}`}>
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className={unlocked ? "text-indigo-200" : "text-gray-400"}>
                  T{node.tier} {node.name}
                </span>
                {unlocked ? (
                  <span className="text-emerald-300 shrink-0">已解锁</span>
                ) : (
                  <button
                    onClick={() => unlock(node.id, node.name)}
                    disabled={!check.ok && ServerApi.mode() !== "server"}
                    title={check.reason ?? formatCost(node.cost)}
                    className="px-2 py-0.5 rounded text-[11px] bg-indigo-600/80 hover:bg-indigo-500 text-white disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                  >
                    解锁
                  </button>
                )}
              </div>
              {!unlocked && <div className="text-[10px] text-gray-500 mt-0.5">{formatCost(node.cost)}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const TechTab: React.FC = () => {
  const [message, setMessage] = useState("");

  const notify = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2400);
  };

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-gray-400">四条分支各 4 级，逐级解锁；效果永久生效，与改装、空间站、事件叠乘。</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {TECH_BRANCHES.map((branch) => (
          <BranchCard key={branch.id} branch={branch} onUnlocked={notify} />
        ))}
      </div>
      {message && <p className="text-xs text-center text-indigo-300">{message}</p>}
    </div>
  );
};

export default TechTab;

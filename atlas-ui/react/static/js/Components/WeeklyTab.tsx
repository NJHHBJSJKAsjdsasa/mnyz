// atlas-ui/react/static/js/Components/WeeklyTab.tsx
import React, { useState } from "react";
import { WeeklyChallenges } from "../Utils/WeeklyChallenges.tsx";
import { resourceLabel } from "../Utils/ResourceLabels.tsx";

const rewardText = (reward: object): string =>
  Object.entries(reward)
    .map(([key, amount]) => `${resourceLabel(key)} ${amount}`)
    .join(" · ");

const WeeklyTab: React.FC = () => {
  const [version, setVersion] = useState(0);
  const [message, setMessage] = useState("");

  const claim = () => {
    const ok = WeeklyChallenges.claim();
    setMessage(ok ? "周目标奖励已发放" : "目标尚未全部完成");
    setVersion((value) => value + 1);
    window.setTimeout(() => setMessage(""), 2400);
  };

  const snapshot = WeeklyChallenges.snapshot();

  return (
    <div className="space-y-3" data-weekly-version={version}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <span className="text-gray-400">本周目标（{snapshot.weekKey}）</span>
        <span className="text-cyan-300">{snapshot.daysLeft === 0 ? "今天结算" : `还剩 ${snapshot.daysLeft} 天`}</span>
      </div>

      {snapshot.tasks.map((task) => {
        const percent = Math.min(100, Math.round((task.current / task.target) * 100));
        return (
          <div key={task.id} className="rounded-lg border border-blue-500/20 bg-white/5 p-2">
            <div className="flex items-center justify-between text-xs">
              <span className={task.done ? "text-emerald-300" : "text-gray-300"}>{task.title}</span>
              <span className="text-gray-400">
                {task.current}/{task.target}
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded bg-white/10 overflow-hidden">
              <div className={`h-full transition-all ${task.done ? "bg-emerald-500" : "bg-gradient-to-r from-blue-500 to-cyan-400"}`} style={{ width: `${percent}%` }} />
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-2">
        <span className={`text-[11px] ${snapshot.claimed ? "text-emerald-300" : "text-gray-400"}`}>
          {snapshot.claimed ? "本周奖励已领取" : `完成奖励：${rewardText(snapshot.reward)}`}
        </span>
        <button
          onClick={claim}
          disabled={!snapshot.allDone || snapshot.claimed}
          className="px-3 py-1.5 rounded-md text-xs font-semibold bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          领取
        </button>
      </div>

      {message && <p className="text-xs text-center text-emerald-400">{message}</p>}
    </div>
  );
};

export default WeeklyTab;

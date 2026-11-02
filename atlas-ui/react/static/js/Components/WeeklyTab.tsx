// atlas-ui/react/static/js/Components/WeeklyTab.tsx
import React, { useEffect, useState } from "react";
import { WeeklyChallenges } from "../Utils/WeeklyChallenges.tsx";
import { resourceLabel } from "../Utils/ResourceLabels.tsx";

const rewardText = (reward: object): string =>
  Object.entries(reward)
    .map(([key, amount]) => `${resourceLabel(key)} ${amount}`)
    .join(" · ");

const WeeklyTab: React.FC = () => {
  const [version, setVersion] = useState(0);
  const [message, setMessage] = useState("");

  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void WeeklyChallenges.sync().then(() => setVersion((value) => value + 1));
  }, []);

  const claim = async () => {
    if (busy) return;
    setBusy(true);
    const result = await WeeklyChallenges.claimAsync();
    setBusy(false);
    setMessage(result.message);
    setVersion((value) => value + 1);
    window.setTimeout(() => setMessage(""), 3000);
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
          <div key={task.id} className="rounded-lg border border-blue-500/20 bg-white/[0.04] p-2">
            <div className="flex items-center justify-between text-xs">
              <span className={task.done ? "text-emerald-300" : "text-gray-300"}>{task.title}</span>
              <span className="text-gray-400">
                {task.current}/{task.target}
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded bg-plate-2 overflow-hidden">
              <div className={`h-full transition-all ${task.done ? "bg-emerald-500" : "bg-blue-500 hover:bg-cyan-400"}`} style={{ width: `${percent}%` }} />
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-2">
        <span className={`text-[11px] ${snapshot.claimed ? "text-emerald-300" : "text-gray-400"}`}>
          {snapshot.claimed ? "本周奖励已领取" : `完成奖励：${rewardText(snapshot.reward)}`}
        </span>
        <button
          onClick={() => void claim()}
          disabled={!snapshot.allDone || snapshot.claimed || busy}
          className="px-3 py-1.5 rounded-md text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          领取
        </button>
      </div>

      {message && <p className="text-xs text-center text-emerald-400">{message}</p>}
    </div>
  );
};

export default WeeklyTab;

// atlas-ui/react/static/js/Components/CouncilTab.tsx
// AI-majority cosmic council: 5 AI seats + 2 player seats.

import React, { useEffect, useState } from "react";
import { ServerApi } from "../Utils/ServerApi.tsx";
import { SectorSystem } from "../Utils/SectorSystem.tsx";

interface Seat {
  seat_no: number;
  name: string;
  faction_code: string | null;
  is_ai: boolean;
  focus: string;
}

interface Vote {
  seat_no: number;
  name: string;
  is_ai: boolean;
  vote: "yes" | "no";
  reason: string;
}

interface Motion {
  id: string;
  kind: "sector_license" | "membership";
  sector_key: string | null;
  cost: Record<string, number>;
  status: "open" | "passed" | "rejected";
  yes: number;
  no: number;
  can_vote: boolean;
  closes_at: string;
  outcome_reason?: string;
  votes: Vote[];
}

interface CouncilData {
  seats: Seat[];
  my_seat: number | null;
  motions: Motion[];
  rules: { pass_yes: number; review_minutes: number };
}

const statusText = (status: string) =>
  status === "open" ? "审核中" : status === "passed" ? "已通过" : "已否决";

const CouncilTab: React.FC = () => {
  const [data, setData] = useState<CouncilData | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      const next = await ServerApi.council();
      (next?.motions || []).forEach((motion: Motion) => {
        if (motion.status === "passed" && motion.kind === "sector_license" && motion.sector_key) {
          SectorSystem.applyServerUnlock(motion.sector_key);
        }
      });
      setData(next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "议会数据加载失败");
    }
  };

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(timer);
  }, []);

  const run = async (label: string, action: () => Promise<any>) => {
    setBusy(true);
    try {
      await action();
      setMessage(label);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return <div className="text-xs text-gray-400">{message || "正在连接宇宙议会…"}</div>;
  }

  const mySeat = data.seats.find((seat) => seat.seat_no === data.my_seat);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-indigo-200">宇宙议会</div>
            <div className="text-[11px] text-gray-400">
              7 席 · 5 名 AI 议员 · 2 名玩家议员 · 动议需 {data.rules.pass_yes} 票赞成
            </div>
          </div>
          {mySeat ? (
            <span className="text-[11px] text-emerald-300">你是第 {mySeat.seat_no} 席议员</span>
          ) : (
            <span className="text-[11px] text-gray-400">你尚未加入议会</span>
          )}
        </div>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
          {data.seats.map((seat) => {
            const filled = seat.is_ai || seat.name !== "开放席位";
            return (
              <div key={seat.seat_no} className="rounded bg-black/20 px-2 py-1 text-[11px]">
                <span className="text-gray-500">#{seat.seat_no}</span>{" "}
                <span className={seat.is_ai ? "text-cyan-200" : filled ? "text-emerald-200" : "text-gray-500"}>
                  {seat.is_ai ? "AI · " : "玩家 · "}
                  {seat.name}
                </span>
                <span className="text-gray-500"> · {seat.focus}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex gap-2">
          {!data.my_seat && (
            <button
              onClick={() => void run("入会申请已提交，等待议会表决", () => ServerApi.applyCouncilSeat())}
              disabled={busy}
              className="px-2 py-1 rounded text-[11px] bg-indigo-600/80 hover:bg-indigo-500 text-white disabled:opacity-40"
            >
              申请加入议会
            </button>
          )}
          {data.my_seat && (
            <button
              onClick={() => void run("已退出议会", () => ServerApi.leaveCouncil())}
              disabled={busy}
              className="px-2 py-1 rounded text-[11px] bg-red-600/70 hover:bg-red-500 text-white disabled:opacity-40"
            >
              退出议会
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {data.motions.length === 0 && <div className="text-[11px] text-gray-500">暂无动议。</div>}
        {data.motions.map((motion) => (
          <div key={motion.id} className="rounded-lg border border-white/10 bg-white/5 p-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span className="text-gray-200">
                {motion.kind === "sector_license"
                  ? `星区许可 ${motion.sector_key}`
                  : "议员入会申请"}
              </span>
              <span
                className={
                  motion.status === "passed"
                    ? "text-emerald-300"
                    : motion.status === "rejected"
                      ? "text-red-300"
                      : "text-yellow-300"
                }
              >
                {statusText(motion.status)} · 赞成 {motion.yes} / 反对 {motion.no}
              </span>
            </div>
            <div className="mt-1 text-[10px] text-gray-500">
              {motion.cost?.antimatter ? `申请费 ${motion.cost.antimatter} 反物质 · ` : ""}
              截止 {new Date(motion.closes_at).toLocaleTimeString()}
              {motion.outcome_reason ? ` · ${motion.outcome_reason}` : ""}
            </div>
            <div className="mt-1 space-y-0.5 text-[10px] text-gray-400">
              {motion.votes.map((vote) => (
                <div key={vote.seat_no}>
                  #{vote.seat_no} {vote.is_ai ? "AI" : "玩家"} {vote.name}：
                  <span className={vote.vote === "yes" ? "text-emerald-300" : "text-red-300"}>
                    {vote.vote === "yes" ? "赞成" : "反对"}
                  </span>{" "}
                  {vote.reason}
                </div>
              ))}
            </div>
            {motion.status === "open" && motion.can_vote && (
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => void run("已投赞成票", () => ServerApi.councilVote(motion.id, "yes"))}
                  disabled={busy}
                  className="px-2 py-1 rounded text-[10px] bg-emerald-600/80 hover:bg-emerald-500 text-white disabled:opacity-40"
                >
                  赞成
                </button>
                <button
                  onClick={() => void run("已投反对票", () => ServerApi.councilVote(motion.id, "no"))}
                  disabled={busy}
                  className="px-2 py-1 rounded text-[10px] bg-red-600/80 hover:bg-red-500 text-white disabled:opacity-40"
                >
                  反对
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {message && <div className="text-[11px] text-indigo-300">{message}</div>}
    </div>
  );
};

export default CouncilTab;

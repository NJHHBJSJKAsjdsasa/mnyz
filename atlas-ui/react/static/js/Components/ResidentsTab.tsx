// atlas-ui/react/static/js/Components/ResidentsTab.tsx
import React, { useEffect, useMemo, useState } from "react";
import { LeaderRow, Residents } from "../Utils/Residents.tsx";
import { NpcEncounters } from "../Utils/NpcEncounters.tsx";
import { DailyChallengesManager } from "../Utils/DailyChallenges.tsx";
import { ChallengeSnapshot, ChallengeSystem } from "../Utils/ChallengeSystem.tsx";
import { ServerApi } from "../Utils/ServerApi.tsx";
import CombatPanel from "./CombatPanel.tsx";
import AllySection from "./AllySection.tsx";

/** Fleet snapshot sharing: encode your refit into a code, fight someone else's. */
const ChallengeSection: React.FC = () => {
  const [code, setCode] = useState("");
  const [input, setInput] = useState("");
  const [challenge, setChallenge] = useState<ChallengeSnapshot | null>(null);
  const [challengeCode, setChallengeCode] = useState<string | undefined>();
  const [message, setMessage] = useState("");
  const serverMode = ServerApi.mode() === "server";

  const generate = async () => {
    if (serverMode) {
      try {
        const data = await ServerApi.createChallenge();
        setCode(data?.code || "");
        setMessage("挑战码由服务端签发，30 天内有效");
      } catch (error) {
        setMessage(error instanceof Error ? `生成失败：${error.message}` : "生成失败");
      }
      return;
    }
    setCode(ChallengeSystem.encode());
  };

  const fight = async () => {
    if (serverMode) {
      try {
        const data = await ServerApi.challengeInfo(input.trim());
        const snapshot = data?.snapshot || {};
        setChallenge({
          name: `${snapshot.name || "同行者"} Lv${snapshot.level || 1}`,
          level: Number(snapshot.level || 1),
          hull: Number(snapshot.hull || 100),
          weaponLevel: Number(snapshot.weapon_level || 0),
          shieldLevel: Number(snapshot.shield_level || 0),
        });
        setChallengeCode(input.trim());
        setMessage("");
      } catch (error) {
        setMessage(error instanceof Error ? `挑战码无效：${error.message}` : "挑战码无效");
      }
      return;
    }
    const snapshot = ChallengeSystem.decode(input);
    if (!snapshot) {
      setMessage("挑战码无效或已损坏");
      return;
    }
    setMessage("");
    setChallenge(snapshot);
  };

  return (
    <div className="rounded-lg border border-purple-500/20 bg-white/5 p-2 space-y-1">
      <div className="text-xs text-gray-200">异步对决 · 挑战码</div>
      <p className="text-[11px] text-gray-500">把你的改装编码成一段文本，对方输入后与这份快照对打（不联网、不同步）。</p>

      <button onClick={() => void generate()} className="px-2 py-1 rounded text-[11px] bg-purple-600/80 hover:bg-purple-500 text-white">
        生成我的挑战码
      </button>
      {code && <textarea readOnly value={code} rows={3} className="w-full text-[10px] bg-black/40 text-gray-400 rounded p-1 break-all" />}

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="粘贴别人的挑战码"
          className="flex-1 min-w-0 text-[11px] bg-black/40 rounded px-2 py-1 text-gray-200"
        />
        <button onClick={() => void fight()} className="px-2 py-1 rounded text-[11px] bg-white/10 hover:bg-white/20 text-white shrink-0">
          挑战
        </button>
      </div>

      {message && <p className="text-[11px] text-orange-300">{message}</p>}
      {challenge && (
        <CombatPanel
          challenge={challenge}
          challengeCode={challengeCode}
          onClose={() => {
            setChallenge(null);
            setChallengeCode(undefined);
          }}
        />
      )}
    </div>
  );
};

const Leaderboard: React.FC<{ rows: LeaderRow[]; serverMode?: boolean }> = ({ rows, serverMode }) => (
  <div className="rounded-lg border border-blue-500/20 bg-white/5 p-2">
    <div className="text-xs text-gray-200 mb-1">{serverMode ? "舰船等级排行" : "探索量排行"}</div>
    <div className="max-h-56 overflow-y-auto divide-y divide-white/5">
      {rows.map((row, index) => (
        <div key={row.id} className={`flex items-center justify-between gap-2 px-1 py-1 text-[11px] ${row.isPlayer ? "bg-emerald-500/15 rounded" : ""}`}>
          <span className="flex items-center gap-2 min-w-0">
            <span className={`w-6 shrink-0 ${index < 3 ? "text-yellow-300" : "text-gray-500"}`}>{index + 1}</span>
            <span className={`truncate ${row.isPlayer ? "text-emerald-200 font-semibold" : "text-gray-300"}`}>{row.callsign}</span>
            <span className="text-gray-500 truncate hidden sm:inline">{row.name}</span>
          </span>
          <span className={`shrink-0 ${row.isPlayer ? "text-emerald-200" : "text-gray-400"}`}>
            {row.score} {serverMode ? "级" : "颗"}
          </span>
        </div>
      ))}
    </div>
  </div>
);

const Roster: React.FC<{ seed: string; met: string[]; favors: Record<string, number> }> = ({ seed, met, favors }) => {
  const metSet = new Set(met);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
      {Residents.roster(seed).map((resident) => {
        const known = metSet.has(resident.id);
        const favor = favors[resident.id] ?? 0;

        return (
          <div
            key={resident.id}
            className={`rounded px-2 py-1 text-[11px] border ${known ? "bg-emerald-500/10 border-emerald-500/30" : "bg-white/5 border-dashed border-white/10"}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={known ? "text-emerald-200 font-medium truncate" : "text-gray-500 truncate"}>{resident.callsign}</span>
              <span className="text-gray-500 shrink-0">{known ? (favor > 0 ? `${resident.trait} · 好感 ${favor}` : resident.trait) : "未相遇"}</span>
            </div>
            <div className="text-gray-500 truncate">{known ? `${resident.name} · ${resident.ship}` : "？？？"}</div>
          </div>
        );
      })}
    </div>
  );
};

const ServerRoster: React.FC<{ residents: any[]; onMeet: (id: string) => void }> = ({ residents, onMeet }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
    {residents.map((resident) => (
      <div
        key={resident.id}
        className={`rounded px-2 py-1 text-[11px] border ${
          resident.met ? "bg-emerald-500/10 border-emerald-500/30" : "bg-white/5 border-dashed border-white/10"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className={resident.met ? "text-emerald-200 font-medium truncate" : "text-gray-500 truncate"}>
            {resident.callsign}
          </span>
          <span className="text-gray-500 shrink-0">
            {resident.met ? `${resident.trait} · 好感 ${resident.favor}` : "未相遇"}
          </span>
        </div>
        <div className="text-gray-500 truncate">
          {resident.met ? `${resident.name} · 交易 ${resident.trades}` : "？？？"}
        </div>
        {!resident.met && (
          <button
            onClick={() => onMeet(resident.id)}
            className="mt-1 px-2 py-0.5 rounded text-[10px] bg-indigo-600/80 hover:bg-indigo-500 text-white"
          >
            打招呼
          </button>
        )}
      </div>
    ))}
  </div>
);

const ResidentsTab: React.FC = () => {
  const seed = Residents.universeSeed();
  const { met } = Residents.encounters();
  const favors = NpcEncounters.favorMap();
  const serverMode = ServerApi.mode() === "server";
  const [serverResidents, setServerResidents] = useState<any[]>([]);
  const [serverRows, setServerRows] = useState<LeaderRow[]>([]);

  const refreshResidents = async () => {
    try {
      const data = await ServerApi.residents();
      setServerResidents(data?.residents || []);
    } catch (error) {
      console.warn("[atlas-server] residents load failed", error);
    }
  };

  useEffect(() => {
    if (!serverMode) return;
    void refreshResidents();
    ServerApi.leaderboard()
      .then((data) => {
        const me = ServerApi.currentPlayerId();
        setServerRows(
          (data?.entries || data || []).map((row: any) => ({
            id: row.player_id,
            name: row.name,
            callsign: row.name,
            score: Number(row.ship_level || 0),
            isPlayer: row.player_id === me,
          })),
        );
      })
      .catch((error) => console.warn("[atlas-server] leaderboard failed", error));
  }, [serverMode]);

  const meetResident = async (id: string) => {
    try {
      await ServerApi.meetResident(id);
      await refreshResidents();
    } catch (error) {
      console.warn("[atlas-server] resident meet failed", error);
    }
  };

  const rows = useMemo(() => {
    const stats = DailyChallengesManager.getExplorationStats();
    const days = DailyChallengesManager.getDayInfo().dayNumber;
    return Residents.leaderboard({ universeSeed: seed, playerPlanets: stats.planets, days });
  }, [seed]);

  const rank = rows.findIndex((row) => row.isPlayer) + 1;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <span className="text-gray-400">本周相遇 {met.length}/24 位舰长（痕迹每周轮换）</span>
        <span className="text-cyan-300 font-semibold">
          你排第 {rank}/{rows.length}
        </span>
      </div>

      <Leaderboard rows={serverMode ? serverRows : rows} serverMode={serverMode} />
      {serverMode ? (
        <ServerRoster residents={serverResidents} onMeet={(id) => void meetResident(id)} />
      ) : (
        <Roster seed={seed} met={met} favors={favors} />
      )}
      <AllySection />
      <ChallengeSection />
      <p className="text-[11px] text-gray-500">舰长的探索量由宇宙 seed 与天数派生，不联网、不同步；你的成绩按已探索行星数计。</p>
    </div>
  );
};

export default ResidentsTab;

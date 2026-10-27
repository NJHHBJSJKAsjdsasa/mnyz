// atlas-ui/react/static/js/Components/CombatPanel.tsx
import React, { useEffect, useState } from "react";
import { CombatAction, CombatResult, CombatShip, CombatState, CombatSystem } from "../Utils/CombatSystem.tsx";
import type { ChallengeSnapshot } from "../Utils/ChallengeSystem.tsx";
import { resourceLabel } from "../Utils/ResourceLabels.tsx";
import { SpaceshipResourceManager } from "../Utils/SpaceshipResources.tsx";
import { ServerApi } from "../Utils/ServerApi.tsx";

interface ServerMax {
  playerHp: number;
  playerShield: number;
  enemyHp: number;
  enemyShield: number;
}

const EMPTY_SHIP = (name: string): CombatShip => ({
  name,
  hp: 1,
  hpMax: 1,
  shield: 0,
  shieldMax: 0,
  firepower: 0,
});

const emptyState = (): CombatState => ({
  seed: 0,
  turn: 1,
  mobility: 0,
  player: EMPTY_SHIP("旗舰"),
  enemy: EMPTY_SHIP("敌舰"),
  log: [],
  outcome: "ongoing",
});

const serverLog = (entries: any[]): string[] =>
  (entries || []).map((entry) => {
    if (entry.kind === "fire") return `你造成 ${entry.damage} 伤害（护盾吸收 ${entry.absorbed}）`;
    if (entry.kind === "enemy") return `敌舰造成 ${entry.damage} 伤害（护盾吸收 ${entry.absorbed}）`;
    if (entry.kind === "shield") return `护盾回充至 ${entry.shield}`;
    if (entry.kind === "escort_hit") return `敌舰击中护航舰 ${entry.name}，造成 ${entry.damage} 伤害`;
    if (entry.kind === "flee") return "你撤出了战斗";
    return "战斗继续";
  });

const mapServerState = (data: any, max: ServerMax): CombatState => {
  const outcome =
    data.status === "won" ? "win" : data.status === "lost" ? "lose" : data.status === "fled" ? "fled" : "ongoing";
  return {
    seed: 0,
    turn: Number(data.turn_no || 1),
    mobility: 0,
    player: {
      name: "旗舰",
      hp: Number(data.player_hp || 0),
      hpMax: max.playerHp,
      shield: Number(data.player_shield || 0),
      shieldMax: max.playerShield,
      firepower: 0,
    },
    enemy: {
      name: "敌舰",
      hp: Number(data.enemy_hp || 0),
      hpMax: max.enemyHp,
      shield: Number(data.enemy_shield || 0),
      shieldMax: max.enemyShield,
      firepower: 0,
    },
    escorts: (data.escorts || []).map((escort: any) => ({
      name: escort.name,
      hp: Number(escort.hp || 0),
      hpMax: Number(escort.hp_max || 30),
      shield: Number(escort.shield || 0),
      shieldMax: Number(escort.shield_max || 0),
      firepower: Number(escort.firepower || 0),
    })),
    log: serverLog(data.log || []),
    outcome,
  };
};

const bar = (current: number, max: number, tone: string): string => (max <= 0 ? "0%" : `${Math.max(0, Math.min(100, Math.round((current / max) * 100)))}%`);

const ShipBlock: React.FC<{ ship: CombatShip; tone: "player" | "enemy" }> = ({ ship, tone }) => (
  <div className="rounded-lg border border-white/10 bg-white/5 p-2">
    <div className="flex items-center justify-between text-[11px]">
      <span className={tone === "player" ? "text-emerald-300" : "text-red-300"}>{ship.name}</span>
      <span className="text-gray-400">
        装甲 {ship.hp}/{ship.hpMax} · 护盾 {ship.shield}/{ship.shieldMax}
      </span>
    </div>
    <div className="mt-1 h-1.5 rounded bg-white/10 overflow-hidden">
      <div className={`h-full ${tone === "player" ? "bg-emerald-500" : "bg-red-500"}`} style={{ width: bar(ship.hp, ship.hpMax, tone) }} />
    </div>
  </div>
);

const ACTIONS: Array<{ id: CombatAction; label: string; hint: string }> = [
  { id: "fire", label: "开火", hint: "造成火力伤害" },
  { id: "shield", label: "护盾", hint: "充满护盾，本回合不开火" },
  { id: "evade", label: "规避", hint: "受创减半并回充 25% 护盾" },
  { id: "flee", label: "撤离", hint: "按机动判定，失败则挨打" },
];

const resultLines = (result: CombatResult): string[] => {
  if (result.outcome === "win") {
    const loot = Object.entries(result.reward)
      .map(([key, amount]) => `${resourceLabel(key)} ${amount}`)
      .join(" · ");
    if (!loot) return ["演练胜利。", "挑战赛不产生战利品。"];
    return [`战果：${loot}${result.vouchers > 0 ? ` · 改装券 ×${result.vouchers}` : ""}`, "船体无损。"];
  }
  if (result.outcome === "lose") {
    const lost = Object.entries(result.cargoLoss)
      .map(([key, amount]) => `${resourceLabel(key)} -${amount}`)
      .join(" · ");
    return [`船体 -${result.hullLoss}，需要维修。`, lost ? `被抢走：${lost}` : "货舱里没有值得抢的东西。"];
  }
  return [`撤离消耗燃料 ${result.fuelLost} 氘。`, "没有战果，也没有损失改装进度。"];
};

interface CombatPanelProps {
  planetKey?: string;
  coordinates?: string;
  challenge?: ChallengeSnapshot;
  challengeCode?: string;
  onClose: () => void;
}

const CombatPanel: React.FC<CombatPanelProps> = ({ planetKey, coordinates, challenge, challengeCode, onClose }) => {
  const useServer = ServerApi.mode() === "server" && (Boolean(challengeCode) || !challenge);
  const [state, setState] = useState<CombatState>(() =>
    useServer
      ? emptyState()
      : challenge
        ? CombatSystem.createFromChallenge(challenge)
        : CombatSystem.createEncounter(planetKey ?? ""),
  );
  const [result, setResult] = useState<CombatResult | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [maxes, setMaxes] = useState<ServerMax>({ playerHp: 1, playerShield: 1, enemyHp: 1, enemyShield: 1 });
  const [loading, setLoading] = useState(useServer);

  useEffect(() => {
    if (!useServer) return;
    let cancelled = false;
    setLoading(true);
    const start = challengeCode ? ServerApi.challengeStart(challengeCode) : ServerApi.combatStart(planetKey ?? "");
    start
      .then((data) => {
        if (cancelled) return;
        const session = data?.session || {};
        const nextMax = {
          playerHp: Number(session.player_hp || 1),
          playerShield: Number(session.player_shield || 1),
          enemyHp: Number(session.enemy_hp || 1),
          enemyShield: Number(session.enemy_shield || 1),
        };
        setMaxes(nextMax);
        setSessionId(session.id || null);
        setState({ ...mapServerState(session, nextMax), log: ["战斗开始"] });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({ ...emptyState(), outcome: "fled", log: [error instanceof Error ? `启动失败：${error.message}` : "启动失败"] });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [useServer, planetKey, challengeCode]);

  const act = async (action: CombatAction) => {
    if (state.outcome !== "ongoing" || loading) return;
    if (useServer) {
      if (!sessionId) return;
      setLoading(true);
      try {
        const data = await ServerApi.combatAction(sessionId, action);
        const next = mapServerState(data, maxes);
        setState(next);
        if (next.outcome === "win") SpaceshipResourceManager.addResources(data?.loot || {});
        if (next.outcome !== "ongoing") {
          setResult({
            outcome: next.outcome,
            reward: data?.loot || {},
            vouchers: 0,
            hullLoss: next.outcome === "lose" && data?.mode !== "challenge" ? 20 : 0,
            cargoLoss: {},
            fuelLost: 0,
          });
        }
      } catch (error) {
        setState((prev) => ({
          ...prev,
          log: [...prev.log, error instanceof Error ? `请求失败：${error.message}` : "请求失败"],
        }));
      } finally {
        setLoading(false);
      }
      return;
    }
    const next = CombatSystem.resolveTurn(state, action);
    setState(next);
    if (next.outcome !== "ongoing") {
      // A challenge fight is a sparring match: no wreck, no faction or contract credit.
      setResult(challenge ? CombatSystem.settle(next) : CombatSystem.settle(next, { planetKey, coordinates }));
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3">
      <div className="w-full max-w-lg rounded-xl border border-red-500/30 bg-slate-950/95 p-3 shadow-2xl">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-bold text-red-300">{challenge ? "🎯 模拟对决" : "⚔ 遭遇战"}</span>
          <span className="text-[11px] text-gray-400">第 {state.turn} 回合</span>
        </div>

        <div className="space-y-1">
          <ShipBlock ship={state.player} tone="player" />
          {state.escorts && state.escorts.length > 0 && (
            <div className="text-[11px] text-cyan-300 px-1">
              护航 {state.escorts.filter((escort) => escort.hp > 0).length}/{state.escorts.length} · 额外火力 +
              {state.escorts.reduce((sum, escort) => sum + (escort.hp > 0 ? escort.firepower : 0), 0)}
              <div className="text-[10px] text-gray-500">
                {state.escorts.map((escort) => `${escort.name} ${escort.hp}/${escort.hpMax}`).join(" · ")}
              </div>
            </div>
          )}
          <ShipBlock ship={state.enemy} tone="enemy" />
        </div>

        {loading && <div className="mt-2 text-[11px] text-cyan-300">正在连接战斗服务…</div>}

        <div className="mt-2 max-h-32 overflow-y-auto rounded bg-black/40 p-2 text-[11px] text-gray-300 space-y-0.5">
          {state.log.map((line, index) => (
            <div key={index}>· {line}</div>
          ))}
        </div>

        {state.outcome === "ongoing" ? (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {ACTIONS.map((action) => (
              <button
                key={action.id}
                onClick={() => void act(action.id)}
                disabled={loading}
                title={action.hint}
                className="px-2 py-1.5 rounded-md text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/10 transition-all disabled:opacity-40"
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-2 space-y-1">
            {result && resultLines(result).map((line, index) => (
              <p key={index} className="text-[11px] text-gray-300">
                {line}
              </p>
            ))}
            <button
              onClick={onClose}
              className="w-full mt-1 px-3 py-1.5 rounded-md text-xs font-semibold bg-gradient-to-r from-slate-700 to-slate-600 hover:from-slate-600 hover:to-slate-500 text-white transition-all"
            >
              关闭
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CombatPanel;

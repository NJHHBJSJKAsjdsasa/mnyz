// atlas-ui/react/static/js/Components/IntelPanel.tsx
import React, { useState } from "react";
import { INTEL_COST, INTEL_TTL_MS, IntelPayload, IntelSystem } from "../Utils/IntelSystem.tsx";

const remainingMinutes = (payload: IntelPayload): number => Math.max(0, Math.round((payload.expiresAt - Date.now()) / 60000));

const IntelPanel: React.FC<{ coordinates: string }> = ({ coordinates }) => {
  const [payload, setPayload] = useState<IntelPayload | null>(() => IntelSystem.cached());
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const buy = async () => {
    setLoading(true);
    const result = await IntelSystem.buy(coordinates);
    setLoading(false);

    if (!result.ok) {
      setMessage(result.reason ?? "购买失败");
      return;
    }
    setPayload(result.payload ?? null);
    setMessage("情报已送达");
  };

  return (
    <div className="rounded-lg border border-teal-500/20 bg-white/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <span className="text-gray-300">附近星系情报 · 真实行星构成（服务端查询）</span>
        <span className="text-gray-500">有效 {Math.round(INTEL_TTL_MS / 60000)} 分钟</span>
      </div>

      {payload ? (
        <div className="mt-2 space-y-1">
          <div className="text-[11px] text-teal-300">
            {payload.galaxyName} · {payload.systemName}
            <span className="text-gray-500">
              {" "}
              ({payload.target.x}, {payload.target.y}, {payload.target.z}) · 剩 {remainingMinutes(payload)} 分钟
            </span>
          </div>
          {payload.planets.map((planet) => (
            <div key={planet.name} className="text-[11px] text-gray-300 truncate">
              <span className="text-white">{planet.name.replace(/_/g, " ")}</span>
              <span className="text-gray-500"> · {planet.planet_type}</span>
              {planet.elements.length > 0 && <span className="text-yellow-300"> · {planet.elements.slice(0, 3).join("/")}</span>}
              {planet.life_forms && planet.life_forms !== "None" && <span className="text-emerald-300"> · {planet.life_forms}</span>}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-[11px] text-gray-500">还没有情报。购买后会给出一个 1.5M 单位内星系的真实行星列表。</p>
      )}

      <button
        onClick={buy}
        disabled={loading}
        className="mt-2 px-3 py-1 rounded-md text-[11px] font-semibold bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? "查询中…" : `购买情报 · ${INTEL_COST} 反物质`}
      </button>

      {message && <p className="mt-1 text-[11px] text-teal-300">{message}</p>}
    </div>
  );
};

export default IntelPanel;

// atlas-ui/react/static/js/Components/SurfaceSurvey.tsx
import React, { useEffect, useRef, useState } from "react";
import { DAILY_SAMPLES, GRID_SIZE, SurfaceSystem, surfaceGrid } from "../Utils/SurfaceSystem.tsx";
import { resourceLabel } from "../Utils/ResourceLabels.tsx";
import { ServerApi } from "../Utils/ServerApi.tsx";
import { SpaceshipResourceManager } from "../Utils/SpaceshipResources.tsx";

interface SurfaceSurveyProps {
  planetKey: string;
  planetName: string;
  onClose: () => void;
}

const CELL = 28;

const tone = (value: number): string => {
  if (value > 0.9) return "#f59e0b";
  if (value > 0.72) return "#34d399";
  if (value > 0.5) return "#22d3ee";
  if (value > 0.3) return "#3b82f6";
  return "#1e3a8a";
};

const SurfaceSurvey: React.FC<SurfaceSurveyProps> = ({ planetKey, planetName, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [remaining, setRemaining] = useState(() => SurfaceSystem.remaining(planetKey));
  const [message, setMessage] = useState("");

  const grid = surfaceGrid(planetKey);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    grid.forEach((value, index) => {
      const x = (index % GRID_SIZE) * CELL;
      const y = Math.floor(index / GRID_SIZE) * CELL;
      context.fillStyle = tone(value);
      context.fillRect(x, y, CELL - 1, CELL - 1);
    });
  }, [planetKey]);

  const pick = async (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * GRID_SIZE);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * GRID_SIZE);
    if (x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) return;
    const cell = y * GRID_SIZE + x;

    if (ServerApi.mode() === "server") {
      try {
        const result = await ServerApi.surfaceSample(planetKey, cell);
        SpaceshipResourceManager.addResources(result?.yield || {});
        SurfaceSystem.applyServerSample(planetKey, Number(result?.remaining ?? 0));
        setRemaining(Number(result?.remaining ?? 0));
        setMessage(
          `采样点丰度 ${(Number(result?.value || 0) * 100).toFixed(0)}% → ${Object.entries(result?.yield || {})
            .map(([key, amount]) => `${resourceLabel(key)} +${amount}`)
            .join(" · ")}`,
        );
      } catch (error) {
        setMessage(error instanceof Error ? `采样失败：${error.message}` : "采样失败");
      }
      return;
    }

    const result = SurfaceSystem.sample(planetKey, cell);
    if (!result) {
      setMessage("本行星今日采样次数已用完");
      return;
    }

    setRemaining(result.remaining);
    setMessage(
      `采样点丰度 ${(result.value * 100).toFixed(0)}% → ${Object.entries(result.yield)
        .map(([key, amount]) => `${resourceLabel(key)} +${amount}`)
        .join(" · ")}`,
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3">
      <div className="w-full max-w-md rounded-xl border border-cyan-500/30 bg-slate-950/95 p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-bold text-cyan-300">地表采样 · {planetName.replace(/_/g, " ")}</span>
          <span className="text-[11px] text-gray-400">
            今日剩余 {remaining}/{DAILY_SAMPLES}
          </span>
        </div>

        <canvas
          ref={canvasRef}
          width={GRID_SIZE * CELL}
          height={GRID_SIZE * CELL}
          onClick={pick}
          className="w-full rounded border border-white/10 cursor-crosshair"
        />

        <p className="mt-2 text-[11px] text-gray-400">颜色越暖丰度越高；热点可能夹带异星晶体。每次采样都真的会消耗当日次数。</p>
        {message && <p className="mt-1 text-[11px] text-cyan-300">{message}</p>}

        <button
          onClick={onClose}
          className="mt-2 w-full px-3 py-1.5 rounded-md text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-white"
        >
          关闭
        </button>
      </div>
    </div>
  );
};

export default SurfaceSurvey;

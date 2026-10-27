// atlas-ui/react/static/js/Components/CosmicBanner.tsx
import React, { useEffect, useState } from "react";
import { CosmicEvents } from "../Utils/CosmicEvents.tsx";

const formatRemaining = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return `${hours}:${minutes.toString().padStart(2, "0")}`;
};

const CosmicBanner: React.FC<{ coordinates: string }> = ({ coordinates }) => {
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const event = CosmicEvents.current();
  const covers = CosmicEvents.affects(coordinates);
  const tone = event.positive ? "border-emerald-500/30 bg-emerald-500/10" : "border-orange-500/30 bg-orange-500/10";

  return (
    <div className={`rounded-xl border ${tone} px-3 py-2 flex flex-wrap items-center justify-between gap-2`}>
      <span className="text-xs text-gray-200">
        <span className="mr-1">{event.icon}</span>
        <span className="font-semibold">{event.title}</span>
        <span className="text-gray-400 ml-2">{event.detail}</span>
      </span>
      <span className="text-[11px] shrink-0">
        <span className={covers ? "text-emerald-300" : "text-gray-500"}>
          {event.scope === "global" ? "全宇宙" : covers ? `覆盖本星区 ${event.sectorKey}` : `仅在 ${event.sectorKey} 生效`}
        </span>
        <span className="text-gray-500 ml-2">剩余 {formatRemaining(CosmicEvents.remainingMs())}</span>
      </span>
    </div>
  );
};

export default CosmicBanner;

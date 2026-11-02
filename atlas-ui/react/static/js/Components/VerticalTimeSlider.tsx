// atlas-ui/react/static/js/Components/VerticalTimeSlider.tsx
import React, { useEffect, useState, useRef, useCallback } from "react";

export const SECONDS_PER_DAY = 24 * 60 * 60;
export const SECONDS_PER_MONTH = 30.44 * SECONDS_PER_DAY;
export const SECONDS_PER_YEAR = 365.25 * SECONDS_PER_DAY;

// Zone 1 (0-25%): 0 to ±1 day - ultra fine control
// Zone 2 (25-50%): ±1 day to ±1 month - fine control
// Zone 3 (50-75%): ±1 month to ±1 year - medium control
// Zone 4 (75-100%): ±1 year to ±100 years - coarse control
const SLIDER_ZONES = {
  ZONE_1_END: 0.25,
  ZONE_2_END: 0.5,
  ZONE_3_END: 0.75,
  // Zone 4 goes to 1.0

  TIME_1: SECONDS_PER_DAY, // ±1 day at 25%
  TIME_2: SECONDS_PER_MONTH, // ±1 month at 50%
  TIME_3: SECONDS_PER_YEAR, // ±1 year at 75%
  TIME_4: 100 * SECONDS_PER_YEAR, // ±100 years at 100%
};

export const sliderToTimeOffset = (sliderValue: number): number => {
  const normalizedPos = sliderValue / 100; // -1 to 1
  const absPos = Math.abs(normalizedPos);
  const sign = normalizedPos >= 0 ? 1 : -1;

  let seconds: number;

  if (absPos <= SLIDER_ZONES.ZONE_1_END) {
    // Zone 1: 0-25% → 0 to 1 day
    const t = absPos / SLIDER_ZONES.ZONE_1_END;
    seconds = t * SLIDER_ZONES.TIME_1;
  } else if (absPos <= SLIDER_ZONES.ZONE_2_END) {
    // Zone 2: 25-50% → 1 day to 1 month
    const t = (absPos - SLIDER_ZONES.ZONE_1_END) / (SLIDER_ZONES.ZONE_2_END - SLIDER_ZONES.ZONE_1_END);
    seconds = SLIDER_ZONES.TIME_1 + t * (SLIDER_ZONES.TIME_2 - SLIDER_ZONES.TIME_1);
  } else if (absPos <= SLIDER_ZONES.ZONE_3_END) {
    // Zone 3: 50-75% → 1 month to 1 year
    const t = (absPos - SLIDER_ZONES.ZONE_2_END) / (SLIDER_ZONES.ZONE_3_END - SLIDER_ZONES.ZONE_2_END);
    seconds = SLIDER_ZONES.TIME_2 + t * (SLIDER_ZONES.TIME_3 - SLIDER_ZONES.TIME_2);
  } else {
    // Zone 4: 75-100% → 1 year to 100 years
    const t = (absPos - SLIDER_ZONES.ZONE_3_END) / (1 - SLIDER_ZONES.ZONE_3_END);
    seconds = SLIDER_ZONES.TIME_3 + t * (SLIDER_ZONES.TIME_4 - SLIDER_ZONES.TIME_3);
  }

  return sign * seconds;
};

export const timeOffsetToSlider = (timeOffset: number): number => {
  const absSeconds = Math.abs(timeOffset);
  const sign = timeOffset >= 0 ? 1 : -1;

  let normalizedPos: number;

  if (absSeconds <= SLIDER_ZONES.TIME_1) {
    // Zone 1
    const t = absSeconds / SLIDER_ZONES.TIME_1;
    normalizedPos = t * SLIDER_ZONES.ZONE_1_END;
  } else if (absSeconds <= SLIDER_ZONES.TIME_2) {
    // Zone 2
    const t = (absSeconds - SLIDER_ZONES.TIME_1) / (SLIDER_ZONES.TIME_2 - SLIDER_ZONES.TIME_1);
    normalizedPos = SLIDER_ZONES.ZONE_1_END + t * (SLIDER_ZONES.ZONE_2_END - SLIDER_ZONES.ZONE_1_END);
  } else if (absSeconds <= SLIDER_ZONES.TIME_3) {
    // Zone 3
    const t = (absSeconds - SLIDER_ZONES.TIME_2) / (SLIDER_ZONES.TIME_3 - SLIDER_ZONES.TIME_2);
    normalizedPos = SLIDER_ZONES.ZONE_2_END + t * (SLIDER_ZONES.ZONE_3_END - SLIDER_ZONES.ZONE_2_END);
  } else {
    // Zone 4
    const t = (absSeconds - SLIDER_ZONES.TIME_3) / (SLIDER_ZONES.TIME_4 - SLIDER_ZONES.TIME_3);
    normalizedPos = SLIDER_ZONES.ZONE_3_END + t * (1 - SLIDER_ZONES.ZONE_3_END);
  }

  return sign * normalizedPos * 100;
};

export const formatTimeOffset = (seconds: number): string => {
  const sign = seconds >= 0 ? "+" : "";
  const absSeconds = Math.abs(seconds);

  const days = absSeconds / SECONDS_PER_DAY;
  const months = absSeconds / SECONDS_PER_MONTH;
  const years = absSeconds / SECONDS_PER_YEAR;

  if (absSeconds < 60 * 60) {
    // Less than 1 hour - show minutes
    const minutes = seconds / 60;
    return `${sign}${minutes.toFixed(0)}min`;
  } else if (days < 1) {
    // Less than 1 day - show hours
    return `${sign}${(seconds / (60 * 60)).toFixed(1)}h`;
  } else if (months < 1) {
    // Less than 1 month - show days
    return `${sign}${(seconds / SECONDS_PER_DAY).toFixed(1)}d`;
  } else if (years < 1) {
    // Less than 1 year - show months
    return `${sign}${(seconds / SECONDS_PER_MONTH).toFixed(1)}mo`;
  } else if (years < 10) {
    // Less than 10 years - show years with 2 decimals
    return `${sign}${(seconds / SECONDS_PER_YEAR).toFixed(2)}y`;
  }
  // 10+ years - show years with 1 decimal
  return `${sign}${(seconds / SECONDS_PER_YEAR).toFixed(1)}y`;
};

export interface VerticalTimeSliderProps {
  sliderPosition: number;
  timeOffset: number;
  onSliderChange: (position: number) => void;
  onReset: () => void;
  minTimeOffset?: number;
}

export const VerticalTimeSlider: React.FC<VerticalTimeSliderProps> = ({ sliderPosition, timeOffset, onSliderChange, onReset, minTimeOffset }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const minSliderPosition = minTimeOffset !== undefined ? Math.max(-100, timeOffsetToSlider(minTimeOffset)) : -100;

  const bitBangPosition = minTimeOffset !== undefined ? ((100 - minSliderPosition) / 200) * 100 : 100;

  const positionToValue = useCallback(
    (clientY: number): number => {
      if (!trackRef.current) return 0;
      const rect = trackRef.current.getBoundingClientRect();
      const relativeY = (clientY - rect.top) / rect.height;
      const value = (1 - relativeY) * 200 - 100;
      return Math.max(minSliderPosition, Math.min(100, value));
    },
    [minSliderPosition]
  );

  const handleStart = useCallback(
    (clientY: number) => {
      setIsDragging(true);
      onSliderChange(positionToValue(clientY));
    },
    [onSliderChange, positionToValue]
  );

  const handleMove = useCallback(
    (clientY: number) => {
      if (isDragging) {
        onSliderChange(positionToValue(clientY));
      }
    },
    [isDragging, onSliderChange, positionToValue]
  );

  const handleEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    handleStart(e.clientY);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    handleStart(e.touches[0].clientY);
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => handleMove(e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) handleMove(e.touches[0].clientY);
    };
    const onMouseUp = () => handleEnd();
    const onTouchEnd = () => handleEnd();

    if (isDragging) {
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
      window.addEventListener("touchmove", onTouchMove, { passive: true });
      window.addEventListener("touchend", onTouchEnd);
    }

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [isDragging, handleMove, handleEnd]);

  const thumbPosition = ((100 - sliderPosition) / 200) * 100;

  const zoneMarkers = [
    { position: 0, label: "+100年", side: "future" },
    { position: 12.5, label: "+1年", side: "future" },
    { position: 25, label: "+1月", side: "future" },
    { position: 37.5, label: "+1天", side: "future" },
    { position: 50, label: "现在", side: "center" },
    { position: 62.5, label: "-1天", side: "past" },
    { position: 75, label: "-1月", side: "past" },
    { position: 87.5, label: "-1年", side: "past" },
    { position: 100, label: "-100年", side: "past" },
  ];

  return (
    <div className="absolute right-0 top-0 h-full flex items-center z-50">
      <div className="h-full py-8 px-2 flex items-center">
        <div className="relative h-full mr-2 flex flex-col justify-between text-[10px] text-gray-400 select-none pointer-events-none">
          {zoneMarkers.map((marker, i) => (
            <span key={i} className={`absolute right-0 transform -translate-y-1/2 whitespace-nowrap ${marker.side === "center" ? "text-cyan-400 font-bold text-xs" : ""} ${marker.side === "future" ? "text-green-400/70" : ""} ${marker.side === "past" ? "text-orange-400/70" : ""}`} style={{ top: `${marker.position}%` }}>
              {marker.label}
            </span>
          ))}
          {minTimeOffset !== undefined && bitBangPosition < 100 && (
            <span className="absolute right-0 transform -translate-y-1/2 whitespace-nowrap text-red-400 font-bold text-[9px] tracking-tight" style={{ top: `${bitBangPosition}%` }}>
              BIT BANG
            </span>
          )}
        </div>

        <div className="relative h-full flex items-center">
          <div ref={trackRef} className="relative w-3 h-full bg-black/60 rounded-full cursor-pointer border border-white/20 touch-none" onMouseDown={onMouseDown} onTouchStart={onTouchStart}>
            <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none">
              <div className="absolute inset-x-0 h-1/4 bg-green-500/30 hover:bg-green-500/10" style={{ top: "0%" }} />
              <div className="absolute inset-x-0 h-1/4 bg-green-500/10 to-transparent" style={{ top: "25%" }} />
              <div className="absolute inset-x-0 h-1/4 bg-gradient-to-b from-transparent to-orange-500/10" style={{ top: "50%" }} />
              <div className="absolute inset-x-0 h-1/4 bg-orange-500/10 hover:bg-orange-500/30" style={{ top: "75%" }} />
            </div>

            <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-cyan-400/60 pointer-events-none" />

            {[12.5, 25, 37.5, 62.5, 75, 87.5].map((pos) => (
              <div key={pos} className={`absolute left-0 right-0 pointer-events-none ${pos === 25 || pos === 75 ? "h-0.5 bg-white/30" : "h-px bg-white/15"}`} style={{ top: `${pos}%` }} />
            ))}

            {minTimeOffset !== undefined && bitBangPosition < 100 && <div className="absolute left-0 right-0 h-1 bg-red-500/80 pointer-events-none shadow-[0_0_8px_rgba(239,68,68,0.6)]" style={{ top: `${bitBangPosition}%` }} title="Bit Bang - Beginning of simulation" />}

            <div className={`absolute left-1/2 -translate-x-1/2 w-6 h-6 rounded-full transition-transform ${isDragging ? "scale-125" : "scale-100"}`} style={{ top: `calc(${thumbPosition}% - 12px)` }}>
              <div className="absolute inset-0 rounded-full bg-cyan-400/40 blur-sm" />
              <div className="absolute inset-1 rounded-full bg-cyan-400 hover:bg-cyan-600 border-2 border-white/50 shadow-lg" />
              <div className="absolute inset-2 rounded-full bg-gradient-to-br from-white/40 to-transparent" />
            </div>
          </div>

          <div className="ml-2 flex flex-col items-center gap-2 h-full justify-center">
            <div
              className={`flex items-center justify-center text-xs font-mono font-bold rounded px-1 py-0.5 whitespace-nowrap ${timeOffset > 0 ? "text-green-400 bg-green-900/30" : timeOffset < 0 ? "text-orange-400 bg-orange-900/30" : "text-cyan-400 bg-cyan-900/30"}`}
              style={{
                writingMode: "vertical-rl",
                textOrientation: "mixed",
                transform: "rotate(180deg)",
                minHeight: "52px",
              }}
            >
              {formatTimeOffset(timeOffset)}
            </div>
            <button
              onClick={onReset}
              className={`text-[9px] rounded transition-all border whitespace-nowrap px-1 py-0.5 ${timeOffset !== 0 ? "bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-300 border-cyan-500/30" : "bg-transparent text-transparent border-transparent pointer-events-none"}`}
              style={{
                writingMode: "vertical-rl",
                textOrientation: "mixed",
                transform: "rotate(180deg)",
                minHeight: "32px",
              }}
            >
              重置
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VerticalTimeSlider;

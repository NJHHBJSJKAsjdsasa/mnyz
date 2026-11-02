// atlas-ui/react/static/js/Components/FuelBars.tsx
// Top-of-page resource strip: twelve 1px bars that expand on hover (desktop) or
// on the +/- tab (mobile). Pure display — values come from useShipResources.

import React, { useState } from "react";
import { useShipResources } from "../Hooks/useShipResources.ts";
import { FUEL_BARS } from "./fuel/resourceConfig.tsx";
import { FuelBar } from "./fuel/FuelBar.tsx";

const FuelBars: React.FC = () => {
  const { resources, maxStorage } = useShipResources();
  const [isExpanded, setIsExpanded] = useState(false);
  const [hoveredResource, setHoveredResource] = useState<string | null>(null);
  const [isMobileToggled, setIsMobileToggled] = useState(false);

  const shouldExpand = isExpanded || isMobileToggled;

  const handleMobileToggle = () => {
    setIsMobileToggled(!isMobileToggled);
    setHoveredResource(null);
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      <div
        className={`relative w-full transition-all duration-500 ease-out ${shouldExpand ? "h-14 sm:h-20" : "h-1 sm:h-1.5"}`}
        onMouseEnter={() => setIsExpanded(true)}
        onMouseLeave={() => {
          setIsExpanded(false);
          setHoveredResource(null);
        }}
      >
        <div className="relative h-full flex gap-px">
          {FUEL_BARS.map((spec) => (
            <FuelBar
              key={spec.key}
              spec={spec}
              value={resources[spec.key]}
              maxStorage={maxStorage}
              expanded={shouldExpand}
              hovered={hoveredResource === spec.name}
              onHover={setHoveredResource}
            />
          ))}
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: "var(--atlas-line-strong)" }} />
      </div>

      <div className="sm:hidden absolute top-full right-2 z-40">
        <div
          onClick={handleMobileToggle}
          className={`border-l border-r border-b border-[var(--atlas-line-strong)] w-6 h-6 cursor-pointer
            transition-colors duration-200 flex items-center justify-center relative overflow-hidden
            ${shouldExpand ? "opacity-100" : "opacity-70"}`}
          style={{ background: "var(--atlas-plate)" }}
        >
          <div className="relative z-10" style={{ color: "var(--atlas-signal)" }}>
            <div className={`text-sm font-bold transition-all duration-300 transform ${shouldExpand ? "rotate-180 scale-110" : "rotate-0 scale-100"}`}>{shouldExpand ? "−" : "+"}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FuelBars;

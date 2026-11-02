// atlas-ui/react/static/js/Components/PeriodicElement.tsx
import React from "react";
import { ELEMENT_SYMBOLS, getRarityColor } from "../Utils/ElementSymbols.tsx";
import { ELEMENT_RESOURCE_VALUES, getElementRarityTier } from "../Utils/ElementResourceValues.tsx";
import AntimatterIcon from "../Icons/AntimatterIcon.tsx";
import DeuteriumIcon from "../Icons/DeuteriumIcon.tsx";
import Element115Icon from "../Icons/Element115Icon.tsx";

interface PeriodicElementProps {
  elementName: string;
  expanded?: boolean;
  showResources?: boolean;
  className?: string;
}

const PeriodicElement: React.FC<PeriodicElementProps> = ({ elementName, expanded = false, showResources = false, className = "" }) => {
  const elementInfo = ELEMENT_SYMBOLS[elementName];
  const resourceValues = ELEMENT_RESOURCE_VALUES[elementName];
  const rarityTier = getElementRarityTier(elementName);

  if (!elementInfo) {
    return <span className={`inline-flex items-center text-xs bg-gray-500/20 text-gray-300 px-1.5 py-0.5 rounded border border-gray-500/30 ${className}`}>{elementName}</span>;
  }

  const rarityColorClass = getRarityColor(rarityTier);
  const isException = rarityTier === "Exception";

  if (expanded) {
    return (
      <div className={`flex flex-col p-2 rounded-lg border ${rarityColorClass} ${isException ? "relative overflow-hidden" : ""} shadow-lg transition-all duration-200 hover:scale-105 ${className}`}>
        {isException && <div className="absolute inset-0 bg-cyan-400/10 animate-pulse pointer-events-none rounded-lg"></div>}

        <div className={`flex flex-col items-center justify-center h-12 w-12 mx-auto mb-2 ${isException ? "bg-black/30 border-cyan-400/30" : "bg-black/20"} rounded border border-white/10 relative z-10`}>
          <div className={`text-xs font-bold leading-none ${isException ? "text-cyan-100" : ""}`}>{elementInfo.symbol}</div>
          <div className={`text-[8px] opacity-70 leading-none mt-0.5 ${isException ? "text-cyan-200" : ""}`}>{elementInfo.atomicNumber}</div>
        </div>

        <div className={`text-xs font-medium text-center leading-tight mb-1 relative z-10 ${isException ? "text-cyan-100 font-bold" : ""}`}>{elementName}</div>

        <div className={`text-[10px] text-center mb-2 relative z-10 ${isException ? "text-cyan-200 font-semibold animate-pulse" : "opacity-80"}`}>{rarityTier}</div>

        {showResources && resourceValues && (
          <div className="space-y-1">
            {resourceValues.antimatter > 0 && (
              <div className="flex justify-between text-[10px] opacity-90">
                <span className="text-purple-300 flex items-center gap-1">
                  <AntimatterIcon size={10} color="currentColor" />
                  反物质:
                </span>
                <span className="font-mono">{resourceValues.antimatter}</span>
              </div>
            )}
            {resourceValues.element115 > 0 && (
              <div className="flex justify-between text-[10px] opacity-90">
                <span className="text-cyan-300 flex items-center gap-1">
                  <Element115Icon size={10} color="currentColor" />
                  元素115:
                </span>
                <span className="font-mono">{resourceValues.element115}</span>
              </div>
            )}
            {resourceValues.deuterium > 0 && (
              <div className="flex justify-between text-[10px] opacity-90">
                <span className="text-orange-300 flex items-center gap-1">
                  <DeuteriumIcon size={10} color="currentColor" />
                  氘:
                </span>
                <span className="font-mono">{resourceValues.deuterium}</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`inline-flex flex-col items-center justify-center h-10 w-10 rounded border ${rarityColorClass} ${isException ? "relative overflow-hidden" : ""} transition-all duration-200 hover:scale-110 cursor-pointer ${className}`}>
      {isException && <div className="absolute inset-0 bg-cyan-400/20 hover:bg-purple-500/20 animate-pulse pointer-events-none rounded"></div>}
      <div className={`text-xs font-bold leading-none relative z-10 ${isException ? "text-cyan-100" : ""}`}>{elementInfo.symbol}</div>
      <div className={`text-[8px] opacity-70 leading-none mt-0.5 relative z-10 ${isException ? "text-cyan-200" : ""}`}>{elementInfo.atomicNumber}</div>
    </div>
  );
};

export default PeriodicElement;

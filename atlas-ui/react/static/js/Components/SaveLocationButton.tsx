// atlas-ui/react/static/js/Components/SaveLocationButton.tsx
import React, { useState, useEffect } from "react";
import { LocationBookmarks } from "../Utils/LocationBookmarks.tsx";
import { StargateGenerator } from "../Utils/StargateGenerator.tsx";
import { UniverseDetection } from "../Utils/UniverseDetection.tsx";

interface SaveLocationButtonProps {
  type: "galaxy" | "system" | "planet";
  name: string;
  coordinates: string;
  systemIndex?: number;
  planetName?: string;
  className?: string;
}

const SaveLocationButton: React.FC<SaveLocationButtonProps> = ({ type, name, coordinates, systemIndex, planetName, className = "" }) => {
  const [isSaved, setIsSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isDifferentPage, setIsDifferentPage] = useState(false);
  const [isRemoteUniverse, setIsRemoteUniverse] = useState(false);

  const generateStargateUrl = (): string => {
    try {
      const galaxyCoords = coordinates.split(",").map(Number);
      const currentPage = StargateGenerator.getCurrentPage();

      switch (type) {
        case "galaxy":
          return StargateGenerator.generateGalaxyUrl(galaxyCoords, currentPage);
        case "system":
          if (systemIndex !== undefined) {
            return StargateGenerator.generateSystemUrl(galaxyCoords, systemIndex, currentPage);
          }
          break;
        case "planet":
          if (systemIndex !== undefined && planetName) {
            return StargateGenerator.generatePlanetUrl(galaxyCoords, systemIndex, planetName, currentPage);
          }
          break;
      }

      return window.location.pathname;
    } catch (error) {
      return window.location.pathname;
    }
  };

  useEffect(() => {
    const stargateUrl = generateStargateUrl();
    const exists = LocationBookmarks.isLocationSaved(stargateUrl);
    const differentPage = LocationBookmarks.isGalaxyLocationSavedDifferentPage(stargateUrl, type);

    setIsSaved(exists);
    setIsDifferentPage(differentPage);
  }, [coordinates, systemIndex, planetName, type]);

  useEffect(() => {
    const checkUniverseType = () => {
      setIsRemoteUniverse(UniverseDetection.isRemoteUniverse());
    };

    checkUniverseType();
    // One-shot on purpose (2026-10-29): `#data-universe-config` is a static
    // server-rendered element, so this value cannot change without a full page
    // load — and that remounts the component anyway. The old 1 s timer re-parsed
    // the same JSON 86,400 times a day for a value that never moved.
  }, []);

  const handleSaveLocation = async () => {
    try {
      const stargateUrl = generateStargateUrl();

      const saved = await LocationBookmarks.saveLocation({
        name,
        type,
        stargateUrl,
      });

      if (saved) {
        setIsLoading(true);

        setTimeout(() => {
          setIsSaved(true);
          setIsLoading(false);
        }, 300);
      } else {
      }
    } catch (error) {
      setIsLoading(false);
    }
  };

  const formatName = (name: string) => {
    return name.replace(/_/g, " ");
  };

  return (
    <>
      <style>{`
        @keyframes border-pulse {
          0%, 100% { border-color: rgba(34, 197, 94, 0.4); }
          50% { border-color: rgba(34, 197, 94, 0.8); }
        }
      `}</style>
      <button
        onClick={handleSaveLocation}
        disabled={isSaved || isLoading || isRemoteUniverse}
        className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded transition-all duration-200 text-[10px] font-medium h-[21px] box-border ${
          isRemoteUniverse
            ? "bg-red-500/20 border border-red-500/50 text-red-400 cursor-not-allowed opacity-60"
            : isSaved
            ? "bg-green-500/20 border border-green-500/50 text-green-400 cursor-default"
            : isLoading
            ? "bg-blue-500/20 border border-blue-500/50 text-blue-400 cursor-wait"
            : isDifferentPage
            ? "bg-plate-2 hover:bg-[var(--atlas-line-strong)] border text-white hover:text-green-300 border-green-500/60 hover:border-green-400/80"
            : "bg-plate-2 hover:bg-[var(--atlas-line-strong)] border border-white/20 hover:border-white/40 text-white hover:text-blue-300"
        } ${className}`}
        style={
          isDifferentPage && !isRemoteUniverse
            ? {
                animation: "border-pulse 2s infinite",
                borderColor: "rgba(34, 197, 94, 0.6)",
              }
            : {}
        }
        title={
          isRemoteUniverse
            ? "Cannot save locations from remote universes - return to local universe first"
            : isSaved
            ? "Location saved"
            : isDifferentPage
            ? `Save this page of ${formatName(name)} (you have another page saved)`
            : `Save ${formatName(name)} to bookmarks`
        }
      >
        {isRemoteUniverse ? (
          <>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
            <span className="text-[10px] uppercase">Remote</span>
          </>
        ) : isLoading ? (
          <>
            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="text-[10px] uppercase">Saving...</span>
          </>
        ) : isSaved ? (
          <>
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
            </svg>
            <span className="text-[10px] uppercase">Saved</span>
          </>
        ) : (
          <>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-[10px] uppercase">Save</span>
          </>
        )}
      </button>
    </>
  );
};

export default SaveLocationButton;

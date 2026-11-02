// Components/spaceship/useSpaceshipPanel.ts — state, effects and actions of the
// spaceship drawer, extracted from `SpaceshipPanel.tsx` (2026-10-29).
//
// The component was 907 lines: fifteen `useState`, six effects, five handlers and
// three tabs of markup in one scope. Only the first two groups moved here; the
// markup stayed byte-for-byte, which is why this hook returns the exact same
// names — the JSX below did not change.
//
// Sits at 15 s / 30 s intervals rather than the shared 1 s clock: these readouts
// (passive accumulation, bookmark cooldowns) are minute-scale, so a per-second
// repaint would be pure waste.

import React, { useEffect, useRef, useState } from "react";
import { DailyChallenges, DailyChallengesManager } from "../../Utils/DailyChallenges.tsx";
import { DataExportImport } from "../../Utils/DataExportImport.tsx";
import { LocationBookmarks, type SavedLocation } from "../../Utils/LocationBookmarks.tsx";
import { ResourceEventManager } from "../../Utils/ResourceEventManager.tsx";
import { ServerApi } from "../../Utils/ServerApi.tsx";
import {
  SpaceshipResource,
  SpaceshipResourceManager,
  SpaceshipUpgrade,
  TravelCost,
} from "../../Utils/SpaceshipResources.tsx";
import { UnifiedSpaceshipStorage } from "../../Utils/UnifiedSpaceshipStorage.tsx";
import { UniverseDetection } from "../../Utils/UniverseDetection.tsx";
import { getStorageStats } from "../../Utils/VisitHistory.tsx";

export const useSpaceshipPanel = () => {
  const serverMode = ServerApi.mode() === "server";
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [activeTab, setActiveTab] = useState<"stats" | "ship" | "saved">("stats");
  const [stats, setStats] = useState<any>(null);
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>([]);
  const [locationStats, setLocationStats] = useState<any>(null);
  const [dailyChallenges, setDailyChallenges] = useState<DailyChallenges | null>(null);
  const [spaceshipResources, setSpaceshipResources] = useState<SpaceshipResource>(() => SpaceshipResourceManager.getResources());
  const [spaceshipUpgrade, setSpaceshipUpgrade] = useState<SpaceshipUpgrade>({ level: 1, efficiency: 1.0, range: 300, storage: 500, multiplier: 1.0 });
  const [upgradeCost, setUpgradeCost] = useState<TravelCost>({ antimatter: 0, element115: 0, deuterium: 0 });
  const [passiveGeneration, setPassiveGeneration] = useState<any>({ antimatter: 0, element115: 0, deuterium: 0, sources: { planets: 0, systems: 0, galaxies: 0 } });
  const [baseGeneration, setBaseGeneration] = useState<any>({ antimatter: 0, element115: 0, deuterium: 0, sources: { planets: 0, systems: 0, galaxies: 0 } });
  const [showCollectionPopup, setShowCollectionPopup] = useState<boolean>(false);
  const [isCollectionClosing, setIsCollectionClosing] = useState<boolean>(false);
  const [, forceUpdate] = useState({});
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<boolean>(false);
  const [isRemoteUniverse, setIsRemoteUniverse] = useState<boolean>(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const collectionModalRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setStats(getStorageStats());
      setSavedLocations(LocationBookmarks.getLocations());
      setLocationStats(LocationBookmarks.getLocationStats());

      const challenges = DailyChallengesManager.updateProgress();
      setDailyChallenges(challenges);

      setSpaceshipResources(SpaceshipResourceManager.getResources());
      setSpaceshipUpgrade(SpaceshipResourceManager.getUpgrade());
      const upgrade = SpaceshipResourceManager.getUpgrade();
      setUpgradeCost(SpaceshipResourceManager.getUpgradeCost(upgrade.level));

      const passiveInfo = SpaceshipResourceManager.getAccumulatedResourcesWithLimit();
      setPassiveGeneration(passiveInfo);

      const baseGenerationInfo = SpaceshipResourceManager.calculatePassiveGeneration();
      setBaseGeneration(baseGenerationInfo);

      setIsRemoteUniverse(UniverseDetection.isRemoteUniverse());
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const checkUniverseType = () => {
      setIsRemoteUniverse(UniverseDetection.isRemoteUniverse());
    };

    // One-shot on purpose (2026-10-29): `#data-universe-config` is a static
    // server-rendered element, so this value cannot change without a full page
    // load — and that remounts the component anyway. The old 1 s timer re-parsed
    // the same JSON 86,400 times a day for a value that never moved.
    // Re-read on each open is enough; the timer used to keep firing while closed.
    checkUniverseType();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const updatePassiveDisplay = () => {
      const passiveInfo = SpaceshipResourceManager.getAccumulatedResourcesWithLimit();
      setPassiveGeneration(passiveInfo);

      const baseGenerationInfo = SpaceshipResourceManager.calculatePassiveGeneration();
      setBaseGeneration(baseGenerationInfo);
    };

    const updateSpaceshipResources = () => {
      setSpaceshipResources(SpaceshipResourceManager.getResources());
    };

    const interval = setInterval(updatePassiveDisplay, 15000);

    const unsubscribeResources = ResourceEventManager.subscribe("resources_updated", updateSpaceshipResources);

    let cooldownInterval: NodeJS.Timeout | null = null;
    if (activeTab === "saved") {
      cooldownInterval = setInterval(() => {
        forceUpdate({});
      }, 30000);
    }

    return () => {
      clearInterval(interval);
      if (cooldownInterval) clearInterval(cooldownInterval);
      unsubscribeResources();
    };
  }, [isOpen, activeTab]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
    }, 300);
  };

  const upgradeShip = async () => {
    if (serverMode) {
      try {
        const result = await ServerApi.upgradeShip();
        UnifiedSpaceshipStorage.applyServerLevel(Number(result?.applied?.level || 1));
        const balances = result?.balances || {};
        const current = SpaceshipResourceManager.getResources();
        const next = { ...current };
        Object.entries(balances).forEach(([code, amount]) => {
          if (code in next) (next as any)[code] = Number(amount);
        });
        UnifiedSpaceshipStorage.setResources(next);
        setSpaceshipResources(SpaceshipResourceManager.getResources());
        const upgrade = SpaceshipResourceManager.getUpgrade();
        setSpaceshipUpgrade(upgrade);
        setUpgradeCost(SpaceshipResourceManager.getUpgradeCost(upgrade.level));
        setPassiveGeneration(SpaceshipResourceManager.getAccumulatedResourcesWithLimit());
        ResourceEventManager.emit("resources_updated");
      } catch (error) {
        console.warn("[atlas-server] ship upgrade failed", error);
      }
      return;
    }

    if (SpaceshipResourceManager.upgradeShip()) {
      setSpaceshipResources(SpaceshipResourceManager.getResources());
      setSpaceshipUpgrade(SpaceshipResourceManager.getUpgrade());
      const upgrade = SpaceshipResourceManager.getUpgrade();
      setUpgradeCost(SpaceshipResourceManager.getUpgradeCost(upgrade.level));
      setPassiveGeneration(SpaceshipResourceManager.getAccumulatedResourcesWithLimit());
      ResourceEventManager.emit("resources_updated");
    }
  };

  const handleServerImport = async () => {
    if (!window.confirm("将本地存档导入服务端？每个角色只能导入一次，导入后本地仍保留副本。")) return;
    try {
      const result = await ServerApi.importLocalSave();
      setImportSuccess(true);
      console.info("[atlas-server] imported", result?.imported);
      setTimeout(() => setImportSuccess(false), 3000);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Server import failed");
      setTimeout(() => setImportError(null), 5000);
    }
  };

  const handleExport = async () => {
    try {
      await DataExportImport.downloadExport();
    } catch (error) {
      console.error("Export failed:", error);
      setImportError("Export failed. Please try again.");
      setTimeout(() => setImportError(null), 3000);
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".atl")) {
      setImportError("Please select a valid .atl file");
      setTimeout(() => setImportError(null), 3000);
      return;
    }

    try {
      await DataExportImport.importData(file);
      setImportSuccess(true);
      setTimeout(() => setImportSuccess(false), 3000);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Import failed");
      setTimeout(() => setImportError(null), 3000);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleToggle = () => {
    if (isOpen) {
      handleClose();
    } else {
      setIsOpen(true);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isOpen && !isClosing && panelRef.current && !panelRef.current.contains(event.target as Node)) {
        handleClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, isClosing]);

  useEffect(() => {
    const handleCollectionModalClickOutside = (event: MouseEvent) => {
      if (showCollectionPopup && !isCollectionClosing && collectionModalRef.current && !collectionModalRef.current.contains(event.target as Node)) {
        closeCollectionPopup();
      }
    };

    document.addEventListener("mousedown", handleCollectionModalClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleCollectionModalClickOutside);
    };
  }, [showCollectionPopup, isCollectionClosing]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatLocationName = (name: string) => {
    return name.replace(/_/g, " ");
  };

  const handleRemoveLocation = (e: React.MouseEvent, locationId: string) => {
    e.stopPropagation();
    LocationBookmarks.removeLocation(locationId);
    setSavedLocations(LocationBookmarks.getLocations());
    setLocationStats(LocationBookmarks.getLocationStats());
  };

  const closeCollectionPopup = () => {
    setIsCollectionClosing(true);
    setTimeout(() => {
      setShowCollectionPopup(false);
      setIsCollectionClosing(false);
    }, 300);
  };

  return {
    // state
    serverMode,
    isOpen,
    isClosing,
    setIsOpen,
    activeTab,
    setActiveTab,
    stats,
    savedLocations,
    locationStats,
    dailyChallenges,
    spaceshipResources,
    spaceshipUpgrade,
    upgradeCost,
    passiveGeneration,
    baseGeneration,
    showCollectionPopup,
    setShowCollectionPopup,
    isCollectionClosing,
    setSpaceshipResources,
    setPassiveGeneration,
    importError,
    importSuccess,
    isRemoteUniverse,
    // refs
    panelRef,
    collectionModalRef,
    fileInputRef,
    // actions
    handleClose,
    handleToggle,
    upgradeShip,
    handleServerImport,
    handleExport,
    handleImport,
    handleRemoveLocation,
    closeCollectionPopup,
    // formatting
    formatBytes,
    formatLocationName,
  };
};

export type PanelBag = ReturnType<typeof useSpaceshipPanel>;

export default useSpaceshipPanel;

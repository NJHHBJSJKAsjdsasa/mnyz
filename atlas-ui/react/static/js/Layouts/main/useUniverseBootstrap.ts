// Layouts/main/useUniverseBootstrap.ts — one-time boot work of the main page.
//
// Pulled out of `__main__.tsx` (2026-10-29). Before this the layout mixed four
// unrelated concerns: storage migration, the server bridge, universe config
// parsing and the first-visit warp intro. They all happen exactly once, so they
// belong in a hook rather than in the middle of a 460-line component.

import { useCallback, useEffect, useState } from "react";
import { ServerBridge } from "../../Utils/ServerBridge.tsx";
import { UniverseDetection } from "../../Utils/UniverseDetection.tsx";
import { UnifiedSpaceshipStorage } from "../../Utils/UnifiedSpaceshipStorage.tsx";

export interface UniverseConfig {
  remote: boolean;
  seed_name: string;
  node_id: string;
  seed_str: string;
  cosmic_origin_time: number;
}

export interface SeedData {
  primordial_seed: string;
  sha256_seed: string;
  decimal_seed: string;
  cosmic_origin_time?: number;
  cosmic_origin_datetime?: string;
}

export interface UniverseBootstrap {
  isRemoteUniverse: boolean;
  universeConfig: UniverseConfig | null;
  seedData: SeedData | null;
  showWarpReveal: boolean;
  finishWarpReveal: () => void;
}

export const useUniverseBootstrap = (): UniverseBootstrap => {
  const [isRemoteUniverse, setIsRemoteUniverse] = useState(false);
  const [universeConfig, setUniverseConfig] = useState<UniverseConfig | null>(null);
  const [seedData, setSeedData] = useState<SeedData | null>(null);
  const [showWarpReveal, setShowWarpReveal] = useState(false);

  useEffect(() => {
    UnifiedSpaceshipStorage.migrateFromOldStorage();
    ServerBridge.start();

    setIsRemoteUniverse(UniverseDetection.isRemoteUniverse());

    // `#data-universe-config` is static server-rendered state: one read on mount
    // is the whole job (a 1 s poll of it used to burn 86k JSON.parse a day).
    const element = document.getElementById("data-universe-config");
    if (element) {
      try {
        setUniverseConfig(JSON.parse(element.textContent || "{}") as UniverseConfig);
      } catch (error) {
        console.error("Error parsing universe config:", error);
      }
    }

    // The intro plays once per browser. It needs the seed from the API, so the
    // fetch only happens when the flag is missing.
    if (!localStorage.getItem("atlasIntroSeen")) {
      fetch("/api/universe/config")
        .then((response) => response.json())
        .then((data) => {
          if (!data.success) return;
          setSeedData({
            primordial_seed: data.seed_str,
            sha256_seed: data.seed_hash,
            decimal_seed: data.seed_decimal,
            cosmic_origin_time: data.cosmic_origin_time,
            cosmic_origin_datetime: data.cosmic_origin_datetime,
          });
          setShowWarpReveal(true);
        })
        .catch((error) => console.error("Error fetching universe config:", error));

      localStorage.setItem("atlasIntroSeen", "true");
    }
  }, []);

  const finishWarpReveal = useCallback(() => setShowWarpReveal(false), []);

  return { isRemoteUniverse, universeConfig, seedData, showWarpReveal, finishWarpReveal };
};

export default useUniverseBootstrap;

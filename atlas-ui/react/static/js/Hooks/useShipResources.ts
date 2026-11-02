// atlas-ui/react/static/js/Hooks/useShipResources.ts
// Wallet + storage cap for display-only surfaces (top fuel bars, status strips).
//
// The old 5s poll was a safety net for one gap only: `upgradeShip` /
// `applyServerLevel` moved the storage cap without emitting `resources_updated`
// (both do now), plus writes made in another tab. It never picked up server-side
// changes — `getResources()` reads localStorage, which only hydration writes.
// So: subscribe to the event, listen for cross-tab `storage`, done.

import { useEffect, useState } from "react";
import { SpaceshipResourceManager, type SpaceshipResource } from "../Utils/SpaceshipResources.tsx";
import { ResourceEventManager } from "../Utils/ResourceEventManager.tsx";

export interface ShipResourcesView {
  resources: SpaceshipResource;
  maxStorage: number;
}

const snapshot = (): ShipResourcesView => ({
  resources: SpaceshipResourceManager.getResources(),
  maxStorage: SpaceshipResourceManager.getUpgrade().storage,
});

export function useShipResources(): ShipResourcesView {
  const [view, setView] = useState<ShipResourcesView>(snapshot);

  useEffect(() => {
    const sync = () => setView(snapshot());
    // Another tab wrote storage: no event crosses tabs, but `storage` does.
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith("_atlas")) sync();
    };
    const unsubscribe = ResourceEventManager.subscribe("resources_updated", sync);
    window.addEventListener("storage", onStorage);
    sync();
    return () => {
      unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return view;
}

export default useShipResources;

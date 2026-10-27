// atlas-ui/react/static/js/Utils/ServerBridge.tsx
// Starts shadow writes and exposes the feature flags for the cutover phases.

import { FactionSystem } from "./FactionSystem.tsx";
import { HullSystem } from "./HullSystem.tsx";
import { ResourceEventManager } from "./ResourceEventManager.tsx";
import { SectorSystem } from "./SectorSystem.tsx";
import { ServerApi } from "./ServerApi.tsx";
import { TechSystem } from "./TechSystem.tsx";
import { UnifiedSpaceshipStorage } from "./UnifiedSpaceshipStorage.tsx";

const HYDRATED_KEY = "_atlasServerHydrated";
const SERVER_KEYS = new Set([
  "_atlasServerBase",
  "_atlasServerMode",
  "_atlasServerToken",
  "_atlasServerTokenExp",
  "_atlasServerPlayer",
  "_atlasServerUniverse",
  "_atlasServerUniverseUsed",
  "_atlasServerDeviceUsed",
  "_atlasServerAccountStatus",
  "_atlasDeviceId",
]);

export class ServerBridge {
  private static started = false;

  static start(): void {
    if (this.started) return;
    if (ServerApi.mode() === "off") return;
    this.started = true;

    if (ServerApi.mode() === "shadow") {
      void ServerApi.shadowSync("startup");
      ResourceEventManager.subscribe("resources_updated", () => ServerApi.scheduleShadow("resources"));
      window.setInterval(() => ServerApi.scheduleShadow("heartbeat"), 60_000);
    }

    if (ServerApi.mode() === "server" && ServerApi.accountStatus() !== "guest") {
      void this.hydrateFromServer();
      void this.syncFactions();
      window.setInterval(() => void this.syncFactions(), 60_000);
    }

    if (ServerApi.mode() === "server" && ServerApi.accountStatus() === "guest") {
      // No guest/local gameplay in server mode: wipe gameplay caches until login.
      ServerBridge.clearLocalGameplay();
      return;
    }

    void ServerApi.request("/api/v1/features")
      .then((data) => console.info("[atlas-server] feature flags", data?.flags))
      .catch((error) => console.warn("[atlas-server] flags unavailable", error));
  }

  /** Server is the source of truth: replace local gameplay caches, never merge. */
  static async hydrateFromServer(): Promise<void> {
    try {
      const state = await ServerApi.state();
      const playerId = String(state?.player?.id || "");
      if (localStorage.getItem(HYDRATED_KEY) !== playerId) {
        ServerBridge.clearLocalGameplay();
      }

      const resources = { ...(state.resources || {}) };
      delete resources.storage_cap;
      UnifiedSpaceshipStorage.setResources(resources as any);
      UnifiedSpaceshipStorage.applyServerLevel(Number(state.ship?.level || 1));
      UnifiedSpaceshipStorage.setShipModules(
        (state.ship?.modules || []).map((row: any) => ({
          id: row.code,
          level: Number(row.level || 0),
          oc: Number(row.overclock || 0),
        })),
      );
      HullSystem.applyServerHull(Number(state.assets?.hull ?? 100));
      Object.entries(state.progress?.tech || {}).forEach(([branch, level]) => {
        for (let index = 1; index <= Number(level); index += 1) {
          TechSystem.applyServerUnlock(`${branch}-${index}`);
        }
      });
      (state.progress?.sectors || []).forEach((key: string) => SectorSystem.applyServerUnlock(key));
      localStorage.setItem(HYDRATED_KEY, playerId);
    } catch (error) {
      console.warn("[atlas-server] state hydrate failed", error);
    }
  }

  static async syncFactions(): Promise<void> {
    try {
      const data = await ServerApi.factions();
      FactionSystem.applyServerRep(data?.reputation || {});
    } catch (error) {
      console.warn("[atlas-server] factions sync failed", error);
    }
  }

  private static clearLocalGameplay(): void {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith("_atlas") || SERVER_KEYS.has(key) || key.startsWith("_atlasDeviceId"))
        continue;
      localStorage.removeItem(key);
    }
  }
}

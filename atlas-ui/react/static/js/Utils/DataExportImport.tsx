// atlas-ui/react/static/js/Utils/DataExportImport.tsx
// Save-file export/import. v3 exports every atlas-owned localStorage key verbatim
// (encoded name → encoded value), so new systems are covered without touching this
// file. Old v2 files (four fixed keys) still import.

import { ATLAS_KEYS, getEncodedStorageKey, getUniverseInfo } from "./b64.tsx";

export interface ExportData {
  version: string;
  timestamp: number;
  currentUniverse?: {
    isRemote: boolean;
    nodeId: string | null;
    seedName?: string;
  };
  /** v3 payload: encoded storage key → stored value. */
  keys?: { [encodedKey: string]: string };
  hashes?: { [encodedKey: string]: string };
  /** v2 payload (legacy). */
  data?: {
    spaceship?: string | null;
    archive?: string | null;
    archives?: { [nodeId: string]: string };
    dailyChallenges?: string | null;
    locations?: string | null;
  };
  checksum: string;
}

const ATLAS_KEY_PATTERN = /^_{1,2}atlas/i;

const decodeStorageKey = (rawKey: string): string => {
  try {
    return decodeURIComponent(atob(rawKey));
  } catch (error) {
    return rawKey;
  }
};

const isAtlasKey = (rawKey: string): boolean => {
  const decoded = decodeStorageKey(rawKey);
  return ATLAS_KEY_PATTERN.test(decoded) || decoded === ATLAS_KEYS.ARCHIVE || decoded.startsWith(ATLAS_KEYS.ARCHIVE);
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

const base64ToText = (base64: string): string => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
};

export class DataExportImport {
  private static readonly VERSION = "2.10.434";

  private static generateFallbackHash(data: string): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, "0");
  }

  private static async generateHash(data: string): Promise<string> {
    if (!crypto || !crypto.subtle || !crypto.subtle.digest) {
      console.warn("crypto.subtle not available, using fallback hash");
      return this.generateFallbackHash(data);
    }

    const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
    return Array.from(new Uint8Array(hashBuffer))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  private static async verifyHash(data: string, expectedHash: string): Promise<boolean> {
    const calculatedHash = await this.generateHash(data);
    if (expectedHash === calculatedHash) return true;

    if (expectedHash.length === 8 || calculatedHash.length === 8) {
      if (!crypto || !crypto.subtle || !crypto.subtle.digest) return true;
      return expectedHash === this.generateFallbackHash(data);
    }

    return false;
  }

  /** Snapshot every atlas key (spaceship, archive, and all the newer systems). */
  static async exportAllData(): Promise<string> {
    const keys: { [encodedKey: string]: string } = {};
    const hashes: { [encodedKey: string]: string } = {};

    for (let i = 0; i < localStorage.length; i++) {
      const rawKey = localStorage.key(i);
      if (!rawKey || !isAtlasKey(rawKey)) continue;

      const value = localStorage.getItem(rawKey);
      if (!value) continue;

      keys[rawKey] = value;
      hashes[rawKey] = await this.generateHash(value);
    }

    const payload = {
      version: this.VERSION,
      timestamp: Date.now(),
      currentUniverse: getUniverseInfo(),
      keys,
      hashes,
    };

    const checksum = await this.generateHash(JSON.stringify(payload));
    const json = JSON.stringify({ ...payload, checksum });
    return bytesToBase64(new TextEncoder().encode(json));
  }

  static async downloadExport(): Promise<void> {
    try {
      const exportedData = await this.exportAllData();
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const blob = new Blob([exportedData], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);

      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `atlas-data-saved-${timestamp}.atl`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error exporting data:", error);
      throw new Error("Failed to export data");
    }
  }

  static async importData(file: File): Promise<void> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async (event) => {
        try {
          const parsed = JSON.parse(base64ToText((event.target?.result as string) ?? ""));
          await DataExportImport.applyImport(parsed);
          window.location.reload();
          resolve();
        } catch (error) {
          console.error("Error importing data:", error);
          reject(new Error(error instanceof Error ? error.message : "Failed to import data. Please ensure the file is valid."));
        }
      };

      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsText(file);
    });
  }

  private static async applyImport(parsed: any): Promise<void> {
    if (!parsed || typeof parsed !== "object" || typeof parsed.version !== "string" || typeof parsed.checksum !== "string") {
      throw new Error("Invalid import data format");
    }

    const { checksum, ...withoutChecksum } = parsed;
    if (!(await this.verifyHash(JSON.stringify(withoutChecksum), checksum))) {
      throw new Error("Data integrity check failed. File may have been tampered with.");
    }

    if (parsed.keys && typeof parsed.keys === "object") {
      await this.applyKeyMap(parsed.keys, parsed.hashes ?? {});
      return;
    }

    if (parsed.data && typeof parsed.data === "object") {
      await this.applyLegacy(parsed.data, parsed.hashes ?? {});
      return;
    }

    throw new Error("Import file contains no data");
  }

  /** v3: write raw localStorage entries exactly as they were exported. */
  private static async applyKeyMap(keys: { [key: string]: string }, hashes: { [key: string]: string }): Promise<void> {
    for (const [rawKey, value] of Object.entries(keys)) {
      if (typeof value !== "string") continue;
      if (hashes[rawKey] && !(await this.verifyHash(value, hashes[rawKey]))) {
        throw new Error(`Data integrity check failed for ${decodeStorageKey(rawKey)}`);
      }
      localStorage.setItem(rawKey, value);
    }
  }

  /** v2: the old fixed set of four keys. */
  private static async applyLegacy(data: NonNullable<ExportData["data"]>, hashes: { [key: string]: any }): Promise<void> {
    const write = (encodedKey: string, value: string | null | undefined) => {
      if (value === undefined) return;
      if (value === null) localStorage.removeItem(encodedKey);
      else localStorage.setItem(encodedKey, value);
    };

    const checks: Array<[string, string | null | undefined, string | undefined]> = [
      [getEncodedStorageKey(ATLAS_KEYS.SPACESHIP), data.spaceship, hashes.spaceship],
      [getEncodedStorageKey(ATLAS_KEYS.ARCHIVE), data.archive, hashes.archive],
      [getEncodedStorageKey(ATLAS_KEYS.DAILY_CHALLENGES), data.dailyChallenges, hashes.dailyChallenges],
      [getEncodedStorageKey(ATLAS_KEYS.LOCATIONS), data.locations, hashes.locations],
    ];

    for (const [encodedKey, value, hash] of checks) {
      if (typeof value === "string" && hash && !(await this.verifyHash(value, hash))) {
        throw new Error(`Data integrity check failed for ${decodeStorageKey(encodedKey)}`);
      }
      write(encodedKey, value);
    }

    if (data.archives) {
      for (const [nodeId, archiveData] of Object.entries(data.archives)) {
        const hash = hashes.archives?.[nodeId];
        if (hash && !(await this.verifyHash(archiveData, hash))) {
          throw new Error(`Archive data integrity check failed for universe ${nodeId}`);
        }
        localStorage.setItem(btoa(encodeURIComponent(`${ATLAS_KEYS.ARCHIVE}_${nodeId}`)), archiveData);
      }
    }
  }

  static getDataSummary(): {
    hasSpaceship: boolean;
    hasArchive: boolean;
    hasDailyChallenges: boolean;
    hasLocations: boolean;
    totalKeys: number;
    totalSize: number;
  } {
    const hasKey = (key: string): boolean => localStorage.getItem(getEncodedStorageKey(key)) !== null;

    let totalKeys = 0;
    let totalSize = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const rawKey = localStorage.key(i);
      if (!rawKey || !isAtlasKey(rawKey)) continue;
      totalKeys += 1;
      totalSize += new Blob([localStorage.getItem(rawKey) ?? ""]).size;
    }

    return {
      hasSpaceship: hasKey(ATLAS_KEYS.SPACESHIP),
      hasArchive: hasKey(ATLAS_KEYS.ARCHIVE),
      hasDailyChallenges: hasKey(ATLAS_KEYS.DAILY_CHALLENGES),
      hasLocations: hasKey(ATLAS_KEYS.LOCATIONS),
      totalKeys,
      totalSize,
    };
  }
}

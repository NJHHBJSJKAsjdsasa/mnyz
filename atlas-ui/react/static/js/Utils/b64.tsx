// atlas-ui/react/static/js/Utils/b64.tsx

import * as pako from "pako";

const ENCODING_ENABLED = true;

const COMPRESSION_THRESHOLD = 100;

const MAX_STORAGE_SIZE = 4 * 1024 * 1024;

export const ATLAS_KEYS = {
  SPACESHIP: "_atlasSpaceShip",
  ARCHIVE: "__atlasArchive",
  DAILY_CHALLENGES: "_atlasDailyChallenges",
  LOCATIONS: "_atlasLocations",
} as const;

const getUniverseIdentifier = (): string | null => {
  try {
    const configElement = document.getElementById("data-universe-config");
    if (configElement) {
      const config = JSON.parse(configElement.textContent || "{}");
      if (config.remote === true && config.node_id) {
        return config.node_id;
      }
    }
    return null;
  } catch (error) {
    return null;
  }
};

const getUniverseSpecificKey = (key: string): string => {
  if (key === ATLAS_KEYS.ARCHIVE) {
    const universeId = getUniverseIdentifier();
    if (universeId) {
      return `${key}_${universeId}`;
    }
  }
  return key;
};

export const getEncodedStorageKey = (key: string): string => {
  const universeKey = getUniverseSpecificKey(key);
  return btoa(encodeURIComponent(universeKey));
};

const uint8ArrayToBase64 = (uint8Array: Uint8Array): string => {
  let binary = "";
  const len = uint8Array.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary);
};

const base64ToUint8Array = (base64: string): Uint8Array => {
  const binary = atob(base64);
  const len = binary.length;
  const uint8Array = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    uint8Array[i] = binary.charCodeAt(i);
  }
  return uint8Array;
};

export const decodeStoredValue = (encodedValue: string | null): string | null => {
  if (encodedValue === null) return null;
  try {
    let uint8Array: Uint8Array;
    if (encodedValue.startsWith("c:")) {
      const compressed = base64ToUint8Array(encodedValue.slice(2));
      uint8Array = pako.ungzip(compressed);
    } else if (encodedValue.startsWith("u:")) {
      uint8Array = base64ToUint8Array(encodedValue.slice(2));
    } else {
      const binary = atob(encodedValue);
      const compressed = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) compressed[i] = binary.charCodeAt(i);
      uint8Array = pako.ungzip(compressed);
    }
    return new TextDecoder().decode(uint8Array);
  } catch {
    return encodedValue;
  }
};

export const setItem = (key: string, value: string): void => {
  const universeKey = getUniverseSpecificKey(key);

  if (!ENCODING_ENABLED) {
    localStorage.setItem(universeKey, value);
    return;
  }

  try {
    const valueSize = new Blob([value]).size;
    if (valueSize > MAX_STORAGE_SIZE) {
      console.warn(`Value too large: ${valueSize} bytes exceeds ${MAX_STORAGE_SIZE} bytes limit`);
      throw new Error("Value exceeds maximum storage size");
    }

    const encodedKey = btoa(encodeURIComponent(universeKey));

    const textEncoder = new TextEncoder();
    const uint8Array = textEncoder.encode(value);

    let encodedValue: string;

    if (uint8Array.length >= COMPRESSION_THRESHOLD) {
      const compressed = pako.gzip(uint8Array);
      encodedValue = "c:" + uint8ArrayToBase64(compressed);
    } else {
      encodedValue = "u:" + uint8ArrayToBase64(uint8Array);
    }

    const finalSize = new Blob([encodedValue]).size;
    if (finalSize > MAX_STORAGE_SIZE) {
      throw new Error("Encoded value exceeds maximum storage size");
    }

    localStorage.setItem(encodedKey, encodedValue);
  } catch (error) {
    if (error instanceof Error && error.message.includes("storage size")) {
      throw error;
    }
    localStorage.setItem(universeKey, value);
  }
};

export const getItem = (key: string): string | null => {
  const universeKey = getUniverseSpecificKey(key);

  if (!ENCODING_ENABLED) {
    return localStorage.getItem(universeKey);
  }

  try {
    const encodedKey = btoa(encodeURIComponent(universeKey));
    const encodedValue = localStorage.getItem(encodedKey);
    return decodeStoredValue(encodedValue) ?? localStorage.getItem(universeKey);
  } catch (error) {
    return localStorage.getItem(universeKey);
  }
};

export const removeItem = (key: string): void => {
  const universeKey = getUniverseSpecificKey(key);

  if (!ENCODING_ENABLED) {
    localStorage.removeItem(universeKey);
    return;
  }

  try {
    const encodedKey = btoa(encodeURIComponent(universeKey));
    localStorage.removeItem(encodedKey);
  } catch (error) {
    localStorage.removeItem(universeKey);
  }
};

export const migrateToEncoded = (): void => {
  if (!ENCODING_ENABLED) {
    return;
  }

  const keysToMigrate = Object.values(ATLAS_KEYS);

  keysToMigrate.forEach((key) => {
    const encodedKey = getEncodedStorageKey(key);
    if (localStorage.getItem(encodedKey) !== null) {
      return;
    }

    const value = localStorage.getItem(key);
    if (value !== null) {
      localStorage.setItem(encodedKey, value);
      localStorage.removeItem(key);
    }
  });
};

export const getUniverseInfo = (): { isRemote: boolean; nodeId: string | null; seedName?: string } => {
  try {
    const configElement = document.getElementById("data-universe-config");
    if (configElement) {
      const config = JSON.parse(configElement.textContent || "{}");
      return {
        isRemote: config.remote === true,
        nodeId: config.node_id || null,
        seedName: config.seed_name,
      };
    }
    return { isRemote: false, nodeId: null };
  } catch (error) {
    return { isRemote: false, nodeId: null };
  }
};

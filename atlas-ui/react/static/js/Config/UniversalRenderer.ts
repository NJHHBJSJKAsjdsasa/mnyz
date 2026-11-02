// atlas-ui/react/static/js/Config/UniversalRenderer.ts

export interface UniversalRendererConfig {
  enabled: boolean;

  defaultToUniversal: boolean;

  enableFallback: boolean;

  showToggle: boolean;

  show3DToggle: boolean;

  showDebugInfo: boolean;

  api: {
    renderingData: string;
    locationData: string;
  };

  renderer3D: {
    antialias: boolean;
    shadows: boolean;
    maxPixelRatio: number;
    enableOrbitControls: boolean;
    autoRotate: boolean;
    autoRotateSpeed: number;
  };

  supportedPlanetTypes: string[];

  features: {
    rings: boolean;
    atmosphere: boolean;
    lifeEffects: boolean;
    dynamicShaders: boolean;
    particleEffects: boolean;
    realTimeRotation: boolean;
  };
}

export const defaultUniversalRendererConfig: UniversalRendererConfig = {
  enabled: true,
  defaultToUniversal: true,
  enableFallback: true,
  showToggle: true,
  show3DToggle: true,
  showDebugInfo: false,

  api: {
    renderingData: "/api/planet/{planetName}/rendering-data",
    locationData: "/api/planet/{planetName}/location-data",
  },

  renderer3D: {
    antialias: true,
    shadows: false,
    maxPixelRatio: 2,
    enableOrbitControls: true,
    autoRotate: false,
    autoRotateSpeed: 0.5,
  },

  supportedPlanetTypes: ["Gas Giant", "Anomaly", "Rocky", "Icy", "Oceanic", "Desert", "Lava", "Arid", "Swamp", "Tundra", "Forest", "Savannah", "Cave", "Crystalline", "Metallic", "Toxic", "Radioactive", "Magma", "Molten Core", "Carbon", "Diamond", "Super Earth", "Sub Earth", "Frozen Gas Giant", "Nebulous", "Aquifer", "Exotic", "Super Puff", "Super Ringed", "Mirror", "Ruby Cloud"],

  features: {
    rings: true,
    atmosphere: true,
    lifeEffects: true,
    dynamicShaders: true,
    particleEffects: true,
    realTimeRotation: true,
  },
};

let runtimeConfig: UniversalRendererConfig = { ...defaultUniversalRendererConfig };

export const getUniversalRendererConfig = (): UniversalRendererConfig => {
  return runtimeConfig;
};

export const updateUniversalRendererConfig = (updates: Partial<UniversalRendererConfig>): void => {
  runtimeConfig = { ...runtimeConfig, ...updates };

  try {
    localStorage.setItem("universalRendererConfig", JSON.stringify(runtimeConfig));
  } catch (error) {
    console.warn("Failed to save universal renderer config to localStorage:", error);
  }
};

export const loadUniversalRendererConfig = (): void => {
  try {
    const saved = localStorage.getItem("universalRendererConfig");
    if (saved) {
      const savedConfig = JSON.parse(saved);
      runtimeConfig = { ...defaultUniversalRendererConfig, ...savedConfig };
    }
  } catch (error) {
    console.warn("Failed to load universal renderer config from localStorage:", error);
    runtimeConfig = { ...defaultUniversalRendererConfig };
  }
};

export const resetUniversalRendererConfig = (): void => {
  runtimeConfig = { ...defaultUniversalRendererConfig };

  try {
    localStorage.removeItem("universalRendererConfig");
  } catch (error) {
    console.warn("Failed to remove universal renderer config from localStorage:", error);
  }
};

export const isPlanetTypeSupported = (planetType: string): boolean => {
  return runtimeConfig.supportedPlanetTypes.includes(planetType);
};

export const shouldUseUniversalRenderer = (planetType?: string): boolean => {
  if (!runtimeConfig.enabled) {
    return false;
  }

  if (planetType && !isPlanetTypeSupported(planetType)) {
    return false;
  }

  return true;
};

export const getRenderingDataEndpoint = (planetName: string): string => {
  return runtimeConfig.api.renderingData.replace("{planetName}", encodeURIComponent(planetName));
};

export const UniversalRendererDebug = {
  logConfig: () => {
    console.group("🌍 Universal Planet Renderer Configuration");
    console.table(runtimeConfig);
    console.groupEnd();
  },

  enableDebug: () => {
    updateUniversalRendererConfig({ showDebugInfo: true });
  },

  disableDebug: () => {
    updateUniversalRendererConfig({ showDebugInfo: false });
  },

  testPlanetType: (planetType: string) => {
    const supported = isPlanetTypeSupported(planetType);
    return supported;
  },

  getMetrics: () => {
    return {
      config: runtimeConfig,
      supported_types: runtimeConfig.supportedPlanetTypes.length,
      features_enabled: Object.values(runtimeConfig.features).filter(Boolean).length,
      total_features: Object.keys(runtimeConfig.features).length,
    };
  },
};

loadUniversalRendererConfig();

if (typeof window !== "undefined") {
  (window as any).UniversalRendererDebug = UniversalRendererDebug;
}

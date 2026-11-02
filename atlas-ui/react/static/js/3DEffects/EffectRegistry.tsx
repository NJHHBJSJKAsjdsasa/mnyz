// atlas-ui/react/static/js/3DEffects/EffectRegistry.tsx
import * as THREE from "three";
import { SeededRandom } from "../Utils/SeededRandom.tsx";

import { RingSystemEffect, createRingSystemFromPythonData, RingSystemParams } from "./RingSystem";
import { AtmosphereEffect, createAtmosphereFromPythonData, AtmosphereParams } from "./Atmosphere";

import { AtmosphereGlowEffect, createAtmosphereGlowFromPythonData, AtmosphereGlowParams } from "./AtmosphereGlow";
import { AtmosphereCloudsEffect, createAtmosphereCloudsFromPythonData, AtmosphereCloudsParams } from "./AtmosphereClouds";
import { SecondaryCloudEffect, createSecondaryCloudsFromPythonData, SecondaryCloudsParams } from "./SecondaryCloudEffect";
import { LandMassesEffect, createLandMassesFromPythonData, createTransparentLandMassesForIcyPlanet, LandMassesParams } from "./LandMasses";
import { IcyFeaturesEffect, createIcyFeaturesFromPythonData } from "./IcyFeatures";
import { TundraSnowflakesEffect, createTundraSnowflakesFromPythonData, createCarbonDustParticlesFromPythonData, createDesertSandstormsFromPythonData, createToxicParticlesFromPythonData } from "./TundraSnowflakes";
import { ToxicPostProcessingEffect, createToxicPostProcessingFromPythonData } from "./ToxicPostProcessing";
import { ToxicWasteRenderEffect, createToxicWasteFromPythonData } from "./ToxicWasteRender";
import { RiverLinesEffect, createRiverLinesFromPythonData } from "./RiverLines";

import { AnomalyPhaseMatterEffect, createAnomalyPhaseMatterFromPythonData } from "./AnomalyPhaseMatter";
import { PulsatingCubeEffect, createPulsatingCubeFromPythonData } from "./PulsatingCube";
import { PlanetRaysEffect, createPlanetRaysFromPythonData } from "./PlanetRays";

import { PlanetLayerSystem } from "../3DComponents/PlanetLayerSystem";
import { CloudBandsLayer, createCloudBandsLayerFromPythonData } from "./CloudBandsLayer";
import { CloudGyrosLayer, createCloudGyrosLayerFromPythonData } from "./CloudGyrosLayer";
import { RockyTerrainLayer, createRockyTerrainLayerFromPythonData } from "./RockyTerrainLayer";
import { SavannahTerrainLayer, createSavannahTerrainLayerFromPythonData } from "./SavannahTerrainLayer";
import { IcyTerrainLayer, createIcyTerrainLayerFromPythonData } from "./IcyTerrainLayer";
import { MetallicSurfaceLayer, createMetallicSurfaceLayerFromPythonData } from "./MetallicSurfaceLayer";
import { DiamondSurfaceLayer, createDiamondSurfaceLayerFromPythonData } from "./DiamondSurfaceLayer";
import { TerrainCracksEffect, createTerrainCracksFromPythonData } from "./TerrainCracksEffect";
import { ExoticGeometricShapesEffect, createExoticGeometricShapesFromPythonData } from "./ExoticGeometricShapes";
import { ExoticDoodlesEffect, createExoticDoodlesFromPythonData } from "./ExoticDoodles";
import { CaveSurfaceHolesEffect, createCaveSurfaceHolesFromPythonData } from "./CaveSurfaceHoles";
import { VegetationEffect, createVegetationFromPythonData } from "./VegetationEffect";
import { MagmaFlowsEffect, createMagmaFlowsFromPythonData } from "./MagmaFlowsEffect";
import { MagmaEruptionsEffect, createMagmaEruptionsFromPythonData } from "./MagmaEruptionsEffect";
import { CrystallineSurfaceEffect, createCrystallineSurfaceFromPythonData } from "./CrystallineSurfaceEffect";
import { ToxicSwampBubblesEffect, createToxicSwampBubblesFromPythonData } from "./ToxicSwampBubbles";

import { AtmosphericStreaksEffect, createAtmosphericStreaksFromPythonData, AtmosphericStreaksParams } from "./AtmosphericStreaks";
import { StarFieldEffect, createStarFieldFromPythonData, StarFieldParams } from "./StarField";
import { PolarHexagonEffect, createPolarHexagonFromPythonData } from "./PolarHexagon";

import { FragmentationEffect } from "./FragmentationEffect";
import { OceanWavesEffect, createOceanWavesFromPythonData } from "./OceanWaves";
import { FluidLayersEffect, createFluidLayersFromPythonData } from "./FluidLayers";
import { AquiferWaterEffect, createAquiferWaterFromPythonData } from "./AquiferWaterEffect";
import { OceanCurrentsEffect, createOceanCurrentsFromPythonData } from "./OceanCurrentsEffect";
import { LavaFlowsEffect, createLavaFlowsFromPythonData } from "./LavaFlowsEffect";
import { LavaRiversEffect, createLavaRiversFromPythonData } from "./LavaRiversEffect";
import { MoltenLavaEffect, createMoltenLavaFromPythonData } from "./MoltenLavaEffect";
import { FireEruptionEffect, createFireEruptionFromPythonData } from "./FireEruptionEffect";
import { CarbonTrailsEffect, createCarbonTrailsFromPythonData } from "./CarbonTrails";
import { RadiationRingsEffect, createRadiationRingsFromPythonData } from "./RadiationRings";
import { SuperEarthWaterFeaturesEffect, createSuperEarthWaterFeaturesFromPythonData } from "./SuperEarthWaterFeatures";
import { LifeFormIntelligentLifeEffect, createLifeFormIntelligentLifeFromPythonData } from "./LifeFormIntelligentLife";
import { LifeFormSiliconBasedLifeEffect, createLifeFormSiliconBasedLifeFromPythonData } from "./LifeFormSiliconBasedLife";
import { LifeFormNonPhysicalEntityEffect, createLifeFormNonPhysicalEntityFromPythonData } from "./LifeFormNonPhysicalEntity";
import { LifeFormConsciousGasEffect, createLifeFormConsciousGasFromPythonData } from "./LifeFormConsciousGas";
import { LifeFormRoboticEntitiesEffect, createLifeFormRoboticEntitiesFromPythonData } from "./LifeFormRoboticEntities";
import { LifeFormGodEffect, createLifeFormGodFromPythonData } from "./LifeFormGod";

import { VisualDebug3DEffect, createVisualDebug3DFromPythonData } from "./VisualDebug3D";
import { ENABLE_EFFECTS_LOGGING } from "../Utils/DebugConfig.tsx";

import { getPlanetBaseColor } from "./PlanetColorBase";

const VISUAL_DEBUG = false;

export interface EffectInstance {
  id: string;
  type: string;
  effect: any;
  priority: number;
  enabled: boolean;
  name?: string;
}

export interface EffectCreationData {
  type: string;
  params: any;
  priority?: number;
  enabled?: boolean;
}

export enum EffectType {
  CLOUD_BANDS = "cloud_bands",
  CLOUD_GYROS = "cloud_gyros",

  ATMOSPHERE = "atmosphere",
  ATMOSPHERE_GLOW = "atmosphere_glow",
  ATMOSPHERE_CLOUDS = "atmosphere_clouds",
  ATMOSPHERIC_STREAKS = "atmospheric_streaks",
  STAR_FIELD = "star_field",

  RING_SYSTEM = "ring_system",
  FRAGMENTATION = "fragmentation",

  ROCKY_TERRAIN = "rocky_terrain",
  SAVANNAH_TERRAIN = "savannah_terrain",
  ICY_TERRAIN = "icy_terrain",
  LAND_MASSES = "land_masses",
  OCEAN_WAVES = "ocean_waves",
  FLUID_LAYERS = "fluid_layers",
  AQUIFER_WATER = "aquifer_water",
  OCEAN_CURRENTS = "ocean_currents",
  LAVA_FLOWS = "lava_flows",
  LAVA_RIVERS = "lava_rivers",
  MOLTEN_LAVA = "molten_lava",
  FIRE_ERUPTION = "fire_eruption",
  CARBON_TRAILS = "carbon_trails",
  RADIATION_RINGS = "radiation_rings",
  SUPER_EARTH_WATER_FEATURES = "super_earth_water_features",
  CRYSTAL_FORMATIONS = "crystal_formations",
  CRYSTALLINE_SURFACE = "crystalline_surface",
  CLOUD_LAYERS = "cloud_layers",
  STORM_SYSTEMS = "storm_systems",
  VOLCANIC_ACTIVITY = "volcanic_activity",
  AURORA = "aurora",
  MAGNETIC_FIELD = "magnetic_field",

  CITY_LIGHTS = "city_lights",
  BIOLUMINESCENCE = "bioluminescence",
  THERMAL_EMISSIONS = "thermal_emissions",

  LIFE_FORM_INTELLIGENT_LIFE = "life_form_intelligent_life",
  LIFE_FORM_SILICON_BASED_LIFE = "life_form_silicon_based_life",
  LIFE_FORM_NON_PHYSICAL_ENTITY = "life_form_non_physical_entity",
  LIFE_FORM_CONSCIOUS_GAS = "life_form_conscious_gas",
  LIFE_FORM_ROBOTIC_ENTITIES = "life_form_robotic_entities",
  LIFE_FORM_GOD = "life_form_god",

  TUNDRA_SNOWFLAKES = "tundra_snowflakes",

  TOXIC_POST_PROCESSING = "toxic_post_processing",

  TOXIC_WASTE_RENDER = "toxic_waste_render",
  TOXIC_SWAMP_BUBBLES = "toxic_swamp_bubbles",

  RIVER_LINES = "river_lines",

  ANOMALY_PHASE_MATTER = "anomaly_phase_matter",
  PULSATING_CUBE = "pulsating_cube",
  PLANET_RAYS = "planet_rays",

  VISUAL_DEBUG_3D = "visual_debug_3d",

  EXOTIC_GEOMETRIC_SHAPES = "exotic_geometric_shapes",
  EXOTIC_DOODLES = "exotic_doodles",

  CAVE_SURFACE_HOLES = "cave_surface_holes",

  VEGETATION = "vegetation",

  MAGMA_FLOWS = "magma_flows",
  MAGMA_ERUPTIONS = "magma_eruptions",
}

export interface EffectCreator {
  create(params: any, planetRadius: number, layerSystem?: PlanetLayerSystem, mesh?: THREE.Mesh): any;
  fromPythonData?(pythonData: any, planetRadius: number, layerSystem?: PlanetLayerSystem, mesh?: THREE.Mesh): any;
}

export class EffectRegistry {
  private creators: Map<string, EffectCreator> = new Map();
  private effects: Map<string, EffectInstance> = new Map();
  private nextId: number = 1;
  private layerSystem?: PlanetLayerSystem;
  private baseColor?: THREE.Color;

  constructor() {
    this.registerDefaultEffects();
  }

  private registerDefaultEffects(): void {
    this.registerEffect(EffectType.ATMOSPHERE_GLOW, {
      create: (params, planetRadius) => new AtmosphereGlowEffect(planetRadius, params),
      fromPythonData: (data, planetRadius) => createAtmosphereGlowFromPythonData(planetRadius, data.atmosphere || {}),
    });

    this.registerEffect(EffectType.ATMOSPHERE_CLOUDS, {
      create: (params, planetRadius) => new AtmosphereCloudsEffect(planetRadius, params),
      fromPythonData: (data, planetRadius) => createAtmosphereCloudsFromPythonData(planetRadius, data.surface_elements || {}, undefined, data.timing?.cosmic_origin_time),
    });

    this.registerEffect(EffectType.ATMOSPHERIC_STREAKS, {
      create: (params, planetRadius) => new AtmosphericStreaksEffect(planetRadius, params),
      fromPythonData: (data, planetRadius) => createAtmosphericStreaksFromPythonData(planetRadius, data.atmosphere || {}),
    });

    this.registerEffect(EffectType.ATMOSPHERE, {
      create: (params, planetRadius) => new AtmosphereEffect(planetRadius, params),
      fromPythonData: (data, planetRadius) => createAtmosphereFromPythonData(planetRadius, data),
    });

    this.registerEffect(EffectType.RING_SYSTEM, {
      create: (params, planetRadius) => new RingSystemEffect(planetRadius, params),
      fromPythonData: (data, planetRadius) => createRingSystemFromPythonData(data.rings || {}, planetRadius),
    });

    this.registerEffect(EffectType.FRAGMENTATION, {
      create: (params, planetRadius) => new FragmentationEffect(planetRadius, params),
      fromPythonData: (data, planetRadius) => {
        return new FragmentationEffect(planetRadius, {
          color: data.surface?.fragment_color || [0.3, 0.3, 0.3],
          fragmentCount: data.surface?.fragment_count || 20,
        });
      },
    });

    this.registerEffect(EffectType.LAND_MASSES, {
      create: (params, planetRadius) => new LandMassesEffect(planetRadius, params),
      fromPythonData: (data, planetRadius) => createLandMassesFromPythonData(planetRadius, data.surface_elements || {}, data.seeds?.planet_seed),
    });

    this.registerEffect(EffectType.OCEAN_WAVES, {
      create: (params, planetRadius) => new OceanWavesEffect(params),
      fromPythonData: (data, planetRadius) => createOceanWavesFromPythonData(data),
    });

    this.registerEffect(EffectType.AQUIFER_WATER, {
      create: (params, planetRadius, layerSystem) => new AquiferWaterEffect(layerSystem!, params),
      fromPythonData: (data, planetRadius, layerSystem) => createAquiferWaterFromPythonData(layerSystem!, data),
    });

    this.registerEffect(EffectType.OCEAN_CURRENTS, {
      create: (params, planetRadius, layerSystem) => new OceanCurrentsEffect(layerSystem!, params),
      fromPythonData: (data, planetRadius, layerSystem) => createOceanCurrentsFromPythonData(layerSystem!, data),
    });

    this.registerEffect(EffectType.FLUID_LAYERS, {
      create: (params, planetRadius) => new FluidLayersEffect(planetRadius, params),
      fromPythonData: (data, planetRadius) => createFluidLayersFromPythonData(planetRadius, data),
    });

    this.registerEffect(EffectType.LAVA_FLOWS, {
      create: (params, planetRadius) => new LavaFlowsEffect(planetRadius, params),
      fromPythonData: (data, planetRadius) => createLavaFlowsFromPythonData(planetRadius, data.surface_elements || {}, data.seeds?.planet_seed),
    });

    this.registerEffect(EffectType.LAVA_RIVERS, {
      create: (params, planetRadius, layerSystem) => new LavaRiversEffect(planetRadius, params),
      fromPythonData: (data, planetRadius, layerSystem) => createLavaRiversFromPythonData(data, planetRadius, layerSystem),
    });

    this.registerEffect(EffectType.MOLTEN_LAVA, {
      create: (params, planetRadius, layerSystem) => new MoltenLavaEffect(layerSystem!, params),
      fromPythonData: (data, planetRadius, layerSystem) => createMoltenLavaFromPythonData(layerSystem!, data, data.seeds?.planet_seed),
    });

    this.registerEffect(EffectType.FIRE_ERUPTION, {
      create: (params, planetRadius) => new FireEruptionEffect(planetRadius, params),
      fromPythonData: (data, planetRadius, layerSystem) => createFireEruptionFromPythonData(data, planetRadius, layerSystem),
    });

    this.registerEffect(EffectType.CARBON_TRAILS, {
      create: (params, planetRadius) => new CarbonTrailsEffect(planetRadius, params),
      fromPythonData: (data, planetRadius, layerSystem) => createCarbonTrailsFromPythonData(data, planetRadius, layerSystem),
    });

    this.registerEffect(EffectType.RADIATION_RINGS, {
      create: (params, planetRadius) => new RadiationRingsEffect(planetRadius, params),
      fromPythonData: (data, planetRadius) => createRadiationRingsFromPythonData(planetRadius, data, data.seeds?.planet_seed),
    });

    this.registerEffect(EffectType.LIFE_FORM_INTELLIGENT_LIFE, {
      create: (params, planetRadius) => new LifeFormIntelligentLifeEffect(planetRadius, params),
      fromPythonData: (data, planetRadius) => createLifeFormIntelligentLifeFromPythonData(planetRadius, data, data.seeds?.planet_seed),
    });

    this.registerEffect(EffectType.LIFE_FORM_SILICON_BASED_LIFE, {
      create: (params, planetRadius) => new LifeFormSiliconBasedLifeEffect(planetRadius, params),
      fromPythonData: (data, planetRadius) => createLifeFormSiliconBasedLifeFromPythonData(planetRadius, data, data.seeds?.planet_seed),
    });
    this.registerEffect(EffectType.LIFE_FORM_NON_PHYSICAL_ENTITY, {
      create: (params, planetRadius) => new LifeFormNonPhysicalEntityEffect(planetRadius, params),
      fromPythonData: (data, planetRadius) => createLifeFormNonPhysicalEntityFromPythonData(planetRadius, data, data.seeds?.planet_seed),
    });
    this.registerEffect(EffectType.LIFE_FORM_CONSCIOUS_GAS, {
      create: (params, planetRadius) => new LifeFormConsciousGasEffect(planetRadius, params),
      fromPythonData: (data, planetRadius) => createLifeFormConsciousGasFromPythonData(planetRadius, data, data.seeds?.planet_seed),
    });
    this.registerEffect(EffectType.LIFE_FORM_ROBOTIC_ENTITIES, {
      create: (params, planetRadius) => new LifeFormRoboticEntitiesEffect(planetRadius, params),
      fromPythonData: (data, planetRadius) => createLifeFormRoboticEntitiesFromPythonData(planetRadius, data, data.seeds?.planet_seed),
    });
    this.registerEffect(EffectType.LIFE_FORM_GOD, {
      create: (params, planetRadius) => new LifeFormGodEffect(planetRadius, params),
      fromPythonData: (data, planetRadius) => createLifeFormGodFromPythonData(planetRadius, data, data.seeds?.planet_seed),
    });

    this.registerEffect(EffectType.CRYSTAL_FORMATIONS, {
      create: (params, planetRadius) => {
        return null;
      },
    });

    this.registerEffect(EffectType.STAR_FIELD, {
      create: (params, planetRadius) => new StarFieldEffect(planetRadius, params),
      fromPythonData: (data, planetRadius) => createStarFieldFromPythonData(planetRadius, data.seeds?.planet_seed || data.planet_seed, data.atmosphere),
    });

    this.registerEffect(EffectType.TUNDRA_SNOWFLAKES, {
      create: (params, planetRadius) => new TundraSnowflakesEffect(planetRadius, params),
      fromPythonData: (data, planetRadius) => createTundraSnowflakesFromPythonData(planetRadius, data.surface_elements || {}, data.seeds?.planet_seed),
    });

    this.registerEffect(EffectType.TOXIC_POST_PROCESSING, {
      create: (params, planetRadius) => null,
      fromPythonData: (data, planetRadius) => null,
    });

    this.registerEffect(EffectType.TOXIC_WASTE_RENDER, {
      create: (params, planetRadius) => new ToxicWasteRenderEffect(planetRadius, params),
      fromPythonData: (data, planetRadius) => createToxicWasteFromPythonData(planetRadius, data.surface_elements || {}, data.seeds?.planet_seed),
    });

    this.registerEffect(EffectType.RIVER_LINES, {
      create: (params, planetRadius) => new RiverLinesEffect(planetRadius, params),
      fromPythonData: (data, planetRadius) => createRiverLinesFromPythonData(planetRadius, data.surface_elements || {}, data.seeds?.planet_seed),
    });

    this.registerEffect(EffectType.ANOMALY_PHASE_MATTER, {
      create: (params, planetRadius) => new AnomalyPhaseMatterEffect(planetRadius, params),
      fromPythonData: (data, planetRadius) => createAnomalyPhaseMatterFromPythonData(planetRadius, data.surface_elements || {}, data.seeds?.planet_seed),
    });

    this.registerEffect(EffectType.PULSATING_CUBE, {
      create: (params, planetRadius) => new PulsatingCubeEffect(planetRadius, params),
      fromPythonData: (data, planetRadius) => {
        const baseColor = getPlanetBaseColor(data);

        return createPulsatingCubeFromPythonData(planetRadius, data.surface_elements || {}, data.seeds?.planet_seed, baseColor, data);
      },
    });

    this.registerEffect(EffectType.PLANET_RAYS, {
      create: (params, planetRadius) => new PlanetRaysEffect(planetRadius, params),
      fromPythonData: (data, planetRadius) => createPlanetRaysFromPythonData(planetRadius, data.surface_elements || {}, data.seeds?.planet_seed),
    });

    this.registerEffect(EffectType.VISUAL_DEBUG_3D, {
      create: (params, planetRadius) => new VisualDebug3DEffect(planetRadius, params),
      fromPythonData: (data, planetRadius) => createVisualDebug3DFromPythonData(data, planetRadius),
    });

    this.registerEffect("terrain_cracks", {
      create: (params, planetRadius) => new TerrainCracksEffect({ ...params, radius: planetRadius }),
      fromPythonData: (data, planetRadius) => createTerrainCracksFromPythonData(data, planetRadius, data.seeds?.shape_seed || data.seeds?.planet_seed),
    });

    this.registerEffect(EffectType.EXOTIC_GEOMETRIC_SHAPES, {
      create: (params, planetRadius) => new ExoticGeometricShapesEffect(planetRadius, params),
      fromPythonData: (data, planetRadius) => {
        const baseColor = getPlanetBaseColor(data);
        return createExoticGeometricShapesFromPythonData(planetRadius, data.surface_elements || {}, data.seeds?.planet_seed, baseColor);
      },
    });

    this.registerEffect(EffectType.EXOTIC_DOODLES, {
      create: (params, planetRadius) => new ExoticDoodlesEffect(planetRadius, params),
      fromPythonData: (data, planetRadius) => createExoticDoodlesFromPythonData(planetRadius, data.surface_elements || {}, data.seeds?.planet_seed),
    });

    this.registerEffect(EffectType.CAVE_SURFACE_HOLES, {
      create: (params, planetRadius, layerSystem) => new CaveSurfaceHolesEffect(planetRadius, params),
      fromPythonData: (data, planetRadius, layerSystem) => createCaveSurfaceHolesFromPythonData(planetRadius, data, data.seeds?.planet_seed),
    });

    this.registerEffect(EffectType.VEGETATION, {
      create: (params, planetRadius, layerSystem) => new VegetationEffect(planetRadius, params),
      fromPythonData: (data, planetRadius, layerSystem) => createVegetationFromPythonData(planetRadius, data.surface_elements || {}, data.seeds?.planet_seed, data.timing?.cosmic_origin_time),
    });

    this.registerEffect(EffectType.CRYSTALLINE_SURFACE, {
      create: (params, planetRadius, layerSystem) => new CrystallineSurfaceEffect(planetRadius, params),
      fromPythonData: (data, planetRadius, layerSystem) => {
        const baseColor = getPlanetBaseColor(data);
        return createCrystallineSurfaceFromPythonData(planetRadius, data.surface_elements || {}, data.seeds?.planet_seed, data.timing?.cosmic_origin_time, undefined, baseColor);
      },
    });

    this.registerEffect(EffectType.TOXIC_SWAMP_BUBBLES, {
      create: (params, planetRadius) => new ToxicSwampBubblesEffect(planetRadius, params),
      fromPythonData: (data, planetRadius) => createToxicSwampBubblesFromPythonData(planetRadius, data.surface_elements || {}, data.seeds?.planet_seed),
    });

    this.registerEffect(EffectType.MAGMA_FLOWS, {
      create: (params, planetRadius, layerSystem) => new MagmaFlowsEffect(planetRadius, params),
      fromPythonData: (data, planetRadius, layerSystem) => createMagmaFlowsFromPythonData(planetRadius, data.surface_elements || {}, data.seeds?.planet_seed, data.timing?.cosmic_origin_time),
    });

    this.registerEffect(EffectType.MAGMA_ERUPTIONS, {
      create: (params, planetRadius, layerSystem) => new MagmaEruptionsEffect(planetRadius, params),
      fromPythonData: (data, planetRadius, layerSystem) => createMagmaEruptionsFromPythonData(planetRadius, data.surface_elements || {}, data.seeds?.planet_seed, data.timing?.cosmic_origin_time),
    });
  }

  /**
   * Registra un nuevo tipo de efecto
   */
  registerEffect(type: string, creator: EffectCreator): void {
    this.creators.set(type, creator);
  }

  /**
   * Crea un efecto específico
   */
  createEffect(type: string, params: any, planetRadius: number, mesh?: THREE.Mesh, priority: number = 0): EffectInstance | null {
    const creator = this.creators.get(type);
    if (!creator) {
      return null;
    }

    try {
      const effect = creator.create(params, planetRadius, this.layerSystem);
      if (!effect) {
        return null;
      }

      const instance: EffectInstance = {
        id: `effect_${this.nextId++}`,
        type,
        effect,
        priority,
        enabled: true,
      };

      this.effects.set(instance.id, instance);
      return instance;
    } catch (error) {
      return null;
    }
  }

  /**
   * Crea un efecto desde datos de Python
   */
  createEffectFromPythonData(type: string, pythonData: any, planetRadius: number, mesh?: THREE.Mesh, priority: number = 0): EffectInstance | null {
    const creator = this.creators.get(type);
    if (!creator || !creator.fromPythonData) {
      return this.createEffect(type, pythonData, planetRadius, mesh, priority);
    }

    try {
      const effect = creator.fromPythonData(pythonData, planetRadius, this.layerSystem);
      if (!effect) {
        return null;
      }

      const instance: EffectInstance = {
        id: `effect_${this.nextId++}`,
        type,
        effect,
        priority,
        enabled: true,
      };

      this.effects.set(instance.id, instance);
      return instance;
    } catch (error) {
      return null;
    }
  }

  /**
   * Crea múltiples efectos desde una lista de datos
   */
  createEffectsFromList(effectsData: EffectCreationData[], planetRadius: number, mesh?: THREE.Mesh): EffectInstance[] {
    const instances: EffectInstance[] = [];

    const sortedData = effectsData.sort((a, b) => (a.priority || 0) - (b.priority || 0));

    for (const data of sortedData) {
      const instance = this.createEffect(data.type, data.params, planetRadius, mesh, data.priority);

      if (instance) {
        instance.enabled = data.enabled !== false;
        instances.push(instance);
      }
    }

    return instances;
  }

  createEffectsFromPythonPlanetData(pythonData: any, planetRadius: number, mesh: THREE.Mesh, scene: THREE.Scene, existingLayerSystem?: PlanetLayerSystem): EffectInstance[] {
    const effects: EffectInstance[] = [];

    try {
      const baseColor = getPlanetBaseColor(pythonData);
      this.baseColor = baseColor;

      if (existingLayerSystem) {
        this.layerSystem = existingLayerSystem;
      } else {
        this.layerSystem = new PlanetLayerSystem(mesh, baseColor);
      }

      if (pythonData.surface_elements) {
        const surface = pythonData.surface_elements;

        if (surface.effects_3d && Array.isArray(surface.effects_3d)) {
          for (const effectData of surface.effects_3d) {
            if (effectData.type === "atmospheric_streaks") {
              const streaksEffect = createAtmosphericStreaksFromPythonData(planetRadius, effectData.params, pythonData.seeds?.shape_seed + 3000);

              const streaksInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "atmospheric_streaks",
                effect: streaksEffect,
                priority: effectData.priority || 0,
                enabled: true,
                name: "Atmospheric Streaks",
              };

              this.effects.set(streaksInstance.id, streaksInstance);
              effects.push(streaksInstance);
              streaksEffect.addToScene(scene, mesh.position);
              continue;
            }

            const instance = this.createEffect(effectData.type, effectData.params, planetRadius, mesh, effectData.priority || 0);

            if (instance) {
              instance.name = effectData.type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

              effects.push(instance);

              if (instance.effect.apply) {
                instance.effect.apply(mesh);
              }

              if (instance.effect.addToScene) {
                instance.effect.addToScene(scene, mesh.position);
              }
            } else {
            }
          }
        } else {
        }

        switch (surface.type.toLowerCase()) {
          case "gas_giant":
            if (this.layerSystem) {
              const cloudBandsLayer = createCloudBandsLayerFromPythonData(
                this.layerSystem,
                {
                  ...surface,
                  base_color: baseColor,
                  turbulence: pythonData.turbulence || surface.turbulence,
                },
                pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed || pythonData.seeds?.planet_seed,
              );

              const cloudGyrosLayer = createCloudGyrosLayerFromPythonData(
                this.layerSystem,
                {
                  ...surface,
                  base_color: baseColor,
                  storm_intensity: pythonData.storm_intensity || surface.storm_intensity,
                },
                (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 1000,
              );

              const bandsInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "cloud_bands_layer",
                effect: cloudBandsLayer,
                priority: 0,
                enabled: true,
              };
              this.effects.set(bandsInstance.id, bandsInstance);
              effects.push(bandsInstance);

              const gyrosInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "cloud_gyros_layer",
                effect: cloudGyrosLayer,
                priority: 1,
                enabled: true,
              };
              this.effects.set(gyrosInstance.id, gyrosInstance);
              effects.push(gyrosInstance);

              if (surface.polar_hexagon && surface.polar_hexagon.enabled) {
                const currentTimeYears = pythonData.timing?.elapsed_time ? pythonData.timing.elapsed_time / (365.25 * 24 * 3600) : 0;

                const hexagonEffect = new PolarHexagonEffect({
                  planetColor: baseColor,
                  hexagonData: surface.polar_hexagon,
                  planetRadius: planetRadius,
                  currentTime: currentTimeYears,
                });

                const hexagonInstance: EffectInstance = {
                  id: `effect_${this.nextId++}`,
                  type: "polar_hexagon",
                  effect: hexagonEffect,
                  priority: 10,
                  enabled: true,
                };
                this.effects.set(hexagonInstance.id, hexagonInstance);
                effects.push(hexagonInstance);

                if (scene) {
                  hexagonEffect.addToScene(scene);
                }
              }

              if (surface.secondary_clouds && surface.secondary_clouds.length > 0) {
                const secondaryCloudsEffect = createSecondaryCloudsFromPythonData(planetRadius, surface, baseColor, pythonData.seeds?.planet_seed || Math.floor(Math.random() * 1000000), pythonData.timing?.cosmic_origin_time);

                const secondaryCloudsInstance: EffectInstance = {
                  id: `effect_${this.nextId++}`,
                  type: "secondary_clouds",
                  effect: secondaryCloudsEffect,
                  priority: 12,
                  enabled: true,
                };
                this.effects.set(secondaryCloudsInstance.id, secondaryCloudsInstance);
                effects.push(secondaryCloudsInstance);

                if (scene) {
                  secondaryCloudsEffect.addToScene(scene);
                }
              }

              if (surface.atmosphere_clouds && surface.atmosphere_clouds.clouds && surface.atmosphere_clouds.clouds.length > 0) {
                const atmosphereCloudsEffect = createAtmosphereCloudsFromPythonData(planetRadius, surface.atmosphere_clouds, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 4000, pythonData.timing?.cosmic_origin_time);

                if (atmosphereCloudsEffect) {
                  const atmosphereCloudsInstance: EffectInstance = {
                    id: `effect_${this.nextId++}`,
                    type: "atmosphere_clouds",
                    effect: atmosphereCloudsEffect,
                    priority: 15,
                    enabled: true,
                    name: "Gas Giant Atmosphere Clouds",
                  };
                  this.effects.set(atmosphereCloudsInstance.id, atmosphereCloudsInstance);
                  effects.push(atmosphereCloudsInstance);
                  atmosphereCloudsEffect.addToScene(scene, mesh.position);
                }
              }
            } else {
            }
            break;

          case "frozen_gas_giant":
            if (this.layerSystem) {
              const frozenBandsLayer = createCloudBandsLayerFromPythonData(
                this.layerSystem,
                {
                  ...surface,
                  base_color: baseColor,
                  turbulence: pythonData.turbulence || surface.turbulence,
                  icy_tint: true,
                },
                pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed,
              );

              const frozenBandsInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "cloud_bands_layer",
                effect: frozenBandsLayer,
                priority: 0,
                enabled: true,
              };
              this.effects.set(frozenBandsInstance.id, frozenBandsInstance);
              effects.push(frozenBandsInstance);

              if (surface.polar_hexagon && surface.polar_hexagon.enabled) {
                const currentTimeYears = pythonData.timing?.elapsed_time ? pythonData.timing.elapsed_time / (365.25 * 24 * 3600) : 0;

                const hexagonEffect = new PolarHexagonEffect({
                  planetColor: baseColor,
                  hexagonData: surface.polar_hexagon,
                  planetRadius: planetRadius,
                  currentTime: currentTimeYears,
                });

                const hexagonInstance: EffectInstance = {
                  id: `effect_${this.nextId++}`,
                  type: "polar_hexagon",
                  effect: hexagonEffect,
                  priority: 10,
                  enabled: true,
                };
                this.effects.set(hexagonInstance.id, hexagonInstance);
                effects.push(hexagonInstance);

                if (scene) {
                  hexagonEffect.addToScene(scene);
                }
              }

              if (surface.secondary_clouds && surface.secondary_clouds.length > 0) {
                const secondaryCloudsEffect = createSecondaryCloudsFromPythonData(planetRadius, surface, baseColor, pythonData.seeds?.planet_seed || Math.floor(Math.random() * 1000000), pythonData.timing?.cosmic_origin_time);

                const secondaryCloudsInstance: EffectInstance = {
                  id: `effect_${this.nextId++}`,
                  type: "secondary_clouds",
                  effect: secondaryCloudsEffect,
                  priority: 12,
                  enabled: true,
                };
                this.effects.set(secondaryCloudsInstance.id, secondaryCloudsInstance);
                effects.push(secondaryCloudsInstance);

                if (scene) {
                  secondaryCloudsEffect.addToScene(scene);
                }
              }

              if (surface.atmosphere_clouds && surface.atmosphere_clouds.clouds && surface.atmosphere_clouds.clouds.length > 0) {
                const atmosphereCloudsEffect = createAtmosphereCloudsFromPythonData(planetRadius, surface.atmosphere_clouds, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 4000, pythonData.timing?.cosmic_origin_time);

                if (atmosphereCloudsEffect) {
                  const atmosphereCloudsInstance: EffectInstance = {
                    id: `effect_${this.nextId++}`,
                    type: "atmosphere_clouds",
                    effect: atmosphereCloudsEffect,
                    priority: 15,
                    enabled: true,
                    name: "Frozen Gas Giant Atmosphere Clouds",
                  };
                  this.effects.set(atmosphereCloudsInstance.id, atmosphereCloudsInstance);
                  effects.push(atmosphereCloudsInstance);
                  atmosphereCloudsEffect.addToScene(scene, mesh.position);
                }
              }
            }
            break;

          case "aquifer":
            const aquiferWaterEffect = createAquiferWaterFromPythonData(this.layerSystem!, pythonData);

            if (aquiferWaterEffect) {
              const aquiferWaterInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "aquifer_water",
                effect: aquiferWaterEffect,
                priority: 2,
                enabled: true,
                name: "Aquifer Water Surface",
              };

              this.effects.set(aquiferWaterInstance.id, aquiferWaterInstance);
              effects.push(aquiferWaterInstance);
            }

            const oceanCurrentsEffect = createOceanCurrentsFromPythonData(this.layerSystem!, pythonData);

            if (oceanCurrentsEffect) {
              const oceanCurrentsInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "ocean_currents",
                effect: oceanCurrentsEffect,
                priority: 1,
                enabled: true,
                name: "Ocean Currents",
              };

              this.effects.set(oceanCurrentsInstance.id, oceanCurrentsInstance);
              effects.push(oceanCurrentsInstance);
            }

            if (surface.clouds && surface.clouds.length > 0) {
              const cloudsEffect = createAtmosphereCloudsFromPythonData(planetRadius, surface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 4000, pythonData.timing?.cosmic_origin_time);
              const cloudsInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "atmosphere_clouds",
                effect: cloudsEffect,
                priority: 15,
                enabled: true,
                name: "Atmospheric Clouds",
              };
              this.effects.set(cloudsInstance.id, cloudsInstance);
              effects.push(cloudsInstance);
              cloudsEffect.addToScene(scene, mesh.position);
            }

            if (surface.land_masses && surface.land_masses.length > 0) {
              const landMassesEffect = createLandMassesFromPythonData(planetRadius, surface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 7000);
              if (landMassesEffect) {
                const landMassesInstance: EffectInstance = {
                  id: `effect_${this.nextId++}`,
                  type: "land_masses",
                  effect: landMassesEffect,
                  priority: 3,
                  enabled: true,
                  name: "Emergent Land Masses",
                };
                this.effects.set(landMassesInstance.id, landMassesInstance);
                effects.push(landMassesInstance);
                landMassesEffect.addToScene(scene, mesh.position);
              }
            }

            if (surface.atmosphere_clouds && surface.atmosphere_clouds.length > 0) {
              const cloudsEffect = createAtmosphereCloudsFromPythonData(planetRadius, surface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 8000, pythonData.timing?.cosmic_origin_time);
              if (cloudsEffect) {
                const cloudsInstance: EffectInstance = {
                  id: `effect_${this.nextId++}`,
                  type: "atmosphere_clouds",
                  effect: cloudsEffect,
                  priority: 4,
                  enabled: true,
                  name: "Atmospheric Clouds",
                };
                this.effects.set(cloudsInstance.id, cloudsInstance);
                effects.push(cloudsInstance);
                cloudsEffect.addToScene(scene, mesh.position);
              }
            }

            if (surface.secondary_clouds && surface.secondary_clouds.length > 0) {
              const secondaryCloudsEffect = createSecondaryCloudsFromPythonData(planetRadius, surface, baseColor, pythonData.seeds?.planet_seed || Math.floor(Math.random() * 1000000), pythonData.timing?.cosmic_origin_time);

              const secondaryCloudsInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "secondary_clouds",
                effect: secondaryCloudsEffect,
                priority: 12,
                enabled: true,
                name: "Aquifer Secondary Clouds",
              };
              this.effects.set(secondaryCloudsInstance.id, secondaryCloudsInstance);
              effects.push(secondaryCloudsInstance);

              if (scene) {
                secondaryCloudsEffect.addToScene(scene);
              }
            }
            break;

          case "nebulous":
            if (this.layerSystem) {
              const nebulaGyrosLayer = createCloudGyrosLayerFromPythonData(
                this.layerSystem,
                {
                  ...surface,
                  base_color: baseColor,
                  storm_intensity: surface.nebula_density || 0.6,
                  color_variance: surface.color_variance || 0.2,
                },
                (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 2000,
              );

              const nebulaGyrosInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "cloud_gyros_layer",
                effect: nebulaGyrosLayer,
                priority: 0,
                enabled: true,
              };
              this.effects.set(nebulaGyrosInstance.id, nebulaGyrosInstance);
              effects.push(nebulaGyrosInstance);

              if (surface.polar_hexagon && surface.polar_hexagon.enabled) {
                const currentTimeYears = pythonData.timing?.elapsed_time ? pythonData.timing.elapsed_time / (365.25 * 24 * 3600) : 0;

                const hexagonEffect = new PolarHexagonEffect({
                  planetColor: baseColor,
                  hexagonData: surface.polar_hexagon,
                  planetRadius: planetRadius,
                  currentTime: currentTimeYears,
                });

                const hexagonInstance: EffectInstance = {
                  id: `effect_${this.nextId++}`,
                  type: "polar_hexagon",
                  effect: hexagonEffect,
                  priority: 10,
                  enabled: true,
                };
                this.effects.set(hexagonInstance.id, hexagonInstance);
                effects.push(hexagonInstance);

                if (scene) {
                  hexagonEffect.addToScene(scene);
                }
              }

              if (surface.clouds && surface.clouds.length > 0) {
                const cloudsEffect = createAtmosphereCloudsFromPythonData(planetRadius, surface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 4000, pythonData.timing?.cosmic_origin_time);

                const cloudsInstance: EffectInstance = {
                  id: `effect_${this.nextId++}`,
                  type: "atmosphere_clouds",
                  effect: cloudsEffect,
                  priority: 15,
                  enabled: true,
                  name: "Nebulous Atmospheric Clouds",
                };

                this.effects.set(cloudsInstance.id, cloudsInstance);
                effects.push(cloudsInstance);
                cloudsEffect.addToScene(scene, mesh.position);
              }

              if (surface.secondary_clouds && surface.secondary_clouds.length > 0) {
                const secondaryCloudsEffect = createSecondaryCloudsFromPythonData(planetRadius, surface, baseColor, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 5000, pythonData.timing?.cosmic_origin_time);

                const secondaryCloudsInstance: EffectInstance = {
                  id: `effect_${this.nextId++}`,
                  type: "secondary_clouds",
                  effect: secondaryCloudsEffect,
                  priority: 12,
                  enabled: true,
                  name: "Nebulous Secondary Clouds",
                };

                this.effects.set(secondaryCloudsInstance.id, secondaryCloudsInstance);
                effects.push(secondaryCloudsInstance);
                secondaryCloudsEffect.addToScene(scene, mesh.position);
              }
            }
            break;

          case "metallic":
          case "metallic_3d":
            if (this.layerSystem) {
              const metallicLayer = createMetallicSurfaceLayerFromPythonData(this.layerSystem, pythonData, pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed);

              const metallicInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "metallic_surface_layer",
                effect: metallicLayer,
                priority: 0,
                enabled: true,
              };
              this.effects.set(metallicInstance.id, metallicInstance);
              effects.push(metallicInstance);

              if (surface.secondary_clouds && surface.secondary_clouds.length > 0) {
                const secondaryCloudsEffect = createSecondaryCloudsFromPythonData(planetRadius, surface, baseColor, pythonData.seeds?.planet_seed || Math.floor(Math.random() * 1000000), pythonData.timing?.cosmic_origin_time);

                const secondaryCloudsInstance: EffectInstance = {
                  id: `effect_${this.nextId++}`,
                  type: "secondary_clouds",
                  effect: secondaryCloudsEffect,
                  priority: 12,
                  enabled: true,
                  name: "Metallic Secondary Clouds",
                };
                this.effects.set(secondaryCloudsInstance.id, secondaryCloudsInstance);
                effects.push(secondaryCloudsInstance);

                if (scene) {
                  secondaryCloudsEffect.addToScene(scene);
                }
              }
            }
            break;

          case "diamond":
            if (this.layerSystem) {
              const diamondLayer = createDiamondSurfaceLayerFromPythonData(this.layerSystem, pythonData, pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed);

              const diamondInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "diamond_surface_layer",
                effect: diamondLayer,
                priority: 0,
                enabled: true,
              };
              this.effects.set(diamondInstance.id, diamondInstance);
              effects.push(diamondInstance);

              const cracksEffect = createTerrainCracksFromPythonData(pythonData, planetRadius, pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed);

              const cracksInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "terrain_cracks",
                effect: cracksEffect,
                priority: 1,
                enabled: true,
              };
              this.effects.set(cracksInstance.id, cracksInstance);
              effects.push(cracksInstance);

              cracksEffect.addToScene(scene, mesh.position);

              if (surface.clouds && surface.clouds.length > 0) {
                const cloudsEffect = createAtmosphereCloudsFromPythonData(planetRadius, surface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 4000, pythonData.timing?.cosmic_origin_time);

                const cloudsInstance: EffectInstance = {
                  id: `effect_${this.nextId++}`,
                  type: "atmosphere_clouds",
                  effect: cloudsEffect,
                  priority: 15,
                  enabled: true,
                  name: "Atmospheric Clouds",
                };

                this.effects.set(cloudsInstance.id, cloudsInstance);
                effects.push(cloudsInstance);
                cloudsEffect.addToScene(scene, mesh.position);
              }

              if (surface.secondary_clouds && surface.secondary_clouds.length > 0) {
                const secondaryCloudsEffect = createSecondaryCloudsFromPythonData(planetRadius, surface, baseColor, pythonData.seeds?.planet_seed || Math.floor(Math.random() * 1000000), pythonData.timing?.cosmic_origin_time);

                const secondaryCloudsInstance: EffectInstance = {
                  id: `effect_${this.nextId++}`,
                  type: "secondary_clouds",
                  effect: secondaryCloudsEffect,
                  priority: 12,
                  enabled: true,
                  name: "Diamond Secondary Clouds",
                };
                this.effects.set(secondaryCloudsInstance.id, secondaryCloudsInstance);
                effects.push(secondaryCloudsInstance);

                if (scene) {
                  secondaryCloudsEffect.addToScene(scene);
                }
              }
            }
            break;

          case "rocky":
            if (this.layerSystem) {
              const rockyLayer = createRockyTerrainLayerFromPythonData(this.layerSystem, pythonData, pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed, "ROCKY");

              const rockyInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "rocky_terrain_layer",
                effect: rockyLayer,
                priority: 0,
                enabled: true,
              };
              this.effects.set(rockyInstance.id, rockyInstance);
              effects.push(rockyInstance);

              if (surface.clouds && surface.clouds.length > 0) {
                const cloudsEffect = createAtmosphereCloudsFromPythonData(planetRadius, surface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 4000, pythonData.timing?.cosmic_origin_time);

                const cloudsInstance: EffectInstance = {
                  id: `effect_${this.nextId++}`,
                  type: "atmosphere_clouds",
                  effect: cloudsEffect,
                  priority: 15,
                  enabled: true,
                  name: "Atmospheric Clouds",
                };

                this.effects.set(cloudsInstance.id, cloudsInstance);
                effects.push(cloudsInstance);
                cloudsEffect.addToScene(scene, mesh.position);
              }

              if (surface.secondary_clouds && surface.secondary_clouds.length > 0) {
                const secondaryCloudsEffect = createSecondaryCloudsFromPythonData(planetRadius, surface, baseColor, pythonData.seeds?.planet_seed || Math.floor(Math.random() * 1000000), pythonData.timing?.cosmic_origin_time);

                const secondaryCloudsInstance: EffectInstance = {
                  id: `effect_${this.nextId++}`,
                  type: "secondary_clouds",
                  effect: secondaryCloudsEffect,
                  priority: 12,
                  enabled: true,
                  name: "Rocky Secondary Clouds",
                };
                this.effects.set(secondaryCloudsInstance.id, secondaryCloudsInstance);
                effects.push(secondaryCloudsInstance);

                if (scene) {
                  secondaryCloudsEffect.addToScene(scene);
                }
              }
            }
            break;

          case "icy":
            if (this.layerSystem) {
              const icyLayer = createIcyTerrainLayerFromPythonData(this.layerSystem, pythonData, pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed);

              const icyInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "icy_terrain_layer",
                effect: icyLayer,
                priority: 0,
                enabled: true,
              };
              this.effects.set(icyInstance.id, icyInstance);
              effects.push(icyInstance);

              const transparentLandMasses = createTransparentLandMassesForIcyPlanet(planetRadius, surface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 8000);

              if (transparentLandMasses) {
                const landMassesInstance: EffectInstance = {
                  id: `effect_${this.nextId++}`,
                  type: "transparent_land_masses",
                  effect: transparentLandMasses,
                  priority: 1,
                  enabled: true,
                  name: "Ice Formations",
                };

                this.effects.set(landMassesInstance.id, landMassesInstance);
                effects.push(landMassesInstance);
                transparentLandMasses.addToScene(scene, mesh.position);
              } else {
              }

              if (surface.clouds && surface.clouds.length > 0) {
                const cloudsEffect = createAtmosphereCloudsFromPythonData(planetRadius, surface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 4000, pythonData.timing?.cosmic_origin_time);

                const cloudsInstance: EffectInstance = {
                  id: `effect_${this.nextId++}`,
                  type: "atmosphere_clouds",
                  effect: cloudsEffect,
                  priority: 15,
                  enabled: true,
                  name: "Atmospheric Clouds",
                };

                this.effects.set(cloudsInstance.id, cloudsInstance);
                effects.push(cloudsInstance);
                cloudsEffect.addToScene(scene, mesh.position);
              }

              const icyFeaturesEffect = createIcyFeaturesFromPythonData(planetRadius, surface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 9000);

              if (icyFeaturesEffect) {
                const icyFeaturesInstance: EffectInstance = {
                  id: `effect_${this.nextId++}`,
                  type: "icy_features",
                  effect: icyFeaturesEffect,
                  priority: 2,
                  enabled: true,
                  name: "Ice Crystals & Features",
                };

                this.effects.set(icyFeaturesInstance.id, icyFeaturesInstance);
                effects.push(icyFeaturesInstance);
                icyFeaturesEffect.addToScene(scene, mesh.position);
              }

              if (surface.secondary_clouds && surface.secondary_clouds.length > 0) {
                const secondaryCloudsEffect = createSecondaryCloudsFromPythonData(planetRadius, surface, baseColor, pythonData.seeds?.planet_seed || Math.floor(Math.random() * 1000000), pythonData.timing?.cosmic_origin_time);

                const secondaryCloudsInstance: EffectInstance = {
                  id: `effect_${this.nextId++}`,
                  type: "secondary_clouds",
                  effect: secondaryCloudsEffect,
                  priority: 12,
                  enabled: true,
                  name: "Icy Secondary Clouds",
                };
                this.effects.set(secondaryCloudsInstance.id, secondaryCloudsInstance);
                effects.push(secondaryCloudsInstance);

                if (scene) {
                  secondaryCloudsEffect.addToScene(scene);
                }
              }
            }
            break;

          case "oceanic":
            const fluidLayersEffect = createFluidLayersFromPythonData(planetRadius, pythonData);

            if (fluidLayersEffect) {
              const fluidLayersInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "fluid_layers",
                effect: fluidLayersEffect,
                priority: 3,
                enabled: true,
                name: "Fluid Ocean Layers",
              };

              this.effects.set(fluidLayersInstance.id, fluidLayersInstance);
              effects.push(fluidLayersInstance);
              fluidLayersEffect.addToScene(scene, mesh.position);
            }

            if (surface.green_patches && surface.green_patches.length > 0) {
              const landMassesEffect = createLandMassesFromPythonData(planetRadius, surface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 6000);

              if (landMassesEffect) {
                const landMassesInstance: EffectInstance = {
                  id: `effect_${this.nextId++}`,
                  type: "land_masses",
                  effect: landMassesEffect,
                  priority: 5,
                  enabled: true,
                  name: "Land Masses (Islands)",
                };

                this.effects.set(landMassesInstance.id, landMassesInstance);
                effects.push(landMassesInstance);
                landMassesEffect.addToScene(scene, mesh.position);
              }
            }

            if (surface.clouds && surface.clouds.length > 0) {
              const cloudsEffect = createAtmosphereCloudsFromPythonData(planetRadius, surface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 4000, pythonData.timing?.cosmic_origin_time);

              const cloudsInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "atmosphere_clouds",
                effect: cloudsEffect,
                priority: 15,
                enabled: true,
                name: "Atmospheric Clouds",
              };

              this.effects.set(cloudsInstance.id, cloudsInstance);
              effects.push(cloudsInstance);
              cloudsEffect.addToScene(scene, mesh.position);
            }

            if (surface.secondary_clouds && surface.secondary_clouds.length > 0) {
              const secondaryCloudsEffect = createSecondaryCloudsFromPythonData(planetRadius, surface, baseColor, pythonData.seeds?.planet_seed || Math.floor(Math.random() * 1000000), pythonData.timing?.cosmic_origin_time);

              const secondaryCloudsInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "secondary_clouds",
                effect: secondaryCloudsEffect,
                priority: 12,
                enabled: true,
                name: "Oceanic Secondary Clouds",
              };
              this.effects.set(secondaryCloudsInstance.id, secondaryCloudsInstance);
              effects.push(secondaryCloudsInstance);

              if (scene) {
                secondaryCloudsEffect.addToScene(scene);
              }
            }
            break;

          case "tundra":
            if (surface.green_patches && surface.green_patches.length > 0) {
              const landMassesEffect = createLandMassesFromPythonData(planetRadius, surface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 6000);

              if (landMassesEffect) {
                const landMassesInstance: EffectInstance = {
                  id: `effect_${this.nextId++}`,
                  type: "land_masses",
                  effect: landMassesEffect,
                  priority: 5,
                  enabled: true,
                  name: "Tundra Terrain",
                };

                this.effects.set(landMassesInstance.id, landMassesInstance);
                effects.push(landMassesInstance);
                landMassesEffect.addToScene(scene, mesh.position);
              }
            }

            const tundraIcyFeatures = createIcyFeaturesFromPythonData(planetRadius, surface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 9000);

            if (tundraIcyFeatures) {
              const icyFeaturesInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "icy_features",
                effect: tundraIcyFeatures,
                priority: 6,
                enabled: true,
                name: "Snow Patches & Ice",
              };

              this.effects.set(icyFeaturesInstance.id, icyFeaturesInstance);
              effects.push(icyFeaturesInstance);
              tundraIcyFeatures.addToScene(scene, mesh.position);
            }

            if (surface.clouds && surface.clouds.length > 0) {
              const cloudsEffect = createAtmosphereCloudsFromPythonData(planetRadius, surface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 4000, pythonData.timing?.cosmic_origin_time);

              const cloudsInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "atmosphere_clouds",
                effect: cloudsEffect,
                priority: 15,
                enabled: true,
                name: "Atmospheric Clouds",
              };

              this.effects.set(cloudsInstance.id, cloudsInstance);
              effects.push(cloudsInstance);
              cloudsEffect.addToScene(scene, mesh.position);
            }

            const snowflakesEffect = createTundraSnowflakesFromPythonData(planetRadius, surface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 15000);

            if (snowflakesEffect) {
              const snowflakesInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "tundra_snowflakes",
                effect: snowflakesEffect,
                priority: 20,
                enabled: true,
                name: "Snowflakes",
              };

              this.effects.set(snowflakesInstance.id, snowflakesInstance);
              effects.push(snowflakesInstance);
              snowflakesEffect.addToScene(scene, mesh.position);
            }
            break;

          case "arid":
            let cloudsEffect;
            if (surface.clouds && surface.clouds.length > 0) {
              cloudsEffect = createAtmosphereCloudsFromPythonData(planetRadius, surface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 4000, pythonData.timing?.cosmic_origin_time);
            } else {
              cloudsEffect = new AtmosphereCloudsEffect(planetRadius, {
                color: new THREE.Color(0.9, 0.8, 0.7),
                cloudCount: 20,
                size: 4.2,
                opacity: 0.7,
                density: 1.2,
                seed: (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 4000,
                rotationSpeed: 0.004,
                movementAmplitude: 0.012,
                puffiness: 1.3,
                timeSpeed: 1.0,
              });
            }

            if (cloudsEffect) {
              const cloudsInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "atmosphere_clouds",
                effect: cloudsEffect,
                priority: 15,
                enabled: true,
                name: "Atmospheric Clouds",
              };

              this.effects.set(cloudsInstance.id, cloudsInstance);
              effects.push(cloudsInstance);
              cloudsEffect.addToScene(scene, mesh.position);
            }

            let landMassesEffect;
            if (surface.green_patches && surface.green_patches.length > 0) {
              const modifiedSurface = {
                ...surface,
                green_patches: surface.green_patches.map((patch: any) => ({
                  ...patch,
                  color: [0.5, 0.0, 0.0, patch.color?.[3] || 1.0],
                })),
              };

              landMassesEffect = createLandMassesFromPythonData(planetRadius, modifiedSurface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 6000);
            } else {
              landMassesEffect = new LandMassesEffect(planetRadius, {
                seed: (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 6000,

                greenPatches: Array.from({ length: 25 }, (_, i) => {
                  const seed = (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 6000 + i * 100;
                  const rng = Math.sin(seed) * 0.5 + 0.5;

                  const phi = Math.acos(1 - (2 * (i + rng)) / 25);
                  const theta = 2 * Math.PI * ((i * 2.399) % 1);

                  let size;
                  if (i < 8) {
                    size = 0.25 + rng * 0.25;
                  } else if (i < 16) {
                    size = 0.15 + rng * 0.15;
                  } else {
                    size = 0.08 + rng * 0.12;
                  }

                  return {
                    position_3d: [Math.sin(phi) * Math.cos(theta), Math.sin(phi) * Math.sin(theta), Math.cos(phi)],
                    size: size,
                    sides: 12 + Math.floor(rng * 16),
                    color: [0.5, 0.0, 0.0, 0.7 + rng * 0.2],
                  };
                }),
              });
            }

            if (landMassesEffect) {
              const landMassesInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "land_masses",
                effect: landMassesEffect,
                priority: 5,
                enabled: true,
                name: "Arid Terrain",
              };

              this.effects.set(landMassesInstance.id, landMassesInstance);
              effects.push(landMassesInstance);
              landMassesEffect.addToScene(scene, mesh.position);
            }

            const riverLinesEffect = createRiverLinesFromPythonData(planetRadius, surface, pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed);
            if (riverLinesEffect) {
              const riverLinesInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "river_lines",
                effect: riverLinesEffect,
                priority: 6,
                enabled: true,
                name: "Dried River Channels",
              };
              this.effects.set(riverLinesInstance.id, riverLinesInstance);
              effects.push(riverLinesInstance);
              riverLinesEffect.addToScene(scene, mesh.position);
            }

            if (surface.secondary_clouds && surface.secondary_clouds.length > 0) {
              const secondaryCloudsEffect = createSecondaryCloudsFromPythonData(planetRadius, surface, baseColor, pythonData.seeds?.planet_seed || Math.floor(Math.random() * 1000000), pythonData.timing?.cosmic_origin_time);

              const secondaryCloudsInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "secondary_clouds",
                effect: secondaryCloudsEffect,
                priority: 12,
                enabled: true,
                name: "Arid Secondary Clouds",
              };
              this.effects.set(secondaryCloudsInstance.id, secondaryCloudsInstance);
              effects.push(secondaryCloudsInstance);

              if (scene) {
                secondaryCloudsEffect.addToScene(scene);
              }
            }
            break;

          case "savannah":
            if (this.layerSystem) {
              const savannahLayer = createSavannahTerrainLayerFromPythonData(this.layerSystem, pythonData, pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed, "SAVANNAH");

              const savannahInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "savannah_terrain_layer",
                effect: savannahLayer,
                priority: 2,
                enabled: true,
                name: "Savannah Terrain Layer",
              };

              this.effects.set(savannahInstance.id, savannahInstance);
              effects.push(savannahInstance);
            }

            if (surface.clouds && surface.clouds.length > 0) {
              const savannahCloudsEffect = createAtmosphereCloudsFromPythonData(planetRadius, surface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 4000, pythonData.timing?.cosmic_origin_time);

              if (savannahCloudsEffect) {
                const savannahCloudsInstance: EffectInstance = {
                  id: `effect_${this.nextId++}`,
                  type: "atmosphere_clouds",
                  effect: savannahCloudsEffect,
                  priority: 15,
                  enabled: true,
                  name: "Savannah Atmospheric Clouds",
                };

                this.effects.set(savannahCloudsInstance.id, savannahCloudsInstance);
                effects.push(savannahCloudsInstance);
                savannahCloudsEffect.addToScene(scene, mesh.position);
              }
            }

            if (surface.green_patches && surface.green_patches.length > 0) {
              const savannahLandMassesEffect = createLandMassesFromPythonData(planetRadius, surface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 6000);

              if (savannahLandMassesEffect) {
                const savannahLandMassesInstance: EffectInstance = {
                  id: `effect_${this.nextId++}`,
                  type: "land_masses",
                  effect: savannahLandMassesEffect,
                  priority: 5,
                  enabled: true,
                  name: "Savannah Terrain",
                };

                this.effects.set(savannahLandMassesInstance.id, savannahLandMassesInstance);
                effects.push(savannahLandMassesInstance);
                savannahLandMassesEffect.addToScene(scene, mesh.position);
              }
            }

            if (surface.secondary_clouds && surface.secondary_clouds.length > 0) {
              const secondaryCloudsEffect = createSecondaryCloudsFromPythonData(planetRadius, surface, baseColor, pythonData.seeds?.planet_seed || Math.floor(Math.random() * 1000000), pythonData.timing?.cosmic_origin_time);

              const secondaryCloudsInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "secondary_clouds",
                effect: secondaryCloudsEffect,
                priority: 12,
                enabled: true,
                name: "Savannah Secondary Clouds",
              };
              this.effects.set(secondaryCloudsInstance.id, secondaryCloudsInstance);
              effects.push(secondaryCloudsInstance);

              if (scene) {
                secondaryCloudsEffect.addToScene(scene);
              }
            }
            break;

          case "desert":
            if (surface.clouds && surface.clouds.length > 0) {
              const desertCloudsEffect = createAtmosphereCloudsFromPythonData(planetRadius, surface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 4000, pythonData.timing?.cosmic_origin_time);

              if (desertCloudsEffect) {
                const desertCloudsInstance: EffectInstance = {
                  id: `effect_${this.nextId++}`,
                  type: "atmosphere_clouds",
                  effect: desertCloudsEffect,
                  priority: 15,
                  enabled: true,
                  name: "Desert Dust Clouds",
                };

                this.effects.set(desertCloudsInstance.id, desertCloudsInstance);
                effects.push(desertCloudsInstance);
                desertCloudsEffect.addToScene(scene, mesh.position);
              }
            }

            if (surface.green_patches && surface.green_patches.length > 0) {
              const desertLandMassesEffect = createLandMassesFromPythonData(planetRadius, surface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 6000);

              if (desertLandMassesEffect) {
                const desertLandMassesInstance: EffectInstance = {
                  id: `effect_${this.nextId++}`,
                  type: "land_masses",
                  effect: desertLandMassesEffect,
                  priority: 5,
                  enabled: true,
                  name: "Desert Oases",
                };

                this.effects.set(desertLandMassesInstance.id, desertLandMassesInstance);
                effects.push(desertLandMassesInstance);
                desertLandMassesEffect.addToScene(scene, mesh.position);
              }
            }

            const desertWaterFeaturesEffect = createSuperEarthWaterFeaturesFromPythonData(planetRadius, surface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 7000, "desert");

            if (desertWaterFeaturesEffect) {
              const desertWaterFeaturesInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "super_earth_water_features",
                effect: desertWaterFeaturesEffect,
                priority: 6,
                enabled: true,
                name: "Desert Rare Water Mass",
              };

              this.effects.set(desertWaterFeaturesInstance.id, desertWaterFeaturesInstance);
              effects.push(desertWaterFeaturesInstance);
              desertWaterFeaturesEffect.addToScene(scene, mesh.position);
            }

            const desertSnowflakesEffect = createDesertSandstormsFromPythonData(planetRadius, surface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 15000);
            if (desertSnowflakesEffect) {
              const desertSnowflakesInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "tundra_snowflakes",
                effect: desertSnowflakesEffect,
                priority: 20,
                enabled: true,
                name: "Desert Sandstorms",
              };
              this.effects.set(desertSnowflakesInstance.id, desertSnowflakesInstance);
              effects.push(desertSnowflakesInstance);
              desertSnowflakesEffect.addToScene(scene, mesh.position);
            }

            if (surface.savannah_terrain_layer && this.layerSystem) {
              const desertSavannahLayer = createSavannahTerrainLayerFromPythonData(this.layerSystem, pythonData, pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed, "SAVANNAH");

              const desertSavannahInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "savannah_terrain_layer",
                effect: desertSavannahLayer,
                priority: 2,
                enabled: true,
                name: "Desert Savannah Terrain",
              };

              this.effects.set(desertSavannahInstance.id, desertSavannahInstance);
              effects.push(desertSavannahInstance);
            }
            break;

          case "molten_core":
          case "molten core":
            const moltenLavaEffect = createMoltenLavaFromPythonData(this.layerSystem!, pythonData);

            if (moltenLavaEffect) {
              const moltenLavaInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "molten_lava",
                effect: moltenLavaEffect,
                priority: 2,
                enabled: true,
                name: "Molten Lava Surface",
              };

              this.effects.set(moltenLavaInstance.id, moltenLavaInstance);
              effects.push(moltenLavaInstance);
            }

            const lavaFlowsEffect = createLavaFlowsFromPythonData(planetRadius, surface, (pythonData.seeds?.planet_seed || pythonData.seeds?.shape_seed) + 9000);

            if (lavaFlowsEffect) {
              const lavaFlowsInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "lava_flows",
                effect: lavaFlowsEffect,
                priority: 4,
                enabled: true,
                name: "Lava Flows & Fire Whips",
              };

              this.effects.set(lavaFlowsInstance.id, lavaFlowsInstance);
              effects.push(lavaFlowsInstance);
              lavaFlowsEffect.addToScene(scene, mesh.position);
            }

            const fireEruptionEffect = this.createEffectFromPythonData(EffectType.FIRE_ERUPTION, pythonData, planetRadius, mesh)?.effect;

            if (fireEruptionEffect) {
              const fireEruptionInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "fire_eruption",
                effect: fireEruptionEffect,
                priority: 15,
                enabled: true,
                name: "Fire Eruptions",
              };

              this.effects.set(fireEruptionInstance.id, fireEruptionInstance);
              effects.push(fireEruptionInstance);
              fireEruptionEffect.addToScene(scene, mesh.position);
            }

            if (surface.green_patches && surface.green_patches.length > 0) {
              const moltenCoreMassesData = {
                ...surface,
                green_patches: surface.green_patches.map((patch: any) => ({
                  ...patch,

                  color: [1.0, 0.55, 0.0, patch.color?.[3] || 0.9],
                })),
              };

              const incandescientLandMasses = createLandMassesFromPythonData(planetRadius, moltenCoreMassesData, (pythonData.seeds?.planet_seed || pythonData.seeds?.shape_seed) + 10000);

              if (incandescientLandMasses) {
                const landMassesInstance: EffectInstance = {
                  id: `effect_${this.nextId++}`,
                  type: "land_masses",
                  effect: incandescientLandMasses,
                  priority: 3,
                  enabled: true,
                  name: "Incandescent Land Masses",
                };

                this.effects.set(landMassesInstance.id, landMassesInstance);
                effects.push(landMassesInstance);
                incandescientLandMasses.addToScene(scene, mesh.position);
              }
            }

            if (surface.clouds && surface.clouds.length > 0) {
              const moltenCloudsEffect = createAtmosphereCloudsFromPythonData(planetRadius, surface, (pythonData.seeds?.planet_seed || pythonData.seeds?.shape_seed) + 4000, pythonData.timing?.cosmic_origin_time);

              const moltenCloudsInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "atmosphere_clouds",
                effect: moltenCloudsEffect,
                priority: 15,
                enabled: true,
                name: "Molten Atmospheric Clouds",
              };

              this.effects.set(moltenCloudsInstance.id, moltenCloudsInstance);
              effects.push(moltenCloudsInstance);
              moltenCloudsEffect.addToScene(scene, mesh.position);
            }

            if (surface.secondary_clouds && surface.secondary_clouds.length > 0) {
              const secondaryCloudsEffect = createSecondaryCloudsFromPythonData(planetRadius, surface, baseColor, pythonData.seeds?.planet_seed || Math.floor(Math.random() * 1000000), pythonData.timing?.cosmic_origin_time);

              const secondaryCloudsInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "secondary_clouds",
                effect: secondaryCloudsEffect,
                priority: 12,
                enabled: true,
                name: "Molten Core Secondary Clouds",
              };
              this.effects.set(secondaryCloudsInstance.id, secondaryCloudsInstance);
              effects.push(secondaryCloudsInstance);

              if (scene) {
                secondaryCloudsEffect.addToScene(scene);
              }
            }
            break;

          case "lava":
            const terrainCracksEffect = createTerrainCracksFromPythonData(pythonData, planetRadius, pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed);

            if (terrainCracksEffect) {
              const cracksInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "terrain_cracks",
                effect: terrainCracksEffect,
                priority: 1,
                enabled: true,
                name: "Lava Terrain Cracks",
              };
              this.effects.set(cracksInstance.id, cracksInstance);
              effects.push(cracksInstance);
              terrainCracksEffect.addToScene(scene, mesh.position);
            }

            const lavaRiversEffect = this.createEffectFromPythonData(EffectType.LAVA_RIVERS, pythonData, planetRadius, mesh)?.effect;

            if (lavaRiversEffect) {
              const lavaRiversInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "lava_rivers",
                effect: lavaRiversEffect,
                priority: 8,
                enabled: true,
                name: "Lava Rivers",
              };

              this.effects.set(lavaRiversInstance.id, lavaRiversInstance);
              effects.push(lavaRiversInstance);
              lavaRiversEffect.addToScene(scene, mesh.position);
            }

            const lavaFireEruptionEffect = this.createEffectFromPythonData(EffectType.FIRE_ERUPTION, pythonData, planetRadius, mesh)?.effect;

            if (lavaFireEruptionEffect) {
              const lavaFireEruptionInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "fire_eruption",
                effect: lavaFireEruptionEffect,
                priority: 12,
                enabled: true,
                name: "Lava Planet Fire Eruptions",
              };

              this.effects.set(lavaFireEruptionInstance.id, lavaFireEruptionInstance);
              effects.push(lavaFireEruptionInstance);
              lavaFireEruptionEffect.addToScene(scene, mesh.position);
            }

            if (surface.green_patches && surface.green_patches.length > 0) {
              const lavaLandMassesData = {
                ...surface,
                green_patches: surface.green_patches.map((patch: any) => ({
                  ...patch,

                  color: [0.8, 0.3, 0.0, patch.color?.[3] || 0.7],
                })),
              };

              const lavaLandMasses = createLandMassesFromPythonData(planetRadius, lavaLandMassesData, (pythonData.seeds?.planet_seed || pythonData.seeds?.shape_seed) + 11000);

              if (lavaLandMasses) {
                const lavaLandMassesInstance: EffectInstance = {
                  id: `effect_${this.nextId++}`,
                  type: "land_masses",
                  effect: lavaLandMasses,
                  priority: 3,
                  enabled: true,
                  name: "Lava Land Masses",
                };

                this.effects.set(lavaLandMassesInstance.id, lavaLandMassesInstance);
                effects.push(lavaLandMassesInstance);
                lavaLandMasses.addToScene(scene, mesh.position);
              }
            }

            if (surface.clouds && surface.clouds.length > 0) {
              const lavaCloudsEffect = createAtmosphereCloudsFromPythonData(planetRadius, surface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 7000, pythonData.timing?.cosmic_origin_time);

              if (lavaCloudsEffect) {
                const lavaCloudsInstance: EffectInstance = {
                  id: `effect_${this.nextId++}`,
                  type: "atmosphere_clouds",
                  effect: lavaCloudsEffect,
                  priority: 16,
                  enabled: true,
                  name: "Volcanic Ash Clouds",
                };

                this.effects.set(lavaCloudsInstance.id, lavaCloudsInstance);
                effects.push(lavaCloudsInstance);
                lavaCloudsEffect.addToScene(scene, mesh.position);
              }
            }

            if (surface.secondary_clouds && surface.secondary_clouds.length > 0) {
              const secondaryCloudsEffect = createSecondaryCloudsFromPythonData(planetRadius, surface, baseColor, pythonData.seeds?.planet_seed || Math.floor(Math.random() * 1000000), pythonData.timing?.cosmic_origin_time);

              const secondaryCloudsInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "secondary_clouds",
                effect: secondaryCloudsEffect,
                priority: 12,
                enabled: true,
                name: "Lava Secondary Clouds",
              };
              this.effects.set(secondaryCloudsInstance.id, secondaryCloudsInstance);
              effects.push(secondaryCloudsInstance);

              if (scene) {
                secondaryCloudsEffect.addToScene(scene);
              }
            }
            break;

          case "exotic":
            if (surface.clouds && surface.clouds.length > 0) {
              const cloudsEffect = createAtmosphereCloudsFromPythonData(planetRadius, surface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 4000, pythonData.timing?.cosmic_origin_time);

              const cloudsInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "atmosphere_clouds",
                effect: cloudsEffect,
                priority: 15,
                enabled: true,
                name: "Exotic Atmospheric Clouds",
              };

              this.effects.set(cloudsInstance.id, cloudsInstance);
              effects.push(cloudsInstance);
              cloudsEffect.addToScene(scene, mesh.position);
            }

            const geometricShapesEffect = createExoticGeometricShapesFromPythonData(planetRadius, surface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 5000, baseColor);

            if (geometricShapesEffect) {
              const shapesInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: EffectType.EXOTIC_GEOMETRIC_SHAPES,
                effect: geometricShapesEffect,
                priority: 10,
                enabled: true,
                name: "Exotic Geometric Shapes",
              };

              this.effects.set(shapesInstance.id, shapesInstance);
              effects.push(shapesInstance);
              geometricShapesEffect.addToScene(scene, mesh.position);
            }

            const doodlesEffect = createExoticDoodlesFromPythonData(planetRadius, surface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 6000, pythonData);

            if (doodlesEffect) {
              const doodlesInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: EffectType.EXOTIC_DOODLES,
                effect: doodlesEffect,
                priority: 12,
                enabled: true,
                name: "Exotic Doodles",
              };

              this.effects.set(doodlesInstance.id, doodlesInstance);
              effects.push(doodlesInstance);
              doodlesEffect.addToScene(scene, mesh.position);
            }

            if (surface.secondary_clouds && surface.secondary_clouds.length > 0) {
              const secondaryCloudsEffect = createSecondaryCloudsFromPythonData(planetRadius, surface, baseColor, pythonData.seeds?.planet_seed || Math.floor(Math.random() * 1000000), pythonData.timing?.cosmic_origin_time);

              const secondaryCloudsInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "secondary_clouds",
                effect: secondaryCloudsEffect,
                priority: 12,
                enabled: true,
                name: "Exotic Secondary Clouds",
              };
              this.effects.set(secondaryCloudsInstance.id, secondaryCloudsInstance);
              effects.push(secondaryCloudsInstance);

              if (scene) {
                secondaryCloudsEffect.addToScene(scene);
              }
            }
            break;

          case "cave":
            let caveCloudsEffect;
            if (surface.atmosphere_clouds && surface.atmosphere_clouds.clouds && surface.atmosphere_clouds.clouds.length > 0) {
              caveCloudsEffect = createAtmosphereCloudsFromPythonData(planetRadius, surface.atmosphere_clouds, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 4000, pythonData.timing?.cosmic_origin_time);
            } else {
              caveCloudsEffect = new AtmosphereCloudsEffect(planetRadius, {
                color: new THREE.Color(0.75, 0.75, 0.75),
                cloudCount: 12,
                size: 3.5,
                opacity: 0.65,
                density: 0.8,
                seed: (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 4000,
                rotationSpeed: 0.003,
                movementAmplitude: 0.008,
                puffiness: 1.1,
                timeSpeed: 0.8,
              });
            }

            if (caveCloudsEffect) {
              const caveCloudsInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "atmosphere_clouds",
                effect: caveCloudsEffect,
                priority: 15,
                enabled: true,
                name: "Cave Atmospheric Clouds",
              };

              this.effects.set(caveCloudsInstance.id, caveCloudsInstance);
              effects.push(caveCloudsInstance);
              caveCloudsEffect.addToScene(scene, mesh.position);
            }

            let caveLandMassesEffect;
            if (surface.green_patches && surface.green_patches.length > 0) {
              caveLandMassesEffect = createLandMassesFromPythonData(planetRadius, surface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 5000);
            } else {
              const rng = new SeededRandom((pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 5000);
              const largeGreenPatches = [];

              for (let i = 0; i < 10; i++) {
                const theta = rng.random() * 2 * Math.PI;
                const phi = Math.acos(rng.random() * 2 - 1);

                let size;
                if (i < 3) {
                  size = 0.2 + rng.random() * 0.2;
                } else if (i < 7) {
                  size = 0.12 + rng.random() * 0.13;
                } else {
                  size = 0.08 + rng.random() * 0.07;
                }

                largeGreenPatches.push({
                  position_3d: [Math.sin(phi) * Math.cos(theta), Math.sin(phi) * Math.sin(theta), Math.cos(phi)],
                  size: size,
                  sides: 12 + Math.floor(rng.random() * 8),
                  color: [0.29, 0.25, 0.21, 0.75 + rng.random() * 0.15],
                });
              }

              caveLandMassesEffect = new LandMassesEffect(planetRadius, {
                greenPatches: largeGreenPatches,
                seed: (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 5000,
              });
            }

            if (caveLandMassesEffect) {
              const caveLandMassesInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "land_masses",
                effect: caveLandMassesEffect,
                priority: 5,
                enabled: true,
                name: "Cave Land Masses",
              };

              this.effects.set(caveLandMassesInstance.id, caveLandMassesInstance);
              effects.push(caveLandMassesInstance);
              caveLandMassesEffect.addToScene(scene, mesh.position);
            }

            if (this.layerSystem) {
              const caveRockyLayer = createRockyTerrainLayerFromPythonData(this.layerSystem, pythonData, pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed, "CAVE");

              const caveRockyInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "rocky_terrain_layer",
                effect: caveRockyLayer,
                priority: 1,
                enabled: true,
                name: "Cave Rocky Terrain",
              };
              this.effects.set(caveRockyInstance.id, caveRockyInstance);
              effects.push(caveRockyInstance);
            }

            const caveSurfaceHolesEffect = createCaveSurfaceHolesFromPythonData(planetRadius, pythonData, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 6000);

            if (caveSurfaceHolesEffect) {
              const caveSurfaceHolesInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: EffectType.CAVE_SURFACE_HOLES,
                effect: caveSurfaceHolesEffect,
                priority: 10,
                enabled: true,
                name: "Cave Surface Holes",
              };

              this.effects.set(caveSurfaceHolesInstance.id, caveSurfaceHolesInstance);
              effects.push(caveSurfaceHolesInstance);
              caveSurfaceHolesEffect.addToScene(scene, mesh.position);

              if (this.layerSystem) {
                caveSurfaceHolesEffect.applyToPlanetSystem(this.layerSystem, baseColor);
              }
            }

            const caveRiverLinesEffect = createRiverLinesFromPythonData(planetRadius, surface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 7000);

            if (caveRiverLinesEffect) {
              const caveRiverLinesInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: EffectType.RIVER_LINES,
                effect: caveRiverLinesEffect,
                priority: 8,
                enabled: true,
                name: "Cave Drainage Channels",
              };

              this.effects.set(caveRiverLinesInstance.id, caveRiverLinesInstance);
              effects.push(caveRiverLinesInstance);
              caveRiverLinesEffect.addToScene(scene, mesh.position);
            }

            if (surface.secondary_clouds && surface.secondary_clouds.length > 0) {
              const secondaryCloudsEffect = createSecondaryCloudsFromPythonData(planetRadius, surface, baseColor, pythonData.seeds?.planet_seed || Math.floor(Math.random() * 1000000), pythonData.timing?.cosmic_origin_time);

              const secondaryCloudsInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "secondary_clouds",
                effect: secondaryCloudsEffect,
                priority: 12,
                enabled: true,
                name: "Cave Secondary Clouds",
              };
              this.effects.set(secondaryCloudsInstance.id, secondaryCloudsInstance);
              effects.push(secondaryCloudsInstance);

              if (scene) {
                secondaryCloudsEffect.addToScene(scene);
              }
            }
            break;

          case "anomaly":
            const allAnomalyEffects = [EffectType.ANOMALY_PHASE_MATTER, EffectType.PULSATING_CUBE, EffectType.PLANET_RAYS];

            const selectedEffects = allAnomalyEffects;
            const anomalySeed = pythonData.seeds?.planet_seed || Math.floor(Math.random() * 1000000);
            const numEffects = selectedEffects.length;

            for (let i = 0; i < numEffects; i++) {
              const effectType = selectedEffects[i];
              const effectSeed = anomalySeed + i * 10000;

              const anomalyEffect = this.createEffectFromPythonData(effectType, { ...pythonData, seeds: { ...pythonData.seeds, planet_seed: effectSeed } }, planetRadius, mesh, 10 + i);

              if (anomalyEffect) {
                anomalyEffect.name = effectType.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
                effects.push(anomalyEffect);

                if (anomalyEffect.effect.addToScene) {
                  anomalyEffect.effect.addToScene(scene, mesh.position);
                }
              }
            }

            if (pythonData.atmosphere && pythonData.atmosphere.type !== "None") {
              const atmosphereEffect = this.createEffectFromPythonData(EffectType.ATMOSPHERE, pythonData.atmosphere, planetRadius, mesh, 5);
              if (atmosphereEffect) {
                effects.push(atmosphereEffect);
                atmosphereEffect.effect.addToScene(scene, mesh.position);
              }
            }

            if (surface.secondary_clouds && surface.secondary_clouds.length > 0) {
              const secondaryCloudsEffect = createSecondaryCloudsFromPythonData(planetRadius, surface, baseColor, pythonData.seeds?.planet_seed || Math.floor(Math.random() * 1000000), pythonData.timing?.cosmic_origin_time);

              const secondaryCloudsInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "secondary_clouds",
                effect: secondaryCloudsEffect,
                priority: 12,
                enabled: true,
                name: "Anomaly Secondary Clouds",
              };
              this.effects.set(secondaryCloudsInstance.id, secondaryCloudsInstance);
              effects.push(secondaryCloudsInstance);

              if (scene) {
                secondaryCloudsEffect.addToScene(scene);
              }
            }
            break;

          case "carbon":
            if (surface.clouds && surface.clouds.length > 0) {
              const carbonCloudsEffect = createAtmosphereCloudsFromPythonData(planetRadius, surface, (pythonData.seeds?.planet_seed || pythonData.seeds?.shape_seed) + 4000, pythonData.timing?.cosmic_origin_time);

              const carbonCloudsInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "atmosphere_clouds",
                effect: carbonCloudsEffect,
                priority: 15,
                enabled: true,
                name: "Carbon Atmospheric Dust",
              };
              this.effects.set(carbonCloudsInstance.id, carbonCloudsInstance);
              effects.push(carbonCloudsInstance);
              carbonCloudsEffect.addToScene(scene, mesh.position);
            }

            if (surface.green_patches && surface.green_patches.length > 0) {
              const modifiedSurface = {
                ...surface,
                green_patches: surface.green_patches.map((patch: any) => ({
                  ...patch,

                  color: [0.1, 0.07, 0.06, patch.color?.[3] || 0.9],

                  size: (patch.size || 0.1) * 1.5,
                })),
              };

              const carbonLandMassesEffect = createLandMassesFromPythonData(planetRadius, modifiedSurface, (pythonData.seeds?.planet_seed || pythonData.seeds?.shape_seed) + 6000);

              if (carbonLandMassesEffect) {
                const carbonLandMassesInstance: EffectInstance = {
                  id: `effect_${this.nextId++}`,
                  type: "land_masses",
                  effect: carbonLandMassesEffect,
                  priority: 5,
                  enabled: true,
                  name: "Carbon Formations",
                };
                this.effects.set(carbonLandMassesInstance.id, carbonLandMassesInstance);
                effects.push(carbonLandMassesInstance);
                carbonLandMassesEffect.addToScene(scene, mesh.position);
              }
            }

            const carbonDustEffect = createCarbonDustParticlesFromPythonData(planetRadius, surface, (pythonData.seeds?.planet_seed || pythonData.seeds?.shape_seed) + 15000);

            if (carbonDustEffect) {
              const carbonDustInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "tundra_snowflakes",
                effect: carbonDustEffect,
                priority: 20,
                enabled: true,
                name: "Carbon Dust Particles",
              };
              this.effects.set(carbonDustInstance.id, carbonDustInstance);
              effects.push(carbonDustInstance);
              carbonDustEffect.addToScene(scene, mesh.position);
            }

            const carbonTrailsEffect = this.createEffectFromPythonData(EffectType.CARBON_TRAILS, pythonData, planetRadius, mesh);

            if (carbonTrailsEffect) {
              const carbonTrailsInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "carbon_trails",
                effect: carbonTrailsEffect.effect,
                priority: 25,
                enabled: true,
                name: "Carbon Gas Trails",
              };
              this.effects.set(carbonTrailsInstance.id, carbonTrailsInstance);
              effects.push(carbonTrailsInstance);
              carbonTrailsEffect.effect.addToScene(scene, mesh.position);
            }

            if (surface.secondary_clouds && surface.secondary_clouds.length > 0) {
              const secondaryCloudsEffect = createSecondaryCloudsFromPythonData(planetRadius, surface, baseColor, pythonData.seeds?.planet_seed || Math.floor(Math.random() * 1000000), pythonData.timing?.cosmic_origin_time);

              const secondaryCloudsInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "secondary_clouds",
                effect: secondaryCloudsEffect,
                priority: 12,
                enabled: true,
                name: "Carbon Secondary Clouds",
              };
              this.effects.set(secondaryCloudsInstance.id, secondaryCloudsInstance);
              effects.push(secondaryCloudsInstance);

              if (scene) {
                secondaryCloudsEffect.addToScene(scene);
              }
            }
            break;

          case "forest":
            const vegetationEffect = this.createEffectFromPythonData(EffectType.VEGETATION, pythonData, planetRadius, mesh);

            if (vegetationEffect) {
              const vegetationInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "vegetation",
                effect: vegetationEffect.effect,
                priority: 10,
                enabled: true,
                name: "Forest Vegetation",
              };

              this.effects.set(vegetationInstance.id, vegetationInstance);
              effects.push(vegetationInstance);
              vegetationEffect.effect.addToScene(scene, mesh.position);
            }

            if (surface.clouds && surface.clouds.length > 0) {
              const forestCloudsEffect = createAtmosphereCloudsFromPythonData(planetRadius, surface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 4000, pythonData.timing?.cosmic_origin_time);

              if (forestCloudsEffect) {
                const forestCloudsInstance: EffectInstance = {
                  id: `effect_${this.nextId++}`,
                  type: "atmosphere_clouds",
                  effect: forestCloudsEffect,
                  priority: 15,
                  enabled: true,
                  name: "Forest Atmospheric Clouds",
                };
                this.effects.set(forestCloudsInstance.id, forestCloudsInstance);
                effects.push(forestCloudsInstance);
                forestCloudsEffect.addToScene(scene, mesh.position);
              }
            }

            if (surface.green_patches && surface.green_patches.length > 0) {
              const forestLandMassesData = {
                ...surface,
                green_patches: surface.green_patches.map((patch: any) => ({
                  ...patch,

                  size: (patch.size || 0.1) * 1.5,
                  color: patch.color || [0.2, 0.4, 0.1, 1.0],
                })),
              };

              const forestLandMassesEffect = createLandMassesFromPythonData(planetRadius, forestLandMassesData, (pythonData.seeds?.planet_seed || pythonData.seeds?.shape_seed) + 6000);

              if (forestLandMassesEffect) {
                const forestLandMassesInstance: EffectInstance = {
                  id: `effect_${this.nextId++}`,
                  type: "land_masses",
                  effect: forestLandMassesEffect,
                  priority: 5,
                  enabled: true,
                  name: "Forest Land Masses",
                };

                this.effects.set(forestLandMassesInstance.id, forestLandMassesInstance);
                effects.push(forestLandMassesInstance);
                forestLandMassesEffect.addToScene(scene, mesh.position);
              }
            }

            if (surface.secondary_clouds && surface.secondary_clouds.length > 0) {
              const secondaryCloudsEffect = createSecondaryCloudsFromPythonData(planetRadius, surface, baseColor, pythonData.seeds?.planet_seed || Math.floor(Math.random() * 1000000), pythonData.timing?.cosmic_origin_time);

              const secondaryCloudsInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "secondary_clouds",
                effect: secondaryCloudsEffect,
                priority: 12,
                enabled: true,
                name: "Forest Secondary Clouds",
              };
              this.effects.set(secondaryCloudsInstance.id, secondaryCloudsInstance);
              effects.push(secondaryCloudsInstance);

              if (scene) {
                secondaryCloudsEffect.addToScene(scene);
              }
            }
            break;

          case "magma":
            const magmaFlowsEffect = this.createEffectFromPythonData(EffectType.MAGMA_FLOWS, pythonData, planetRadius, mesh);

            if (magmaFlowsEffect) {
              const magmaFlowsInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "magma_flows",
                effect: magmaFlowsEffect.effect,
                priority: 12,
                enabled: true,
                name: "Magma Flows & Lakes",
              };

              this.effects.set(magmaFlowsInstance.id, magmaFlowsInstance);
              effects.push(magmaFlowsInstance);
              magmaFlowsEffect.effect.addToScene(scene, mesh.position);
            }

            const magmaEruptionsEffect = this.createEffectFromPythonData(EffectType.MAGMA_ERUPTIONS, pythonData, planetRadius, mesh);

            if (magmaEruptionsEffect) {
              const magmaEruptionsInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "magma_eruptions",
                effect: magmaEruptionsEffect.effect,
                priority: 13,
                enabled: true,
                name: "Magma Eruptions & Arcs",
              };

              this.effects.set(magmaEruptionsInstance.id, magmaEruptionsInstance);
              effects.push(magmaEruptionsInstance);
              magmaEruptionsEffect.effect.addToScene(scene, mesh.position);
            }

            if (surface.clouds && surface.clouds.length > 0) {
              const magmaCloudsEffect = createAtmosphereCloudsFromPythonData(planetRadius, surface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 4000, pythonData.timing?.cosmic_origin_time);

              if (magmaCloudsEffect) {
                const magmaCloudsInstance: EffectInstance = {
                  id: `effect_${this.nextId++}`,
                  type: "atmosphere_clouds",
                  effect: magmaCloudsEffect,
                  priority: 15,
                  enabled: true,
                  name: "Magma Atmospheric Clouds",
                };
                this.effects.set(magmaCloudsInstance.id, magmaCloudsInstance);
                effects.push(magmaCloudsInstance);
                magmaCloudsEffect.addToScene(scene, mesh.position);
              }
            }

            if (surface.green_patches && surface.green_patches.length > 0) {
              const magmaLandMassesEffect = createLandMassesFromPythonData(planetRadius, surface, (pythonData.seeds?.planet_seed || pythonData.seeds?.shape_seed) + 6000);

              if (magmaLandMassesEffect) {
                const magmaLandMassesInstance: EffectInstance = {
                  id: `effect_${this.nextId++}`,
                  type: "land_masses",
                  effect: magmaLandMassesEffect,
                  priority: 5,
                  enabled: true,
                  name: "Magmatic Land Masses",
                };

                this.effects.set(magmaLandMassesInstance.id, magmaLandMassesInstance);
                effects.push(magmaLandMassesInstance);
                magmaLandMassesEffect.addToScene(scene, mesh.position);
              }
            }

            if (surface.secondary_clouds && surface.secondary_clouds.length > 0) {
              const secondaryCloudsEffect = createSecondaryCloudsFromPythonData(planetRadius, surface, baseColor, pythonData.seeds?.planet_seed || Math.floor(Math.random() * 1000000), pythonData.timing?.cosmic_origin_time);

              const secondaryCloudsInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "secondary_clouds",
                effect: secondaryCloudsEffect,
                priority: 12,
                enabled: true,
                name: "Magma Secondary Clouds",
              };
              this.effects.set(secondaryCloudsInstance.id, secondaryCloudsInstance);
              effects.push(secondaryCloudsInstance);

              if (scene) {
                secondaryCloudsEffect.addToScene(scene);
              }
            }
            break;

          case "crystalline":
            const crystallineSurfaceEffect = this.createEffectFromPythonData(EffectType.CRYSTALLINE_SURFACE, pythonData, planetRadius, mesh);

            if (crystallineSurfaceEffect) {
              const crystallineSurfaceInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "crystalline_surface",
                effect: crystallineSurfaceEffect.effect,
                priority: 3,
                enabled: true,
                name: "Advanced Crystalline Surface",
              };

              this.effects.set(crystallineSurfaceInstance.id, crystallineSurfaceInstance);
              effects.push(crystallineSurfaceInstance);
              crystallineSurfaceEffect.effect.addToScene(scene, mesh.position);
            }
            break;

          case "toxic":
            if (surface.clouds && surface.clouds.length > 0) {
              const toxicCloudsEffect = createAtmosphereCloudsFromPythonData(planetRadius, surface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 4000, pythonData.timing?.cosmic_origin_time);

              const toxicCloudsInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "atmosphere_clouds",
                effect: toxicCloudsEffect,
                priority: 15,
                enabled: true,
                name: "Toxic Purple Clouds",
              };

              this.effects.set(toxicCloudsInstance.id, toxicCloudsInstance);
              effects.push(toxicCloudsInstance);
              toxicCloudsEffect.addToScene(scene, mesh.position);
            }

            if (surface.green_patches && surface.green_patches.length > 0) {
              const toxicLandMassesEffect = createLandMassesFromPythonData(planetRadius, surface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 4500);

              if (toxicLandMassesEffect) {
                const toxicLandMassesInstance: EffectInstance = {
                  id: `effect_${this.nextId++}`,
                  type: "land_masses",
                  effect: toxicLandMassesEffect,
                  priority: 10,
                  enabled: true,
                  name: "Toxic Contaminated Areas",
                };

                this.effects.set(toxicLandMassesInstance.id, toxicLandMassesInstance);
                effects.push(toxicLandMassesInstance);
                toxicLandMassesEffect.addToScene(scene, mesh.position);
              }
            }

            const toxicParticlesEffect = createToxicParticlesFromPythonData(planetRadius, surface, (pythonData.seeds?.planet_seed || pythonData.seeds?.shape_seed) + 15000);

            if (toxicParticlesEffect) {
              const toxicParticlesInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "tundra_snowflakes",
                effect: toxicParticlesEffect,
                priority: 20,
                enabled: true,
                name: "Toxic Particles",
              };

              this.effects.set(toxicParticlesInstance.id, toxicParticlesInstance);
              effects.push(toxicParticlesInstance);
              toxicParticlesEffect.addToScene(scene, mesh.position);
            }

            const toxicWasteEffect = createToxicWasteFromPythonData(planetRadius, surface, pythonData.seeds?.planet_seed);
            if (toxicWasteEffect) {
              const toxicWasteInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "toxic_waste_render",
                effect: toxicWasteEffect,
                priority: 25,
                enabled: true,
                name: "Toxic Waste Polygonal Spots",
              };
              this.effects.set(toxicWasteInstance.id, toxicWasteInstance);
              effects.push(toxicWasteInstance);
              toxicWasteEffect.addToScene(scene, mesh.position);
            }
            break;

          case "radioactive":
            if (surface.clouds && surface.clouds.length > 0) {
              const radioactiveCloudsEffect = createAtmosphereCloudsFromPythonData(planetRadius, surface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 5000, pythonData.timing?.cosmic_origin_time);

              const radioactiveCloudsInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "atmosphere_clouds",
                effect: radioactiveCloudsEffect,
                priority: 15,
                enabled: true,
                name: "Radioactive Toxic Clouds",
              };

              this.effects.set(radioactiveCloudsInstance.id, radioactiveCloudsInstance);
              effects.push(radioactiveCloudsInstance);
              radioactiveCloudsEffect.addToScene(scene, mesh.position);
            }

            if (surface.green_patches && surface.green_patches.length > 0) {
              const radioactiveLandMassesEffect = createLandMassesFromPythonData(planetRadius, surface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 6000);

              if (radioactiveLandMassesEffect) {
                const radioactiveLandMassesInstance: EffectInstance = {
                  id: `effect_${this.nextId++}`,
                  type: "land_masses",
                  effect: radioactiveLandMassesEffect,
                  priority: 10,
                  enabled: true,
                  name: "Radioactive Contaminated Areas",
                };

                this.effects.set(radioactiveLandMassesInstance.id, radioactiveLandMassesInstance);
                effects.push(radioactiveLandMassesInstance);
                radioactiveLandMassesEffect.addToScene(scene, mesh.position);
              }
            }

            const radiationRingsEffect = this.createEffectFromPythonData(EffectType.RADIATION_RINGS, pythonData, planetRadius, mesh);

            if (radiationRingsEffect) {
              const radiationRingsInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "radiation_rings",
                effect: radiationRingsEffect.effect,
                priority: 21,
                enabled: true,
                name: "Radioactive Surface Rings",
              };

              this.effects.set(radiationRingsInstance.id, radiationRingsInstance);
              effects.push(radiationRingsInstance);
              radiationRingsEffect.effect.addToScene(scene, mesh.position);
            }

            if (surface.secondary_clouds && surface.secondary_clouds.length > 0) {
              const secondaryCloudsEffect = createSecondaryCloudsFromPythonData(planetRadius, surface, baseColor, pythonData.seeds?.planet_seed || Math.floor(Math.random() * 1000000), pythonData.timing?.cosmic_origin_time);

              const secondaryCloudsInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "secondary_clouds",
                effect: secondaryCloudsEffect,
                priority: 12,
                enabled: true,
                name: "Radioactive Secondary Clouds",
              };
              this.effects.set(secondaryCloudsInstance.id, secondaryCloudsInstance);
              effects.push(secondaryCloudsInstance);

              if (scene) {
                secondaryCloudsEffect.addToScene(scene);
              }
            }
            break;

          case "super_earth":
            if (surface.clouds && surface.clouds.length > 0) {
              const superEarthCloudsEffect = createAtmosphereCloudsFromPythonData(planetRadius, surface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 8000, pythonData.timing?.cosmic_origin_time);

              if (superEarthCloudsEffect) {
                const superEarthCloudsInstance: EffectInstance = {
                  id: `effect_${this.nextId++}`,
                  type: "atmosphere_clouds",
                  effect: superEarthCloudsEffect,
                  priority: 15,
                  enabled: true,
                  name: "Super Earth Dense Atmosphere",
                };
                this.effects.set(superEarthCloudsInstance.id, superEarthCloudsInstance);
                effects.push(superEarthCloudsInstance);
                superEarthCloudsEffect.addToScene(scene, mesh.position);
              }
            }

            if (surface.green_patches && surface.green_patches.length > 0) {
              const superEarthLandMassesEffect = createLandMassesFromPythonData(planetRadius, surface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 9000);

              if (superEarthLandMassesEffect) {
                const superEarthLandMassesInstance: EffectInstance = {
                  id: `effect_${this.nextId++}`,
                  type: "land_masses",
                  effect: superEarthLandMassesEffect,
                  priority: 5,
                  enabled: true,
                  name: "Super Earth Massive Continents",
                };

                this.effects.set(superEarthLandMassesInstance.id, superEarthLandMassesInstance);
                effects.push(superEarthLandMassesInstance);
                superEarthLandMassesEffect.addToScene(scene, mesh.position);
              }
            }

            if (this.layerSystem) {
              const superEarthSavannahLayer = createSavannahTerrainLayerFromPythonData(this.layerSystem, pythonData, pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed, "SAVANNAH");

              const superEarthSavannahInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "savannah_terrain_layer",
                effect: superEarthSavannahLayer,
                priority: 3,
                enabled: true,
                name: "Super Earth Savannah Terrain",
              };

              this.effects.set(superEarthSavannahInstance.id, superEarthSavannahInstance);
              effects.push(superEarthSavannahInstance);
            }

            const superEarthWaterFeaturesEffect = createSuperEarthWaterFeaturesFromPythonData(planetRadius, surface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 11000);
            if (superEarthWaterFeaturesEffect) {
              const superEarthWaterFeaturesInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "super_earth_water_features",
                effect: superEarthWaterFeaturesEffect,
                priority: 6,
                enabled: true,
                name: "Super Earth Water Features",
              };
              this.effects.set(superEarthWaterFeaturesInstance.id, superEarthWaterFeaturesInstance);
              effects.push(superEarthWaterFeaturesInstance);
              superEarthWaterFeaturesEffect.addToScene(scene, mesh.position);
            }

            if (surface.secondary_clouds && surface.secondary_clouds.length > 0) {
              const secondaryCloudsEffect = createSecondaryCloudsFromPythonData(planetRadius, surface, baseColor, pythonData.seeds?.planet_seed || Math.floor(Math.random() * 1000000), pythonData.timing?.cosmic_origin_time);

              const secondaryCloudsInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "secondary_clouds",
                effect: secondaryCloudsEffect,
                priority: 12,
                enabled: true,
                name: "Super Earth Secondary Clouds",
              };
              this.effects.set(secondaryCloudsInstance.id, secondaryCloudsInstance);
              effects.push(secondaryCloudsInstance);

              if (scene) {
                secondaryCloudsEffect.addToScene(scene);
              }
            }
            break;

          case "sub_earth":
            if (surface.clouds && surface.clouds.length > 0) {
              const subEarthCloudsEffect = createAtmosphereCloudsFromPythonData(planetRadius, surface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 7000, pythonData.timing?.cosmic_origin_time);

              if (subEarthCloudsEffect) {
                const subEarthCloudsInstance: EffectInstance = {
                  id: `effect_${this.nextId++}`,
                  type: "atmosphere_clouds",
                  effect: subEarthCloudsEffect,
                  priority: 15,
                  enabled: true,
                  name: "Sub Earth Thin Atmosphere",
                };
                this.effects.set(subEarthCloudsInstance.id, subEarthCloudsInstance);
                effects.push(subEarthCloudsInstance);
                subEarthCloudsEffect.addToScene(scene, mesh.position);
              }
            }

            if (surface.green_patches && surface.green_patches.length > 0) {
              const subEarthLandMassesEffect = createLandMassesFromPythonData(planetRadius, surface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 7500);

              if (subEarthLandMassesEffect) {
                const subEarthLandMassesInstance: EffectInstance = {
                  id: `effect_${this.nextId++}`,
                  type: "land_masses",
                  effect: subEarthLandMassesEffect,
                  priority: 5,
                  enabled: true,
                  name: "Sub Earth Small Continents",
                };

                this.effects.set(subEarthLandMassesInstance.id, subEarthLandMassesInstance);
                effects.push(subEarthLandMassesInstance);
                subEarthLandMassesEffect.addToScene(scene, mesh.position);
              }
            }

            if (surface.savannah_terrain_layer && this.layerSystem) {
              const savannahLayer = createSavannahTerrainLayerFromPythonData(this.layerSystem, pythonData, pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed, "SAVANNAH");

              const savannahInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "savannah_terrain_layer",
                effect: savannahLayer,
                priority: 2,
                enabled: true,
                name: "Sub Earth Savannah Terrain",
              };

              this.effects.set(savannahInstance.id, savannahInstance);
              effects.push(savannahInstance);
            }

            if (surface.secondary_clouds && surface.secondary_clouds.length > 0) {
              const secondaryCloudsEffect = createSecondaryCloudsFromPythonData(planetRadius, surface, baseColor, pythonData.seeds?.planet_seed || Math.floor(Math.random() * 1000000), pythonData.timing?.cosmic_origin_time);

              const secondaryCloudsInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "secondary_clouds",
                effect: secondaryCloudsEffect,
                priority: 12,
                enabled: true,
                name: "Sub Earth Secondary Clouds",
              };
              this.effects.set(secondaryCloudsInstance.id, secondaryCloudsInstance);
              effects.push(secondaryCloudsInstance);

              if (scene) {
                secondaryCloudsEffect.addToScene(scene);
              }
            }
            break;

          case "swamp":
            if (surface.clouds && surface.clouds.length > 0) {
              const swampCloudsEffect = createAtmosphereCloudsFromPythonData(planetRadius, surface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 4000, pythonData.timing?.cosmic_origin_time);

              if (swampCloudsEffect) {
                const swampCloudsInstance: EffectInstance = {
                  id: `effect_${this.nextId++}`,
                  type: "atmosphere_clouds",
                  effect: swampCloudsEffect,
                  priority: 15,
                  enabled: true,
                  name: "Swamp Humid Atmosphere",
                };
                this.effects.set(swampCloudsInstance.id, swampCloudsInstance);
                effects.push(swampCloudsInstance);
                swampCloudsEffect.addToScene(scene, mesh.position);
              }
            }

            if (surface.green_patches && surface.green_patches.length > 0) {
              const swampLandMassesEffect = createLandMassesFromPythonData(planetRadius, surface, (pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed) + 6000);

              if (swampLandMassesEffect) {
                const swampLandMassesInstance: EffectInstance = {
                  id: `effect_${this.nextId++}`,
                  type: "land_masses",
                  effect: swampLandMassesEffect,
                  priority: 5,
                  enabled: true,
                  name: "Swamp Land Masses",
                };
                this.effects.set(swampLandMassesInstance.id, swampLandMassesInstance);
                effects.push(swampLandMassesInstance);
                swampLandMassesEffect.addToScene(scene, mesh.position);
              }
            }

            if (this.layerSystem) {
              const swampSavannahLayer = createSavannahTerrainLayerFromPythonData(this.layerSystem, pythonData, pythonData.seeds?.shape_seed || pythonData.seeds?.planet_seed, "SAVANNAH");

              const swampSavannahInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "savannah_terrain_layer",
                effect: swampSavannahLayer,
                priority: 3,
                enabled: true,
                name: "Swamp Savannah Terrain",
              };

              this.effects.set(swampSavannahInstance.id, swampSavannahInstance);
              effects.push(swampSavannahInstance);
            }

            if (surface.secondary_clouds && surface.secondary_clouds.length > 0) {
              const secondaryCloudsEffect = createSecondaryCloudsFromPythonData(planetRadius, surface, baseColor, pythonData.seeds?.planet_seed || Math.floor(Math.random() * 1000000), pythonData.timing?.cosmic_origin_time);

              const secondaryCloudsInstance: EffectInstance = {
                id: `effect_${this.nextId++}`,
                type: "secondary_clouds",
                effect: secondaryCloudsEffect,
                priority: 12,
                enabled: true,
                name: "Swamp Secondary Clouds",
              };
              this.effects.set(secondaryCloudsInstance.id, secondaryCloudsInstance);
              effects.push(secondaryCloudsInstance);

              if (scene) {
                secondaryCloudsEffect.addToScene(scene);
              }
            }

            if (surface.toxic_bubbles) {
              const toxicSwampBubblesEffect = this.createEffectFromPythonData(EffectType.TOXIC_SWAMP_BUBBLES, pythonData, planetRadius, mesh)?.effect;

              if (toxicSwampBubblesEffect) {
                const toxicSwampBubblesInstance: EffectInstance = {
                  id: `effect_${this.nextId++}`,
                  type: EffectType.TOXIC_SWAMP_BUBBLES,
                  effect: toxicSwampBubblesEffect,
                  priority: 25,
                  enabled: true,
                  name: "Toxic Swamp Bubbles",
                };
                this.effects.set(toxicSwampBubblesInstance.id, toxicSwampBubblesInstance);
                effects.push(toxicSwampBubblesInstance);
                toxicSwampBubblesEffect.addToScene(scene, mesh.position);
              }
            }
            break;

          default:
            if (pythonData.planet_info?.type?.toLowerCase() === "anomaly") {
              const allAnomalyEffects = [EffectType.ANOMALY_PHASE_MATTER, EffectType.PULSATING_CUBE, EffectType.PLANET_RAYS];

              const selectedEffects = allAnomalyEffects;
              const anomalySeed = pythonData.seeds?.planet_seed || Math.floor(Math.random() * 1000000);
              const numEffects = selectedEffects.length;

              for (let i = 0; i < numEffects; i++) {
                const effectType = selectedEffects[i];
                const effectSeed = anomalySeed + i * 10000;

                const anomalyEffect = this.createEffectFromPythonData(effectType, { ...pythonData, seeds: { ...pythonData.seeds, planet_seed: effectSeed } }, planetRadius, mesh, 10 + i);

                if (anomalyEffect) {
                  anomalyEffect.name = effectType.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
                  effects.push(anomalyEffect);

                  if (anomalyEffect.effect.addToScene) {
                    anomalyEffect.effect.addToScene(scene, mesh.position);
                  }
                }
              }

              if (pythonData.atmosphere && pythonData.atmosphere.type !== "None") {
                const atmosphereEffect = this.createEffectFromPythonData(EffectType.ATMOSPHERE, pythonData.atmosphere, planetRadius, mesh, 5);
                if (atmosphereEffect) {
                  effects.push(atmosphereEffect);
                  atmosphereEffect.effect.addToScene(scene, mesh.position);
                }
              }
            } else {
              if (mesh.material instanceof THREE.MeshStandardMaterial) {
                const baseColor = getPlanetBaseColor(pythonData);
                mesh.material.color.copy(baseColor);
              }
            }
            break;
        }
      } else {
        if (mesh.material instanceof THREE.MeshStandardMaterial) {
          const baseColor = getPlanetBaseColor(pythonData);
          mesh.material.color.copy(baseColor);
        }
      }

      const planetType = pythonData.planet_info?.type?.toLowerCase() || pythonData.surface_elements?.type?.toLowerCase();
      const isAnomalyPlanet = planetType === "anomaly" || pythonData.surface_elements?.type === "anomaly";

      if (pythonData.atmosphere && !isAnomalyPlanet) {
        if (pythonData.atmosphere.streaks || ["Gas Giant", "Frozen Gas Giant", "Super Puff", "Super Ringed", "Mirror", "Ruby Cloud"].includes(pythonData.planet_info?.type)) {
          const glowEffect = createAtmosphereGlowFromPythonData(planetRadius, pythonData.atmosphere || {}, pythonData.seeds?.shape_seed + 2000);

          if (glowEffect) {
            const glowInstance: EffectInstance = {
              id: `effect_${this.nextId++}`,
              type: "atmosphere_glow",
              effect: glowEffect,
              priority: 20,
              enabled: true,
            };

            this.effects.set(glowInstance.id, glowInstance);
            effects.push(glowInstance);

            glowEffect.addToScene(scene, mesh.position);
          }
        }

        if (pythonData.atmosphere.type && pythonData.atmosphere.type !== "None") {
          const atmosphereData = { ...pythonData.atmosphere };
          if (planetType === "oceanic") {
            atmosphereData.opacity = Math.min(atmosphereData.opacity || 0.3, 0.15);
            atmosphereData.width = Math.min(atmosphereData.width || 15, 8);
          }

          const atmosphereEffect = this.createEffectFromPythonData(EffectType.ATMOSPHERE, atmosphereData, planetRadius, mesh, 5);
          if (atmosphereEffect) {
            effects.push(atmosphereEffect);
            atmosphereEffect.effect.addToScene(scene, mesh.position);
          }
        }
      }

      if ((pythonData.rings && pythonData.rings.has_rings) || ["Gas Giant", "Frozen Gas Giant", "Super Earth"].includes(pythonData.planet_info?.type)) {
        const ringsEffect = this.createEffectFromPythonData(EffectType.RING_SYSTEM, pythonData, planetRadius, mesh, 1);
        if (ringsEffect) {
          effects.push(ringsEffect);
          ringsEffect.effect.addToScene(scene, mesh.position);
        } else {
        }
      } else {
      }

      if (pythonData.surface_elements?.has_fragmentation_zones) {
        const fragmentationEffect = this.createEffectFromPythonData(EffectType.FRAGMENTATION, pythonData, planetRadius, mesh, 5);
        if (fragmentationEffect) {
          effects.push(fragmentationEffect);
          fragmentationEffect.effect.addToScene(scene, mesh.position);
        }
      }

      if (pythonData.original_planet_data && pythonData.original_planet_data.life_forms === "Intelligent Life") {
        const intelligentLifeEffect = this.createEffectFromPythonData(EffectType.LIFE_FORM_INTELLIGENT_LIFE, pythonData, planetRadius, mesh, 10);
        if (intelligentLifeEffect) {
          effects.push(intelligentLifeEffect);
          intelligentLifeEffect.effect.addToScene(scene, mesh.position);
        }
      }

      if (pythonData.original_planet_data && pythonData.original_planet_data.life_forms === "Silicon-Based Life") {
        const siliconLifeEffect = this.createEffectFromPythonData(EffectType.LIFE_FORM_SILICON_BASED_LIFE, pythonData, planetRadius, mesh, 10);
        if (siliconLifeEffect) {
          effects.push(siliconLifeEffect);
          siliconLifeEffect.effect.addToScene(scene, mesh.position);
        }
      }
      if (pythonData.original_planet_data && pythonData.original_planet_data.life_forms === "Non-Physical Entity") {
        const nonPhysicalEntityEffect = this.createEffectFromPythonData(EffectType.LIFE_FORM_NON_PHYSICAL_ENTITY, pythonData, planetRadius, mesh, 10);
        if (nonPhysicalEntityEffect) {
          effects.push(nonPhysicalEntityEffect);
          nonPhysicalEntityEffect.effect.addToScene(scene, mesh.position);
        }
      }
      if (pythonData.original_planet_data && pythonData.original_planet_data.life_forms === "Conscious Gas") {
        const consciousGasEffect = this.createEffectFromPythonData(EffectType.LIFE_FORM_CONSCIOUS_GAS, pythonData, planetRadius, mesh, 10);
        if (consciousGasEffect) {
          effects.push(consciousGasEffect);
          consciousGasEffect.effect.addToScene(scene, mesh.position);
        }
      }
      if (pythonData.original_planet_data && pythonData.original_planet_data.life_forms === "Robotic Entities") {
        const roboticEntitiesEffect = this.createEffectFromPythonData(EffectType.LIFE_FORM_ROBOTIC_ENTITIES, pythonData, planetRadius, mesh, 10);
        if (roboticEntitiesEffect) {
          effects.push(roboticEntitiesEffect);
          roboticEntitiesEffect.effect.addToScene(scene, mesh.position);
        }
      }
      if (pythonData.original_planet_data && pythonData.original_planet_data.life_forms === "Have I just found God?") {
        const godEffect = this.createEffectFromPythonData(EffectType.LIFE_FORM_GOD, pythonData, planetRadius, mesh, 10);
        if (godEffect) {
          effects.push(godEffect);
          godEffect.effect.addToScene(scene, mesh.position);
        }
      }

      if (VISUAL_DEBUG) {
        const debugEffect = this.createEffectFromPythonData(EffectType.VISUAL_DEBUG_3D, pythonData, planetRadius, mesh, 100);

        if (debugEffect) {
          effects.push(debugEffect);
          debugEffect.effect.addToScene(scene, mesh.position);
        } else {
        }
      }

      if (this.layerSystem) {
        this.layerSystem.addToScene(scene);
      }

      try {
        const starFieldEffect = this.createEffectFromPythonData(EffectType.STAR_FIELD, pythonData, planetRadius, mesh, -100);

        if (starFieldEffect && starFieldEffect.effect) {
          starFieldEffect.effect.addToScene(scene, mesh.position);
          effects.push(starFieldEffect);
        }
      } catch (error) {}

      effects.forEach((effect, index) => {});

      if (effects.length === 0) {
      }

      return effects;
    } catch (error) {
      throw error;
    }
  }

  getEffect(id: string): EffectInstance | null {
    return this.effects.get(id) || null;
  }

  getEffectsByType(type: string): EffectInstance[] {
    return Array.from(this.effects.values()).filter((effect) => effect.type === type);
  }

  getAllEffects(): EffectInstance[] {
    return Array.from(this.effects.values());
  }

  toggleEffect(id: string, enabled?: boolean): void {
    const effectInstance = this.effects.get(id);
    if (effectInstance) {
      effectInstance.enabled = enabled !== undefined ? enabled : !effectInstance.enabled;

      const effect = effectInstance.effect;

      if (effect && effect.getObject3D) {
        const object3D = effect.getObject3D();
        if (object3D) {
          object3D.visible = effectInstance.enabled;
        }
      }

      if (effectInstance.type === "cave_surface_holes" && effect) {
        if (effectInstance.enabled) {
          if (effect.applyToPlanetSystem && this.layerSystem) {
            const baseColor = this.baseColor || new THREE.Color(0xd1d1d1);
            effect.applyToPlanetSystem(this.layerSystem, baseColor);
          }
        } else {
          if (effect.planetSystem && effect.planetSystem.restoreOriginalMaterial) {
            effect.planetSystem.restoreOriginalMaterial();
          }
        }
      }

      if (this.layerSystem) {
        const layerMeshes = this.layerSystem.getLayerMeshes();

        const layerNameMap: Record<string, string> = {
          cloud_bands_layer: "cloudBands",
          cloud_gyros_layer: "cloudGyros",
          metallic_surface_layer: "metallicSurface",
          diamond_surface_layer: "diamondSurface",
          rocky_terrain_layer: "rockyTerrain",
          savannah_terrain_layer: "savannahTerrain",
          icy_terrain_layer: "icyTerrain",
          aquifer_water: "aquiferWater",
          ocean_currents: "oceanCurrents",
          molten_lava: "moltenLava",
        };

        const layerName = layerNameMap[effectInstance.type];

        if (layerName && layerMeshes[layerName]) {
          layerMeshes[layerName].visible = effectInstance.enabled;
        }
      }
    } else {
    }
  }

  updateAllEffects(deltaTime: number, planetRotation?: number, camera?: THREE.Camera, cosmicTime?: number): void {
    if (this.layerSystem) {
      this.layerSystem.update(deltaTime, planetRotation);
    }

    for (const instance of this.effects.values()) {
      if (instance.enabled && instance.effect.update) {
        try {
          if (instance.type === "star_field" && camera && "updateWithCamera" in instance.effect) {
            (instance.effect as any).updateWithCamera(deltaTime, camera);
          } else if (cosmicTime !== undefined && "setCosmicTime" in instance.effect) {
            (instance.effect as any).setCosmicTime(cosmicTime);
            instance.effect.update(deltaTime, planetRotation);
          } else {
            instance.effect.update(deltaTime, planetRotation);
          }
        } catch (error) {}
      }
    }
  }

  updateLightForAllEffects(light: THREE.DirectionalLight): void {
    if (this.layerSystem) {
      this.layerSystem.updateFromThreeLight(light);
    }

    for (const instance of this.effects.values()) {
      if (instance.enabled && instance.effect.updateFromThreeLight) {
        try {
          instance.effect.updateFromThreeLight(light);
        } catch (error) {}
      }
    }
  }

  updateOrbitalPositionForAllEffects(orbitalPosition: THREE.Vector3): void {
    for (const instance of this.effects.values()) {
      if (instance.enabled && instance.effect.updateOrbitalPosition) {
        try {
          instance.effect.updateOrbitalPosition(orbitalPosition);
        } catch (error) {}
      }
    }
  }

  removeEffect(id: string): void {
    const instance = this.effects.get(id);
    if (instance) {
      if (instance.effect.dispose) {
        instance.effect.dispose();
      }
      this.effects.delete(id);
    }
  }

  clearAllEffects(): void {
    if (this.layerSystem) {
      this.layerSystem.dispose();
      this.layerSystem = undefined;
    }

    for (const instance of this.effects.values()) {
      if (instance.effect.dispose) {
        instance.effect.dispose();
      }
    }
    this.effects.clear();

    this.nextId = 1;
  }

  getStats(): { registeredTypes: number; activeEffects: number; enabledEffects: number } {
    const activeEffects = Array.from(this.effects.values());
    return {
      registeredTypes: this.creators.size,
      activeEffects: activeEffects.length,
      enabledEffects: activeEffects.filter((e) => e.enabled).length,
    };
  }

  getAvailableEffectTypes(): string[] {
    return Array.from(this.creators.keys());
  }
}

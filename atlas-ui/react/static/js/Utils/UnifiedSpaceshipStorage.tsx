// atlas-ui/react/static/js/Utils/UnifiedSpaceshipStorage.tsx

import React from "react";
import { getItem, setItem, removeItem } from "./b64.tsx";

export interface SpaceshipData {
  r: {
    // 基础资源
    a: number; // antimatter
    e: number; // element115
    d: number; // deuterium
    // 中级资源
    q: number; // quantumAlloy
    p: number; // plasmaCell
    n: number; // neuralCircuit
    // 稀有资源
    ex: number; // exoticCrystal
    nd: number; // nebulaDust
    bh: number; // blackHoleFragment
    // Artifact资源
    ar: number; // ancientRelic
    aa: number; // alienArtifact
    ds: number; // dimensionalShard
  };
  u: {
    l: number; // 等级
    ef: number; // 效率
    rn: number; // 范围
    st: number; // 存储
    m: number; // 乘数
    t: string; // 飞船类型
    mds: any[]; // 模块
    app: { // 外观
      c: string; // 颜色
      p: string; // 图案
      d: string; // 贴花
    };
    sk: { [key: string]: number }; // 技能
  };
  c: { [locationId: string]: number };
  /** Lifetime collection count per location; drives the diminishing-return curve. */
  n?: { [locationId: string]: number };
  t: {
    lp?: number;
    ld?: number;
    lc?: number;
  };
  s?: {
    tc?: number;
    tr?: { 
      a: number; 
      e: number; 
      d: number;
      q: number;
      p: number;
      n: number;
      ex: number;
      nd: number;
      bh: number;
      ar: number;
      aa: number;
      ds: number;
    };
    tt?: number;
    cs?: number;
    dc?: number;
    dcp?: number;
    dcs?: number;
    dcg?: number;
    lcd?: string;
  };
}

export class UnifiedSpaceshipStorage {
  private static readonly STORAGE_KEY = "_atlasSpaceShip";
  private static readonly COLLECTION_COOLDOWNS = {
    planet: 15 * 60 * 1000,
    system: 45 * 60 * 1000,
    galaxy: 8 * 60 * 60 * 1000,
  };
  private static readonly DAILY_COLLECTION_LIMITS = {
    planet: Infinity,
    system: 15,
    galaxy: 5,
  };
  private static readonly PASSIVE_INTERVAL = 1 * 60 * 1000;
  private static readonly DEFAULT_DATA: SpaceshipData = {
    r: { 
      a: 300, e: 200, d: 250, // 基础资源
      q: 0, p: 0, n: 0, // 中级资源
      ex: 0, nd: 0, bh: 0, // 稀有资源
      ar: 0, aa: 0, ds: 0 // Artifact资源
    },
    u: { 
      l: 1, ef: 1.0, rn: 500, st: 1000, m: 1.0, // 基础属性
      t: "explorer", // 默认飞船类型
      mds: [], // 默认无模块
      app: { c: "#0070f3", p: "none", d: "none" }, // 默认外观
      sk: {} // 默认无技能
    },
    c: {},
    n: {},
    t: {},
    s: { 
      tc: 0, 
      tr: { 
        a: 0, e: 0, d: 0, 
        q: 0, p: 0, n: 0, 
        ex: 0, nd: 0, bh: 0, 
        ar: 0, aa: 0, ds: 0 
      }, 
      tt: 0, cs: 0, dc: 0, dcp: 0, dcs: 0, dcg: 0, lcd: new Date().toDateString() 
    },
  };
  static getData(): SpaceshipData {
    try {
      const stored = getItem(this.STORAGE_KEY);
      if (!stored) {
        this.saveData(this.DEFAULT_DATA);
        return { ...this.DEFAULT_DATA };
      }

      const compactData = JSON.parse(stored);
      const data = this.expandData(compactData);
      return {
        r: data.r || { ...this.DEFAULT_DATA.r },
        u: data.u || { ...this.DEFAULT_DATA.u },
        c: data.c || {},
        n: data.n || {},
        t: data.t || {},
        s: data.s || { ...this.DEFAULT_DATA.s },
      };
    } catch (error) {
      console.error("Error reading spaceship data:", error);
      return { ...this.DEFAULT_DATA };
    }
  }

  private static saveData(data: SpaceshipData): void {
    try {
      const now = Date.now();
      const cutoff = now - 24 * 60 * 60 * 1000;

      Object.keys(data.c).forEach((key) => {
        if (data.c[key] < cutoff) {
          delete data.c[key];
        }
      });

      const collectionKeys = Object.keys(data.c);
      if (collectionKeys.length > 500) {
        const sorted = collectionKeys.sort((a, b) => data.c[a] - data.c[b]);
        const toRemove = sorted.slice(0, sorted.length - 500);
        toRemove.forEach((key) => delete data.c[key]);
      }

      const compactData = this.compactData(data);
      setItem(this.STORAGE_KEY, JSON.stringify(compactData));
    } catch (error) {
      console.error("Error saving spaceship data:", error);
      if (error.name === "QuotaExceededError") {
        this.performEmergencyCleanup();
      }
    }
  }

  private static performEmergencyCleanup(): void {
    const data = this.getData();
    data.c = {};
    data.n = {};
    data.s = this.emptyStats();
    this.saveData(data);
  }

  /** Zeroed statistics block; every counter the storage interface knows about. */
  private static emptyStats(today = new Date().toDateString()): NonNullable<SpaceshipData["s"]> {
    return {
      tc: 0,
      tr: { a: 0, e: 0, d: 0, q: 0, p: 0, n: 0, ex: 0, nd: 0, bh: 0, ar: 0, aa: 0, ds: 0 },
      tt: 0,
      cs: 0,
      dc: 0,
      dcp: 0,
      dcs: 0,
      dcg: 0,
      lcd: today,
    };
  }
  static getResources(): { 
    antimatter: number; 
    element115: number; 
    deuterium: number;
    quantumAlloy: number;
    plasmaCell: number;
    neuralCircuit: number;
    exoticCrystal: number;
    nebulaDust: number;
    blackHoleFragment: number;
    ancientRelic: number;
    alienArtifact: number;
    dimensionalShard: number;
  } {
    const data = this.getData();
    return {
      antimatter: Math.round(data.r.a),
      element115: Math.round(data.r.e),
      deuterium: Math.round(data.r.d),
      quantumAlloy: Math.round(data.r.q || 0),
      plasmaCell: Math.round(data.r.p || 0),
      neuralCircuit: Math.round(data.r.n || 0),
      exoticCrystal: Math.round(data.r.ex || 0),
      nebulaDust: Math.round(data.r.nd || 0),
      blackHoleFragment: Math.round(data.r.bh || 0),
      ancientRelic: Math.round(data.r.ar || 0),
      alienArtifact: Math.round(data.r.aa || 0),
      dimensionalShard: Math.round(data.r.ds || 0),
    };
  }

  static setResources(resources: { 
    antimatter: number; 
    element115: number; 
    deuterium: number;
    quantumAlloy: number;
    plasmaCell: number;
    neuralCircuit: number;
    exoticCrystal: number;
    nebulaDust: number;
    blackHoleFragment: number;
    ancientRelic: number;
    alienArtifact: number;
    dimensionalShard: number;
  }): void {
    const data = this.getData();
    const upgrade = data.u;
    data.r.a = Math.min(Math.max(0, resources.antimatter), upgrade.st);
    data.r.e = Math.min(Math.max(0, resources.element115), upgrade.st);
    data.r.d = Math.min(Math.max(0, resources.deuterium), upgrade.st);
    data.r.q = Math.min(Math.max(0, resources.quantumAlloy), upgrade.st);
    data.r.p = Math.min(Math.max(0, resources.plasmaCell), upgrade.st);
    data.r.n = Math.min(Math.max(0, resources.neuralCircuit), upgrade.st);
    data.r.ex = Math.min(Math.max(0, resources.exoticCrystal), upgrade.st);
    data.r.nd = Math.min(Math.max(0, resources.nebulaDust), upgrade.st);
    data.r.bh = Math.min(Math.max(0, resources.blackHoleFragment), upgrade.st);
    data.r.ar = Math.min(Math.max(0, resources.ancientRelic), upgrade.st);
    data.r.aa = Math.min(Math.max(0, resources.alienArtifact), upgrade.st);
    data.r.ds = Math.min(Math.max(0, resources.dimensionalShard), upgrade.st);

    this.saveData(data);
  }

  static addResources(toAdd: { 
    antimatter: number; 
    element115: number; 
    deuterium: number;
    quantumAlloy: number;
    plasmaCell: number;
    neuralCircuit: number;
    exoticCrystal: number;
    nebulaDust: number;
    blackHoleFragment: number;
    ancientRelic: number;
    alienArtifact: number;
    dimensionalShard: number;
  }): void {
    const data = this.getData();
    const upgrade = data.u;

    data.r.a = Math.round(Math.min(data.r.a + toAdd.antimatter, upgrade.st));
    data.r.e = Math.round(Math.min(data.r.e + toAdd.element115, upgrade.st));
    data.r.d = Math.round(Math.min(data.r.d + toAdd.deuterium, upgrade.st));
    data.r.q = Math.round(Math.min((data.r.q || 0) + toAdd.quantumAlloy, upgrade.st));
    data.r.p = Math.round(Math.min((data.r.p || 0) + toAdd.plasmaCell, upgrade.st));
    data.r.n = Math.round(Math.min((data.r.n || 0) + toAdd.neuralCircuit, upgrade.st));
    data.r.ex = Math.round(Math.min((data.r.ex || 0) + toAdd.exoticCrystal, upgrade.st));
    data.r.nd = Math.round(Math.min((data.r.nd || 0) + toAdd.nebulaDust, upgrade.st));
    data.r.bh = Math.round(Math.min((data.r.bh || 0) + toAdd.blackHoleFragment, upgrade.st));
    data.r.ar = Math.round(Math.min((data.r.ar || 0) + toAdd.ancientRelic, upgrade.st));
    data.r.aa = Math.round(Math.min((data.r.aa || 0) + toAdd.alienArtifact, upgrade.st));
    data.r.ds = Math.round(Math.min((data.r.ds || 0) + toAdd.dimensionalShard, upgrade.st));
    
    if (data.s) {
      data.s.tr = data.s.tr || { 
        a: 0, e: 0, d: 0, 
        q: 0, p: 0, n: 0, 
        ex: 0, nd: 0, bh: 0, 
        ar: 0, aa: 0, ds: 0 
      };
      data.s.tr.a += toAdd.antimatter;
      data.s.tr.e += toAdd.element115;
      data.s.tr.d += toAdd.deuterium;
      data.s.tr.q += toAdd.quantumAlloy;
      data.s.tr.p += toAdd.plasmaCell;
      data.s.tr.n += toAdd.neuralCircuit;
      data.s.tr.ex += toAdd.exoticCrystal;
      data.s.tr.nd += toAdd.nebulaDust;
      data.s.tr.bh += toAdd.blackHoleFragment;
      data.s.tr.ar += toAdd.ancientRelic;
      data.s.tr.aa += toAdd.alienArtifact;
      data.s.tr.ds += toAdd.dimensionalShard;
    }

    this.saveData(data);
  }

  static consumeResources(cost: { antimatter: number; element115: number; deuterium: number }): boolean {
    const data = this.getData();
    const actualCost = {
      antimatter: Math.floor(cost.antimatter / data.u.ef),
      element115: Math.floor(cost.element115 / data.u.ef),
      deuterium: Math.floor(cost.deuterium / data.u.ef),
    };

    if (data.r.a >= actualCost.antimatter && data.r.e >= actualCost.element115 && data.r.d >= actualCost.deuterium) {
      data.r.a -= actualCost.antimatter;
      data.r.e -= actualCost.element115;
      data.r.d -= actualCost.deuterium;
      if (data.s) {
        data.s.tt = (data.s.tt || 0) + 1;
      }

      this.saveData(data);
      return true;
    }

    return false;
  }
  static getUpgrade(): {
    level: number;
    efficiency: number;
    range: number;
    storage: number;
    multiplier: number;
    type: string;
    modules: any[];
    appearance: {
      color: string;
      pattern: string;
      decal: string;
    };
    skills: { [key: string]: number };
  } {
    const data = this.getData();
    return {
      level: data.u.l,
      efficiency: data.u.ef,
      range: data.u.rn,
      storage: data.u.st,
      multiplier: data.u.m,
      type: data.u.t || "explorer",
      modules: data.u.mds || [],
      appearance: {
        color: data.u.app?.c || "#0070f3",
        pattern: data.u.app?.p || "none",
        decal: data.u.app?.d || "none",
      },
      skills: data.u.sk || {},
    };
  }

  static getShipModules(): Array<{ id: string; level: number; oc?: number }> {
    return this.getData().u.mds || [];
  }

  static setShipModules(modules: Array<{ id: string; level: number; oc?: number }>): void {
    const data = this.getData();
    data.u.mds = modules;
    this.saveData(data);
  }

  /** Mirror a server-authoritative ship level without touching resources. */
  static applyServerLevel(level: number): void {
    const data = this.getData();
    const next = Math.max(1, Math.min(999, Math.round(level)));
    data.u.l = next;
    data.u.ef = next <= 16 ? 1 + (next - 1) * 0.2 : 4.0 + (next - 16) * 0.02;
    data.u.rn = Math.floor(next <= 25 ? 500 + (next - 1) * 200 : 5300 + (next - 25) * 12);
    data.u.st = Math.floor(next <= 20 ? 1000 + (next - 1) * 400 : 8600 + (next - 20) * 45);
    data.u.m = next <= 100 ? 1.0 + (next - 1) * 0.242 : 24.958 + (next - 100) * 0.02;
    this.saveData(data);
  }

  static upgradeShip(cost: { antimatter: number; element115: number; deuterium: number }): boolean {
    const data = this.getData();
    const MAX_LEVEL = 999;
    if (data.u.l >= MAX_LEVEL) {
      return false;
    }
    if (data.r.a >= cost.antimatter && data.r.e >= cost.element115 && data.r.d >= cost.deuterium) {
      data.r.a -= cost.antimatter;
      data.r.e -= cost.element115;
      data.r.d -= cost.deuterium;
      data.u.l += 1;
      // Every level grants a little of each stat; nothing plateaus before 999.
      // The early segments keep the original pacing, the tail is linear so the
      // numbers stay predictable instead of exploding.
      let efficiency = data.u.l <= 16 ? 1 + (data.u.l - 1) * 0.2 : 4.0 + (data.u.l - 16) * 0.02;

      let range = data.u.l <= 25 ? 500 + (data.u.l - 1) * 200 : 5300 + (data.u.l - 25) * 12;

      let storage = data.u.l <= 20 ? 1000 + (data.u.l - 1) * 400 : 8600 + (data.u.l - 20) * 45;

      let multiplier = data.u.l <= 100 ? 1.0 + (data.u.l - 1) * 0.242 : 24.958 + (data.u.l - 100) * 0.02;

      // 保留飞船类型和定制信息
      const shipType = data.u.t || "explorer";
      const modules = data.u.mds || [];
      const appearance = data.u.app || { c: "#0070f3", p: "none", d: "none" };
      const skills = data.u.sk || {};

      data.u.ef = efficiency;
      data.u.rn = Math.floor(range);
      data.u.st = Math.floor(storage);
      data.u.m = multiplier;
      data.u.t = shipType;
      data.u.mds = modules;
      data.u.app = appearance;
      data.u.sk = skills;

      this.saveData(data);
      return true;
    }

    return false;
  }

  private static getLocationTypeFromId(locationId: string): "planet" | "system" | "galaxy" {
    if (locationId.startsWith("planet_")) return "planet";
    if (locationId.startsWith("system_")) return "system";
    if (locationId.startsWith("galaxy_")) return "galaxy";
    return "planet";
  }
  private static getCooldownForLocation(locationId: string): number {
    const locationType = this.getLocationTypeFromId(locationId);
    return this.COLLECTION_COOLDOWNS[locationType];
  }

  private static canCollectFromLocationType(locationType: "planet" | "system" | "galaxy", data?: SpaceshipData): boolean {
    if (!data) data = this.getData();

    const today = new Date().toDateString();

    if (data.s && data.s.lcd !== today) {
      data.s.dcp = 0;
      data.s.dcs = 0;
      data.s.dcg = 0;
      data.s.lcd = today;
      this.saveData(data);
    }

    if (!data.s) return true;

    const limit = this.DAILY_COLLECTION_LIMITS[locationType];
    if (limit === Infinity) return true;

    const currentCount = locationType === "planet" ? data.s.dcp || 0 : locationType === "system" ? data.s.dcs || 0 : data.s.dcg || 0;

    return currentCount < limit;
  }

  static canCollectFromLocation(locationId: string): boolean {
    const data = this.getData();
    const lastCollected = data.c[locationId];

    if (lastCollected) {
      const now = Date.now();
      const cooldown = this.getCooldownForLocation(locationId);
      if (now - lastCollected < cooldown) {
        return false;
      }
    }

    const locationType = this.getLocationTypeFromId(locationId);
    return this.canCollectFromLocationType(locationType, data);
  }

  static getTimeUntilNextCollection(locationId: string): number {
    const data = this.getData();
    const lastCollected = data.c[locationId];

    if (!lastCollected) return 0;

    const now = Date.now();
    const cooldown = this.getCooldownForLocation(locationId);
    const remaining = cooldown - (now - lastCollected);
    return remaining > 0 ? remaining / (1000 * 60 * 60) : 0;
  }

  static markLocationCollected(locationId: string): void {
    const data = this.getData();
    data.c[locationId] = Date.now();
    data.n = data.n || {};
    data.n[locationId] = (data.n[locationId] ?? 0) + 1;

    const locationType = this.getLocationTypeFromId(locationId);
    this.updateDailyCollectionCounters(data, locationType);

    this.updateCollectionStreaks(data);

    this.saveData(data);
  }

  private static updateDailyCollectionCounters(data: SpaceshipData, locationType: "planet" | "system" | "galaxy"): void {
    const today = new Date().toDateString();

    if (!data.s) {
      data.s = this.emptyStats(today);
    }

    if (data.s.lcd !== today) {
      data.s.dcp = 0;
      data.s.dcs = 0;
      data.s.dcg = 0;
      data.s.lcd = today;
    }

    if (locationType === "planet") {
      data.s.dcp = (data.s.dcp || 0) + 1;
    } else if (locationType === "system") {
      data.s.dcs = (data.s.dcs || 0) + 1;
    } else if (locationType === "galaxy") {
      data.s.dcg = (data.s.dcg || 0) + 1;
    }
  }

  private static updateCollectionStreaks(data: SpaceshipData): void {
    const now = Date.now();
    const today = new Date(now).toDateString();
    const lastCollectionDay = data.t.lc ? new Date(data.t.lc).toDateString() : null;

    if (!data.s) {
      data.s = this.emptyStats();
    }

    data.s.tc = (data.s.tc || 0) + 1;

    if (today !== lastCollectionDay) {
      const oldLastCollectionTime = data.t.lc;
      data.t.lc = now;

      if (lastCollectionDay && oldLastCollectionTime) {
        const lastDate = new Date(oldLastCollectionTime);
        const todayDate = new Date(now);
        const daysDifference = Math.floor((todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

        if (daysDifference === 1) {
          data.s.cs = (data.s.cs || 0) + 1;
        } else if (daysDifference > 1) {
          data.s.cs = 1;
        }
      } else {
        data.s.cs = 1;
      }

      data.s.dc = 1;
    } else {
      data.s.dc = (data.s.dc || 0) + 1;
    }
  }

  static getCollectionStreakInfo(): {
    currentStreak: number;
    dailyCollections: number;
    streakMultiplier: number;
  } {
    const data = this.getData();
    const currentStreak = data.s?.cs || 0;
    const dailyCollections = data.s?.dc || 0;

    // Consecutive collection days pay 3% each, capped at +30%.
    const streakMultiplier = 1 + Math.min(0.3, 0.03 * Math.max(0, currentStreak - 1));

    return {
      currentStreak,
      dailyCollections,
      streakMultiplier,
    };
  }

  static getCollectionCount(locationId: string): number {
    const data = this.getData();
    const counted = data.n?.[locationId] ?? 0;
    // Older saves only kept a timestamp; count those as one collection.
    return counted > 0 ? counted : data.c[locationId] ? 1 : 0;
  }

  static shouldProcessPassive(): boolean {
    const data = this.getData();
    const now = Date.now();
    const lastPassive = data.t.lp || 0;

    return now - lastPassive >= this.PASSIVE_INTERVAL;
  }

  static markPassiveProcessed(): void {
    const data = this.getData();
    data.t.lp = Date.now();
    this.saveData(data);
  }

  static getStats(): {
    totalCollections: number;
    totalResourcesCollected: { 
      antimatter: number; 
      element115: number; 
      deuterium: number;
      quantumAlloy: number;
      plasmaCell: number;
      neuralCircuit: number;
      exoticCrystal: number;
      nebulaDust: number;
      blackHoleFragment: number;
      ancientRelic: number;
      alienArtifact: number;
      dimensionalShard: number;
    };
    totalTravels: number;
  } {
    const data = this.getData();
    const rawResources = data.s?.tr || { 
      a: 0, e: 0, d: 0, 
      q: 0, p: 0, n: 0, 
      ex: 0, nd: 0, bh: 0, 
      ar: 0, aa: 0, ds: 0 
    };

    return {
      totalCollections: data.s?.tc || 0,
      totalResourcesCollected: {
        antimatter: rawResources.a || 0,
        element115: rawResources.e || 0,
        deuterium: rawResources.d || 0,
        quantumAlloy: rawResources.q || 0,
        plasmaCell: rawResources.p || 0,
        neuralCircuit: rawResources.n || 0,
        exoticCrystal: rawResources.ex || 0,
        nebulaDust: rawResources.nd || 0,
        blackHoleFragment: rawResources.bh || 0,
        ancientRelic: rawResources.ar || 0,
        alienArtifact: rawResources.aa || 0,
        dimensionalShard: rawResources.ds || 0,
      },
      totalTravels: data.s?.tt || 0,
    };
  }

  static migrateFromOldStorage(): void {
    try {
      const oldKeys = ["atlas_ship_resources", "atlas_ship_upgrades", "atlas_resource_collections", "_atlasSpaceShip_collections", "_atlasSpaceShip_lastPassive", "atlas_last_resource_generation", "atlas_last_passive_generation"];

      const currentData = getItem(this.STORAGE_KEY);
      if (currentData) return;

      const oldResources = localStorage.getItem("atlas_ship_resources");
      const oldUpgrades = localStorage.getItem("atlas_ship_upgrades");
      const oldCollections = localStorage.getItem("atlas_resource_collections") || localStorage.getItem("_atlasSpaceShip_collections");

      const newData: SpaceshipData = { ...this.DEFAULT_DATA };

      if (oldResources) {
        try {
          const resources = JSON.parse(oldResources);
          newData.r.a = resources.antimatter || 150;
          newData.r.e = resources.element115 || 100;
          newData.r.d = resources.deuterium || 125;
        } catch (e) {}
      }

      if (oldUpgrades) {
        try {
          const upgrade = JSON.parse(oldUpgrades);
          newData.u.l = upgrade.level || 1;
          newData.u.ef = upgrade.efficiency || 1.0;
          newData.u.rn = upgrade.range || 300;
          newData.u.st = upgrade.storage || 500;
          newData.u.m = upgrade.multiplier || upgrade.passiveGeneration || 1.0;
        } catch (e) {}
      }

      if (oldCollections) {
        try {
          const collections = JSON.parse(oldCollections);
          Object.keys(collections).forEach((key) => {
            if (collections[key].lastCollected) {
              newData.c[collections[key].id] = collections[key].lastCollected;
            }
          });
        } catch (e) {}
      }

      this.saveData(newData);

      oldKeys.forEach((key) => {
        try {
          localStorage.removeItem(key);
        } catch (e) {}
      });

      console.log("Successfully migrated to unified spaceship storage");
    } catch (error) {
      console.error("Error during migration:", error);
    }
  }

  static reset(): void {
    removeItem(this.STORAGE_KEY);
  }

  static getStorageSize(): number {
    const data = getItem(this.STORAGE_KEY) || "{}";
    return data.length;
  }

  private static compactData(data: SpaceshipData): any {
    const compactData: any = {
      r: data.r,
      u: data.u,
      c: data.c,
      n: data.n,
      s: data.s,
      t: data.t,
    };

    return compactData;
  }

  private static expandData(compactData: any): SpaceshipData {
    const now = Date.now();
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

    const expandedCollections: { [key: string]: number } = {};
    if (compactData.c) {
      Object.keys(compactData.c).forEach((key) => {
        const value = compactData.c[key];

        const MIN_VALID_TIMESTAMP = 1577836800000; // Jan 1, 2020
        const MAX_VALID_TIMESTAMP = 1893456000000; // Jan 1, 2030

        if (value === 0) {
          const migratedTimestamp = now - TWENTY_FOUR_HOURS;
          expandedCollections[key] = migratedTimestamp;
        } else if (value >= MIN_VALID_TIMESTAMP && value <= MAX_VALID_TIMESTAMP) {
          expandedCollections[key] = value;
        } else if (value > 0 && value < 86400 * 30) {
          const converted = now - value * 1000;
          expandedCollections[key] = converted;
        } else {
          expandedCollections[key] = now - TWENTY_FOUR_HOURS;
        }
      });
    }

    const expandedData: SpaceshipData = {
      r: compactData.r || { a: 300, e: 200, d: 250 },
      u: compactData.u || { l: 1, ef: 1.0, rn: 500, st: 1000, m: 1.0 },
      c: expandedCollections,
      n: compactData.n || {},
      t: compactData.t || {},
      s: compactData.s || { tc: 0, tr: { a: 0, e: 0, d: 0 }, tt: 0, cs: 0, dc: 0, dcp: 0, dcs: 0, dcg: 0, lcd: new Date().toDateString() },
    };

    return expandedData;
  }
  static cleanCorruptedTimestamps(): void {
    const data = this.getData();
    const now = Date.now();
    const MIN_VALID_TIMESTAMP = 1577836800000; // Jan 1, 2020
    const MAX_VALID_TIMESTAMP = 1893456000000; // Jan 1, 2030
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

    let cleaned = false;
    Object.keys(data.c).forEach((key) => {
      const value = data.c[key];
      if (value === 0) {
        data.c[key] = now - TWENTY_FOUR_HOURS;
        cleaned = true;
      } else if (value < MIN_VALID_TIMESTAMP || value > MAX_VALID_TIMESTAMP) {
        data.c[key] = now - TWENTY_FOUR_HOURS;
        cleaned = true;
      }
    });

    if (cleaned) {
      this.saveData(data);
    }
  }
  static getDailyCollectionInfo(): {
    planets: { used: number; limit: number; unlimited: boolean };
    systems: { used: number; limit: number; unlimited: boolean };
    galaxies: { used: number; limit: number; unlimited: boolean };
  } {
    const data = this.getData();
    const today = new Date().toDateString();

    if (!data.s) {
      data.s = this.emptyStats(today);
      this.saveData(data);
    }

    if (data.s.lcd !== today) {
      data.s.dcp = 0;
      data.s.dcs = 0;
      data.s.dcg = 0;
      data.s.lcd = today;
      this.saveData(data);
    }

    return {
      planets: {
        used: data.s.dcp || 0,
        limit: this.DAILY_COLLECTION_LIMITS.planet,
        unlimited: this.DAILY_COLLECTION_LIMITS.planet === Infinity,
      },
      systems: {
        used: data.s.dcs || 0,
        limit: this.DAILY_COLLECTION_LIMITS.system,
        unlimited: this.DAILY_COLLECTION_LIMITS.system === Infinity,
      },
      galaxies: {
        used: data.s.dcg || 0,
        limit: this.DAILY_COLLECTION_LIMITS.galaxy,
        unlimited: this.DAILY_COLLECTION_LIMITS.galaxy === Infinity,
      },
    };
  }
}

// atlas-ui/react/static/js/Utils/CombatSystem.tsx
// Turn-based PvE, fully client-side and reproducible: both sides are derived
// from the planet key plus the refit levels. Nothing here touches the network.

import { getItem, setItem } from "./b64.tsx";
import { hashText, makeRng, dayKey } from "./Deterministic.tsx";
import { ShipModuleSystem } from "./ShipModules.tsx";
import { HullSystem } from "./HullSystem.tsx";
import { Residents } from "./Residents.tsx";
import { UnifiedSpaceshipStorage } from "./UnifiedSpaceshipStorage.tsx";
import { ResourceEventManager } from "./ResourceEventManager.tsx";
import { RefitVoucherSystem } from "./RefitVoucher.tsx";
import { WreckSystem } from "./WreckSystem.tsx";
import { ContractSystem } from "./ContractSystem.tsx";
import { FactionSystem } from "./FactionSystem.tsx";
import { FleetSystem } from "./FleetSystem.tsx";
import type { ChallengeSnapshot } from "./ChallengeSystem.tsx";
import { coordinatesFromKey, sectorOf } from "./SectorMath.tsx";
import type { SpaceshipResource } from "./SpaceshipResources.tsx";

export const COMBAT_STORAGE_KEY = "_atlasCombat";
const ENCOUNTER_RATE = 5;
const MAX_TRACKED = 60;

export type CombatAction = "fire" | "shield" | "evade" | "flee";
export type CombatOutcome = "ongoing" | "win" | "lose" | "fled";

export interface CombatShip {
  name: string;
  hp: number;
  hpMax: number;
  shield: number;
  shieldMax: number;
  firepower: number;
}

export interface CombatState {
  seed: number;
  turn: number;
  mobility: number;
  player: CombatShip;
  enemy: CombatShip;
  /** Idle fleet ships that joined the fight as escorts. */
  escorts?: CombatShip[];
  log: string[];
  outcome: CombatOutcome;
}

export interface CombatResult {
  outcome: CombatOutcome;
  reward: Partial<SpaceshipResource>;
  vouchers: number;
  hullLoss: number;
  cargoLoss: Partial<SpaceshipResource>;
  fuelLost: number;
}

interface CombatStore {
  version: number;
  day: string;
  fought: string[];
}

const CARGO_KEYS: Array<keyof SpaceshipResource> = [
  "quantumAlloy",
  "plasmaCell",
  "neuralCircuit",
  "exoticCrystal",
  "nebulaDust",
  "ancientRelic",
  "alienArtifact",
  "dimensionalShard",
];

const applyDamage = (attacker: CombatShip, defender: CombatShip, roll: number, mitigation = 1): number => {
  const raw = Math.max(1, Math.round(attacker.firepower * (0.8 + roll * 0.4) * mitigation));
  const absorbed = Math.min(defender.shield, raw);
  defender.shield -= absorbed;
  defender.hp = Math.max(0, defender.hp - (raw - absorbed));
  return raw;
};

export class CombatSystem {
  static shouldEncounter(planetKey: string): boolean {
    const store = CombatSystem.load();
    const day = dayKey();
    if (store.day === day && store.fought.includes(planetKey)) return false;

    // Reputation in raider space makes ambushes more likely.
    const rate = ENCOUNTER_RATE + FactionSystem.encounterBonus(coordinatesFromKey(planetKey)) * 100;
    return hashText(`combat|${planetKey}|${day}`) % 100 < rate;
  }

  /** Marks the planet as fought today so a refresh cannot re-roll for free. */
  static createEncounter(planetKey: string): CombatState {
    const seed = hashText(`combat-roll|${planetKey}|${dayKey()}`);
    const rng = makeRng(seed);
    const hull = HullSystem.value();
    const efficiency = UnifiedSpaceshipStorage.getUpgrade().efficiency;

    const hpMax = Math.round(40 + hull * 0.6);
    const player: CombatShip = {
      name: "本舰",
      hp: hpMax,
      hpMax,
      shieldMax: ShipModuleSystem.shieldStrength(),
      shield: ShipModuleSystem.shieldStrength(),
      firepower: ShipModuleSystem.firepower(),
    };

    const scale = 0.6 + rng.next() * 0.6;
    const roster = Residents.roster(Residents.universeSeed());
    const raider = roster[rng.int(0, roster.length - 1)];

    const enemy: CombatShip = {
      name: `${raider.callsign} 的掠夺舰`,
      hpMax: Math.max(20, Math.round(hpMax * scale)),
      hp: Math.max(20, Math.round(hpMax * scale)),
      shieldMax: Math.max(0, Math.round(player.shieldMax * scale)),
      shield: Math.max(0, Math.round(player.shieldMax * scale)),
      firepower: Math.max(4, Math.round(player.firepower * scale)),
    };

    CombatSystem.markFought(planetKey);

    // Ships left on standby fly escort: they add firepower and soak hits.
    const escorts: CombatShip[] = FleetSystem.list()
      .filter((ship) => ship.task === "idle")
      .slice(0, 2)
      .map((ship) => ({
        name: ship.name,
        hpMax: 30,
        hp: 30,
        shieldMax: 0,
        shield: 0,
        firepower: 8,
      }));

    const log = [`${enemy.name} 挡在航道上，拒绝让路。`];
    if (escorts.length > 0) log.push(`${escorts.length} 艘待命舰加入编队。`);

    return {
      seed,
      turn: 1,
      mobility: 0.2 + efficiency * 0.05,
      player,
      enemy,
      escorts,
      log,
      outcome: "ongoing",
    };
  }

  /** Fight a decoded challenge code: the opponent is another captain's snapshot. */
  static createFromChallenge(snapshot: ChallengeSnapshot): CombatState {
    const seed = hashText(`challenge|${snapshot.name}|${snapshot.weaponLevel}|${snapshot.shieldLevel}|${dayKey()}`);
    const hull = HullSystem.value();
    const efficiency = UnifiedSpaceshipStorage.getUpgrade().efficiency;
    const hpMax = Math.round(40 + hull * 0.6);

    const player: CombatShip = {
      name: "本舰",
      hp: hpMax,
      hpMax,
      shieldMax: ShipModuleSystem.shieldStrength(),
      shield: ShipModuleSystem.shieldStrength(),
      firepower: ShipModuleSystem.firepower(),
    };

    const enemyHp = Math.round(40 + snapshot.hull * 0.6);
    const enemy: CombatShip = {
      name: `${snapshot.name} 的旗舰`,
      hp: enemyHp,
      hpMax: enemyHp,
      shieldMax: 4 + snapshot.shieldLevel * 3,
      shield: 4 + snapshot.shieldLevel * 3,
      firepower: 6 + snapshot.weaponLevel * 4,
    };

    return {
      seed,
      turn: 1,
      mobility: 0.2 + efficiency * 0.05,
      player,
      enemy,
      log: [`你调出了 ${snapshot.name} 的战术快照，模拟战开始。`],
      outcome: "ongoing",
    };
  }

  /** Pure turn resolution: returns a new state, never mutates the input. */
  static resolveTurn(state: CombatState, action: CombatAction): CombatState {
    if (state.outcome !== "ongoing") return state;

    const rng = makeRng(state.seed + state.turn * 7919);
    const player = { ...state.player };
    const enemy = { ...state.enemy };
    const log = [...state.log];

    if (action === "flee") {
      const chance = Math.min(0.9, 0.35 + state.mobility * 0.1);
      if (rng.next() < chance) {
        log.push("你甩开了对方，跳入跃迁通道。");
        return { ...state, player, enemy, log, outcome: "fled" };
      }
      log.push("撤离失败，对方咬住了尾迹。");
    } else if (action === "shield") {
      player.shield = player.shieldMax;
      log.push("护盾充能至满。");
    } else if (action === "evade") {
      player.shield = Math.min(player.shieldMax, player.shield + Math.round(player.shieldMax * 0.25));
      log.push("机动规避，本回合受创减半。");
    } else {
      // The whole formation fires: flagship plus any escort.
      const combined: CombatShip = {
        ...player,
        firepower: player.firepower + (state.escorts ?? []).reduce((sum, escort) => sum + escort.firepower, 0),
      };
      const damage = applyDamage(combined, enemy, rng.next());
      log.push(`你开火，造成 ${damage} 点伤害。`);
    }

    if (enemy.hp <= 0) {
      log.push(`${enemy.name} 失去动力。`);
      return { ...state, turn: state.turn + 1, player, enemy, escorts: state.escorts, log, outcome: "win" };
    }

    const escorts = (state.escorts ?? []).map((escort) => ({ ...escort }));
    const alive = escorts.filter((escort) => escort.hp > 0);
    const mitigation = action === "evade" ? 0.5 : 1;
    let taken: number;

    if (alive.length > 0 && rng.next() < 0.35) {
      taken = applyDamage(enemy, alive[0], rng.next(), mitigation);
      log.push(`对方击中护航舰 ${alive[0].name}，造成 ${taken} 点伤害。`);
    } else {
      taken = applyDamage(enemy, player, rng.next(), mitigation);
      log.push(`对方还击，造成 ${taken} 点伤害。`);
    }

    if (player.hp <= 0) {
      log.push("船体失压，你被迫弃船撤离。");
      return { ...state, turn: state.turn + 1, player, enemy, escorts, log, outcome: "lose" };
    }

    return { ...state, turn: state.turn + 1, player, enemy, escorts, log };
  }

  /** Applies the consequences of a finished fight exactly once. */
  static settle(state: CombatState, context: { planetKey?: string; coordinates?: string } = {}): CombatResult {
    const result: CombatResult = { outcome: state.outcome, reward: {}, vouchers: 0, hullLoss: 0, cargoLoss: {}, fuelLost: 0 };
    if (state.outcome === "ongoing") return result;

    if (state.outcome === "win") {
      if (context.planetKey) WreckSystem.record(context.planetKey, state.turn);
      if (context.coordinates) {
        ContractSystem.increment("kills", 1, context.coordinates);
        FactionSystem.recordKill(context.coordinates);
      }

      result.reward = { antimatter: 120 + state.turn * 10, exoticCrystal: 8 };
      result.vouchers = state.turn <= 6 ? 1 : 0;
      UnifiedSpaceshipStorage.addResources({
        antimatter: result.reward.antimatter ?? 0,
        element115: 0,
        deuterium: 0,
        quantumAlloy: 0,
        plasmaCell: 0,
        neuralCircuit: 0,
        exoticCrystal: result.reward.exoticCrystal ?? 0,
        nebulaDust: 0,
        blackHoleFragment: 0,
        ancientRelic: 0,
        alienArtifact: 0,
        dimensionalShard: 0,
      });
      if (result.vouchers > 0) RefitVoucherSystem.earn(result.vouchers);
    }

    if (state.outcome === "lose") {
      result.hullLoss = 20;
      HullSystem.damage(result.hullLoss);
      result.cargoLoss = CombatSystem.raidCargo();
    }

    if (state.outcome === "fled") {
      result.fuelLost = 20;
      const resources = UnifiedSpaceshipStorage.getResources();
      UnifiedSpaceshipStorage.setResources({ ...resources, deuterium: Math.max(0, resources.deuterium - result.fuelLost) });
    }

    ResourceEventManager.emit("resources_updated");
    return result;
  }

  private static raidCargo(): Partial<SpaceshipResource> {
    const resources = UnifiedSpaceshipStorage.getResources();
    const updated = { ...resources };
    const lost: Partial<SpaceshipResource> = {};

    CARGO_KEYS.forEach((key) => {
      const amount = resources[key] ?? 0;
      if (amount <= 0) return;
      const taken = Math.floor(amount * 0.05);
      if (taken <= 0) return;
      updated[key] = amount - taken;
      lost[key] = taken;
    });

    UnifiedSpaceshipStorage.setResources(updated);
    return lost;
  }

  private static markFought(planetKey: string): void {
    const store = CombatSystem.load();
    const day = dayKey();
    const fought = store.day === day ? [...store.fought, planetKey] : [planetKey];

    CombatSystem.save({ version: 1, day, fought: fought.slice(-MAX_TRACKED) });
  }

  private static load(): CombatStore {
    try {
      const raw = getItem(COMBAT_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || !Array.isArray(parsed.fought)) return { version: 1, day: "", fought: [] };
      return { version: 1, day: parsed.day ?? "", fought: parsed.fought };
    } catch (error) {
      return { version: 1, day: "", fought: [] };
    }
  }

  private static save(store: CombatStore): void {
    setItem(COMBAT_STORAGE_KEY, JSON.stringify(store));
  }
}

export default CombatSystem;

// atlas-ui/react/static/js/Utils/TradeSystem.tsx
// Local commodity exchange: each planet quotes three goods whose prices are
// re-rolled every day from the planet key, so markets differ per destination.

import { SeededRandom } from "./SeededRandom.tsx";
import { getItem, setItem } from "./b64.tsx";
import { SpaceshipResourceManager, SpaceshipResource } from "./SpaceshipResources.tsx";
import { UnifiedSpaceshipStorage } from "./UnifiedSpaceshipStorage.tsx";
import { ResourceEventManager } from "./ResourceEventManager.tsx";
import { resourceLabel } from "./ResourceLabels.tsx";
import { ShipModuleSystem } from "./ShipModules.tsx";
import { ContractSystem } from "./ContractSystem.tsx";
import { StationSystem } from "./StationSystem.tsx";
import { Residents } from "./Residents.tsx";
import { CosmicEvents } from "./CosmicEvents.tsx";
import { FactionSystem } from "./FactionSystem.tsx";
import { TechSystem } from "./TechSystem.tsx";
import { coordinatesFromKey } from "./SectorMath.tsx";

export const TRADE_STORAGE_KEY = "_atlasTrade";
/** Payout is the good's base value, so cheap markets are worth hauling. */
export const TRADE_SELL_RATIO = 1.0;
const MAX_TRACKED_MARKETS = 200;

export interface TradeGood {
  resource: keyof SpaceshipResource;
  label: string;
  icon: string;
  price: number;
  basePrice: number;
  sellPrice: number;
  stock: number;
}

export interface TradeResult {
  ok: boolean;
  message: string;
}

const GOOD_POOL: Array<{ resource: keyof SpaceshipResource; icon: string; base: number }> = [
  { resource: "quantumAlloy", icon: "⚙️", base: 6 },
  { resource: "plasmaCell", icon: "🔋", base: 8 },
  { resource: "neuralCircuit", icon: "🧠", base: 10 },
  { resource: "exoticCrystal", icon: "💠", base: 18 },
  { resource: "nebulaDust", icon: "🌫️", base: 14 },
  { resource: "blackHoleFragment", icon: "🕳️", base: 40 },
  { resource: "ancientRelic", icon: "🏺", base: 30 },
  { resource: "alienArtifact", icon: "🛸", base: 34 },
  { resource: "dimensionalShard", icon: "🔮", base: 50 },
];

interface MarketStock {
  date: string;
  stock: number;
}

interface TradeStore {
  version: number;
  markets: Record<string, MarketStock>;
}

export class TradeSystem {
  static getMarket(planetKey: string): TradeGood[] {
    const rng = new SeededRandom(TradeSystem.hashText(`${planetKey}|${TradeSystem.today()}`));
    const pool = [...GOOD_POOL];
    const picked: TradeGood[] = [];
    const today = TradeSystem.today();
    const store = TradeSystem.load();
    // A planet another captain already picked over: thinner stock, worse prices.
    const raided = Residents.hasTrace(planetKey, Residents.universeSeed());
    // Patrol space you have helped charges less.
    const factionFactor = FactionSystem.tradeMultiplier(coordinatesFromKey(planetKey));

    for (let i = 0; i < 3; i++) {
      const index = rng.randint(0, pool.length - 1);
      const [entry] = pool.splice(index, 1);
      const price = Math.max(
        2,
        Math.round(entry.base * (0.65 + rng.random() * 0.7) * ShipModuleSystem.tradeBuyMultiplier() * (raided ? 1.08 : 1) * factionFactor),
      );
      const key = `${planetKey}:${entry.resource}`;

      if (!store.markets[key] || store.markets[key].date !== today) {
        // Derived from the key, not the rng: drawing here would shift the rolls
        // below and make prices/selection change between two calls on the same day.
        const stock = 4 + (TradeSystem.hashText(key) % 13);
        store.markets[key] = { date: today, stock: Math.max(1, Math.round(stock * (raided ? 0.8 : 1))) };
      }

      picked.push({
        resource: entry.resource,
        label: resourceLabel(entry.resource),
        icon: entry.icon,
        price,
        basePrice: entry.base,
        // Station modules and cosmic events lift the quote itself, so the shown
        // price is exactly what the player receives.
        sellPrice: Math.max(
          1,
          Math.round(entry.base * TRADE_SELL_RATIO * StationSystem.tradeSellMultiplier() * CosmicEvents.multiplier("sell") * TechSystem.multiplier("trade")),
        ),
        stock: store.markets[key].stock,
      });
    }

    TradeSystem.trim(store);
    setItem(TRADE_STORAGE_KEY, JSON.stringify(store));
    return picked;
  }

  static buy(planetKey: string, good: TradeGood, quantity = 1, coordinates?: string): TradeResult {
    const resources = SpaceshipResourceManager.getResources();
    const cost = good.price * quantity;

    if (good.stock < quantity) return { ok: false, message: "市场库存不足" };
    if (resources.antimatter < cost) return { ok: false, message: `反物质不足（需要 ${cost}）` };

    UnifiedSpaceshipStorage.setResources({ ...resources, antimatter: resources.antimatter - cost });
    SpaceshipResourceManager.addResources({ [good.resource]: quantity } as Partial<SpaceshipResource>);
    TradeSystem.shiftStock(planetKey, good.resource, -quantity);
    ContractSystem.increment("trades", 1, coordinates);
    ResourceEventManager.emit("resources_updated");

    return { ok: true, message: `购入 ${good.label} ×${quantity}，花费 ${cost} 反物质` };
  }

  static sell(planetKey: string, good: TradeGood, quantity = 1, coordinates?: string): TradeResult {
    const resources = SpaceshipResourceManager.getResources();
    if ((resources[good.resource] ?? 0) < quantity) return { ok: false, message: `${good.label} 数量不足` };

    const payout = good.sellPrice * quantity;
    UnifiedSpaceshipStorage.setResources({ ...resources, [good.resource]: (resources[good.resource] ?? 0) - quantity } as SpaceshipResource);
    SpaceshipResourceManager.addResources({ antimatter: payout });
    TradeSystem.shiftStock(planetKey, good.resource, quantity);
    ContractSystem.increment("trades", 1, coordinates);
    ResourceEventManager.emit("resources_updated");

    return { ok: true, message: `售出 ${good.label} ×${quantity}，获得 ${payout} 反物质` };
  }

  private static shiftStock(planetKey: string, resource: keyof SpaceshipResource, delta: number): void {
    const store = TradeSystem.load();
    const key = `${planetKey}:${resource}`;
    const today = TradeSystem.today();

    if (!store.markets[key] || store.markets[key].date !== today) {
      store.markets[key] = { date: today, stock: 4 + (TradeSystem.hashText(key) % 13) };
    }
    store.markets[key].stock = Math.max(0, store.markets[key].stock + delta);

    setItem(TRADE_STORAGE_KEY, JSON.stringify(store));
  }

  private static trim(store: TradeStore): void {
    const keys = Object.keys(store.markets);
    if (keys.length <= MAX_TRACKED_MARKETS) return;

    keys
      .filter((key) => store.markets[key].date !== TradeSystem.today())
      .slice(0, keys.length - MAX_TRACKED_MARKETS)
      .forEach((stale) => delete store.markets[stale]);
  }

  private static today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private static hashText(text: string): number {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash) % 2147483647;
  }

  private static load(): TradeStore {
    try {
      const raw = getItem(TRADE_STORAGE_KEY);
      if (!raw) return { version: 1, markets: {} };
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || typeof parsed.markets !== "object") {
        return { version: 1, markets: {} };
      }
      return { version: 1, markets: parsed.markets };
    } catch (error) {
      return { version: 1, markets: {} };
    }
  }
}

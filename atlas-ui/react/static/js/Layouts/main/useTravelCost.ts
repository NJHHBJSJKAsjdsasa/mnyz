// Layouts/main/useTravelCost.ts — quoted fuel for the current coordinates.
//
// Extracted from `__main__.tsx` (2026-10-29). Two behavioural fixes came with it:
//
//   * the cost was recomputed by a 5 s `setInterval`; it now recomputes when the
//     coordinates change **or** when the wallet changes (`resources_updated`),
//     which is the only two ways the number can move. One timer fewer, and the
//     readout stops lagging up to five seconds behind a purchase;
//   * efficiency used to be applied by both the caller and `executeTravel`. It is
//     applied once here, next to the quote, and the same value feeds the charge.

import { useCallback, useEffect, useState } from "react";
import { ResourceEventManager } from "../../Utils/ResourceEventManager.tsx";
import { SpaceshipResourceManager } from "../../Utils/SpaceshipResources.tsx";
import { SpaceshipTravelManager } from "../../Utils/SpaceshipTravelCosts.tsx";
import { distanceFromOrigin, type Coordinates } from "./format.ts";

export type { Coordinates };

export interface TravelCost {
  antimatter: number;
  element115: number;
  deuterium: number;
}

export interface TravelQuote {
  travelCost: TravelCost | null;
  canAfford: boolean;
  /** How far this ship can jump in one hop (same table as `ship.stats.range`). */
  range: number;
  /** The chosen coordinates are within one hop. */
  inRange: boolean;
  /** Euclidean distance from the origin to the chosen coordinates. */
  distance: number;
}

/** Quote for a jump from the origin to `coordinates`, efficiency applied once. */
export const quoteTravel = (
  coordinates: Coordinates,
): { cost: TravelCost; affordable: boolean; range: number; inRange: boolean; distance: number } => {
  const upgrade = SpaceshipResourceManager.getUpgrade();
  const distance = distanceFromOrigin(coordinates);
  const raw = SpaceshipTravelManager.getTravelCost("galaxy", distance);
  const efficiency = upgrade.efficiency;
  const cost: TravelCost = {
    antimatter: Math.max(1, Math.floor(raw.antimatter / efficiency)),
    element115: Math.max(1, Math.floor(raw.element115 / efficiency)),
    deuterium: Math.max(1, Math.floor(raw.deuterium / efficiency)),
  };
  const resources = SpaceshipResourceManager.getResources();
  const affordable =
    resources.antimatter >= cost.antimatter &&
    resources.element115 >= cost.element115 &&
    resources.deuterium >= cost.deuterium;
  // The server refuses a hop longer than `stats(level).range` (500 at level 1), so
  // the button has to know that *before* the round trip — otherwise every
  // coordinate a player types across a galaxy comes back as
  // "超出当前航程，请先升级飞船".
  const range = upgrade.range;
  return { cost, affordable, range, inRange: distance <= range, distance };
};

export const useTravelCost = (coordinates: Coordinates): TravelQuote => {
  const [travelCost, setTravelCost] = useState<TravelCost | null>(null);
  const [canAfford, setCanAfford] = useState(false);
  const [range, setRange] = useState(0);
  const [inRange, setInRange] = useState(true);
  const [distance, setDistance] = useState(0);

  const refresh = useCallback(() => {
    const quoted = quoteTravel(coordinates);
    setTravelCost(quoted.cost);
    setCanAfford(quoted.affordable);
    setRange(quoted.range);
    setInRange(quoted.inRange);
    setDistance(quoted.distance);
  }, [coordinates.x, coordinates.y, coordinates.z]);

  useEffect(() => {
    refresh();
    return ResourceEventManager.subscribe("resources_updated", refresh);
  }, [refresh]);

  return { travelCost, canAfford, range, inRange, distance };
};

export default useTravelCost;

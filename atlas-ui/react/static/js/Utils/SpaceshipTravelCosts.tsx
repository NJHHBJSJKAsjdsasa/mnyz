// atlas-ui/react/static/js/Utils/SpaceshipTravelCosts.tsx

import React from "react";
import { SpaceshipResourceManager, TravelCost } from "./SpaceshipResources.tsx";
import { UnifiedSpaceshipStorage } from "./UnifiedSpaceshipStorage.tsx";
import { ServerApi } from "./ServerApi.tsx";
import { toast } from "../ui/Toast.tsx";

export type TravelOutcome = "success" | "partial" | "emergency";

export class SpaceshipTravelManager {
  /** Galaxy jumps above 1000 units are long jumps and share the contract formula. */
  static getTravelCost(locationType: "galaxy" | "system" | "planet", distance: number = 0): TravelCost {
    if (locationType === "galaxy" && distance >= 1000) return SpaceshipResourceManager.calculateJumpCost(distance);
    return SpaceshipResourceManager.calculateTravelCost(locationType, distance);
  }

  /**
   * Charge one jump.
   *
   * In `server` mode the price and the debit both happen on the server
   * (docs/frontend-redesign 11 §4.1): quote → commit. The local wallet is then
   * overwritten with the balances the ledger returned, so a hand-edited save
   * cannot buy fuel. `off` / `shadow` keep the original local behaviour.
   */
  static async chargeTravel(
    locationType: "galaxy" | "system" | "planet",
    origin: number[],
    target: number[],
    distance: number = 1
  ): Promise<TravelOutcome> {
    if (ServerApi.mode() !== "server") {
      const outcome = this.executeTravel(locationType, distance);
      // 静默失败 = "点了没反应"。本地模式至少要说出价格和缺口。
      if (outcome === "emergency") {
        toast(`燃料不足：本次跳跃需要 ${this.previewTravelCost(locationType, distance)}`, "warn");
      }
      return outcome;
    }
    try {
      const quote = await ServerApi.travelQuote(locationType, toPoint(origin), toPoint(target));
      if (!quote.affordable) {
        toast(`燃料不足：本次跳跃需要 ${formatCost(quote.cost)}`, "warn");
        return "emergency";
      }
      const travel = await ServerApi.travelCommit(quote.quote_id);
      this.applyServerBalances(travel.balances);
      return "success";
    } catch (error) {
      // No silent local fallback: double-charging is worse than refusing a jump.
      // Either the quote or the commit can fail (a zero-distance jump never
      // reaches commit at all); name the whole charge, not just the commit.
      console.warn("[atlas-server] travel charge failed", error);
      toast(`航行被拒绝：${errorText(error)}`, "danger");
      return "emergency";
    }
  }

  /** Copy the ledger's answer into the local cache (never the other way round). */
  static applyServerBalances(balances: Record<string, string> | undefined): void {
    if (!balances) return;
    const next = { ...SpaceshipResourceManager.getResources() } as unknown as Record<string, number>;
    let touched = false;
    Object.entries(balances).forEach(([code, value]) => {
      if (code in next) {
        next[code] = Math.max(0, Math.round(Number(value)));
        touched = true;
      }
    });
    if (touched) UnifiedSpaceshipStorage.setResources(next as Parameters<typeof UnifiedSpaceshipStorage.setResources>[0]);
  }

  static canAffordTravel(locationType: "galaxy" | "system" | "planet", distance: number = 0): boolean {
    const cost = SpaceshipTravelManager.getTravelCost(locationType, distance);
    const resources = SpaceshipResourceManager.getResources();
    const efficiency = SpaceshipResourceManager.getUpgrade().efficiency;

    return (
      resources.antimatter >= Math.floor(cost.antimatter / efficiency) &&
      resources.element115 >= Math.floor(cost.element115 / efficiency) &&
      resources.deuterium >= Math.floor(cost.deuterium / efficiency)
    );
  }

  static executeTravel(locationType: "galaxy" | "system" | "planet", distance: number = 0): "success" | "partial" | "emergency" {
    const cost = this.getTravelCost(locationType, distance);
    const resources = SpaceshipResourceManager.getResources();
    const upgrade = SpaceshipResourceManager.getUpgrade();

    const actualCost = {
      antimatter: Math.floor(cost.antimatter / upgrade.efficiency),
      element115: Math.floor(cost.element115 / upgrade.efficiency),
      deuterium: Math.floor(cost.deuterium / upgrade.efficiency),
    };

    const resourcePercentages = [resources.antimatter / actualCost.antimatter, resources.element115 / actualCost.element115, resources.deuterium / actualCost.deuterium];

    const minPercentage = Math.min(...resourcePercentages);

    if (minPercentage >= 1.0) {
      SpaceshipResourceManager.consumeResources(actualCost);
      return "success";
    } else if (minPercentage >= 0.5) {
      SpaceshipResourceManager.consumeResources({
        antimatter: Math.min(resources.antimatter, actualCost.antimatter),
        element115: Math.min(resources.element115, actualCost.element115),
        deuterium: Math.min(resources.deuterium, actualCost.deuterium),
      });
      return "partial";
    } else {
      return "emergency";
    }
  }

  static previewTravelCost(locationType: "galaxy" | "system" | "planet", distance: number = 0): string {
    const cost = this.getTravelCost(locationType, distance);
    const upgrade = SpaceshipResourceManager.getUpgrade();

    const actualCost = {
      antimatter: Math.floor(cost.antimatter / upgrade.efficiency),
      element115: Math.floor(cost.element115 / upgrade.efficiency),
      deuterium: Math.floor(cost.deuterium / upgrade.efficiency),
    };

    return `${actualCost.antimatter}AM | ${actualCost.element115}E115 | ${actualCost.deuterium}D`;
  }

  static getActualTravelCost(locationType: "galaxy" | "system" | "planet", distance: number = 0): { antimatter: number; element115: number; deuterium: number } {
    const cost = this.getTravelCost(locationType, distance);
    const resources = SpaceshipResourceManager.getResources();
    const upgrade = SpaceshipResourceManager.getUpgrade();

    const actualCost = {
      antimatter: Math.floor(cost.antimatter / upgrade.efficiency),
      element115: Math.floor(cost.element115 / upgrade.efficiency),
      deuterium: Math.floor(cost.deuterium / upgrade.efficiency),
    };

    const resourcePercentages = [resources.antimatter / actualCost.antimatter, resources.element115 / actualCost.element115, resources.deuterium / actualCost.deuterium];

    const minPercentage = Math.min(...resourcePercentages);

    if (minPercentage >= 1.0) {
      return actualCost;
    } else if (minPercentage >= 0.5) {
      return {
        antimatter: Math.min(resources.antimatter, actualCost.antimatter),
        element115: Math.min(resources.element115, actualCost.element115),
        deuterium: Math.min(resources.deuterium, actualCost.deuterium),
      };
    } else {
      return { antimatter: 0, element115: 0, deuterium: 0 };
    }
  }

  static getTravelEfficiency(): number {
    const upgrade = SpaceshipResourceManager.getUpgrade();
    return upgrade.efficiency;
  }

  static getMaxTravelRange(): number {
    const upgrade = SpaceshipResourceManager.getUpgrade();
    return upgrade.range;
  }
}

/** Clamp a galaxy coordinate triple into the `Point` the API accepts. */
function toPoint(coords: number[]): { x: number; y: number; z: number } {
  const clamp = (value: number) => Math.max(0, Math.min(10_000_000, Math.round(Number(value) || 0)));
  return { x: clamp(coords[0] ?? 0), y: clamp(coords[1] ?? 0), z: clamp(coords[2] ?? 0) };
}

/** `{antimatter: "1.0000"}` → `1 AM / 2 E115 / 3 D`, dropping zero parts. */
function formatCost(cost: Record<string, string> | undefined): string {
  if (!cost) return "未知";
  const labels: Record<string, string> = { antimatter: "AM", element115: "E115", deuterium: "D" };
  const parts = Object.entries(cost)
    .map(([code, value]) => [labels[code] ?? code, Number(value)] as const)
    .filter(([, value]) => Number.isFinite(value) && value > 0)
    .map(([label, value]) => `${trim(value)} ${label}`);
  return parts.length ? parts.join(" / ") : "未知";
}

function trim(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/** ServerApi throws plain Errors carrying the API's own Chinese detail. */
function errorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

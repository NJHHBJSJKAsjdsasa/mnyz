// atlas-ui/react/static/js/Utils/CosmicEvents.tsx
// One cosmic event per 6-hour window, derived purely from the universe seed and
// the window index. Nothing is stored, so the event is identical for everyone
// in the same universe and cannot be re-rolled by refreshing.

import { getUniverseInfo } from "./b64.tsx";
import { hashText } from "./Deterministic.tsx";
import { sectorOf } from "./SectorMath.tsx";

export const EVENT_WINDOW_MS = 6 * 60 * 60 * 1000;

export type CosmicKind = "mining" | "scan" | "sell" | "fuel";

export interface CosmicEvent {
  id: string;
  title: string;
  icon: string;
  detail: string;
  kind: CosmicKind;
  factor: number;
  positive: boolean;
  scope: "global" | "sector";
  sectorKey?: string;
  endsAt: number;
}

interface EventType {
  id: string;
  title: string;
  icon: string;
  detail: string;
  kind: CosmicKind;
  factor: number;
  positive: boolean;
}

const EVENT_TYPES: EventType[] = [
  { id: "supernova", title: "超新星余晖", icon: "💥", detail: "尘埃里的重元素更易提取：采集 +30%", kind: "mining", factor: 1.3, positive: true },
  { id: "meteor", title: "流星雨", icon: "☄️", detail: "表层被击穿，扫描产出 +25%", kind: "scan", factor: 1.25, positive: true },
  { id: "gravity", title: "引力波", icon: "🌊", detail: "航道被压缩，航行燃料 -20%", kind: "fuel", factor: 0.8, positive: true },
  { id: "market", title: "星际集市", icon: "🏷", detail: "商船云集，卖价 +15%", kind: "sell", factor: 1.15, positive: true },
  { id: "storm", title: "离子风暴", icon: "🌩", detail: "传感器受扰，扫描产出 -20%", kind: "scan", factor: 0.8, positive: false },
  { id: "leak", title: "燃料泄漏", icon: "🛢", detail: "货舱密封失效，航行燃料 +35%", kind: "fuel", factor: 1.35, positive: false },
];

export class CosmicEvents {
  /** The event active right now; stable for the whole 6-hour window. */
  static current(): CosmicEvent {
    const slot = Math.floor(Date.now() / EVENT_WINDOW_MS);
    const seed = hashText(`event|${getUniverseInfo().seedName ?? "local"}|${slot}`);
    const type = EVENT_TYPES[seed % EVENT_TYPES.length];

    // Mining and survey events hit one sector; trade and fuel touch the whole
    // universe so their multiplier needs no coordinates at the call site.
    const local = type.kind === "mining" || type.kind === "scan";
    const sectorKey = local ? `${seed % 10}-${Math.floor(seed / 10) % 10}-${Math.floor(seed / 100) % 10}` : undefined;

    return {
      id: `${slot}-${type.id}`,
      ...type,
      scope: local ? "sector" : "global",
      sectorKey,
      endsAt: (slot + 1) * EVENT_WINDOW_MS,
    };
  }

  /** Multiplier for one system, honouring the sector limit when there is one. */
  static multiplier(kind: CosmicKind, coordinates?: string): number {
    const event = CosmicEvents.current();
    if (event.kind !== kind) return 1;
    if (event.scope === "global") return event.factor;

    return event.sectorKey === sectorOf(coordinates ?? "").key ? event.factor : 1;
  }

  /** Whether the current position is covered by the active event. */
  static affects(coordinates?: string): boolean {
    const event = CosmicEvents.current();
    if (event.scope === "global") return true;
    return event.sectorKey === sectorOf(coordinates ?? "").key;
  }

  static remainingMs(): number {
    return Math.max(0, CosmicEvents.current().endsAt - Date.now());
  }
}

export default CosmicEvents;

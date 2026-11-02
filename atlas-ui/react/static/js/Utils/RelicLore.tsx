// atlas-ui/react/static/js/Utils/RelicLore.tsx
// Five programmatic log fragments, one per relic scan. The fragment a planet
// yields is fixed by its key, so the same world always gives the same text.

import { getItem, setItem } from "./b64.tsx";
import { hashText, makeRng } from "./Deterministic.tsx";
import { ServerApi } from "./ServerApi.tsx";
import { SpaceshipResourceManager } from "./SpaceshipResources.tsx";
import { RefitVoucherSystem } from "./RefitVoucher.tsx";
import { ResourceEventManager } from "./ResourceEventManager.tsx";

export const RELIC_STORAGE_KEY = "_atlasRelics";
export const TOTAL_FRAGMENTS = 5;

const TITLES = ["残片 · 冻土之下", "残片 · 回音", "残片 · 拆分", "残片 · 分歧", "残片 · 邀请"];

const OPENERS = [
  "记录员身份已抹除。",
  "我们在这里停了两百三十七天。",
  "母星的轨道偏了 0.4 度。",
  "第七次钻探才取到样本。",
  "如果你是从轨道上读到这段的，说明我们失败了。",
  "所有仪器都指向同一件事。",
];

const MIDDLES = [
  "地下的结构不是自然形成的，",
  "冰层下面有规律的震动，",
  "我们把它拆开，又在原位装回去，",
  "团队分成了两派，",
  "样本在无氧环境里仍然在生长，",
  "有人在夜里听见了回音，",
];

const CLOSERS = [
  "别在本地过夜。",
  "把坐标交给下一个人。",
  "我们留下了一半工具。",
  "如果你需要答案，往北走三天。",
  "这不是警告，是邀请。",
  "到此为止。",
];

const REWARD = { antimatter: 2500, ancientRelic: 3, alienArtifact: 2 };

interface RelicStore {
  version: number;
  found: number[];
  claimed: boolean;
}

export interface RelicFragment {
  index: number;
  title: string;
  text: string;
}

export interface RelicProgress {
  found: number[];
  total: number;
  complete: boolean;
  claimed: boolean;
}

export class RelicLore {
  /** Which fragment this planet carries — stable for the planet's whole lifetime. */
  static fragmentFor(planetKey: string, planetName?: string): RelicFragment {
    const index = (hashText(planetKey) % TOTAL_FRAGMENTS) + 1;
    const rng = makeRng(hashText(`${planetKey}|lore`));
    const pick = (pool: string[]): string => pool[rng.int(0, pool.length - 1)];

    const text = `${pick(OPENERS)}${pick(MIDDLES)}${pick(CLOSERS)}`.replace("{planet}", (planetName ?? "").replace(/_/g, " "));
    return { index, title: TITLES[index - 1], text };
  }

  /**
   * Record a relic scan on the server (T-63).
   *
   * The server owns both the fragment index and the one-time reward, so a
   * hand-edited `_atlasRelics` can no longer fake a completed archive. The local
   * store is written only from the response.
   */
  static async record(planetKey: string): Promise<{ index: number; completed: boolean }> {
    try {
      const result = await ServerApi.request(`/api/v1/relics/${encodeURIComponent(planetKey)}`, {
        method: "POST",
        headers: { "Idempotency-Key": globalThis.crypto?.randomUUID?.() || `${Date.now()}` },
        body: "{}",
      });
      const found = Array.isArray(result?.found) ? result.found.map((value: number) => Number(value)) : [];
      RelicLore.save({ version: 1, found, claimed: Boolean(result?.complete) });
      if (result?.reward_granted) ResourceEventManager.emit("resources_updated");
      return { index: Number(result?.fragment_index ?? 0), completed: Boolean(result?.complete) };
    } catch (error) {
      console.warn("[atlas] relic record failed", error);
      return { index: 0, completed: false };
    }
  }

  /** Pull the authoritative archive; the local copy is a render cache. */
  static async sync(): Promise<void> {
    try {
      const data = await ServerApi.request("/api/v1/relics");
      const found = Array.isArray(data?.found) ? data.found.map((value: number) => Number(value)) : [];
      RelicLore.save({ version: 1, found, claimed: Boolean(data?.claimed) });
    } catch (error) {
      console.warn("[atlas] relic view failed", error);
    }
  }

  static progress(): RelicProgress {
    const store = RelicLore.load();
    return {
      found: store.found,
      total: TOTAL_FRAGMENTS,
      complete: store.found.length >= TOTAL_FRAGMENTS,
      claimed: store.claimed,
    };
  }

  private static load(): RelicStore {
    try {
      const raw = getItem(RELIC_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || !Array.isArray(parsed.found)) return { version: 1, found: [], claimed: false };
      return {
        version: 1,
        found: parsed.found.filter((value: number) => Number.isInteger(value) && value >= 1 && value <= TOTAL_FRAGMENTS),
        claimed: Boolean(parsed.claimed),
      };
    } catch (error) {
      return { version: 1, found: [], claimed: false };
    }
  }

  private static save(store: RelicStore): void {
    setItem(RELIC_STORAGE_KEY, JSON.stringify(store));
  }
}

export default RelicLore;

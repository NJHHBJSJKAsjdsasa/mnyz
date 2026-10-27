// atlas-ui/react/static/js/Utils/Residents.tsx
// Deterministic NPC captains. Every value here is a pure function of
// (universe seed, week key, planet key) — no timers, no Math.random(),
// so a planet looks identical on reload and across devices.

import { getItem, setItem, getUniverseInfo } from "./b64.tsx";
import { hashText, makeRng, Rng } from "./Deterministic.tsx";

const TRACE_RATE = 18;
const MAX_DAYS_AGO = 21;
export const ENCOUNTER_STORAGE_KEY = "_atlasEncounters";

interface Captain {
  name: string;
  callsign: string;
}

const CAPTAINS: Captain[] = [
  { name: "林舟", callsign: "渡鸦-07" },
  { name: "顾青野", callsign: "白噪-12" },
  { name: "伊芙·兰", callsign: "冷湖-03" },
  { name: "柏原", callsign: "长夜-21" },
  { name: "罗塞塔·李", callsign: "灰烬-09" },
  { name: "穆斯塔法·奥", callsign: "砂时-16" },
  { name: "韩稚", callsign: "微光-04" },
  { name: "阿尔敏·柯", callsign: "环带-11" },
  { name: "谢无咎", callsign: "静默-18" },
  { name: "卡莉·温", callsign: "逆风-05" },
  { name: "池野", callsign: "残响-14" },
  { name: "诺拉·赛", callsign: "拂晓-01" },
  { name: "韦陀", callsign: "铁砧-22" },
  { name: "苏黎", callsign: "潮汐-08" },
  { name: "淀真", callsign: "短波-13" },
  { name: "玛拉·昆", callsign: "深井-06" },
  { name: "佟野", callsign: "折跃-19" },
  { name: "阿德里安·霍", callsign: "灰阶-02" },
  { name: "凯尔·索", callsign: "碎石-17" },
  { name: "孟迟", callsign: "空谱-10" },
  { name: "艾伯特·冯", callsign: "冷锋-24" },
  { name: "郑燧", callsign: "长弧-15" },
  { name: "诺亚·祁", callsign: "静海-20" },
  { name: "星野·遥", callsign: "旁白-23" },
];

const SHIP_CLASSES = [
  "探测船「针孔」",
  "货船「辎重」",
  "科考船「拓印」",
  "矿船「砾石」",
  "护卫舰「长矛」",
  "轻巡「雨燕」",
  "补给船「余温」",
  "测绘船「等距」",
];

interface Trait {
  label: string;
  notes: string[];
}

const TRAITS: Trait[] = [
  {
    label: "遗迹猎人",
    notes: [
      "这里的 {element} 层位不对，下面应该有东西，我没敢往下挖。",
      "打了三个孔，只取到 {element}。岩芯我留了一半在东侧。",
      "如果地层没骗我，{element} 只是封顶的那一层。下次带钻头来。",
      "别在这个位置降落第二次，我的采样坑还没塌完。",
    ],
  },
  {
    label: "精算师",
    notes: [
      "{element} 在最近三个贸易站都在跌，别急着装船。",
      "我只取了一罐 {element} 验货，成色比标称好一点。",
      "这地方的 {element} 值得跑一趟——如果你不赶合同的话。",
      "采样完毕。运费比货值贵，我劝你换个目的地。",
    ],
  },
  {
    label: "观测者",
    notes: [
      "读数有一处说不通的抖动，和 {element} 的分布对不上。",
      "光谱干净得可疑。我记下来就走了。",
      "{element} 的丰度在这个纬度突然升高，成因不明。",
      "此处不宜久留，磁场在慢慢往上走。",
    ],
  },
  {
    label: "独行客",
    notes: [
      "来过。取了 {element}。走了。",
      "东西不错，人不该久待。",
      "别跟我的航迹。",
      "{element} 归你，风向归我。",
    ],
  },
];

const TRACE_KINDS: Record<"life" | "mineral" | "orbit", string[]> = {
  life: ["营地残迹", "脚印链", "熄灭的照明棒"],
  mineral: ["采样坑", "钻探孔", "碎屑堆"],
  orbit: ["轨道标记", "烧蚀斑点", "定位信标残片"],
};

export interface Resident {
  id: string;
  name: string;
  callsign: string;
  ship: string;
  trait: string;
}

export interface PlanetTrace {
  resident: Resident;
  kind: string;
  element: string;
  daysAgo: number;
  note: string;
}

export interface LeaderRow {
  id: string;
  name: string;
  callsign: string;
  score: number;
  isPlayer: boolean;
}

export interface TraceOptions {
  planetKey: string;
  universeSeed: string;
  elements?: string[];
  lifeForms?: string;
}

export class Residents {
  /** One universe identity shared by every caller, so traces and roster never disagree. */
  static universeSeed(): string {
    const info = getUniverseInfo();
    return info.seedName || info.nodeId || "local";
  }

  /** ISO-ish week label from the local calendar, so it flips at local midnight. */
  static weekKey(date: Date = new Date()): string {
    const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = utc.getUTCDay() || 7;
    utc.setUTCDate(utc.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  }

  /** The full roster is fixed per universe; only the trace roll changes weekly. */
  static roster(universeSeed: string): Resident[] {
    const offset = hashText(`roster|${universeSeed}`) % CAPTAINS.length;

    return CAPTAINS.map((_, index) => {
      const source = CAPTAINS[(index * 5 + offset) % CAPTAINS.length];
      const stream = makeRng(hashText(`resident|${universeSeed}|${index}`));

      return {
        id: `res-${String(index).padStart(2, "0")}`,
        name: source.name,
        callsign: source.callsign,
        ship: stream.pick(SHIP_CLASSES),
        trait: stream.pick(TRAITS).label,
      };
    });
  }

  static hasTrace(planetKey: string, universeSeed: string): boolean {
    return Residents.roll(planetKey, universeSeed) < TRACE_RATE;
  }

  static trace(options: TraceOptions): PlanetTrace | null {
    const { planetKey, universeSeed } = options;
    const roll = Residents.roll(planetKey, universeSeed);
    if (roll >= TRACE_RATE) return null;

    const stream = makeRng(hashText(`trace|${universeSeed}|${Residents.weekKey()}|${planetKey}`));
    const roster = Residents.roster(universeSeed);
    const resident = roster[stream.int(0, roster.length - 1)];
    const trait = TRAITS.find((item) => item.label === resident.trait) ?? TRAITS[0];

    const elements = (options.elements ?? []).filter(Boolean);
    const element = elements.length > 0 ? stream.pick(elements) : "本星样本";
    const category = Residents.category(options.lifeForms, elements.length, stream);

    return {
      resident,
      kind: stream.pick(TRACE_KINDS[category]),
      element,
      daysAgo: stream.int(1, MAX_DAYS_AGO),
      note: stream.pick(trait.notes).replace("{element}", element),
    };
  }

  /** Roster entries met this week; resets on week rollover without touching storage again. */
  static encounters(): { week: string; met: string[] } {
    const week = Residents.weekKey();

    try {
      const raw = getItem(ENCOUNTER_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || parsed.week !== week || !Array.isArray(parsed.met)) return { week, met: [] };
      return { week, met: parsed.met.filter((id: string) => typeof id === "string") };
    } catch (error) {
      return { week, met: [] };
    }
  }

  static markMet(residentId: string): void {
    const { week, met } = Residents.encounters();
    if (met.includes(residentId)) return;
    setItem(ENCOUNTER_STORAGE_KEY, JSON.stringify({ week, met: [...met, residentId] }));
  }

  /**
   * NPC exploration score = base + days × rate, all derived from the seed.
   * Progress is anchored to nothing else, so a new player still sees a reachable top.
   */
  static leaderboard(options: { universeSeed: string; playerPlanets: number; days: number }): LeaderRow[] {
    const { universeSeed, playerPlanets, days } = options;

    const rows: LeaderRow[] = Residents.roster(universeSeed).map((resident) => {
      const stream = makeRng(hashText(`progress|${universeSeed}|${resident.id}`));
      const base = 12 + stream.int(0, 90);
      const rate = 3 + stream.int(0, 9);
      return {
        id: resident.id,
        name: resident.name,
        callsign: resident.callsign,
        score: Math.round(base + days * rate),
        isPlayer: false,
      };
    });

    rows.push({ id: "player", name: "你", callsign: "本舰", score: playerPlanets, isPlayer: true });
    return rows.sort((a, b) => b.score - a.score);
  }

  private static roll(planetKey: string, universeSeed: string): number {
    return hashText(`${universeSeed}|${Residents.weekKey()}|${planetKey}`) % 100;
  }

  private static category(lifeForms: string | undefined, elementCount: number, stream: Rng): "life" | "mineral" | "orbit" {
    if (lifeForms && lifeForms !== "None" && stream.int(0, 99) < 55) return "life";
    if (elementCount >= 4) return "mineral";
    return "orbit";
  }
}

export default Residents;

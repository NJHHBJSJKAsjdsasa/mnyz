// atlas-ui/react/static/js/Utils/AllySystem.tsx
// Offline alliances: an invite code carries an alliance name + id, and everyone
// who joins locally contributes a small shared bonus. No server, no sync.

import { getItem, setItem } from "./b64.tsx";
import { hashText } from "./Deterministic.tsx";

export const ALLY_STORAGE_KEY = "_atlasAllies";
export const ALLY_PREFIX = "ALLY-";
export const MAX_ALLIES = 5;
const BONUS_PER_MEMBER = 0.02;
const BONUS_CAP = 0.1;

interface AllyMember {
  id: string;
  name: string;
  joinedAt: number;
}

interface AllyStore {
  version: number;
  alliance: { id: string; name: string } | null;
  members: AllyMember[];
}

const emptyStore = (): AllyStore => ({ version: 1, alliance: null, members: [] });

export class AllySystem {
  static current(): { id: string; name: string } | null {
    return AllySystem.load().alliance;
  }

  static members(): AllyMember[] {
    return AllySystem.load().members;
  }

  static create(name: string): string {
    const clean = (name || "无名联盟").slice(0, 12);
    const id = `ally-${hashText(`${clean}|${Date.now()}`)}`;
    const store = AllySystem.load();

    store.alliance = { id, name: clean };
    store.members = [{ id: "self", name: "本舰", joinedAt: Date.now() }, ...store.members.slice(0, MAX_ALLIES - 1)];
    AllySystem.save(store);

    return AllySystem.inviteCode();
  }

  static inviteCode(): string {
    const alliance = AllySystem.load().alliance;
    if (!alliance) return "";
    return ALLY_PREFIX + btoa(encodeURIComponent(JSON.stringify({ id: alliance.id, n: alliance.name })));
  }

  static join(code: string): { ok: boolean; reason?: string; name?: string } {
    const trimmed = (code ?? "").trim();
    if (!trimmed.startsWith(ALLY_PREFIX)) return { ok: false, reason: "邀请码格式不对" };

    let payload: { id: string; n: string };
    try {
      payload = JSON.parse(decodeURIComponent(atob(trimmed.slice(ALLY_PREFIX.length))));
    } catch (error) {
      return { ok: false, reason: "邀请码已损坏" };
    }
    if (!payload?.id || !payload?.n) return { ok: false, reason: "邀请码缺少联盟信息" };

    const store = AllySystem.load();
    if (store.alliance?.id === payload.id || store.members.some((member) => member.id === payload.id)) {
      return { ok: false, reason: "已在联盟中" };
    }
    if (store.members.length >= MAX_ALLIES) return { ok: false, reason: `联盟最多 ${MAX_ALLIES} 位成员` };

    store.alliance = store.alliance ?? { id: payload.id, name: payload.n };
    store.members = [...store.members, { id: payload.id, name: payload.n.slice(0, 12), joinedAt: Date.now() }];
    AllySystem.save(store);
    return { ok: true, name: store.alliance.name };
  }

  static leave(): void {
    AllySystem.save(emptyStore());
  }

  /** Shared gathering bonus: +2% per member, capped at +10%. */
  static bonus(): number {
    return 1 + Math.min(BONUS_CAP, BONUS_PER_MEMBER * AllySystem.members().length);
  }

  private static load(): AllyStore {
    try {
      const raw = getItem(ALLY_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || !Array.isArray(parsed.members)) return emptyStore();
      return { version: 1, alliance: parsed.alliance ?? null, members: parsed.members.slice(0, MAX_ALLIES) };
    } catch (error) {
      return emptyStore();
    }
  }

  private static save(store: AllyStore): void {
    setItem(ALLY_STORAGE_KEY, JSON.stringify(store));
  }
}

export default AllySystem;

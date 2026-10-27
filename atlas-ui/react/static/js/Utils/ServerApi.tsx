// atlas-ui/react/static/js/Utils/ServerApi.tsx
// Atlas is an online game: every gameplay action goes through /api/v1.

import { decodeStoredValue } from "./b64.tsx";

// Legacy callers still mention off/shadow; runtime always reports server.
export type ServerMode = "off" | "shadow" | "server";

const BASE_KEY = "_atlasServerBase";
const MODE_KEY = "_atlasServerMode";
const TOKEN_KEY = "_atlasServerToken";
const TOKEN_EXP_KEY = "_atlasServerTokenExp";
const DEVICE_KEY = "_atlasDeviceId";
const PLAYER_KEY = "_atlasServerPlayer";
const UNIVERSE_KEY = "_atlasServerUniverseUsed";
const DEVICE_USED_KEY = "_atlasServerDeviceUsed";
const ACCOUNT_STATUS_KEY = "_atlasServerAccountStatus";

const DEFAULT_BASE = "http://127.0.0.1:8000";
const DEFAULT_UNIVERSE = "atlas-main";

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage is best-effort; the bridge must never break gameplay
  }
};

export class ServerApi {
  private static token: string | null = read(TOKEN_KEY);

  static baseUrl(): string {
    return (read(BASE_KEY) || DEFAULT_BASE).replace(/\/+$/, "");
  }

  static mode(): ServerMode {
    return "server";
  }

  static setMode(_mode: ServerMode): void {
    // Kept for old callers; there is no offline/shadow runtime anymore.
  }

  static currentPlayerId(): string | null {
    return read(PLAYER_KEY);
  }

  static accountStatus(): string {
    return read(ACCOUNT_STATUS_KEY) || "guest";
  }

  static async login(email: string, password: string): Promise<any> {
    return this.auth("/api/v1/auth/login", { email, password });
  }

  static async register(email: string, password: string, displayName: string): Promise<any> {
    return this.auth("/api/v1/auth/register", {
      email,
      password,
      display_name: displayName || "舰长",
      device_id: this.deviceId(),
    });
  }

  static async logout(): Promise<void> {
    try {
      await this.request("/api/v1/auth/logout", { method: "POST" });
    } catch {
      // token may already be gone; local cleanup still matters
    }
    this.forgetToken();
  }

  private static async auth(path: string, body: Record<string, string>): Promise<any> {
    const response = await fetch(`${this.baseUrl()}${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, universe_seed_name: this.universeSeedName() }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.detail || payload?.code || `http_${response.status}`);
    }
    this.storeToken(payload.data);
    return payload.data;
  }

  static deviceId(): string {
    // Guest accounts are bound per device hash. A device that first logged in
    // before seed alignment would otherwise keep returning its old-universe
    // player for atlas-main requests.
    const key = `${DEVICE_KEY}:${this.universeSeedName()}`;
    let id = read(key);
    if (!id) {
      id = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`).replace(/-/g, "");
      write(key, id);
    }
    return id;
  }

  static async ensureSession(): Promise<void> {
    const desired = this.universeSeedName();
    const used = read(UNIVERSE_KEY);
    const device = this.deviceId();
    const usedDevice = read(DEVICE_USED_KEY);
    const status = this.accountStatus();
    const fresh = this.token && Number(read(TOKEN_EXP_KEY) || 0) > Date.now() + 30_000;
    if (status !== "guest" && fresh && used === desired && usedDevice === device) return;
    // Registered accounts may refresh; guests are never auto-created.
    if (status !== "guest" && used === desired && usedDevice === device && (await this.refresh())) return;
    this.forgetToken();
    try {
      window.dispatchEvent(new CustomEvent("atlas:login-required"));
    } catch {
      // non-browser context
    }
    throw new Error("请先登录后操作");
  }

  private static forgetToken(): void {
    this.token = null;
    [TOKEN_KEY, TOKEN_EXP_KEY, PLAYER_KEY, UNIVERSE_KEY, DEVICE_USED_KEY, ACCOUNT_STATUS_KEY].forEach(
      (key) => {
        try {
          localStorage.removeItem(key);
        } catch {
          // ignore
        }
      },
    );
  }

  private static async createSession(): Promise<void> {
    const response = await fetch(`${this.baseUrl()}/api/v1/session`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ universe_seed_name: this.universeSeedName(), device_id: this.deviceId() }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.code || "server_session_failed");
    this.storeToken(body.data);
  }

  private static async refresh(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl()}/api/v1/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) return false;
      const body = await response.json();
      this.storeToken(body.data);
      return true;
    } catch {
      return false;
    }
  }

  private static storeToken(data: any): void {
    this.token = data?.access_token || null;
    if (this.token) {
      write(TOKEN_KEY, this.token);
      write(TOKEN_EXP_KEY, String(Date.now() + Number(data?.expires_in || 840) * 1000));
    }
    if (data?.player?.id) write(PLAYER_KEY, String(data.player.id));
    if (data?.account?.status) write(ACCOUNT_STATUS_KEY, String(data.account.status));
    write(UNIVERSE_KEY, this.universeSeedName());
    write(DEVICE_USED_KEY, this.deviceId());
  }

  private static universeSeedName(): string {
    const override = read("_atlasServerUniverse");
    if (override) return override;
    try {
      const element = document.getElementById("data-universe-config");
      const config = element ? JSON.parse(element.textContent || "{}") : {};
      // Local Atlas calls its universe "Local Universe"; the server's
      // aligned universe is atlas-main. Remote/multiverse keeps its own name.
      if (config.remote === true && config.seed_name) return config.seed_name;
      return DEFAULT_UNIVERSE;
    } catch {
      return DEFAULT_UNIVERSE;
    }
  }

  static async request(path: string, init: RequestInit = {}, retry = true): Promise<any> {
    await this.ensureSession();
    const headers = new Headers(init.headers || {});
    headers.set("Content-Type", "application/json");
    if (this.token) headers.set("Authorization", `Bearer ${this.token}`);
    const response = await fetch(`${this.baseUrl()}${path}`, {
      ...init,
      headers,
      credentials: "include",
    });
    if (response.status === 401 && retry) {
      this.token = null;
      return this.request(path, init, false);
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.detail || body?.code || `http_${response.status}`);
    return body.data ?? body;
  }

  static async state(): Promise<any> {
    return this.request("/api/v1/state");
  }

  static async collect(planetKey: string, coordinates: string): Promise<any> {
    return this.request(`/api/v1/planets/${encodeURIComponent(planetKey)}/collect`, {
      method: "POST",
      headers: { "Idempotency-Key": (globalThis.crypto?.randomUUID?.() || `${Date.now()}`) },
      body: JSON.stringify({ coordinates }),
    });
  }

  static async scan(planetKey: string): Promise<any> {
    return this.request(`/api/v1/planets/${encodeURIComponent(planetKey)}/scan`, {
      method: "POST",
      headers: { "Idempotency-Key": (globalThis.crypto?.randomUUID?.() || `${Date.now()}`) },
      body: "{}",
    });
  }

  static async surfaceSample(planetKey: string, cell: number): Promise<any> {
    return this.request(`/api/v1/planets/${encodeURIComponent(planetKey)}/surface/sample`, {
      method: "POST",
      headers: { "Idempotency-Key": (globalThis.crypto?.randomUUID?.() || `${Date.now()}`) },
      body: JSON.stringify({ cell }),
    });
  }

  static async worldPlanet(planetKey: string): Promise<any> {
    return this.request(`/api/v1/world-planets/${encodeURIComponent(planetKey)}`);
  }

  static async claimWorldPlanet(planetKey: string): Promise<any> {
    return this.request(`/api/v1/world-planets/${encodeURIComponent(planetKey)}/claim`, {
      method: "POST",
      headers: { "Idempotency-Key": (globalThis.crypto?.randomUUID?.() || `${Date.now()}`) },
      body: "{}",
    });
  }

  static async declareSiege(planetKey: string): Promise<any> {
    return this.request(`/api/v1/world-planets/${encodeURIComponent(planetKey)}/siege`, {
      method: "POST",
      headers: { "Idempotency-Key": (globalThis.crypto?.randomUUID?.() || `${Date.now()}`) },
      body: "{}",
    });
  }

  static async siegeDetail(siegeId: string): Promise<any> {
    return this.request(`/api/v1/sieges/${encodeURIComponent(siegeId)}`);
  }

  static async joinSiege(siegeId: string): Promise<any> {
    return this.request(`/api/v1/sieges/${encodeURIComponent(siegeId)}/join`, {
      method: "POST",
      headers: { "Idempotency-Key": (globalThis.crypto?.randomUUID?.() || `${Date.now()}`) },
      body: "{}",
    });
  }

  static async siegeLoot(): Promise<any> {
    return this.request("/api/v1/sieges/loot", {
      method: "POST",
      headers: { "Idempotency-Key": (globalThis.crypto?.randomUUID?.() || `${Date.now()}`) },
      body: "{}",
    });
  }

  static async leaderboard(): Promise<any> {
    return this.request("/api/v1/leaderboard");
  }

  static async factions(): Promise<any> {
    return this.request("/api/v1/factions");
  }

  static async residentOffer(planetKey: string): Promise<any> {
    return this.request(`/api/v1/residents/offer?planet_key=${encodeURIComponent(planetKey)}`);
  }

  static async tradeResident(residentId: string, planetKey: string): Promise<any> {
    return this.request(`/api/v1/residents/${encodeURIComponent(residentId)}/trade`, {
      method: "POST",
      headers: { "Idempotency-Key": (globalThis.crypto?.randomUUID?.() || `${Date.now()}`) },
      body: JSON.stringify({ planet_key: planetKey }),
    });
  }

  static async residents(): Promise<any> {
    return this.request("/api/v1/residents");
  }

  static async meetResident(residentId: string): Promise<any> {
    return this.request(`/api/v1/residents/${encodeURIComponent(residentId)}/meet`, {
      method: "POST",
      headers: { "Idempotency-Key": (globalThis.crypto?.randomUUID?.() || `${Date.now()}`) },
      body: "{}",
    });
  }

  static async tasks(): Promise<any> {
    return this.request("/api/v1/tasks");
  }

  static async claimTask(code: string): Promise<any> {
    return this.request(`/api/v1/tasks/${encodeURIComponent(code)}/claim`, {
      method: "POST",
      headers: { "Idempotency-Key": (globalThis.crypto?.randomUUID?.() || `${Date.now()}`) },
      body: "{}",
    });
  }

  static async visitPlanet(planetKey: string): Promise<any> {
    return this.request(`/api/v1/planets/${encodeURIComponent(planetKey)}/visit`, {
      method: "POST",
      headers: { "Idempotency-Key": (globalThis.crypto?.randomUUID?.() || `${Date.now()}`) },
      body: "{}",
    });
  }

  static async codex(kind?: string): Promise<any> {
    return this.request(`/api/v1/codex${kind ? `?kind=${encodeURIComponent(kind)}` : ""}`);
  }

  static async claimCodex(section: string): Promise<any> {
    return this.request(`/api/v1/codex/${encodeURIComponent(section)}/claim`, {
      method: "POST",
      headers: { "Idempotency-Key": (globalThis.crypto?.randomUUID?.() || `${Date.now()}`) },
      body: "{}",
    });
  }

  static async wrecks(): Promise<any> {
    return this.request("/api/v1/wrecks");
  }

  static async salvage(planetKey: string): Promise<any> {
    return this.request(`/api/v1/planets/${encodeURIComponent(planetKey)}/salvage`, {
      method: "POST",
      headers: { "Idempotency-Key": (globalThis.crypto?.randomUUID?.() || `${Date.now()}`) },
      body: "{}",
    });
  }

  static async createChallenge(): Promise<any> {
    return this.request("/api/v1/challenges", {
      method: "POST",
      headers: { "Idempotency-Key": (globalThis.crypto?.randomUUID?.() || `${Date.now()}`) },
      body: "{}",
    });
  }

  static async challengeInfo(code: string): Promise<any> {
    return this.request(`/api/v1/challenges/${encodeURIComponent(code)}`);
  }

  static async challengeStart(code: string): Promise<any> {
    return this.request(`/api/v1/challenges/${encodeURIComponent(code)}/fight`, {
      method: "POST",
      headers: { "Idempotency-Key": (globalThis.crypto?.randomUUID?.() || `${Date.now()}`) },
      body: "{}",
    });
  }

  static async combatStart(planetKey: string): Promise<any> {
    return this.request("/api/v1/combat/start", {
      method: "POST",
      headers: { "Idempotency-Key": (globalThis.crypto?.randomUUID?.() || `${Date.now()}`) },
      body: JSON.stringify({ planet_key: planetKey }),
    });
  }

  static async combatAction(sessionId: string, action: string): Promise<any> {
    return this.request(`/api/v1/combat/${encodeURIComponent(sessionId)}/action`, {
      method: "POST",
      headers: { "Idempotency-Key": (globalThis.crypto?.randomUUID?.() || `${Date.now()}`) },
      body: JSON.stringify({ action }),
    });
  }

  static async upgradeShip(): Promise<any> {
    return this.request("/api/v1/ship/upgrade", {
      method: "POST",
      headers: { "Idempotency-Key": (globalThis.crypto?.randomUUID?.() || `${Date.now()}`) },
      body: "{}",
    });
  }

  static async assets(): Promise<any> {
    return this.request("/api/v1/assets");
  }

  static async buildStation(planetKey: string): Promise<any> {
    return this.request("/api/v1/stations", {
      method: "POST",
      headers: { "Idempotency-Key": (globalThis.crypto?.randomUUID?.() || `${Date.now()}`) },
      body: JSON.stringify({ planet_key: planetKey }),
    });
  }

  static async stationModule(stationId: string, moduleCode: string): Promise<any> {
    return this.request(
      `/api/v1/stations/${encodeURIComponent(stationId)}/modules/${encodeURIComponent(moduleCode)}`,
      {
        method: "POST",
        headers: { "Idempotency-Key": (globalThis.crypto?.randomUUID?.() || `${Date.now()}`) },
        body: "{}",
      },
    );
  }

  static async stationClaim(stationId: string): Promise<any> {
    return this.request(`/api/v1/stations/${encodeURIComponent(stationId)}/claim`, {
      method: "POST",
      headers: { "Idempotency-Key": (globalThis.crypto?.randomUUID?.() || `${Date.now()}`) },
      body: "{}",
    });
  }

  static async recruitFleet(name: string): Promise<any> {
    return this.request("/api/v1/fleet", {
      method: "POST",
      headers: { "Idempotency-Key": (globalThis.crypto?.randomUUID?.() || `${Date.now()}`) },
      body: JSON.stringify({ name }),
    });
  }

  static async fleetTask(fleetId: string, task: string): Promise<any> {
    return this.request(`/api/v1/fleet/${encodeURIComponent(fleetId)}/task`, {
      method: "POST",
      headers: { "Idempotency-Key": (globalThis.crypto?.randomUUID?.() || `${Date.now()}`) },
      body: JSON.stringify({ task }),
    });
  }

  static async fleetClaim(fleetId: string): Promise<any> {
    return this.request(`/api/v1/fleet/${encodeURIComponent(fleetId)}/claim`, {
      method: "POST",
      headers: { "Idempotency-Key": (globalThis.crypto?.randomUUID?.() || `${Date.now()}`) },
      body: "{}",
    });
  }

  static async refitModule(moduleId: string, useVoucher = false): Promise<any> {
    return this.request(`/api/v1/ship/modules/${encodeURIComponent(moduleId)}/refit`, {
      method: "POST",
      headers: { "Idempotency-Key": (globalThis.crypto?.randomUUID?.() || `${Date.now()}`) },
      body: JSON.stringify({ use_voucher: useVoucher }),
    });
  }

  static async overclockModule(moduleId: string): Promise<any> {
    return this.request(`/api/v1/ship/modules/${encodeURIComponent(moduleId)}/overclock`, {
      method: "POST",
      headers: { "Idempotency-Key": (globalThis.crypto?.randomUUID?.() || `${Date.now()}`) },
      body: "{}",
    });
  }

  static async repairHull(): Promise<any> {
    return this.request("/api/v1/ship/repair", {
      method: "POST",
      headers: { "Idempotency-Key": (globalThis.crypto?.randomUUID?.() || `${Date.now()}`) },
      body: "{}",
    });
  }

  static async unlockTech(nodeId: string): Promise<any> {
    return this.request(`/api/v1/tech/${encodeURIComponent(nodeId)}/unlock`, {
      method: "POST",
      headers: { "Idempotency-Key": (globalThis.crypto?.randomUUID?.() || `${Date.now()}`) },
      body: "{}",
    });
  }

  static async contracts(): Promise<any> {
    return this.request("/api/v1/contracts");
  }

  static async contractAccept(contractId: string): Promise<any> {
    return this.request(`/api/v1/contracts/${encodeURIComponent(contractId)}/accept`, {
      method: "POST",
      headers: { "Idempotency-Key": (globalThis.crypto?.randomUUID?.() || `${Date.now()}`) },
      body: "{}",
    });
  }

  static async contractClaim(contractId: string): Promise<any> {
    return this.request(`/api/v1/contracts/${encodeURIComponent(contractId)}/claim`, {
      method: "POST",
      headers: { "Idempotency-Key": (globalThis.crypto?.randomUUID?.() || `${Date.now()}`) },
      body: "{}",
    });
  }

  static async market(planetKey: string): Promise<any> {
    return this.request(`/api/v1/planets/${encodeURIComponent(planetKey)}/market`);
  }

  static async marketBuy(planetKey: string, resourceCode: string, quantity = 1): Promise<any> {
    return this.request(`/api/v1/planets/${encodeURIComponent(planetKey)}/market/buy`, {
      method: "POST",
      headers: { "Idempotency-Key": (globalThis.crypto?.randomUUID?.() || `${Date.now()}`) },
      body: JSON.stringify({ resource_code: resourceCode, quantity }),
    });
  }

  static async marketSell(planetKey: string, resourceCode: string, quantity = 1): Promise<any> {
    return this.request(`/api/v1/planets/${encodeURIComponent(planetKey)}/market/sell`, {
      method: "POST",
      headers: { "Idempotency-Key": (globalThis.crypto?.randomUUID?.() || `${Date.now()}`) },
      body: JSON.stringify({ resource_code: resourceCode, quantity }),
    });
  }

  static async council(): Promise<any> {
    return this.request("/api/v1/council");
  }

  static async applySectorLicense(sectorKey: string): Promise<any> {
    return this.request("/api/v1/council/sector-license", {
      method: "POST",
      headers: { "Idempotency-Key": (globalThis.crypto?.randomUUID?.() || `${Date.now()}`) },
      body: JSON.stringify({ sector_key: sectorKey }),
    });
  }

  static async applyCouncilSeat(): Promise<any> {
    return this.request("/api/v1/council/seat", {
      method: "POST",
      headers: { "Idempotency-Key": (globalThis.crypto?.randomUUID?.() || `${Date.now()}`) },
      body: "{}",
    });
  }

  static async councilVote(motionId: string, vote: "yes" | "no"): Promise<any> {
    return this.request(`/api/v1/council/motions/${encodeURIComponent(motionId)}/vote`, {
      method: "POST",
      headers: { "Idempotency-Key": (globalThis.crypto?.randomUUID?.() || `${Date.now()}`) },
      body: JSON.stringify({ vote }),
    });
  }

  static async leaveCouncil(): Promise<any> {
    return this.request("/api/v1/council/leave", {
      method: "POST",
      headers: { "Idempotency-Key": (globalThis.crypto?.randomUUID?.() || `${Date.now()}`) },
      body: "{}",
    });
  }

  static async unlockSector(sectorKey: string): Promise<any> {
    return this.request(`/api/v1/sectors/${encodeURIComponent(sectorKey)}/unlock`, {
      method: "POST",
      headers: { "Idempotency-Key": (globalThis.crypto?.randomUUID?.() || `${Date.now()}`) },
      body: "{}",
    });
  }

  static snapshot(): Record<string, string> {
    const payload: Record<string, string> = {};
    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const encodedKey = localStorage.key(index);
        if (!encodedKey) continue;
        let plain = encodedKey;
        try {
          plain = decodeURIComponent(atob(encodedKey));
        } catch {
          // not an encoded key
        }
        if (!/^_+atlas/i.test(plain)) continue;
        const value = localStorage.getItem(encodedKey);
        if (value !== null) payload[plain] = value;
      }
    } catch {
      // ignore private-mode storage errors
    }
    return payload;
  }

  static decodedSnapshot(): Record<string, string> {
    const payload: Record<string, string> = {};
    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const encodedKey = localStorage.key(index);
        if (!encodedKey) continue;
        let plain = encodedKey;
        try {
          plain = decodeURIComponent(atob(encodedKey));
        } catch {
          // not an encoded key
        }
        if (!/^_+atlas/i.test(plain)) continue;
        const decoded = decodeStoredValue(localStorage.getItem(encodedKey));
        if (decoded !== null) payload[plain] = decoded;
      }
    } catch {
      // ignore private-mode storage errors
    }
    return payload;
  }

  static async importLocalSave(): Promise<any> {
    const keys = this.decodedSnapshot();
    if (!Object.keys(keys).length) throw new Error("没有可导入的本地存档");
    return this.request("/api/v1/migrations/local-save", {
      method: "POST",
      body: JSON.stringify({ keys }),
    });
  }

  static scheduleShadow(reason: string): void {
    if (this.mode() === "off") return;
    const timer = (this as any)._shadowTimer;
    if (timer) window.clearTimeout(timer);
    (this as any)._shadowTimer = window.setTimeout(() => {
      void this.shadowSync(reason);
    }, 1500);
  }

  static async shadowSync(reason: string): Promise<void> {
    if (this.mode() === "off") return;
    try {
      await this.ensureSession();
      const payload = this.snapshot();
      const keys = Object.keys(payload).length;
      if (!keys) return;
      await this.request("/api/v1/shadow/state", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      console.info(`[atlas-server] shadow ${reason}: ${keys} keys`);
    } catch (error) {
      console.warn("[atlas-server] shadow sync skipped", error);
    }
  }
}

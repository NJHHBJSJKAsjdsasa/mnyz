// Shell/ShellProvider.tsx — the one place that talks to /state (05 §5.1, T-65a).
//
// Why a provider and not a hook per panel: the rail (wallet), the badges
// (obligations), the status bar (positions) and the assets panel all read the same
// snapshot. Four pollers would drift apart within a week, and the 3D scene under
// the shell must not be re-initialised by a re-mount (07 §1.4).
//
// Hard rule enforced from here on: **shell components never call fetch()**.
// If a panel needs data, it either reads the snapshot or owns its own request in
// panels/*, never in Shell/*.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { fetchState, loadErrorCodes } from "../ui/api.ts";
import { ServerApi } from "../Utils/ServerApi.tsx";

export interface ShellSnapshot {
  player?: { id?: string; display_name?: string; state_version?: number };
  resources?: Record<string, number>;
  ship?: { level?: number; hull?: number; shield?: number; shield_max?: number };
  assets?: { hull?: number; vouchers?: number };
  wallet_summary?: { total_q1?: string | number };
  portfolio_summary?: { positions?: number; market_value?: string | number };
  obligations?: Array<{ overdue?: boolean; [key: string]: unknown }>;
  game_day?: string;
  server_time?: string;
  in_flight?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

interface ShellContextValue {
  snapshot: ShellSnapshot | null;
  error: string | null;
  /** Manual refresh (used by the palette and after a write that changes state). */
  refresh: () => Promise<void>;
  /** True until the first snapshot lands — panels can show a skeleton instead of 0. */
  loading: boolean;
  lastFetchedAt: number | null;
}

const ShellContext = createContext<ShellContextValue | null>(null);

export const useShell = (): ShellContextValue => {
  const value = useContext(ShellContext);
  if (!value) throw new Error("useShell() must be used inside <ShellProvider>");
  return value;
};

export interface ShellProviderProps {
  /** Poll interval; 15 s matches the previous EconomyShell behaviour. */
  intervalMs?: number;
  children: React.ReactNode;
}

export const ShellProvider: React.FC<ShellProviderProps> = ({ intervalMs = 15_000, children }) => {
  const [snapshot, setSnapshot] = useState<ShellSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
  const alive = useRef(true);

  const pull = useCallback(async () => {
    // A hidden tab does not poll: the server already has enough load without
    // background tabs keeping a 15 s heartbeat each.
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    // Signed-out visitors have no session to read: `/state` would 401 four times a
    // minute and every panel would paint an error. Skip the poll until they log in.
    if (ServerApi.accountStatus() === "guest") {
      if (alive.current) {
        setSnapshot(null);
        setError(null);
      }
      return;
    }
    try {
      const data = await fetchState();
      if (!alive.current) return;
      setSnapshot(data as ShellSnapshot);
      setError(null);
      setLastFetchedAt(Date.now());
    } catch (raw) {
      if (!alive.current) return;
      setError(raw instanceof Error ? raw.message : String(raw));
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void loadErrorCodes();
    void pull();
    const timer = window.setInterval(() => void pull(), intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") void pull();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive.current = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, pull]);

  const value = useMemo<ShellContextValue>(
    () => ({ snapshot, error, refresh: pull, loading: snapshot === null && error === null, lastFetchedAt }),
    [snapshot, error, pull, lastFetchedAt],
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
};

export default ShellProvider;

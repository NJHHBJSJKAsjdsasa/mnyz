// ui/Toast.tsx — the single toast host (05 §5.3 / 06 §0.2).
//
// Panels call `toast()` from event handlers; they never render their own floating
// notice.
//
// 2026-10-29: the host is now **self-mounting**. Before this the only `<ToastHost/>`
// lived inside AtlasShell, so every page that is not the economy shell
// (`__galaxy__`, `__system__`, `__planet__`, `__faq__`, …) silently dropped its
// toasts: `toast()` dispatched a CustomEvent with nobody listening. Mounting on
// first use fixes that for all eight layouts without adding eight call sites.

import React, { useCallback, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

export type ToastTone = "info" | "ok" | "warn" | "danger";

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

const EVENT = "atlas:toast";
const LIFETIME_MS = 4200;

let sequence = 0;
let hostRoot: Root | null = null;

// Messages dispatched before the host's listener exists are parked here and
// drained on mount. `createRoot().render()` is asynchronous, so the very first
// `toast()` of a page session used to disappear — which is indistinguishable
// from "the button did nothing".
const pending: ToastItem[] = [];

const mountHost = (): void => {
  if (hostRoot || typeof document === "undefined") return;
  const container = document.createElement("div");
  container.id = "atlas-toast-host";
  document.body.appendChild(container);
  hostRoot = createRoot(container);
  hostRoot.render(<ToastHost />);
};

/** Called once by the host on mount: hand over anything queued before it existed. */
const drainPending = (): ToastItem[] => pending.splice(0, pending.length);

export function toast(message: string, tone: ToastTone = "info"): void {
  if (typeof window === "undefined") return;
  const item: ToastItem = { id: ++sequence, message, tone };
  // Always queue: the event below reaches a listener only if the host is already
  // mounted, and the queue covers the other case (including the first ever call).
  pending.push(item);
  mountHost();
  window.dispatchEvent(new CustomEvent(EVENT, { detail: item }));
}

const COLOUR: Record<ToastTone, string> = {
  info: "var(--atlas-n-800)",
  ok: "var(--atlas-signal)",
  warn: "var(--atlas-warn)",
  danger: "var(--atlas-danger)",
};

export const ToastHost: React.FC = () => {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const timers: number[] = [];
    const add = (item: ToastItem) => {
      setItems((prev) => [...prev, item].slice(-5));
      timers.push(
        window.setTimeout(() => setItems((prev) => prev.filter((row) => row.id !== item.id)), LIFETIME_MS),
      );
    };
    const onToast = (event: Event) => {
      const item = (event as CustomEvent<ToastItem>).detail;
      if (!item?.message) return;
      // This message also sits in `pending`; take it out so a remount does not
      // replay something the player has already seen.
      const at = pending.findIndex((row) => row.id === item.id);
      if (at >= 0) pending.splice(at, 1);
      add(item);
    };
    // Replay everything that was queued before this host existed (the first
    // toast() of a page session always lands here).
    drainPending().forEach(add);
    window.addEventListener(EVENT, onToast);
    return () => {
      window.removeEventListener(EVENT, onToast);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((row) => row.id !== id));
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      aria-live="polite"
      style={{
        position: "fixed",
        right: "var(--atlas-4)",
        bottom: "var(--atlas-6)",
        zIndex: 90,
        display: "flex",
        flexDirection: "column",
        gap: "var(--atlas-2)",
        maxWidth: 360,
        pointerEvents: "none",
      }}
    >
      {items.map((item) => (
        <div
          key={item.id}
          role={item.tone === "danger" ? "alert" : "status"}
          className="surface-overlay"
          style={{
            pointerEvents: "auto",
            display: "flex",
            alignItems: "flex-start",
            gap: "var(--atlas-2)",
            padding: "var(--atlas-3)",
            borderLeft: `2px solid ${COLOUR[item.tone]}`,
            color: "var(--atlas-n-950)",
            fontSize: "var(--atlas-t-small)",
            lineHeight: 1.5,
          }}
        >
          <span style={{ flex: 1 }}>{item.message}</span>
          <button
            type="button"
            aria-label="关闭提示"
            onClick={() => dismiss(item.id)}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--atlas-n-700)",
              cursor: "pointer",
              fontSize: "var(--atlas-t-body)",
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
};

export default ToastHost;

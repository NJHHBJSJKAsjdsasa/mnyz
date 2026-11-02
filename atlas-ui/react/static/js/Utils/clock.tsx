// Utils/clock.tsx — one 1 s heartbeat for the whole app.
//
// Eight components used to own their own `setInterval(..., 1000)` just to repaint
// a countdown (mining timer, scan cooldown, siege clock, contract/fabricator
// cooldowns). On the planet page that meant eight independent timers and eight
// re-render trees, and none of them paused when the tab was hidden.
//
// This module keeps a single timer:
//   * it starts when the first listener subscribes and stops with the last, so an
//     idle page still has zero timers;
//   * it skips the tick while `document.visibilityState !== "visible"` — the
//     values being counted down are wall-clock based, so one catch-up repaint on
//     return is enough (subscribers compute from `Date.now()`, not by counting);
//   * a new subscriber is called once immediately, so a component never paints a
//     stale value for a full second before its first tick.

export type ClockListener = (nowMs: number) => void;

const listeners = new Set<ClockListener>();
let timer: number | null = null;

const start = () => {
  if (timer !== null) return;
  timer = window.setInterval(() => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const now = Date.now();
    listeners.forEach((listener) => listener(now));
  }, 1000);
};

const stop = () => {
  if (timer === null) return;
  window.clearInterval(timer);
  timer = null;
};

/** Subscribe to the shared 1 s clock. Returns an unsubscribe function. */
export const subscribeClock = (listener: ClockListener): (() => void) => {
  listeners.add(listener);
  start();
  listener(Date.now());
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stop();
  };
};

/** Test/debug helper: how many timers this module currently owns (0 or 1). */
export const clockDebug = () => ({ timer: timer === null ? 0 : 1, listeners: listeners.size });

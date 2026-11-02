// Shell/ShellRouter.tsx — hash ↔ view, the only source of truth for "which panel"
// (05 §5.1 / 02 §1.1, T-65b).
//
// Shareable URLs and the browser back button both work because the hash *is* the
// state; there is no second `useState` copy to keep in sync. `select`/`close` use
// `history.replaceState` (close) and hash assignment (select) so the back button
// after closing returns to the page, not to an empty panel.

import { useCallback, useEffect, useState } from "react";

const readHash = <T extends string>(views: readonly T[]): T | null => {
  if (typeof window === "undefined") return null;
  const raw = (window.location.hash || "").replace(/^#\/?/, "").split("?")[0];
  return (views as readonly string[]).includes(raw) ? (raw as T) : null;
};

export interface ShellRouter {
  view: string | null;
  open: (id: string) => void;
  close: () => void;
}

export const useShellRouter = <T extends string>(views: readonly T[]): ShellRouter => {
  const [view, setView] = useState<T | null>(() => readHash(views));

  useEffect(() => {
    const onHash = () => setView(readHash(views));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
    // `views` is a module-level constant in every caller; joining keeps the
    // effect stable without asking callers to memoise an array literal.
  }, [views.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = useCallback((id: string) => {
    setView(id as T);
    window.location.hash = `/${id}`;
  }, []);

  const close = useCallback(() => {
    setView(null);
    if (window.location.hash) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  return { view, open, close };
};

export default useShellRouter;

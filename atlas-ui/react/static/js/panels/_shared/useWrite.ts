// panels/_shared/useWrite.ts — every POST/DELETE from a panel goes through here
// (06 §0.2): in-flight lock, error → sentence, one success toast.
//
// The idempotency key itself is owned by `ui/api.ts` (`ServerApi` + `write()`), so
// a panel cannot forget it by calling `fetch` directly.

import { useCallback, useRef, useState } from "react";
import { toast } from "../../ui/Toast.tsx";
import { messageOf } from "./errors.ts";

export interface WriteResult<T> {
  value?: T;
  ok: boolean;
}

export interface WriteApi {
  busy: boolean;
  error: string | null;
  setError: (message: string | null) => void;
  run: <T>(action: () => Promise<T>, success?: string) => Promise<WriteResult<T>>;
}

/**
 * @param onDone called after a successful write; panels use it to refresh only
 * the slice the write touched.
 */
export function useWrite(onDone?: () => void | Promise<void>): WriteApi {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const run = useCallback(
    async <T,>(action: () => Promise<T>, success?: string): Promise<WriteResult<T>> => {
      if (inFlight.current) return { ok: false };
      inFlight.current = true;
      setBusy(true);
      setError(null);
      try {
        const value = await action();
        if (success) toast(success, "ok");
        if (onDone) await onDone();
        return { value, ok: true };
      } catch (raw) {
        const message = messageOf(raw);
        setError(message);
        toast(message, "danger");
        return { ok: false };
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [onDone],
  );

  return { busy, error, setError, run };
}

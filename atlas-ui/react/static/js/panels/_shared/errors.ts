// panels/_shared/errors.ts — one place that turns a thrown API error into the
// sentence a player sees (06 §0.2). `ui/api.ts` already maps machine codes; this
// only keeps the "detail first, message second" order in one place so panels do
// not each invent `err?.detail || err?.message || String(raw)`.

import { errorText } from "../../ui/api.ts";

export function messageOf(raw: unknown): string {
  if (raw && typeof raw === "object") {
    const detail = (raw as { detail?: unknown }).detail;
    if (detail != null && String(detail).trim() !== "") return humanize(String(detail));
    const message = (raw as { message?: unknown }).message;
    if (message != null && String(message).trim() !== "") return humanize(String(message));
  }
  return humanize(raw instanceof Error ? raw.message : String(raw));
}

/** Machine codes (`insufficient_funds`, `http_500`) become Chinese; a sentence
 * already written for a human is passed through unchanged. */
function humanize(text: string): string {
  return /^[a-z0-9_.-]+$/i.test(text.trim()) ? errorText(text.trim()) : text;
}

// atlas-ui/react/static/js/Utils/universeSearch.ts — find a system by name or
// number anywhere in the current galaxy.
//
// 2026-10-31 (P3 follow-up). The rail's search box used to filter the 150 rows
// already on screen, because a system's name was only computed while rendering a
// page of systems. `GET /api/v1/universe/systems` (added today) computes names on
// demand, so this is the whole galaxy.
//
// The endpoint streams: it stops at a wall-clock budget and reports how far it
// got. That is why the result carries `scanned` and `complete` — a galaxy can hold
// hundreds of millions of systems, and the UI must not imply otherwise.

import { ServerApi } from "./ServerApi.tsx";

export interface SystemHit {
  index: number;
  number: number;
  name: string;
}

export interface SystemSearchResult {
  query: string;
  /** Systems in the galaxy (may be far larger than anything scanned). */
  total: number;
  /** Systems actually examined by this query. */
  scanned: number;
  /** Matches found within `scanned`. */
  matched: number;
  systems: SystemHit[];
  /** The scan reached the end of the galaxy, so nothing was missed. */
  complete: boolean;
  truncated: boolean;
}

/** Below this the server refuses to scan — see `_MIN_QUERY` in `api/v1/universe.py`. */
export const MIN_QUERY_LENGTH = 2;

export async function searchSystems(
  coordinates: [number, number, number] | number[],
  query: string,
  limit = 60
): Promise<SystemSearchResult> {
  const [x, y, z] = coordinates;
  const params = new URLSearchParams({ x: String(x), y: String(y), z: String(z), q: query, limit: String(limit) });

  const response = await fetch(`${ServerApi.baseUrl()}/api/v1/universe/systems?${params.toString()}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) throw new Error(`system search failed: ${response.status}`);

  const body = await response.json();
  return body.data as SystemSearchResult;
}

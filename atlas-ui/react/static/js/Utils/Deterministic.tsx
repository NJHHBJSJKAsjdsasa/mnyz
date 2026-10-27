// atlas-ui/react/static/js/Utils/Deterministic.tsx
// Shared determinism helpers: FNV-1a hashing plus a repeatable draw sequence.
// Everything derived from these is stable across reloads and devices.

export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  pick<T>(items: T[]): T;
}

export const hashText = (text: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 2147483647;
};

/** Lehmer LCG seeded from a hash; same seed always yields the same sequence. */
export const makeRng = (seed: number): Rng => {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;

  const next = (): number => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };

  return {
    next,
    int: (min, max) => Math.floor(next() * (max - min + 1)) + min,
    pick: (items) => items[Math.floor(next() * items.length)],
  };
};

/** Local day key, so daily rolls flip at local midnight rather than UTC. */
export const dayKey = (date: Date = new Date()): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

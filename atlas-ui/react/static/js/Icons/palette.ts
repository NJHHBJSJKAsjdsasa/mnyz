// Icons/palette.ts — the only place icon colours are decided.
//
// The SVGs themselves all default to `currentColor`, so a plain icon inherits
// text colour. Only *resource* icons need a fixed hue (they appear inside
// surfaces of different colours), and those three hues are declared here instead
// of being sprinkled as hex literals at call sites.
//
// Hues are chosen for separation first, identity second: amber / champagne /
// copper all sit in the cockpit family but read apart at 8–20px.

export const RESOURCE_COLOR = {
  /** 反物质 — amber: the volatile one. */
  antimatter: "#f0b53f",
  /** 115 号元素 — champagne: the stable, valuable one. */
  element115: "#d9c389",
  /** 氘 — copper: the bulk one. */
  deuterium: "#cd8663",
} as const;

/** Chart/indicator accents, aligned with --atlas-signal and friends. */
export const ICON_ACCENT = {
  signal: "#e8951d",
  info: "#c6ad70",
  up: "#c94f38",
  down: "#4c9f7b",
  warn: "#e6b94a",
  paper: "#f6f3ea",
} as const;

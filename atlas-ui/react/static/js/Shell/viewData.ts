// atlas-ui/react/static/js/Shell/viewData.ts — how a page's data islands become
// a view.
//
// Before P2 each MountPoint read its own `<script type="application/json">`
// blocks and rendered one fixed layout. That is why moving between galaxy →
// system → planet cost a full document load: the *only* thing that could turn a
// document into props was a mount point, and a mount point only runs on load.
//
// This module is that logic, extracted and made addressable. Given a Document —
// the live one on first paint, or one fetched by `navigate()` — it returns the
// view to render. The id maps below are transcription, not redesign: every key
// comes from the template that already wrote it.
//
// If a server template gains a field, add it here *and* in the layout's props.
// Do not read `document` from inside a layout; that is what made them untestable.

import type { GalaxyLayoutProps } from "../Layouts/__galaxy__.tsx";
import type { SystemLayoutProps } from "../Layouts/__system__.tsx";
import type { PlanetLayoutProps } from "../Layouts/__planet__.tsx";

export type GameView =
  | { kind: "galaxy"; url: string; props: GalaxyLayoutProps }
  | { kind: "system"; url: string; props: SystemLayoutProps }
  | { kind: "planet"; url: string; props: PlanetLayoutProps };

const readJson = (doc: Document, id: string): any => {
  const element = doc.getElementById(id);
  if (!element || !element.textContent) return null;
  try {
    return JSON.parse(element.textContent.trim());
  } catch {
    return null;
  }
};

/** `/galaxy`, `/galaxy/3`, `/system/12`, `/planet/kepler_442b`. */
export type GameRoute =
  | { kind: "galaxy"; page: number }
  | { kind: "system"; index: number }
  | { kind: "planet"; name: string };

export const parseRoute = (url: string): GameRoute | null => {
  let path = url;
  try {
    path = new URL(url, window.location.origin).pathname;
  } catch {
    /* already a path */
  }

  const galaxy = path.match(/^\/galaxy(?:\/(\d+))?\/?$/);
  if (galaxy) return { kind: "galaxy", page: galaxy[1] ? Number(galaxy[1]) : 1 };

  const system = path.match(/^\/system\/(\d+)\/?$/);
  if (system) return { kind: "system", index: Number(system[1]) };

  const planet = path.match(/^\/planet\/([^/]+)\/?$/);
  if (planet) return { kind: "planet", name: decodeURIComponent(planet[1]) };

  return null;
};

/**
 * Build the view for `url` from `doc`.
 *
 * Returns null when the document is missing a block the layout needs — the
 * caller then falls back to a real page load rather than rendering a half-empty
 * screen. That path matters: `/system/5` redirects to `/` when the session has
 * no galaxy, and the fetched document is then `index.html`, not `system.html`.
 */
export const viewFromDocument = (doc: Document, url: string): GameView | null => {
  const route = parseRoute(url);
  if (!route) return null;

  if (route.kind === "galaxy") {
    const galaxy = readJson(doc, "data-galaxy");
    const systems = readJson(doc, "data-systems");
    const navigation = readJson(doc, "data-navigation");
    const common = readJson(doc, "data-common");
    if (!galaxy || !navigation) return null;

    return {
      kind: "galaxy",
      url,
      props: {
        galaxy: {
          name: galaxy.name ?? "Unknown Galaxy",
          coordinates: galaxy.coordinates ?? [0, 0, 0],
          galaxy_type: galaxy.galaxy_type ?? "Unknown",
          num_systems: galaxy.num_systems ?? 0,
          black_holes: galaxy.black_holes ?? 0,
          pulsars: galaxy.pulsars ?? 0,
          quasars: galaxy.quasars ?? 0,
          seed: galaxy.seed ?? 12345,
        },
        systems: systems ?? [],
        galaxy_url: navigation.galaxy_url ?? "#",
        version: common?.version ?? "1.0.0",
        page: navigation.page ?? route.page,
        prev_page: navigation.prev_page,
        next_page: navigation.next_page,
        finish: navigation.finish ?? 1,
        image_url: common?.image_url ?? "",
      },
    };
  }

  if (route.kind === "system") {
    const system = readJson(doc, "system-data");
    const galaxy = readJson(doc, "galaxy-data");
    const meta = readJson(doc, "meta-data");
    if (!system || !galaxy || !meta) return null;

    return {
      kind: "system",
      url,
      props: {
        system,
        galaxy,
        system_url: meta.system_url,
        version: meta.version,
        system_index: meta.system_index ?? route.index,
        image_url: meta.image_url,
        page: meta.page ?? 1,
        cosmic_origin_time: meta.cosmic_origin_time,
      },
    };
  }

  const planet = readJson(doc, "planet-data");
  const system = readJson(doc, "system-data");
  const galaxy = readJson(doc, "galaxy-data");
  const meta = readJson(doc, "meta-data");
  if (!planet || !system || !galaxy || !meta) return null;

  return {
    kind: "planet",
    url,
    props: {
      planet,
      system,
      galaxy,
      planet_url: meta.planet_url,
      version: meta.version,
      image_url: meta.image_url,
      cosmic_origin_time: meta.cosmic_origin_time,
      initial_angle_rotation: meta.initial_angle_rotation,
    },
  };
};

/** First paint: the document is the one the browser already loaded. */
export const viewFromCurrentDocument = (): GameView | null => viewFromDocument(document, window.location.pathname);

/**
 * Hand a freshly fetched document's data over to the live DOM.
 *
 * `GalaxyVisualization` and friends read `#data-galaxy` / `#data-universe-config`
 * directly for their own hydration, and `UniverseDetection.isRemoteUniverse()`
 * reads `#data-universe-config` on mount. After a client-side navigation those
 * elements are stale, so they are replaced with the fetched versions. Without
 * this, moving from a galaxy with 11k systems to one with 800 would keep the old
 * numbers in components that bypass props.
 */
export const syncDataIslands = (incoming: Document) => {
  const ids = ["data-galaxy", "data-systems", "data-navigation", "data-common", "system-data", "galaxy-data", "planet-data", "meta-data"];
  for (const id of ids) {
    const next = incoming.getElementById(id);
    const current = document.getElementById(id);
    if (next && current) {
      current.textContent = next.textContent;
    } else if (next && !current) {
      document.body.appendChild(next.cloneNode(true));
    } else if (!next && current) {
      current.remove();
    }
  }
};

/** Same idea for `<title>` and the body `data-*` attributes the CSS keys on. */
export const syncDocumentMeta = (incoming: Document, url: string) => {
  if (incoming.title) document.title = incoming.title;
  const coords = incoming.body.getAttribute("data-coordinates");
  const systemIndex = incoming.body.getAttribute("data-system-index");
  const planetName = incoming.body.getAttribute("data-planet-name");
  for (const [name, value] of [
    ["data-coordinates", coords],
    ["data-system-index", systemIndex],
    ["data-planet-name", planetName],
  ] as const) {
    if (value) document.body.setAttribute(name, value);
    else document.body.removeAttribute(name);
  }
  void url;
};

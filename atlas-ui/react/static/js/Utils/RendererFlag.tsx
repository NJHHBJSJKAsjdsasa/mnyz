// atlas-ui/react/static/js/Utils/RendererFlag.tsx
//
// Which renderer the 3D surfaces use.
//
// 2026-10-28: the 3.0 transplant is now the **default** (docs/render-transplant step 6). The
// 2.x pipeline is kept as an escape hatch, not as a fallback nobody can reach:
//
//   ?renderer=realistic   → force on, and remember it
//   ?renderer=classic     → force off, and remember it (the old renderer)
//   (no param)            → whatever was remembered, else realistic
//
// localStorage key is documented in docs/render-transplant/README.md §8.
// Pages must still degrade to classic on their own (fetch failure / no WebGL): the flag says
// what to *prefer*, never what to force.

export type RendererKind = "classic" | "realistic";

const KEY = "atlas.renderer";

export function readRenderer(): RendererKind {
  try {
    const param = new URLSearchParams(window.location.search).get("renderer");
    if (param === "realistic" || param === "classic") {
      localStorage.setItem(KEY, param);
      return param;
    }
    const stored = localStorage.getItem(KEY);
    return stored === "classic" ? "classic" : "realistic";
  } catch {
    return "realistic";
  }
}

export function writeRenderer(kind: RendererKind): void {
  try {
    localStorage.setItem(KEY, kind);
  } catch {
    // storage is best-effort; the URL param still works for this page load
  }
  const url = new URL(window.location.href);
  url.searchParams.set("renderer", kind);
  window.location.replace(url.toString());
}

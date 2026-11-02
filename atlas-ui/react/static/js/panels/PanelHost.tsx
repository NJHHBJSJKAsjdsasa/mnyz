// panels/PanelHost.tsx — keep-alive panel container (05 §5.6 / 07 §1.4).
//
// Panels are hidden, never unmounted: the 3D scene below the shell owns WebGL
// contexts that cost hundreds of milliseconds to rebuild, and a chart or a table
// that re-fetches on every tab switch is worse than one kept warm.
//
// `visibility: hidden` (not `display: none`) keeps layout measurable; the
// absolutely-positioned zero-height branch takes the hidden panel out of flow so
// it cannot reserve scroll height.

import React from "react";

export interface PanelHostProps {
  active: string | null;
  id: string;
  children: React.ReactNode;
}

export const PanelHost: React.FC<PanelHostProps> = ({ active, id, children }) => {
  const visible = active === id;
  return (
    <section
      aria-hidden={!visible}
      data-panel={id}
      style={{
        visibility: visible ? "visible" : "hidden",
        pointerEvents: visible ? "auto" : "none",
        position: visible ? "static" : "absolute",
        inset: visible ? undefined : 0,
        height: visible ? undefined : 0,
        overflow: visible ? undefined : "hidden",
      }}
    >
      {children}
    </section>
  );
};

export default PanelHost;

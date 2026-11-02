// atlas-ui/react/static/js/Shell/Breadcrumb.tsx — where you are, in the top bar.
//
// P1 of docs/frontend-redesign/16-shell-unification.md. Each game page used to
// print its own centred `<h1>` above the content ("SYSTEM / <name>"), which cost
// ~90px of vertical space on every screen and made the level change look like a
// page change. The level is now a crumb; the name lives on the stage.
//
// Last item is always the current one and renders as a lit, non-link span.

import React from "react";

export interface Crumb {
  label: string;
  href?: string;
}

const Breadcrumb: React.FC<{ items: Crumb[] }> = ({ items }) => (
  <nav
    aria-label="位置"
    style={{
      display: "flex",
      alignItems: "center",
      gap: 7,
      fontFamily: "var(--atlas-mono)",
      fontSize: 10,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      minWidth: 0,
    }}
  >
    {items.map((item, index) => {
      const last = index === items.length - 1;
      return (
        <React.Fragment key={`${item.label}-${index}`}>
          {index > 0 ? (
            <span aria-hidden style={{ color: "var(--atlas-line-strong)" }}>
              ›
            </span>
          ) : null}
          {item.href && !last ? (
            <a
              href={item.href}
              style={{ color: "var(--atlas-n-700)", textDecoration: "none", whiteSpace: "nowrap" }}
            >
              {item.label}
            </a>
          ) : (
            <span
              style={{
                color: last ? "var(--atlas-signal)" : "var(--atlas-n-700)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: 220,
              }}
              title={item.label}
            >
              {item.label}
            </span>
          )}
        </React.Fragment>
      );
    })}
  </nav>
);

export default Breadcrumb;

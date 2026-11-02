// ui/Tooltip.tsx — hover/focus hint. Rendered inline (no portal) so it never
// escapes a transformed parent; auto-flips above/below based on the pointer Y.

import React, { useId, useState } from "react";

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement<{ "aria-describedby"?: string }>;
  side?: "top" | "bottom";
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children, side = "top" }) => {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {React.cloneElement(children, { "aria-describedby": open ? id : undefined })}
      {open && (
        <span
          role="tooltip"
          id={id}
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            [side === "top" ? "bottom" : "top"]: "calc(100% + 6px)",
            zIndex: 40,
            maxWidth: 240,
            padding: "4px 8px",
            borderRadius: 0,
            background: "var(--atlas-deep)",
            border: "1px solid var(--atlas-line-strong)",
            color: "var(--atlas-n-900)",
            fontFamily: "var(--atlas-font)",
            fontSize: "var(--atlas-t-small)",
            lineHeight: 1.4,
            whiteSpace: "normal",
            pointerEvents: "none",
          }}
        >
          {content}
        </span>
      )}
    </span>
  );
};

export default Tooltip;

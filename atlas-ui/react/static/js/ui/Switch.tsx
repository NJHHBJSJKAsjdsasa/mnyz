// ui/Switch.tsx — boolean toggle; role="switch" so assistive tech announces state.

import React from "react";

export interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
}

export const Switch: React.FC<SwitchProps> = ({ checked, onChange, label, disabled }) => (
  <label
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: "var(--atlas-2)",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      fontSize: "var(--atlas-t-body)",
      color: "var(--atlas-n-900)",
    }}
  >
    <span
      role="switch"
      aria-checked={checked}
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && onChange(!checked)}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          onChange(!checked);
        }
      }}
      style={{
        position: "relative",
        width: 34,
        height: 18,
        borderRadius: 0,
        background: checked ? "var(--atlas-signal-dim)" : "var(--atlas-plate-2)",
        border: `1px solid ${checked ? "var(--atlas-signal)" : "var(--atlas-line-strong)"}`,
        transition: "background 140ms ease, border-color 140ms ease",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 18 : 2,
          width: 12,
          height: 12,
          borderRadius: 0,
          background: checked ? "var(--atlas-signal)" : "var(--atlas-n-600)",
          transition: "left 140ms ease",
        }}
      />
    </span>
    {label}
  </label>
);

export default Switch;

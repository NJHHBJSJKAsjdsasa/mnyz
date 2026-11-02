// ui/Checkbox.tsx — 16px box with a label that is part of the hit area.

import React from "react";

export interface CheckboxProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
  ariaLabel?: string;
}

export const Checkbox: React.FC<CheckboxProps> = ({ checked, onChange, label, disabled, ariaLabel }) => (
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
    <input
      type="checkbox"
      aria-label={ariaLabel}
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
      style={{ width: 16, height: 16, accentColor: "var(--atlas-signal)" }}
    />
    {label}
  </label>
);

export default Checkbox;

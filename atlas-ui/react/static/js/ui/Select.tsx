// ui/Select.tsx — native select dressed in the design system.
//
// Native on purpose: the platform popup is keyboard- and screen-reader-correct for
// free, and 05 §5.2 only asks for consistent *styling*, not a custom listbox.

import React from "react";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  options: SelectOption[];
}

export const Select: React.FC<SelectProps> = ({ options, style, ...rest }) => (
  <select
    {...rest}
    style={{
      height: 32,
      padding: "0 var(--atlas-2)",
      background: "var(--atlas-plate-2)",
      color: "var(--atlas-n-950)",
      border: "1px solid var(--atlas-line-strong)",
      borderRadius: 0,
      fontFamily: "var(--atlas-font)",
      fontSize: "var(--atlas-t-body)",
      outline: "none",
      ...style,
    }}
  >
    {options.map((option) => (
      <option key={option.value} value={option.value} disabled={option.disabled}>
        {option.label}
      </option>
    ))}
  </select>
);

export default Select;

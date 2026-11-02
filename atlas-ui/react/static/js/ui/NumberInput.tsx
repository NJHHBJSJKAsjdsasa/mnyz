// ui/NumberInput.tsx — numeric field: mono digits, tabular, optional steppers.
//
// Keeps the value as a string so an empty box stays empty (a `0` in a money field
// is a different statement from "not filled in yet").

import React from "react";

export interface NumberInputProps {
  value: string;
  onChange: (next: string) => void;
  step?: number;
  min?: number;
  max?: number;
  decimals?: number;
  disabled?: boolean;
  placeholder?: string;
  suffix?: React.ReactNode;
  ariaLabel?: string;
}

const clamp = (value: number, min?: number, max?: number): number => {
  let next = value;
  if (min !== undefined) next = Math.max(min, next);
  if (max !== undefined) next = Math.min(max, next);
  return next;
};

export const NumberInput: React.FC<NumberInputProps> = ({
  value,
  onChange,
  step = 1,
  min,
  max,
  decimals = 0,
  disabled = false,
  placeholder,
  suffix,
  ariaLabel,
}) => {
  const bump = (direction: 1 | -1) => {
    const current = Number(value.replace(/,/g, "")) || 0;
    const next = clamp(current + step * direction, min, max);
    onChange(next.toFixed(decimals));
  };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        width: "100%",
        border: "1px solid var(--atlas-line-strong)",
        borderRadius: 0,
        background: "var(--atlas-plate-2)",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <input
        aria-label={ariaLabel}
        inputMode="decimal"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="atlas-tabular"
        style={{
          flex: 1,
          minWidth: 0,
          height: 32,
          padding: "0 var(--atlas-2)",
          background: "transparent",
          border: "none",
          outline: "none",
          color: "var(--atlas-n-950)",
          fontSize: "var(--atlas-t-body)",
          textAlign: "right",
        }}
      />
      {suffix && <span style={{ color: "var(--atlas-n-700)", fontSize: "var(--atlas-t-small)", paddingRight: 6 }}>{suffix}</span>}
      <span style={{ display: "flex", flexDirection: "column", borderLeft: "1px solid var(--atlas-line)" }}>
        {[1, -1].map((direction) => (
          <button
            key={direction}
            type="button"
            aria-label={direction === 1 ? "增加" : "减少"}
            disabled={disabled}
            onClick={() => bump(direction as 1 | -1)}
            style={{
              width: 20,
              height: 16,
              lineHeight: "14px",
              fontSize: 9,
              background: "transparent",
              border: "none",
              color: "var(--atlas-n-700)",
              cursor: disabled ? "not-allowed" : "pointer",
            }}
          >
            {direction === 1 ? "▲" : "▼"}
          </button>
        ))}
      </span>
    </span>
  );
};

export default NumberInput;

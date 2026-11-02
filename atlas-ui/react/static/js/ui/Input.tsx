// ui/Input.tsx — single-line text input with an optional inline suffix.

import React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  suffix?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ invalid = false, suffix, style, ...rest }, ref) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      width: "100%",
      border: `1px solid ${invalid ? "var(--atlas-danger)" : "var(--atlas-line-strong)"}`,
      borderRadius: 0,
      background: "var(--atlas-plate-2)",
      paddingRight: suffix ? "var(--atlas-2)" : undefined,
    }}
  >
    <input
      {...rest}
      ref={ref}
      style={{
        flex: 1,
        minWidth: 0,
        height: 32,
        padding: "0 var(--atlas-2)",
        background: "transparent",
        border: "none",
        outline: "none",
        color: "var(--atlas-n-950)",
        fontFamily: "var(--atlas-font)",
        fontSize: "var(--atlas-t-body)",
        ...style,
      }}
    />
    {suffix}
  </span>
));

Input.displayName = "Input";

export default Input;

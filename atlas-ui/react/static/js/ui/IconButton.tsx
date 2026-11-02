// ui/IconButton.tsx — square icon-only action; always takes an aria-label.

import React from "react";

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: number;
  active?: boolean;
}

export const IconButton: React.FC<IconButtonProps> = ({
  label,
  size = 28,
  active = false,
  disabled,
  style,
  children,
  ...rest
}) => (
  <button
    {...rest}
    aria-label={label}
    title={label}
    disabled={disabled}
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: size,
      height: size,
      borderRadius: 0,
      border: `1px solid ${active ? "var(--atlas-signal)" : "var(--atlas-line)"}`,
      background: active ? "var(--atlas-signal-dim)" : "transparent",
      color: active ? "var(--atlas-signal)" : "var(--atlas-n-800)",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.45 : 1,
      ...style,
    }}
  >
    {children}
  </button>
);

export default IconButton;

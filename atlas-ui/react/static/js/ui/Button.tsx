// ui/Button.tsx — the only button primitive (05 §5.2).
// Four variants × three sizes; no bespoke padding in panels.
//
// Game HUD: a cut-corner chip. Primary is a lit cyan slab, secondary is a
// glazed plate that brightens on hover, danger is a red slab. The visuals live
// in tokens.css (`.hud-btn[data-variant]`) because :hover cannot be expressed in
// inline styles without attaching an event handler to every button.

import React from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = "secondary",
  size = "md",
  block = false,
  loading = false,
  disabled,
  style,
  className,
  children,
  ...rest
}) => (
  <button
    {...rest}
    className={`hud-btn${className ? ` ${className}` : ""}`}
    data-variant={variant}
    data-size={size}
    disabled={disabled || loading}
    style={{ width: block ? "100%" : undefined, ...style }}
  >
    {loading && (
      <span
        aria-hidden
        style={{
          width: 9,
          height: 9,
          border: "1.5px solid currentColor",
          borderTopColor: "transparent",
          borderRadius: 0,
          animation: "atlas-spin 700ms linear infinite",
        }}
      />
    )}
    {children}
  </button>
);

export default Button;

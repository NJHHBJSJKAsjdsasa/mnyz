// ui/Modal.tsx — the only modal host (05 §5.3). Uses `.surface-overlay`, one of
// the four sanctioned blur hosts (01 §5.2); panels may not add their own.
//
// Esc and a backdrop click close it unless `dismissible={false}` is set for a
// write that is already in flight.

import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

export interface ModalProps {
  open: boolean;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
  width?: number;
  dismissible?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  open,
  title,
  children,
  footer,
  onClose,
  width = 520,
  dismissible = true,
}) => {
  const titleId = useId();
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // `onClose` and `dismissible` are read through refs so the effect below does not
  // depend on them.
  //
  // It used to list `onClose` in its dependencies, and every caller passes an
  // inline arrow (`onClose={() => setOpen(false)}`). A new function identity on
  // each render meant the effect tore down and re-ran on *every keystroke* of a
  // controlled input: the cleanup restored focus to whatever was focused before
  // the dialog opened, then the effect refocused the dialog container. Typing one
  // character moved focus out of the input — the "输入框会失焦" bug.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const dismissRef = useRef(dismissible);
  dismissRef.current = dismissible;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusables = (): HTMLElement[] => {
      const root = bodyRef.current;
      if (!root) return [];
      return Array.from(
        root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((node) => node.offsetParent !== null || node === document.activeElement);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dismissRef.current) {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const nodes = focusables();
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    bodyRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--atlas-4)",
        background: "rgba(4, 5, 7, 0.78)",
      }}
      onClick={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={bodyRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="surface-overlay"
        style={{
          width: `min(${width}px, 100%)`,
          maxHeight: "min(80vh, 720px)",
          overflowY: "auto",
          padding: "var(--atlas-4)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--atlas-3)",
          outline: "none",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "var(--atlas-2)",
            paddingBottom: "var(--atlas-2)",
            borderBottom: "1px solid var(--atlas-line)",
          }}
        >
          <h2
            id={titleId}
            style={{
              margin: 0,
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              fontFamily: "var(--atlas-display)",
              fontSize: "var(--atlas-t-title)",
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--atlas-n-950)",
            }}
          >
            <span aria-hidden style={{ width: 3, height: 12, background: "var(--atlas-signal)" }} />
            {title}
          </h2>
          {dismissible ? (
            <button
              type="button"
              aria-label="关闭"
              onClick={onClose}
              style={{
                marginLeft: "auto",
                background: "transparent",
                border: "none",
                color: "var(--atlas-n-700)",
                cursor: "pointer",
                fontSize: "var(--atlas-t-title)",
                lineHeight: 1,
                padding: 0,
              }}
            >
              ×
            </button>
          ) : null}
        </header>
        <div style={{ color: "var(--atlas-n-900)", fontSize: "var(--atlas-t-body)" }}>{children}</div>
        {footer ? <footer style={{ display: "flex", justifyContent: "flex-end", gap: "var(--atlas-2)" }}>{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
};

export default Modal;

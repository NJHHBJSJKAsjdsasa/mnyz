// panels/_shared/Notice.tsx — the one strip a panel shows when its reads failed.
//
// Before this each main panel rendered `error` as a single long danger-coloured
// line. In guest mode every section fails with the same sentence, so a visitor
// landed on eight repetitions of "请先登录后操作" in alarm red — noise that looks
// like a crash instead of a permission state.
//
// Two rules:
//   * if every failure is the guest sentinel, collapse to one calm line;
//   * otherwise list the real failures, but keep the guest ones out of the alarm
//     colour so an actual error still stands out.

import React from "react";

const GUEST = "请先登录后操作";
const SEP = " · ";

export interface NoticeProps {
  text: string | null;
}

export const Notice: React.FC<NoticeProps> = ({ text }) => {
  if (!text) return null;
  const parts = text.split(SEP).filter((part) => part.trim() !== "");
  const real = parts.filter((part) => !part.includes(GUEST));
  const guests = parts.length - real.length;

  const guestOnly = real.length === 0;
  const tone = guestOnly ? "var(--atlas-warn)" : "var(--atlas-danger)";

  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "6px 10px",
        marginBottom: 8,
        background: "var(--atlas-plate-2)",
        boxShadow: `inset 2px 0 0 0 ${tone}`,
        fontFamily: "var(--atlas-mono)",
        fontSize: "var(--atlas-t-micro)",
        lineHeight: 1.5,
        color: "var(--atlas-n-800)",
      }}
    >
      {guestOnly ? (
        <span style={{ color: tone }}>游客模式 · 登录后可读写全部经济功能</span>
      ) : (
        <>
          <span style={{ color: tone, whiteSpace: "pre-wrap" }}>{real.join(SEP)}</span>
          {guests > 0 ? (
            <span style={{ marginLeft: "auto", color: "var(--atlas-n-600)", whiteSpace: "nowrap" }}>
              另 {guests} 项需登录
            </span>
          ) : null}
        </>
      )}
    </div>
  );
};

export default Notice;

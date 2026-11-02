// The only status renderer (docs/frontend-redesign/09 §3).
// A panel must never build its own badge or inline its own label.

import React from "react";

export type StatusId =
  | "shield.offline"
  | "hull.damaged"
  | "fuel.low"
  | "cargo.full"
  | "task.running"
  | "market.margin_call"
  | "market.mm_paused"
  | "property.tax_due"
  | "court.deadline"
  | "contract.expiring"
  | "company.no_quorum";

type Severity = "nominal" | "caution" | "degraded" | "critical" | "offline";

interface Spec {
  severity: Severity;
  glyph: string;
  label: (payload: Record<string, unknown>) => string;
}

const SEVERITY_COLOUR: Record<Severity, string> = {
  nominal: "var(--atlas-signal)",
  caution: "var(--atlas-warn)",
  degraded: "#c9a227",
  critical: "var(--atlas-danger)",
  offline: "var(--atlas-n-600)",
};

const SPECS: Record<StatusId, Spec> = {
  "shield.offline": { severity: "critical", glyph: "⬢", label: () => "护盾离线" },
  "hull.damaged": { severity: "degraded", glyph: "◆", label: (p) => `船体受损 ${p.pct ?? 0}%` },
  "fuel.low": { severity: "caution", glyph: "▲", label: () => "燃料不足" },
  "cargo.full": { severity: "caution", glyph: "▣", label: () => "货舱已满" },
  "task.running": { severity: "nominal", glyph: "●", label: () => "自动采集运行中" },
  "market.margin_call": { severity: "critical", glyph: "⬢", label: () => "追保通知" },
  "market.mm_paused": { severity: "degraded", glyph: "◆", label: () => "做市已暂停" },
  "property.tax_due": { severity: "caution", glyph: "▲", label: (p) => `持有税 ${p.days ?? 0} 天到期` },
  "court.deadline": { severity: "critical", glyph: "⬢", label: (p) => `应诉剩余 ${p.hhmm ?? "--:--"}` },
  "contract.expiring": { severity: "caution", glyph: "▲", label: (p) => `合同 ${p.hours ?? 0}h 后到期` },
  "company.no_quorum": { severity: "degraded", glyph: "◆", label: () => "股东会未达法定人数" },
};

interface StatusProps {
  statusId: StatusId;
  payload?: Record<string, unknown>;
  size?: "sm" | "md";
}

export const Status: React.FC<StatusProps> = ({ statusId, payload = {}, size = "sm" }) => {
  const spec = SPECS[statusId];
  if (!spec) return null;
  const colour = SEVERITY_COLOUR[spec.severity];
  return (
    <span
      title={`${statusId} · ${spec.severity}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: size === "sm" ? "2px 7px" : "3px 9px",
        border: `1px solid ${colour}`,
        borderRadius: 0,
        color: colour,
        fontSize: size === "sm" ? "var(--atlas-t-micro)" : "var(--atlas-t-small)",
        lineHeight: 1.4,
        whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden>{spec.glyph}</span>
      {spec.label(payload)}
    </span>
  );
};

export const STATUS_IDS = Object.keys(SPECS) as StatusId[];

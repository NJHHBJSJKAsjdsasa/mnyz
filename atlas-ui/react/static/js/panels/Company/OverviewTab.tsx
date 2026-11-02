// panels/Company/OverviewTab.tsx — read-only company summary.

import React from "react";
import { Badge, EmptyState, Money, Panel, Table } from "../../ui/index.ts";
import type { CompanyCommon } from "../CompanyPanel.tsx";

export interface OverviewTabProps {
  common: CompanyCommon;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({ common }) => {
  const detail = common.detail ?? {};
  const holdings: any[] = detail.holdings ?? [];
  const totalShares = Number(detail.shares_total) || 0;
  const top = [...holdings].sort((a, b) => Number(b.shares) - Number(a.shares)).slice(0, 5);

  return (
    <div style={{ display: "grid", gap: "var(--atlas-3)" }}>
      <Panel title="注册资本与股本">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "var(--atlas-2)", fontSize: "var(--atlas-t-small)" }}>
          <span>股本 <span className="atlas-tabular">{Number(detail.shares_total ?? 0).toLocaleString("en-US")}</span></span>
          <span>自由流通 <span className="atlas-tabular">{Number(detail.free_float ?? 0).toLocaleString("en-US")}</span></span>
          <span>净资产 <Money value={detail.book_value} /></span>
          <span>成立 <span className="atlas-tabular">{String(detail.created_at ?? "").slice(0, 10)}</span></span>
          <span>状态 <Badge tone={detail.status === "private" ? "neutral" : "signal"}>{detail.status}</Badge></span>
        </div>
      </Panel>

      <Panel title="主要股东" hint={`${holdings.length} 位`}>
        <Table
          ariaLabel="主要股东"
          rows={top}
          rowKey={(row) => String(row.actor_id)}
          empty={<EmptyState title="暂无股东记录" />}
          columns={[
            { key: "name", header: "股东", width: 180, render: (row) => row.display_name || String(row.actor_id).slice(0, 10) },
            { key: "shares", header: "股数", width: 140, align: "right", render: (row) => <span className="atlas-tabular">{Number(row.shares).toLocaleString("en-US")}</span> },
            {
              key: "pct",
              header: "占比",
              width: 90,
              align: "right",
              render: (row) => <span className="atlas-tabular">{totalShares ? ((Number(row.shares) / totalShares) * 100).toFixed(2) : "0.00"}%</span>,
            },
            { key: "locked", header: "锁定至", width: 140, render: (row) => row.locked_until ? String(row.locked_until).slice(0, 10) : "—" },
          ]}
        />
      </Panel>
    </div>
  );
};

export default OverviewTab;

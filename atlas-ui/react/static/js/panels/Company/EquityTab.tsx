// panels/Company/EquityTab.tsx — shareholder table and share transfer.

import React, { useState } from "react";
import { Button, EmptyState, Panel, Table } from "../../ui/index.ts";
import { transferCompanyShares } from "../../ui/api.ts";
import { useWrite } from "../_shared/useWrite.ts";
import type { CompanyCommon } from "../CompanyPanel.tsx";

export interface EquityTabProps {
  common: CompanyCommon;
}

export const EquityTab: React.FC<EquityTabProps> = ({ common }) => {
  const detail = common.detail ?? {};
  const holdings: any[] = detail.holdings ?? [];
  const total = Number(detail.shares_total) || 0;
  const [toActor, setToActor] = useState("");
  const [shares, setShares] = useState("1000");
  const [error, setError] = useState<string | null>(null);
  const write = useWrite(common.onChanged);

  const submit = async () => {
    setError(null);
    const outcome = await write.run(
      () => transferCompanyShares(String(detail.ticker), { to_actor_id: toActor.trim(), shares: Math.floor(Number(shares) || 0) }),
      "股份已转让",
    );
    if (!outcome.ok) setError(write.error);
    else {
      setToActor("");
    }
  };

  return (
    <div style={{ display: "grid", gap: "var(--atlas-3)" }}>
      <Panel title="全部股东" hint={`${holdings.length} 位`}>
        <Table
          ariaLabel="全部股东"
          rows={holdings}
          rowKey={(row) => String(row.actor_id)}
          empty={<EmptyState title="暂无股东记录" />}
          columns={[
            { key: "name", header: "股东", width: 200, render: (row) => row.display_name || String(row.actor_id).slice(0, 10) },
            { key: "shares", header: "股数", width: 140, align: "right", render: (row) => <span className="atlas-tabular">{Number(row.shares).toLocaleString("en-US")}</span> },
            { key: "pct", header: "占比", width: 90, align: "right", render: (row) => <span className="atlas-tabular">{total ? ((Number(row.shares) / total) * 100).toFixed(2) : "0.00"}%</span> },
            { key: "locked", header: "锁定至", width: 140, render: (row) => row.locked_until ? String(row.locked_until).slice(0, 10) : "—" },
          ]}
        />
      </Panel>

      <Panel title="转让股份" hint="受让方填 actor id">
        {error ? <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-small)" }}>{error}</div> : null}
        <div style={{ display: "flex", gap: "var(--atlas-2)", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ minWidth: 240 }}>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>受让方 actor_id</div>
            <input value={toActor} onChange={(event) => setToActor(event.target.value)} placeholder="uuid" style={{ width: "100%", height: 32, padding: "0 var(--atlas-2)", background: "var(--atlas-plate-2)", border: "1px solid var(--atlas-line-strong)", borderRadius: "var(--atlas-r-md)", color: "var(--atlas-n-950)", fontFamily: "var(--atlas-mono)" }} />
          </div>
          <div style={{ width: 140 }}>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>股数</div>
            <input value={shares} onChange={(event) => setShares(event.target.value)} style={{ width: "100%", height: 32, padding: "0 var(--atlas-2)", background: "var(--atlas-plate-2)", border: "1px solid var(--atlas-line-strong)", borderRadius: "var(--atlas-r-md)", color: "var(--atlas-n-950)", fontFamily: "var(--atlas-mono)", textAlign: "right" }} />
          </div>
          <Button variant="primary" loading={write.busy} disabled={!toActor.trim() || Number(shares) <= 0} onClick={() => void submit()}>
            转让
          </Button>
        </div>
      </Panel>
    </div>
  );
};

export default EquityTab;

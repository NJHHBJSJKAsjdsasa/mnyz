// panels/Company/FinancialsTab.tsx — disclosed financial statements.

import React, { useState } from "react";
import { Button, EmptyState, Money, NumberInput, Panel, Table } from "../../ui/index.ts";
import { publishFinancials } from "../../ui/api.ts";
import { useWrite } from "../_shared/useWrite.ts";
import type { CompanyCommon } from "../CompanyPanel.tsx";

export interface FinancialsTabProps {
  common: CompanyCommon;
}

export const FinancialsTab: React.FC<FinancialsTabProps> = ({ common }) => {
  const detail = common.detail ?? {};
  const rows: any[] = detail.financials ?? [];
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 10));
  const [revenue, setRevenue] = useState("0");
  const [cost, setCost] = useState("0");
  const [assets, setAssets] = useState("0");
  const [liabilities, setLiabilities] = useState("0");
  const write = useWrite(common.onChanged);

  return (
    <div style={{ display: "grid", gap: "var(--atlas-3)" }}>
      <Panel title="已披露财报" hint={`${rows.length} 期`}>
        <Table
          ariaLabel="财报"
          rows={rows}
          rowKey={(row) => String(row.period)}
          empty={<EmptyState title="尚未披露财报" />}
          columns={[
            { key: "period", header: "期间", width: 120, render: (row) => String(row.period ?? "").slice(0, 10) },
            { key: "revenue", header: "收入", width: 130, align: "right", render: (row) => <Money value={row.revenue} /> },
            { key: "cost", header: "成本", width: 130, align: "right", render: (row) => <Money value={row.cost} muted /> },
            { key: "profit", header: "净利", width: 130, align: "right", render: (row) => <Money value={row.profit} delta={row.profit} /> },
            { key: "assets", header: "资产", width: 130, align: "right", render: (row) => <Money value={row.assets} /> },
            { key: "liabilities", header: "负债", width: 130, align: "right", render: (row) => <Money value={row.liabilities} muted /> },
          ]}
        />
      </Panel>

      <Panel title="披露财报" hint="仅控股 50% 以上股东可披露">
        {write.error ? <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-small)" }}>{write.error}</div> : null}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "var(--atlas-2)" }}>
          <div>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>期间</div>
            <input value={period} onChange={(event) => setPeriod(event.target.value)} style={{ width: "100%", height: 32, padding: "0 var(--atlas-2)", background: "var(--atlas-plate-2)", border: "1px solid var(--atlas-line-strong)", borderRadius: "var(--atlas-r-md)", color: "var(--atlas-n-950)", fontFamily: "var(--atlas-mono)" }} />
          </div>
          <div>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>收入</div>
            <NumberInput value={revenue} onChange={setRevenue} min={0} decimals={4} step={100} />
          </div>
          <div>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>成本</div>
            <NumberInput value={cost} onChange={setCost} min={0} decimals={4} step={100} />
          </div>
          <div>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>资产</div>
            <NumberInput value={assets} onChange={setAssets} min={0} decimals={4} step={100} />
          </div>
          <div>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>负债</div>
            <NumberInput value={liabilities} onChange={setLiabilities} min={0} decimals={4} step={100} />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <Button
              variant="primary"
              loading={write.busy}
              onClick={() =>
                void write.run(
                  () => publishFinancials(String(detail.ticker), { period, revenue, cost, assets, liabilities }),
                  "财报已披露",
                )
              }
            >
              披露
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  );
};

export default FinancialsTab;

// panels/Company/RelatedPartyTab.tsx — declare and decide related-party deals.

import React, { useState } from "react";
import { Badge, Button, EmptyState, Money, NumberInput, Panel, Table } from "../../ui/index.ts";
import { declareRelatedParty, decideRelatedParty } from "../../ui/api.ts";
import { useWrite } from "../_shared/useWrite.ts";
import type { CompanyCommon } from "../CompanyPanel.tsx";

export interface RelatedPartyTabProps {
  common: CompanyCommon;
}

export const RelatedPartyTab: React.FC<RelatedPartyTabProps> = ({ common }) => {
  const detail = common.detail ?? {};
  const governance = common.governance ?? {};
  const rows: any[] = governance.related_parties ?? [];
  const [counterparty, setCounterparty] = useState("");
  const [kind, setKind] = useState("service");
  const [amount, setAmount] = useState("1000");
  const write = useWrite(common.onChanged);

  return (
    <div style={{ display: "grid", gap: "var(--atlas-3)" }}>
      <Panel title="关联交易" hint={`${rows.length} 笔`}>
        <Table
          ariaLabel="关联交易"
          rows={rows}
          rowKey={(row) => String(row.id)}
          empty={<EmptyState title="暂无关联交易" />}
          columns={[
            { key: "counterparty", header: "对方 actor", width: 180, render: (row) => String(row.counterparty_actor_id).slice(0, 12) },
            { key: "kind", header: "类型", width: 120, render: (row) => row.kind },
            { key: "amount", header: "金额", width: 130, align: "right", render: (row) => <Money value={row.amount} /> },
            { key: "status", header: "状态", width: 100, render: (row) => <Badge tone={row.status === "approved" ? "down" : row.status === "rejected" ? "danger" : "warn"}>{row.status}</Badge> },
            {
              key: "action",
              header: "操作",
              width: 160,
              align: "right",
              render: (row) =>
                row.status === "proposed" ? (
                  <span style={{ display: "inline-flex", gap: "var(--atlas-1)" }}>
                    <Button size="sm" loading={write.busy} onClick={() => void write.run(() => decideRelatedParty(String(detail.ticker), String(row.id), true), "关联交易已批准")}>批准</Button>
                    <Button size="sm" loading={write.busy} onClick={() => void write.run(() => decideRelatedParty(String(detail.ticker), String(row.id), false), "关联交易已驳回")}>驳回</Button>
                  </span>
                ) : null,
            },
          ]}
        />
      </Panel>

      <Panel title="申报关联交易" hint="关联方必须回避表决">
        {write.error ? <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-small)" }}>{write.error}</div> : null}
        <div style={{ display: "flex", gap: "var(--atlas-2)", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ minWidth: 240 }}>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>对方 actor_id</div>
            <input value={counterparty} onChange={(event) => setCounterparty(event.target.value)} style={{ width: "100%", height: 32, padding: "0 var(--atlas-2)", background: "var(--atlas-plate-2)", border: "1px solid var(--atlas-line-strong)", borderRadius: "var(--atlas-r-md)", color: "var(--atlas-n-950)", fontFamily: "var(--atlas-mono)" }} />
          </div>
          <div style={{ width: 150 }}>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>类型</div>
            <input value={kind} onChange={(event) => setKind(event.target.value)} style={{ width: "100%", height: 32, padding: "0 var(--atlas-2)", background: "var(--atlas-plate-2)", border: "1px solid var(--atlas-line-strong)", borderRadius: "var(--atlas-r-md)", color: "var(--atlas-n-950)" }} />
          </div>
          <div style={{ width: 150 }}>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>金额</div>
            <NumberInput value={amount} onChange={setAmount} min={0} decimals={4} step={100} />
          </div>
          <Button
            loading={write.busy}
            disabled={!counterparty.trim() || Number(amount) <= 0}
            onClick={() => void write.run(() => declareRelatedParty(String(detail.ticker), { counterparty_actor_id: counterparty.trim(), kind, amount }), "关联交易已申报")}
          >
            申报
          </Button>
        </div>
      </Panel>
    </div>
  );
};

export default RelatedPartyTab;

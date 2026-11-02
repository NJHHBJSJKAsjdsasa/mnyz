// panels/Bank/InterbankTab.tsx — interbank quotes are readable by everyone;
// posting/accepting requires a bank actor plus central-bank/CCMC rights, so the
// UI deliberately offers no buttons (06 §3).

import React, { useCallback, useEffect, useState } from "react";
import { Badge, Button, EmptyState, Money, Panel, Table } from "../../ui/index.ts";
import { fetchInterbank } from "../../ui/api.ts";
import { messageOf } from "../_shared/errors.ts";

export const InterbankTab: React.FC = () => {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchInterbank();
      setOrders(data?.orders ?? []);
      setError(null);
    } catch (raw) {
      setError(messageOf(raw));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Panel
      title="同业拆借"
      hint={`${orders.length} 条公开报价`}
      actions={<Button size="sm" loading={loading} onClick={() => void load()}>刷新</Button>}
    >
      {error ? <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-small)" }}>{error}</div> : null}
      <Table
        ariaLabel="同业拆借"
        loading={loading}
        rows={orders}
        rowKey={(row) => String(row.id)}
        empty={<EmptyState title="暂无拆借报价" />}
        columns={[
          { key: "lender", header: "拆出行", width: 130, render: (row) => row.lender_code },
          { key: "borrower", header: "拆入行", width: 130, render: (row) => row.borrower_code ?? "—" },
          { key: "currency", header: "币种", width: 70, render: (row) => row.currency_code },
          { key: "principal", header: "金额", width: 130, align: "right", render: (row) => <Money value={row.principal} /> },
          { key: "rate", header: "利率", width: 80, align: "right", render: (row) => <span className="atlas-tabular">{row.rate_bps}bp</span> },
          { key: "term", header: "期限", width: 80, align: "right", render: (row) => `${row.term_days} 天` },
          { key: "status", header: "状态", width: 90, render: (row) => <Badge tone={row.status === "open" ? "signal" : "neutral"}>{row.status}</Badge> },
          { key: "at", header: "挂出", width: 130, render: (row) => String(row.created_at ?? "").slice(0, 16).replace("T", " ") },
        ]}
      />
      <div style={{ color: "var(--atlas-n-600)", fontSize: "var(--atlas-t-micro)" }}>
        挂单、接受与还款需要银行主体 + 央行/CCMC 权限，普通玩家面板不提供入口。
      </div>
    </Panel>
  );
};

export default InterbankTab;

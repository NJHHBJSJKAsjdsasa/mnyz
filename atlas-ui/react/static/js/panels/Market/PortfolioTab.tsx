// panels/Market/PortfolioTab.tsx — long positions plus open shorts (06 §2
// `portfolio`). Reads `GET /stocks/portfolio`; no derived authority.

import React from "react";
import { EmptyState, Money, Panel, Table } from "../../ui/index.ts";
import { formatAmount } from "../../ui/Money.tsx";

export interface PortfolioTabProps {
  portfolio: any;
  loading: boolean;
}

export const PortfolioTab: React.FC<PortfolioTabProps> = ({ portfolio, loading }) => {
  const positions: any[] = portfolio?.positions ?? [];
  const shorts: any[] = portfolio?.shorts ?? [];

  return (
    <div style={{ display: "grid", gap: "var(--atlas-3)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "var(--atlas-3)" }}>
        <Panel title="持仓市值">
          <Money value={portfolio?.market_value} currency="cc4" size="var(--atlas-t-h1)" />
        </Panel>
        <Panel title="可用现金">
          <Money value={portfolio?.cash} currency="cc4" size="var(--atlas-t-h1)" />
        </Panel>
        <Panel title="持仓只数">
          <span className="atlas-tabular" style={{ fontSize: "var(--atlas-t-h1)", color: "var(--atlas-n-950)" }}>
            {positions.length}
          </span>
        </Panel>
      </div>

      <Panel title="多头持仓" hint={`${positions.length} 只`}>
        <Table
          ariaLabel="多头持仓"
          loading={loading}
          rows={positions}
          rowKey={(row) => String(row.ticker)}
          empty={<EmptyState title="尚无持仓" hint="在「行情」分区买入后会出现在这里。" />}
          columns={[
            { key: "ticker", header: "标的", width: 90, render: (row) => <span style={{ color: "var(--atlas-n-950)" }}>{row.ticker}</span> },
            { key: "shares", header: "股数", width: 96, align: "right", render: (row) => <span className="atlas-tabular">{row.shares}</span> },
            { key: "sellable", header: "可卖", width: 96, align: "right", render: (row) => <span className="atlas-tabular">{row.sellable}</span> },
            { key: "cost", header: "成本", width: 110, align: "right", render: (row) => <Money value={row.avg_cost} muted /> },
            { key: "last", header: "现价", width: 110, align: "right", render: (row) => <Money value={row.last_price} /> },
            { key: "value", header: "市值", width: 130, align: "right", render: (row) => <Money value={row.market_value} /> },
            {
              key: "pnl",
              header: "浮动盈亏",
              width: 130,
              align: "right",
              render: (row) => <Money value={row.unrealized_pnl} delta={row.unrealized_pnl} />,
            },
            {
              key: "locked",
              header: "锁定至",
              width: 150,
              render: (row) => (
                <span className="atlas-tabular" style={{ color: "var(--atlas-n-700)", fontSize: "var(--atlas-t-micro)" }}>
                  {row.locked_until ? String(row.locked_until).slice(0, 16).replace("T", " ") : "—"}
                </span>
              ),
            },
            { key: "status", header: "状态", width: 84, render: (row) => row.status },
          ]}
        />
      </Panel>

      <Panel title="空头持仓" hint={`${shorts.length} 笔`}>
        <Table
          ariaLabel="空头持仓"
          rows={shorts}
          rowKey={(row) => String(row.id)}
          empty={<EmptyState title="没有空头持仓" hint="开空与还券入口在「融资融券」分区。" />}
          columns={[
            { key: "ticker", header: "标的", width: 90, render: (row) => row.ticker },
            { key: "quantity", header: "数量", width: 96, align: "right", render: (row) => <span className="atlas-tabular">{row.quantity}</span> },
            { key: "entry", header: "开仓价", width: 110, align: "right", render: (row) => <Money value={row.entry_price} muted /> },
            { key: "last", header: "现价", width: 110, align: "right", render: (row) => <Money value={row.last_price} /> },
            { key: "margin", header: "保证金", width: 120, align: "right", render: (row) => <Money value={row.margin} /> },
            { key: "fee", header: "借券费", width: 110, align: "right", render: (row) => <Money value={row.fee_paid} muted /> },
            {
              key: "pnl",
              header: "浮动盈亏",
              width: 130,
              align: "right",
              render: (row) => <Money value={row.unrealized_pnl} delta={row.unrealized_pnl} />,
            },
            { key: "status", header: "状态", width: 84, render: (row) => row.status },
          ]}
        />
      </Panel>

      <div style={{ color: "var(--atlas-n-600)", fontSize: "var(--atlas-t-micro)" }}>
        合计市值 {formatAmount(portfolio?.market_value)} cc4；金额以服务端成交结果为准。
      </div>
    </div>
  );
};

export default PortfolioTab;

// panels/Market/OrdersTab.tsx — my resting/historical orders and the cancel
// action (06 §2 `orders`).

import React from "react";
import { Badge, Button, EmptyState, Money, Panel, Table } from "../../ui/index.ts";
import { cancelOrder } from "../../ui/api.ts";
import { useWrite } from "../_shared/useWrite.ts";
import { labelOfSide } from "./_constants.ts";

export interface OrdersTabProps {
  orders: any[];
  loading: boolean;
  onChanged: () => void;
}

const STATUS_TONE: Record<string, "neutral" | "signal" | "warn" | "danger" | "down"> = {
  open: "signal",
  partial: "signal",
  filled: "down",
  cancelled: "neutral",
  rejected: "danger",
};

export const OrdersTab: React.FC<OrdersTabProps> = ({ orders, loading, onChanged }) => {
  const write = useWrite(onChanged);

  return (
    <Panel title="我的委托" hint={`${orders.length} 笔`}>
      {write.error ? <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-small)" }}>{write.error}</div> : null}
      <Table
        ariaLabel="我的委托"
        loading={loading}
        rows={orders}
        rowKey={(row) => String(row.id)}
        empty={
          <EmptyState title="还没有委托" hint="在「行情」分区选中标的后即可下单。" />
        }
        columns={[
          {
            key: "created",
            header: "时间",
            width: 128,
            render: (row) => (
              <span className="atlas-tabular" style={{ color: "var(--atlas-n-700)", fontSize: "var(--atlas-t-micro)" }}>
                {String(row.created_at ?? "").slice(5, 19).replace("T", " ")}
              </span>
            ),
          },
          { key: "ticker", header: "标的", width: 90, render: (row) => <span style={{ color: "var(--atlas-n-950)" }}>{row.ticker}</span> },
          {
            key: "side",
            header: "方向",
            width: 64,
            render: (row) => (
              <span style={{ color: row.side === "buy" ? "var(--atlas-up)" : "var(--atlas-down)" }}>
                {labelOfSide(row.side)}
              </span>
            ),
          },
          { key: "type", header: "类型", width: 64, render: (row) => (row.type === "market" ? "市价" : "限价") },
          {
            key: "price",
            header: "价格",
            width: 110,
            align: "right",
            render: (row) => (row.price == null ? <span style={{ color: "var(--atlas-n-600)" }}>市价</span> : <Money value={row.price} />),
          },
          { key: "quantity", header: "数量", width: 90, align: "right", render: (row) => <span className="atlas-tabular">{row.quantity}</span> },
          {
            key: "filled",
            header: "已成交",
            width: 90,
            align: "right",
            render: (row) => <span className="atlas-tabular">{row.filled}{row.remaining ? ` / ${row.remaining}` : ""}</span>,
          },
          {
            key: "status",
            header: "状态",
            width: 84,
            render: (row) => <Badge tone={STATUS_TONE[row.status] ?? "neutral"}>{row.status}</Badge>,
          },
          {
            key: "action",
            header: "操作",
            width: 84,
            align: "right",
            render: (row) =>
              row.status === "open" || row.status === "partial" ? (
                <Button
                  size="sm"
                  variant="ghost"
                  loading={write.busy}
                  onClick={() => void write.run(() => cancelOrder(String(row.id)), "已撤单")}
                >
                  撤单
                </Button>
              ) : null,
          },
        ]}
      />
    </Panel>
  );
};

export default OrdersTab;

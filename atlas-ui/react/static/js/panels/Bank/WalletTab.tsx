// panels/Bank/WalletTab.tsx — nine-currency balances, ledger and transfer.

import React, { useState } from "react";
import { Badge, Button, EmptyState, Money, NumberInput, Panel, Select, Table } from "../../ui/index.ts";
import { transfer } from "../../ui/api.ts";
import { useWrite } from "../_shared/useWrite.ts";
import type { BankCommon } from "../BankPanel.tsx";

export interface WalletTabProps {
  common: BankCommon;
}

export const WalletTab: React.FC<WalletTabProps> = ({ common }) => {
  const balances: any[] = common.wallet?.currencies ?? [];
  const [toPlayer, setToPlayer] = useState("");
  const [currency, setCurrency] = useState(balances[0]?.code ?? "cc1");
  const [amount, setAmount] = useState("1000");
  const [memo, setMemo] = useState("");
  const write = useWrite(common.reload);
  const options = balances.length
    ? balances.map((row) => ({ value: String(row.code), label: `${row.code} · ${row.name}` }))
    : [{ value: "cc1", label: "cc1" }];

  return (
    <div style={{ display: "grid", gap: "var(--atlas-3)" }}>
      <Panel title="货币余额" hint={`${balances.length} 个账户`}>
        <Table
          ariaLabel="货币余额"
          rows={balances}
          rowKey={(row) => String(row.code)}
          empty={<EmptyState title="还没有货币账户" hint="领取产出或兑换后会出现。" />}
          columns={[
            { key: "code", header: "代码", width: 80, render: (row) => row.code },
            { key: "name", header: "名称", width: 160, render: (row) => row.name },
            { key: "quality", header: "品质", width: 70, render: (row) => <Badge tone="neutral">Q{row.quality}</Badge> },
            { key: "balance", header: "可用", width: 140, align: "right", render: (row) => <Money value={row.balance} /> },
            { key: "frozen", header: "冻结", width: 130, align: "right", render: (row) => <Money value={row.frozen} muted /> },
            { key: "q1", header: "折 Q1", width: 140, align: "right", render: (row) => <Money value={row.q1_equiv} muted /> },
          ]}
        />
      </Panel>

      <Panel title="转账" hint="按 player_id 转给其他玩家">
        {write.error ? <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-small)" }}>{write.error}</div> : null}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "var(--atlas-2)" }}>
          <div>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>收款 player_id</div>
            <input
              value={toPlayer}
              onChange={(event) => setToPlayer(event.target.value)}
              placeholder="uuid"
              style={{ width: "100%", height: 32, padding: "0 var(--atlas-2)", background: "var(--atlas-plate-2)", border: "1px solid var(--atlas-line-strong)", borderRadius: "var(--atlas-r-md)", color: "var(--atlas-n-950)", fontFamily: "var(--atlas-mono)" }}
            />
          </div>
          <div>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>币种</div>
            <Select value={currency} onChange={(event) => setCurrency(event.target.value)} options={options} />
          </div>
          <div>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>金额</div>
            <NumberInput value={amount} onChange={setAmount} min={0} decimals={4} step={100} />
          </div>
          <div>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>备注</div>
            <input
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
              style={{ width: "100%", height: 32, padding: "0 var(--atlas-2)", background: "var(--atlas-plate-2)", border: "1px solid var(--atlas-line-strong)", borderRadius: "var(--atlas-r-md)", color: "var(--atlas-n-950)" }}
            />
          </div>
        </div>
        <div>
          <Button
            variant="primary"
            loading={write.busy}
            disabled={!toPlayer.trim() || Number(amount) <= 0}
            onClick={() => void write.run(() => transfer(toPlayer.trim(), currency, amount, memo), "转账已提交")}
          >
            转账
          </Button>
        </div>
      </Panel>

      <Panel title="最近流水" hint={`${common.entries.length} 条`}>
        <Table
          ariaLabel="钱包流水"
          rows={common.entries}
          rowKey={(row, index) => `${row.tx_id}-${index}`}
          empty={<EmptyState title="暂无流水" />}
          columns={[
            { key: "time", header: "时间", width: 130, render: (row) => <span className="atlas-tabular" style={{ color: "var(--atlas-n-700)", fontSize: "var(--atlas-t-micro)" }}>{String(row.created_at ?? "").slice(5, 19).replace("T", " ")}</span> },
            { key: "kind", header: "类型", width: 150, render: (row) => row.kind },
            { key: "currency", header: "币种", width: 70, render: (row) => row.currency_code },
            { key: "delta", header: "变动", width: 120, align: "right", render: (row) => <Money value={row.delta} delta={row.delta} /> },
            { key: "after", header: "余额后", width: 130, align: "right", render: (row) => <Money value={row.balance_after} /> },
            { key: "ref", header: "关联", width: 140, render: (row) => row.ref_type ? `${row.ref_type}:${String(row.ref_id ?? "").slice(0, 8)}` : "—" },
          ]}
        />
      </Panel>
    </div>
  );
};

export default WalletTab;

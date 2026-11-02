// panels/Bank/BanksTab.tsx — bank list, rates, deposit and withdraw.

import React, { useEffect, useState } from "react";
import { Badge, Button, EmptyState, Money, NumberInput, Panel, Select, Table } from "../../ui/index.ts";
import { deposit, withdraw } from "../../ui/api.ts";
import { formatAmount, toNumber } from "../../ui/Money.tsx";
import { useWrite } from "../_shared/useWrite.ts";
import type { BankCommon } from "../BankPanel.tsx";

export interface BanksTabProps {
  common: BankCommon;
}

export const BanksTab: React.FC<BanksTabProps> = ({ common }) => {
  const balances: any[] = common.wallet?.currencies ?? [];
  const [bankId, setBankId] = useState(common.banks[0]?.id ?? "");
  const [currency, setCurrency] = useState("cc1");
  const [amount, setAmount] = useState("1000");
  const write = useWrite(common.reload);
  const bankOptions = common.banks.length ? common.banks.map((row) => ({ value: String(row.id), label: `${row.name} (${row.code})` })) : [{ value: "", label: "暂无银行" }];
  const currencyOptions = balances.length ? balances.map((row) => ({ value: String(row.code), label: `${row.code} · ${row.name}` })) : [{ value: "cc1", label: "cc1" }];

  useEffect(() => {
    if (!bankId && common.banks.length) setBankId(String(common.banks[0].id));
  }, [bankId, common.banks]);

  return (
    <div style={{ display: "grid", gap: "var(--atlas-3)" }}>
      <Panel title="银行列表" hint={`${common.banks.length} 家`}>
        <Table
          ariaLabel="银行列表"
          rows={common.banks}
          rowKey={(row) => String(row.id)}
          empty={<EmptyState title="暂无银行" />}
          columns={[
            { key: "code", header: "代码", width: 90, render: (row) => row.code },
            { key: "name", header: "名称", width: 200, render: (row) => row.name },
            { key: "kind", header: "类型", width: 90, render: (row) => <Badge tone={row.kind === "central" ? "signal" : "neutral"}>{row.kind === "central" ? "央行" : "商业"}</Badge> },
            { key: "currency", header: "币种", width: 70, render: (row) => row.currency_code },
            { key: "reserve", header: "准备金率", width: 100, align: "right", render: (row) => <span className="atlas-tabular">{(toNumber(row.reserve_ratio) * 100).toFixed(1)}%</span> },
            { key: "accounts", header: "账户数", width: 90, align: "right", render: (row) => <span className="atlas-tabular">{row.accounts}</span> },
          ]}
        />
        {common.rates ? (
          <div style={{ color: "var(--atlas-n-700)", fontSize: "var(--atlas-t-micro)" }}>
            基准 {common.rates.policy_rate_bps}bp · 存款 {common.rates.deposit_rate_bps}bp · 贷款 {common.rates.lend_rate_bps}bp · 来源 {common.rates.source}
          </div>
        ) : null}
      </Panel>

      <Panel title="存取" hint="存款进入银行负债，取款回到钱包">
        {write.error ? <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-small)" }}>{write.error}</div> : null}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "var(--atlas-2)" }}>
          <div>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>银行</div>
            <Select value={bankId} onChange={(event) => setBankId(event.target.value)} options={bankOptions} />
          </div>
          <div>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>币种</div>
            <Select value={currency} onChange={(event) => setCurrency(event.target.value)} options={currencyOptions} />
          </div>
          <div>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>金额</div>
            <NumberInput value={amount} onChange={setAmount} min={0} decimals={4} step={100} />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: "var(--atlas-2)" }}>
            <Button variant="primary" loading={write.busy} disabled={!bankId || toNumber(amount) <= 0} onClick={() => void write.run(() => deposit(bankId, currency, amount), `已存入 ${amount} ${currency}`)}>
              存入
            </Button>
            <Button loading={write.busy} disabled={!bankId || toNumber(amount) <= 0} onClick={() => void write.run(() => withdraw(bankId, currency, amount), `已取出 ${amount} ${currency}`)}>
              取出
            </Button>
          </div>
        </div>
        <div style={{ color: "var(--atlas-n-600)", fontSize: "var(--atlas-t-micro)" }}>
          我的存款：{common.accounts.length ? common.accounts.map((row) => `${row.bank_code} ${row.currency_code} ${formatAmount(row.balance)}`).join(" · ") : "—"}
        </div>
      </Panel>

      <Panel title="我的存款" hint={`${common.accounts.length} 个账户`}>
        <Table
          ariaLabel="我的存款"
          rows={common.accounts}
          rowKey={(row) => String(row.id)}
          empty={<EmptyState title="没有银行存款" />}
          columns={[
            { key: "bank", header: "银行", width: 200, render: (row) => `${row.bank_name} (${row.bank_code})` },
            { key: "currency", header: "币种", width: 80, render: (row) => row.currency_code },
            { key: "balance", header: "余额", width: 150, align: "right", render: (row) => <Money value={row.balance} /> },
          ]}
        />
      </Panel>
    </div>
  );
};

export default BanksTab;

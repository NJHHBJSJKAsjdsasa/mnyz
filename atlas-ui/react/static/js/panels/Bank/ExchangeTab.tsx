// panels/Bank/ExchangeTab.tsx — adjacent-quality FX with a visible spread
// (06 §3: hiding the spread is the fastest way to get an "黑我钱" complaint).

import React, { useState } from "react";
import { Button, Money, NumberInput, Panel, Select } from "../../ui/index.ts";
import { exchangeCurrency, fetchBankQuote } from "../../ui/api.ts";
import { formatAmount, toNumber } from "../../ui/Money.tsx";
import { useWrite } from "../_shared/useWrite.ts";
import { messageOf } from "../_shared/errors.ts";
import type { BankCommon } from "../BankPanel.tsx";

export interface ExchangeTabProps {
  common: BankCommon;
}

export const ExchangeTab: React.FC<ExchangeTabProps> = ({ common }) => {
  const balances: any[] = common.wallet?.currencies ?? [];
  const codes = balances.map((row) => String(row.code));
  const [fromCode, setFromCode] = useState(codes[0] ?? "cc1");
  const [toCode, setToCode] = useState(codes[1] ?? "cc2");
  const [amount, setAmount] = useState("1000");
  const [quote, setQuote] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const write = useWrite(common.reload);
  const options = balances.length ? balances.map((row) => ({ value: String(row.code), label: `${row.code} · ${row.name}` })) : [{ value: "cc1", label: "cc1" }];

  const askQuote = async () => {
    setError(null);
    try {
      setQuote(await fetchBankQuote(fromCode, toCode));
    } catch (raw) {
      setQuote(null);
      setError(messageOf(raw));
    }
  };

  const exchange = async () => {
    const outcome = await write.run(
      () => exchangeCurrency(fromCode, toCode, amount),
      `已兑换 ${amount} ${fromCode} → ${toCode}`,
    );
    if (outcome.ok) setQuote(null);
  };

  return (
    <Panel title="兑换" hint="只能相邻品质逐级兑换">
      {(error || write.error) ? <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-small)" }}>{error ?? write.error}</div> : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "var(--atlas-2)" }}>
        <div>
          <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>从</div>
          <Select value={fromCode} onChange={(event) => setFromCode(event.target.value)} options={options} />
        </div>
        <div>
          <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>到</div>
          <Select value={toCode} onChange={(event) => setToCode(event.target.value)} options={options} />
        </div>
        <div>
          <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>金额</div>
          <NumberInput value={amount} onChange={setAmount} min={0} decimals={4} step={100} />
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "var(--atlas-2)" }}>
          <Button onClick={() => void askQuote()}>询价</Button>
          <Button variant="primary" loading={write.busy} disabled={toNumber(amount) <= 0} onClick={() => void exchange()}>
            兑换
          </Button>
        </div>
      </div>

      {quote ? (
        <div style={{ borderTop: "1px solid var(--atlas-line)", paddingTop: "var(--atlas-2)", display: "grid", gap: 2, fontSize: "var(--atlas-t-small)" }}>
          <div className="atlas-kv">
            <span className="atlas-kv-label">参考价</span>
            <span className="atlas-tabular">1 {quote.to_code} = <Money value={quote.mid} /> {quote.from_code}</span>
          </div>
          <div className="atlas-kv">
            <span className="atlas-kv-label">点差</span>
            <span className="atlas-tabular">{quote.spread_bps}bp</span>
          </div>
          <div className="atlas-kv">
            <span className="atlas-kv-label">银行买入 / 卖出</span>
            <span className="atlas-tabular"><Money value={quote.bank_buy} /> / <Money value={quote.bank_sell} /></span>
          </div>
          <div style={{ color: "var(--atlas-n-600)", fontSize: "var(--atlas-t-micro)" }}>{quote.expires_in}s 内有效；实际到账以成交结果为准。</div>
        </div>
      ) : null}

      <div style={{ color: "var(--atlas-n-600)", fontSize: "var(--atlas-t-micro)" }}>
        当前可用：{balances.map((row) => `${row.code} ${formatAmount(row.balance)}`).join(" · ") || "—"}
      </div>
    </Panel>
  );
};

export default ExchangeTab;

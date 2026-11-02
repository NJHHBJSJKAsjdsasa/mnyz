// panels/Market/MarginTab.tsx — margin account, short positions, borrow/lend
// (06 §2 `margin`). All thresholds come from `GET /stocks/margin`; nothing is
// re-derived client side.

import React, { useCallback, useEffect, useState } from "react";
import { Badge, Button, EmptyState, Money, NumberInput, Panel, Select, Status, Table } from "../../ui/index.ts";
import { coverShort, depositMargin, fetchMargin, lendShares, openShort } from "../../ui/api.ts";
import { formatAmount, toNumber } from "../../ui/Money.tsx";
import { useWrite } from "../_shared/useWrite.ts";
import { messageOf } from "../_shared/errors.ts";

export interface MarginTabProps {
  stocks: any[];
  selected: string | null;
  onSelect: (ticker: string) => void;
  onChanged: () => void;
}

export const MarginTab: React.FC<MarginTabProps> = ({ stocks, selected, onSelect, onChanged }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState<string | null>(null);
  const [ticker, setTicker] = useState(selected ?? stocks[0]?.ticker ?? "");
  const [amount, setAmount] = useState("1000");
  const [shortQty, setShortQty] = useState("100");
  const [coverQty, setCoverQty] = useState("");
  const [lendQty, setLendQty] = useState("100");
  const [feeBps, setFeeBps] = useState("300");
  const [days, setDays] = useState("30");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchMargin());
      setReadError(null);
    } catch (raw) {
      setReadError(messageOf(raw));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (selected) setTicker(selected);
  }, [selected]);

  const write = useWrite(async () => {
    await reload();
    onChanged();
  });

  const account = data?.account ?? null;
  const ratio = data?.margin_ratio == null ? null : toNumber(data.margin_ratio);
  const maintenance = toNumber(data?.maintenance_margin);
  const positions: any[] = data?.positions ?? [];
  const options = stocks.map((row) => ({ value: String(row.ticker), label: `${row.ticker} · ${row.company ?? ""}` }));

  return (
    <div style={{ display: "grid", gap: "var(--atlas-3)" }}>
      <Panel
        title="保证金账户"
        hint={account?.status ? `状态 ${account.status}` : undefined}
        actions={<Button size="sm" onClick={() => void reload()}>刷新</Button>}
      >
        {readError ? <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-small)" }}>{readError}</div> : null}
        {loading ? <div style={{ color: "var(--atlas-n-700)", fontSize: "var(--atlas-t-small)" }}>读取中…</div> : null}
        {!loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "var(--atlas-3)" }}>
            <div>
              <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)" }}>保证金余额</div>
              <Money value={account?.cash} currency={account?.currency_code ?? "cc4"} size="var(--atlas-t-h1)" />
            </div>
            <div>
              <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)" }}>空头负债</div>
              <Money value={data?.liability} currency="cc4" size="var(--atlas-t-h1)" />
            </div>
            <div>
              <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)" }}>维持担保比例</div>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--atlas-2)" }}>
                <span className="atlas-tabular" style={{ fontSize: "var(--atlas-t-h1)", color: ratio != null && ratio < maintenance ? "var(--atlas-danger)" : "var(--atlas-n-950)" }}>
                  {ratio == null ? "—" : `${(ratio * 100).toFixed(1)}%`}
                </span>
                {ratio != null && ratio < maintenance ? <Status statusId="market.margin_call" /> : null}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)" }}>初始 / 维持线</div>
              <div className="atlas-tabular" style={{ color: "var(--atlas-n-900)", fontSize: "var(--atlas-t-body)" }}>
                {formatAmount(toNumber(data?.initial_margin) * 100)}% / {formatAmount(maintenance * 100)}%
              </div>
            </div>
          </div>
        ) : null}
      </Panel>

      {write.error ? <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-small)" }}>{write.error}</div> : null}

      <Panel title="交易标的">
        <Select
          value={ticker}
          onChange={(event) => {
            setTicker(event.target.value);
            onSelect(event.target.value);
          }}
          options={options.length ? options : [{ value: "", label: "暂无上市股票" }]}
          aria-label="融资融券标的"
        />
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "var(--atlas-3)" }}>
        <Panel title="追加保证金" hint="转入 cc4 到保证金账户">
          <div style={{ display: "flex", gap: "var(--atlas-2)", alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>金额 cc4</div>
              <NumberInput value={amount} onChange={setAmount} min={0} decimals={4} step={100} />
            </div>
            <Button
              variant="primary"
              loading={write.busy}
              disabled={!ticker || toNumber(amount) <= 0}
              onClick={() => void write.run(() => depositMargin(ticker, amount), "保证金已转入")}
            >
              转入
            </Button>
          </div>
        </Panel>

        <Panel title="开空" hint="借券 + 市价卖出，需保证金账户">
          <div style={{ display: "flex", gap: "var(--atlas-2)", alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>数量</div>
              <NumberInput value={shortQty} onChange={setShortQty} min={1} />
            </div>
            <Button
              variant="danger"
              loading={write.busy}
              disabled={!ticker || toNumber(shortQty) <= 0}
              onClick={() => void write.run(() => openShort(ticker, Math.floor(toNumber(shortQty))), "开空已提交")}
            >
              开空
            </Button>
          </div>
        </Panel>

        <Panel title="还券" hint="留空数量 = 全部平仓">
          <div style={{ display: "flex", gap: "var(--atlas-2)", alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>数量（可空）</div>
              <NumberInput value={coverQty} onChange={setCoverQty} min={1} placeholder="全部" />
            </div>
            <Button
              loading={write.busy}
              disabled={!ticker}
              onClick={() =>
                void write.run(
                  () => coverShort(ticker, coverQty ? Math.floor(toNumber(coverQty)) : undefined),
                  "还券已提交",
                )
              }
            >
              还券
            </Button>
          </div>
        </Panel>

        <Panel title="出借股票" hint="券源收入，费率为年化 bp">
          <div style={{ display: "grid", gap: "var(--atlas-2)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--atlas-2)" }}>
              <div>
                <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>数量</div>
                <NumberInput value={lendQty} onChange={setLendQty} min={1} />
              </div>
              <div>
                <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>费率 bp</div>
                <NumberInput value={feeBps} onChange={setFeeBps} min={100} max={1000} step={50} />
              </div>
              <div>
                <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>天数</div>
                <NumberInput value={days} onChange={setDays} min={1} max={365} />
              </div>
            </div>
            <Button
              loading={write.busy}
              disabled={!ticker || toNumber(lendQty) <= 0}
              onClick={() =>
                void write.run(
                  () =>
                    lendShares(ticker, {
                      quantity: Math.floor(toNumber(lendQty)),
                      fee_bps: Math.floor(toNumber(feeBps)),
                      days: Math.floor(toNumber(days)),
                    }),
                  "出借已登记",
                )
              }
            >
              出借
            </Button>
          </div>
        </Panel>
      </div>

      <Panel title="空头持仓" hint={`${positions.length} 笔`}>
        <Table
          ariaLabel="空头持仓"
          rows={positions}
          rowKey={(row) => String(row.id)}
          empty={<EmptyState title="没有空头持仓" hint="开空后会出现在这里。" />}
          columns={[
            { key: "ticker", header: "标的", width: 90, render: (row) => row.ticker },
            { key: "quantity", header: "数量", width: 96, align: "right", render: (row) => <span className="atlas-tabular">{row.quantity}</span> },
            { key: "entry", header: "开仓价", width: 110, align: "right", render: (row) => <Money value={row.entry_price} muted /> },
            { key: "last", header: "现价", width: 110, align: "right", render: (row) => <Money value={row.last_price} /> },
            { key: "margin", header: "保证金", width: 120, align: "right", render: (row) => <Money value={row.margin} /> },
            { key: "fee", header: "借券费", width: 110, align: "right", render: (row) => <Money value={row.fee_paid} muted /> },
            { key: "status", header: "状态", width: 90, render: (row) => <Badge tone={row.status === "open" ? "warn" : "neutral"}>{row.status}</Badge> },
          ]}
        />
      </Panel>
    </div>
  );
};

export default MarginTab;

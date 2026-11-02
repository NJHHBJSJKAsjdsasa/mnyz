// panels/Market/IpoTab.tsx — IPO application (06 §2 `ipo`).
//
// The form mirrors `stock_service.ipo` exactly: the requirements below are the
// same four checks the server makes, so a player does not fill a form that is
// certain to be rejected. No Q-level gate is shown because the current backend
// does not implement one (05 §13).

import React, { useState } from "react";
import { Button, Checkbox, Money, NumberInput, Panel, Select } from "../../ui/index.ts";
import { requestIpo } from "../../ui/api.ts";
import { formatAmount, toNumber } from "../../ui/Money.tsx";
import { useWrite } from "../_shared/useWrite.ts";

export interface IpoTabProps {
  exchanges: any[];
  onChanged: () => void;
}

export const IpoTab: React.FC<IpoTabProps> = ({ exchanges, onChanged }) => {
  const [ticker, setTicker] = useState("");
  const [offerShares, setOfferShares] = useState("1000000");
  const [price, setPrice] = useState("10");
  const [settlement, setSettlement] = useState<"t0" | "t1">("t0");
  const [shortable, setShortable] = useState(true);
  const [exchangeCode, setExchangeCode] = useState("");
  const [result, setResult] = useState<any>(null);

  const write = useWrite(onChanged);

  const raise = toNumber(price) * toNumber(offerShares);
  const activeVenues = exchanges.filter((row) => row.status === "active");
  const venueOptions = [
    { value: "", label: "官方交易所（默认）" },
    ...activeVenues.map((row) => ({
      value: String(row.code),
      label: `${row.code} · ${row.name}${row.listing_fee ? ` · 上市费 ${formatAmount(row.listing_fee)}` : ""}`,
    })),
  ];

  const submit = () =>
    void write.run(
      () =>
        requestIpo({
          ticker: ticker.trim().toUpperCase(),
          offer_shares: Math.floor(toNumber(offerShares)),
          price,
          settlement_mode: settlement,
          shortable,
          ...(exchangeCode ? { exchange_code: exchangeCode } : {}),
        }),
      `${ticker.trim().toUpperCase()} IPO 已提交`,
    ).then((outcome) => {
      if (outcome.ok) setResult(outcome.value);
    });

  return (
    <div style={{ display: "grid", gap: "var(--atlas-3)" }}>
      <Panel title="发行 IPO" hint="新增股份卖给市场，募资进入公司金库">
        {write.error ? <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-small)" }}>{write.error}</div> : null}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "var(--atlas-3)" }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)" }}>公司代码 / Ticker</span>
            <input
              value={ticker}
              onChange={(event) => setTicker(event.target.value.toUpperCase())}
              placeholder="ATL"
              maxLength={8}
              style={{
                height: 32,
                padding: "0 var(--atlas-2)",
                background: "var(--atlas-plate-2)",
                border: "1px solid var(--atlas-line-strong)",
                borderRadius: "var(--atlas-r-md)",
                color: "var(--atlas-n-950)",
                fontFamily: "var(--atlas-mono)",
                fontSize: "var(--atlas-t-body)",
              }}
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)" }}>发行股数</span>
            <NumberInput value={offerShares} onChange={setOfferShares} min={1} step={100000} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)" }}>发行价 cc4</span>
            <NumberInput value={price} onChange={setPrice} min={0} decimals={4} step={0.1} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)" }}>结算模式</span>
            <Select
              value={settlement}
              onChange={(event) => setSettlement(event.target.value as "t0" | "t1")}
              options={[
                { value: "t0", label: "T+0 当日可卖" },
                { value: "t1", label: "T+1 次日可卖" },
              ]}
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)" }}>挂牌交易所</span>
            <Select value={exchangeCode} onChange={(event) => setExchangeCode(event.target.value)} options={venueOptions} />
          </label>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--atlas-4)", flexWrap: "wrap" }}>
          <Checkbox checked={shortable} onChange={setShortable} label="允许做空" />
          <span style={{ fontSize: "var(--atlas-t-small)", color: "var(--atlas-n-800)" }}>
            预计募资 <Money value={raise} currency="cc4" />（发行价 × 股数，以成交结果为准）
          </span>
        </div>

        <div style={{ borderTop: "1px solid var(--atlas-line)", paddingTop: "var(--atlas-2)", color: "var(--atlas-n-700)", fontSize: "var(--atlas-t-micro)", lineHeight: 1.7 }}>
          服务端校验：公司成立 ≥ 7 天 · 净资产 ≥ 50,000 cc4 · 控股 ≥ 50% · 自由流通 ≥ 20% · ticker 未上市。
          上市费从公司金库扣除，募集资金进入公司金库。
        </div>

        <div>
          <Button
            variant="primary"
            loading={write.busy}
            disabled={!ticker.trim() || toNumber(offerShares) <= 0 || toNumber(price) <= 0}
            onClick={submit}
          >
            提交 IPO
          </Button>
        </div>
      </Panel>

      {result ? (
        <Panel title="发行结果" hint={result.exchange ? `场地 ${result.exchange}` : undefined}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "var(--atlas-2)" }}>
            <span>代码 <span className="atlas-tabular">{result.ticker}</span></span>
            <span>发行价 <Money value={result.ipo_price} /></span>
            <span>发行股数 <span className="atlas-tabular">{result.offered_shares}</span></span>
            <span>总股本 <span className="atlas-tabular">{result.total_shares}</span></span>
            <span>结算 <span className="atlas-tabular">{result.settlement_mode}</span></span>
            <span>卖单编号 <span className="atlas-tabular">{result.offer_order_id}</span></span>
          </div>
        </Panel>
      ) : null}
    </div>
  );
};

export default IpoTab;

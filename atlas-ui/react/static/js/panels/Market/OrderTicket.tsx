// panels/Market/OrderTicket.tsx — the order-entry half of `quotes` (06 §2.6).
//
// Split out of QuotesTab so the read-only market surface (listings, candles,
// book, tapes) and the write surface (side/price/quantity, fee preview,
// confirmation) can be understood and tested separately.
//
// The fee block is presentation only: every leg is labelled, and the last line
// says the成交 result wins. Amounts are strings on the wire.

import React, { useEffect, useState } from "react";
import { Button, Modal, Money, NumberInput, Panel, Select, Status } from "../../ui/index.ts";
import { fetchBrokerAccount, placeOrder } from "../../ui/api.ts";
import { formatAmount, toNumber } from "../../ui/Money.tsx";
import { useWrite } from "../_shared/useWrite.ts";
import { labelOfSide } from "./_constants.ts";

export interface OrderTicketProps {
  ticker: string;
  detail: any;
  quote: any;
  portfolio: any;
  onDone: () => void;
}

interface OrderPayload {
  side: "buy" | "sell";
  type: "limit" | "market";
  price?: string;
  quantity: number;
  venue_code?: string;
}

export const OrderTicket: React.FC<OrderTicketProps> = ({ ticker, detail, quote, portfolio, onDone }) => {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("100");
  const [routing, setRouting] = useState<"auto" | "venue">("auto");
  const [venue, setVenue] = useState("");
  const [brokerAccount, setBrokerAccount] = useState<any>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState<OrderPayload | null>(null);
  const [lastResult, setLastResult] = useState<any>(null);

  const write = useWrite(onDone);

  useEffect(() => {
    void fetchBrokerAccount()
      .then((data) => setBrokerAccount(data?.account ?? null))
      .catch(() => setBrokerAccount(null));
  }, []);

  useEffect(() => {
    setPrice(detail?.last_price != null ? String(detail.last_price) : "");
    setVenue("");
    setRouting("auto");
    setConfirmOpen(false);
    setPending(null);
    // Re-seed when the server payload changes (initial load / refresh after a
    // write), not on every render: typing must not be overwritten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, detail?.last_price]);

  const bid = toNumber(quote?.bid);
  const ask = toNumber(quote?.ask);
  const qty = Math.floor(toNumber(quantity));
  const explicitPrice = price.trim() === "" ? null : price;
  const reference =
    explicitPrice != null
      ? toNumber(explicitPrice)
      : side === "buy"
        ? ask || toNumber(detail?.last_price)
        : bid || toNumber(detail?.last_price);
  const notional = qty * reference;

  const venues: any[] = detail?.venues ?? [];
  const venueRow = routing === "venue" ? venues.find((row) => row.exchange_code === venue) : null;
  const venueFeeBps = venueRow ? toNumber(venueRow.fee_bps) : toNumber(detail?.fee_bps);
  const commissionBps = brokerAccount?.status === "active" ? toNumber(brokerAccount.commission_bps) : 0;
  const exchangeFee = (notional * venueFeeBps) / 10_000;
  const commission = (notional * commissionBps) / 10_000;
  const tax = side === "sell" ? notional * 0.001 : 0;
  const feeTotal = exchangeFee + commission + tax;
  const cash = toNumber(portfolio?.cash);
  const halted = Boolean(detail?.halted_until);
  const requiresConfirm = notional > 0 && cash > 0 && notional > cash * 0.1;

  const buildPayload = (): OrderPayload | null => {
    if (qty <= 0) return null;
    if (explicitPrice != null && toNumber(explicitPrice) <= 0) return null;
    return {
      side,
      type: explicitPrice != null ? "limit" : "market",
      ...(explicitPrice != null ? { price: explicitPrice } : {}),
      quantity: qty,
      ...(routing === "venue" && venue ? { venue_code: venue } : {}),
    };
  };

  const send = async (payload: OrderPayload) => {
    const outcome = await write.run(
      () => placeOrder(ticker, payload),
      `${labelOfSide(payload.side)} ${payload.quantity} 股 ${ticker} 已提交`,
    );
    setConfirmOpen(false);
    setPending(null);
    if (outcome.ok) setLastResult(outcome.value);
  };

  const submit = () => {
    const payload = buildPayload();
    if (!payload) return;
    if (requiresConfirm) {
      setPending(payload);
      setConfirmOpen(true);
      return;
    }
    void send(payload);
  };

  return (
    <>
      <Panel title="下单" hint={`${ticker} · ${detail?.currency_code ?? "cc4"}`}>
        <div style={{ display: "grid", gap: "var(--atlas-2)" }}>
          <div style={{ display: "flex", gap: "var(--atlas-2)" }}>
            <Button block variant={side === "buy" ? "primary" : "ghost"} onClick={() => setSide("buy")}>
              买入
            </Button>
            <Button block variant={side === "sell" ? "danger" : "ghost"} onClick={() => setSide("sell")}>
              卖出
            </Button>
          </div>

          <div>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>价格（留空 = 市价）</div>
            <div style={{ display: "flex", gap: "var(--atlas-1)" }}>
              <NumberInput value={price} onChange={setPrice} min={0} decimals={4} step={0.01} placeholder="市价" />
              <Button
                size="sm"
                onClick={() => setPrice(String(side === "buy" ? quote?.ask ?? "" : quote?.bid ?? ""))}
                disabled={!quote}
                title="使用当前对手价"
              >
                对手价
              </Button>
              <Button size="sm" onClick={() => setPrice("")} title="改为市价单">
                市价
              </Button>
            </div>
          </div>

          <div>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>数量</div>
            <NumberInput value={quantity} onChange={setQuantity} min={1} />
          </div>

          <div>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>路由</div>
            <div style={{ display: "flex", gap: "var(--atlas-1)" }}>
              <Button block size="sm" variant={routing === "auto" ? "secondary" : "ghost"} onClick={() => setRouting("auto")}>
                自动最优价
              </Button>
              <Button block size="sm" variant={routing === "venue" ? "secondary" : "ghost"} onClick={() => setRouting("venue")}>
                指定场地
              </Button>
            </div>
          </div>

          {routing === "venue" ? (
            <Select
              value={venue}
              onChange={(event) => setVenue(event.target.value)}
              options={[
                { value: "", label: "选择场地" },
                ...venues.map((row) => ({
                  value: String(row.exchange_code),
                  label: `${row.exchange_code} · ${row.fee_bps}bp · ${row.status}`,
                  disabled: row.status !== "active",
                })),
              ]}
              aria-label="指定场地"
            />
          ) : null}

          <div style={{ borderTop: "1px solid var(--atlas-line)", paddingTop: "var(--atlas-2)", display: "grid", gap: 2, fontSize: "var(--atlas-t-small)" }}>
            <div className="atlas-kv">
              <span className="atlas-kv-label">预估金额</span>
              <Money value={notional} currency={detail?.currency_code ?? "cc4"} />
            </div>
            <div className="atlas-kv">
              <span className="atlas-kv-label">本所费率</span>
              <span className="atlas-tabular" style={{ color: "var(--atlas-n-800)" }}>
                {venueRow ? `${venueRow.exchange_code} ` : ""}
                {venueFeeBps}bp · {formatAmount(exchangeFee)}
              </span>
            </div>
            <div className="atlas-kv">
              <span className="atlas-kv-label">券商佣金</span>
              <span className="atlas-tabular" style={{ color: "var(--atlas-n-800)" }}>
                {brokerAccount?.status === "active"
                  ? `${brokerAccount.broker} ${commissionBps}bp · ${formatAmount(commission)}`
                  : "直连，无佣金"}
              </span>
            </div>
            {side === "sell" ? (
              <div className="atlas-kv">
                <span className="atlas-kv-label">印花税 0.10%</span>
                <span className="atlas-tabular" style={{ color: "var(--atlas-n-800)" }}>{formatAmount(tax)}</span>
              </div>
            ) : null}
            <div className="atlas-kv">
              <span className="atlas-kv-label">预计费用</span>
              <Money value={feeTotal} currency={detail?.currency_code ?? "cc4"} />
            </div>
            <div style={{ color: "var(--atlas-n-600)", fontSize: "var(--atlas-t-micro)" }}>以成交结果为准。</div>
          </div>

          <Button
            variant={side === "buy" ? "primary" : "danger"}
            loading={write.busy}
            disabled={
              qty <= 0 ||
              (explicitPrice != null && toNumber(explicitPrice) <= 0) ||
              (halted && explicitPrice == null) ||
              (routing === "venue" && !venue)
            }
            onClick={submit}
          >
            {labelOfSide(side)} {qty > 0 ? qty : ""} 股
          </Button>

          {detail?.settlement_mode === "t1" ? (
            <div style={{ color: "var(--atlas-n-700)", fontSize: "var(--atlas-t-micro)" }}>T+1：当日买入的股份次日可卖。</div>
          ) : null}
          {halted ? <Status statusId="market.mm_paused" /> : null}
          {write.error ? <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-small)" }}>{write.error}</div> : null}
          {lastResult ? (
            <div style={{ color: "var(--atlas-signal)", fontSize: "var(--atlas-t-micro)" }}>
              最近委托 {String(lastResult.order_id ?? lastResult.id ?? "")} · {lastResult.status ?? ""}
            </div>
          ) : null}
        </div>
      </Panel>

      <Modal
        open={confirmOpen}
        title="确认下单"
        onClose={() => setConfirmOpen(false)}
        dismissible={!write.busy}
        footer={
          <>
            <Button onClick={() => setConfirmOpen(false)} disabled={write.busy}>取消</Button>
            <Button variant="danger" loading={write.busy} onClick={() => pending && void send(pending)}>
              确认{side === "buy" ? "买入" : "卖出"}
            </Button>
          </>
        }
      >
        {pending ? (
          <div style={{ display: "grid", gap: 4 }}>
            <div>方向 {labelOfSide(pending.side)} · 类型 {pending.type === "market" ? "市价" : "限价"}</div>
            <div>标的 <span className="atlas-tabular">{ticker}</span> · 数量 <span className="atlas-tabular">{pending.quantity}</span></div>
            <div>价格 {pending.price ?? "市价"} · 预估金额 {formatAmount(notional)}</div>
            <div style={{ color: "var(--atlas-warn)" }}>
              该笔金额超过可用现金的 10%（约 {formatAmount(cash * 0.1)}），请确认。
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
};

export default OrderTicket;

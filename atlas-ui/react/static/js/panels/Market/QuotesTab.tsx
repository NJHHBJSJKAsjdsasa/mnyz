// panels/Market/QuotesTab.tsx — the read-only trading view (06 §2).
//
// Left: index strip + listing search. Centre: candles, book and tapes. The write
// surface lives in OrderTicket.tsx so this file owns no form state.
//
// No polling: the panel refreshes on demand and after a write. 06 §8 allows one
// 15 s price poll, but a hidden PanelHost cannot tell this tab it was hidden, and
// a poll that keeps running behind another panel is worse than a refresh button.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, CandleChart, EmptyState, Money, Panel } from "../../ui/index.ts";
import { fetchCandles, fetchStockQuote } from "../../ui/api.ts";
import { formatAmount, formatPct } from "../../ui/Money.tsx";
import { messageOf } from "../_shared/errors.ts";
import { DOWN, INTERVALS, Interval, toneOfChange, UP } from "./_constants.ts";
import OrderTicket from "./OrderTicket.tsx";

export interface QuotesTabProps {
  stocks: any[];
  indices: any[];
  selected: string | null;
  detail: any;
  portfolio: any;
  orders: any[];
  loading: boolean;
  onSelect: (ticker: string) => void;
  onChanged: () => void;
}

export const QuotesTab: React.FC<QuotesTabProps> = ({
  stocks,
  indices,
  selected,
  detail,
  portfolio,
  orders,
  loading,
  onSelect,
  onChanged,
}) => {
  const [search, setSearch] = useState("");
  const [span, setSpan] = useState<Interval>("1m");
  const [candles, setCandles] = useState<any[]>([]);
  const [candlesLoading, setCandlesLoading] = useState(false);
  const [candlesError, setCandlesError] = useState<string | null>(null);
  const [quote, setQuote] = useState<any>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const loadCandles = useCallback(async () => {
    if (!selected) return;
    setCandlesLoading(true);
    try {
      const data = await fetchCandles(selected, span, 300);
      setCandles(data?.candles ?? []);
      setCandlesError(null);
    } catch (raw) {
      setCandlesError(messageOf(raw));
    } finally {
      setCandlesLoading(false);
    }
  }, [selected, span]);

  useEffect(() => {
    void loadCandles();
  }, [loadCandles]);

  const loadQuote = useCallback(async () => {
    if (!selected) return;
    try {
      setQuote(await fetchStockQuote(selected));
      setQuoteError(null);
    } catch (raw) {
      setQuote(null);
      setQuoteError(messageOf(raw));
    }
  }, [selected]);

  useEffect(() => {
    void loadQuote();
  }, [loadQuote]);

  const rows = useMemo(() => {
    const needle = search.trim().toUpperCase();
    if (!needle) return stocks;
    return stocks.filter(
      (row) => String(row.ticker).toUpperCase().includes(needle) || String(row.company ?? "").toUpperCase().includes(needle),
    );
  }, [stocks, search]);

  const bidLevels: any[] = (detail?.order_book?.bids ?? []).slice(0, 5);
  const askLevels: any[] = (detail?.order_book?.asks ?? []).slice(0, 5);
  const trades: any[] = detail?.recent_trades ?? [];
  const openOrders = orders.filter((row) => (row.status === "open" || row.status === "partial") && row.ticker === selected).length;
  const halted = Boolean(detail?.halted_until);
  // 05 §4.4: orders rest until the single opening price is struck.
  const auctionOpen = Boolean(detail?.auction_ends_at) && !detail?.auction_cleared_at;

  return (
    <div style={{ display: "grid", gap: "var(--atlas-3)" }}>
      <Panel title="指数" hint="点击下方行情行查看盘口">
        {indices.length === 0 ? (
          <EmptyState title="暂无活跃指数" />
        ) : (
          <div style={{ display: "flex", gap: "var(--atlas-2)", overflowX: "auto" }} className="atlas-scroll">
            {indices.map((index) => (
              <div
                key={index.code}
                style={{
                  minWidth: 190,
                  border: "1px solid var(--atlas-line)",
                  borderRadius: "var(--atlas-r-md)",
                  padding: "var(--atlas-2)",
                }}
              >
                <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)" }}>
                  {index.code} · {index.name}
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "var(--atlas-2)" }}>
                  <Money value={index.value} size="var(--atlas-t-h1)" />
                  <span className="atlas-tabular" style={{ color: toneOfChange(index.change_pct), fontSize: "var(--atlas-t-small)" }}>
                    {formatPct(index.change_pct)}
                  </span>
                </div>
                <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-600)" }}>{index.sample_size} 只成分</div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="market-quotes">
        <Panel title="行情" hint={`${rows.length} / ${stocks.length} 只`}>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索代码或公司"
            aria-label="搜索股票"
            style={{
              height: 30,
              width: "100%",
              padding: "0 var(--atlas-2)",
              background: "var(--atlas-plate-2)",
              border: "1px solid var(--atlas-line-strong)",
              borderRadius: "var(--atlas-r-md)",
              color: "var(--atlas-n-950)",
              fontFamily: "var(--atlas-font)",
              fontSize: "var(--atlas-t-small)",
            }}
          />
          <div className="atlas-scroll" style={{ maxHeight: 420, overflowY: "auto" }}>
            {loading ? <div style={{ color: "var(--atlas-n-700)", fontSize: "var(--atlas-t-small)" }}>读取行情…</div> : null}
            {!loading && rows.length === 0 ? <EmptyState title="没有匹配的股票" /> : null}
            {rows.map((row) => {
              const active = row.ticker === selected;
              return (
                <button
                  key={row.ticker}
                  type="button"
                  onClick={() => onSelect(String(row.ticker))}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 2,
                    width: "100%",
                    textAlign: "left",
                    cursor: "pointer",
                    background: active ? "var(--atlas-plate-2)" : "transparent",
                    border: "none",
                    borderLeft: `2px solid ${active ? "var(--atlas-signal)" : "transparent"}`,
                    borderBottom: "1px solid var(--atlas-line)",
                    padding: "6px 8px",
                    fontFamily: "var(--atlas-font)",
                    color: "var(--atlas-n-900)",
                  }}
                >
                  <span>
                    <span style={{ color: "var(--atlas-n-950)" }}>{row.ticker}</span>
                    <span style={{ display: "block", fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-600)" }}>
                      {row.company || row.exchange_code}
                    </span>
                  </span>
                  <span style={{ textAlign: "right" }}>
                    <Money value={row.last_price} />
                    <span
                      className="atlas-tabular"
                      style={{ display: "block", fontSize: "var(--atlas-t-micro)", color: toneOfChange(row.change_pct) }}
                    >
                      {formatPct(row.change_pct)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </Panel>

        <div style={{ display: "grid", gap: "var(--atlas-3)", minWidth: 0 }}>
          {!selected || !detail ? (
            <Panel title="盘口">
              <EmptyState title={selected ? "读取盘口…" : "选择一只股票"} hint="从左侧行情列表中选择标的。" />
            </Panel>
          ) : (
            <>
              <Panel
                title={`${detail.ticker} · ${detail.company || ""}`}
                hint={`主场地 ${detail.exchange_code ?? "—"} · ${detail.settlement_mode?.toUpperCase() ?? ""}`}
                actions={
                  <>
                    {detail.status !== "listed" ? <Badge tone="warn">{detail.status}</Badge> : null}
                    {auctionOpen ? <Badge tone="signal">集合竞价</Badge> : null}
                    {openOrders > 0 ? <Badge tone="signal">我的挂单 {openOrders}</Badge> : null}
                  </>
                }
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: "var(--atlas-3)", flexWrap: "wrap" }}>
                  <Money value={detail.last_price} size="var(--atlas-t-h1)" />
                  <span className="atlas-tabular" style={{ color: toneOfChange(detail.change_pct), fontSize: "var(--atlas-t-body)" }}>
                    {formatPct(detail.change_pct)}
                  </span>
                  <span style={{ color: "var(--atlas-n-700)", fontSize: "var(--atlas-t-micro)" }}>
                    前收 {formatAmount(detail.prev_close)} · 总股本 {formatAmount(detail.total_shares)} · 流通 {formatAmount(detail.free_float)}
                  </span>
                  {halted ? <Badge tone="danger">熔断中</Badge> : null}
                </div>
                {halted ? (
                  <div style={{ color: "var(--atlas-warn)", fontSize: "var(--atlas-t-small)" }}>
                    {detail.halt_reason || "价格异动"} · 恢复时间 {String(detail.halted_until).slice(0, 16).replace("T", " ")}；市价单已禁用。
                  </div>
                ) : null}
                {auctionOpen ? (
                  <div style={{ color: "var(--atlas-signal)", fontSize: "var(--atlas-t-small)" }}>
                    首日集合竞价 · 窗口截止 {String(detail.auction_ends_at).slice(0, 16).replace("T", " ")}；期间只收限价单、不撮合，结束后统一按单一价成交。
                  </div>
                ) : null}

                <div style={{ display: "flex", gap: "var(--atlas-1)", flexWrap: "wrap" }}>
                  {INTERVALS.map((option) => (
                    <Button key={option} size="sm" variant={option === span ? "secondary" : "ghost"} onClick={() => setSpan(option)}>
                      {option}
                    </Button>
                  ))}
                  <Button size="sm" variant="ghost" onClick={() => void loadCandles()}>刷新 K 线</Button>
                </div>
                {candlesError ? <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-small)" }}>{candlesError}</div> : null}
                {candlesLoading ? (
                  <div style={{ color: "var(--atlas-n-700)", fontSize: "var(--atlas-t-small)" }}>读取 K 线…</div>
                ) : (
                  <CandleChart candles={candles} intervalLabel={span} />
                )}
              </Panel>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "var(--atlas-3)" }}>
                <Panel title="五档盘口" hint="价格 / 数量">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--atlas-1)" }}>
                    {askLevels.slice().reverse().map((level, index) => (
                      <React.Fragment key={`ask-${index}-${level.price}`}>
                        <span className="atlas-tabular" style={{ color: DOWN }}>{level.price}</span>
                        <span className="atlas-tabular" style={{ textAlign: "right", color: "var(--atlas-n-800)" }}>{level.quantity}</span>
                      </React.Fragment>
                    ))}
                    {bidLevels.map((level, index) => (
                      <React.Fragment key={`bid-${index}-${level.price}`}>
                        <span className="atlas-tabular" style={{ color: UP }}>{level.price}</span>
                        <span className="atlas-tabular" style={{ textAlign: "right", color: "var(--atlas-n-800)" }}>{level.quantity}</span>
                      </React.Fragment>
                    ))}
                  </div>
                  {askLevels.length === 0 && bidLevels.length === 0 ? <EmptyState title="暂无挂单" /> : null}
                  {quoteError ? <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-micro)" }}>{quoteError}</div> : null}
                  {quote ? (
                    <div className="atlas-tabular" style={{ color: "var(--atlas-n-700)", fontSize: "var(--atlas-t-micro)" }}>
                      买一 {quote.bid} · 卖一 {quote.ask} · 点差 {quote.spread_bps}bp
                    </div>
                  ) : null}
                </Panel>

                <Panel title="最近成交" hint={`${trades.length} 笔`}>
                  {trades.length === 0 ? (
                    <EmptyState title="暂无成交" />
                  ) : (
                    <div className="atlas-scroll" style={{ maxHeight: 180, overflowY: "auto", display: "grid", gap: 2 }}>
                      {trades.slice(0, 20).map((trade, index) => (
                        <div key={`trade-${index}`} style={{ display: "flex", gap: "var(--atlas-2)", fontSize: "var(--atlas-t-small)" }}>
                          <span className="atlas-tabular" style={{ color: "var(--atlas-n-950)" }}>{trade.price}</span>
                          <span className="atlas-tabular" style={{ color: "var(--atlas-n-700)" }}>{trade.quantity}</span>
                          <span className="atlas-tabular" style={{ marginLeft: "auto", color: "var(--atlas-n-600)", fontSize: "var(--atlas-t-micro)" }}>
                            {String(trade.executed_at ?? "").slice(11, 19)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>
              </div>
            </>
          )}
        </div>

        <div className="market-ticket">
          {selected && detail ? (
            <OrderTicket
              ticker={selected}
              detail={detail}
              quote={quote}
              portfolio={portfolio}
              onDone={() => {
                onSelect(selected);
                onChanged();
              }}
            />
          ) : (
            <Panel title="下单">
              <EmptyState title="先选择标的" />
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuotesTab;

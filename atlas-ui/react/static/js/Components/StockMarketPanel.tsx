// atlas-ui/react/static/js/Components/StockMarketPanel.tsx
// Cosmic stock exchange: order book, candles and portfolio (05 §8).
// Prices follow the domestic convention: up = red, down = green.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ServerApi } from "../Utils/ServerApi.tsx";

interface StockRow {
  ticker: string;
  name?: string;
  last_price: string;
  prev_close: string;
  change_pct?: string;
  free_float: number;
}

interface Level {
  price: string;
  quantity: number;
}

interface Candle {
  t: string;
  o: string;
  h: string;
  l: string;
  c: string;
  v: number;
}

interface Holding {
  ticker: string;
  shares: number;
  avg_cost: string;
  last_price?: string;
  market_value?: string;
  unrealized_pnl?: string;
}

interface IndexRow {
  code: string;
  name: string;
  value: string;
  change_pct: string;
}

type Tab = "book" | "chart" | "portfolio";

const INTERVALS = ["1m", "5m", "15m", "1h", "1d"] as const;
const UP = "#f87171"; // 涨 = 红
const DOWN = "#4ade80"; // 跌 = 绿

const num = (value: string | number | undefined): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const money = (value: string | number | undefined): string => {
  const parsed = num(value);
  if (!parsed) return "0";
  if (Math.abs(parsed) >= 1_000_000) return `${(parsed / 1_000_000).toFixed(2)}M`;
  if (Math.abs(parsed) >= 1_000) return `${(parsed / 1_000).toFixed(2)}K`;
  return parsed.toFixed(4).replace(/\.?0+$/, "");
};

const changeColor = (pct: number): string => (pct >= 0 ? UP : DOWN);

/** Pure SVG candlestick chart: no chart library, no canvas, prints anywhere. */
const CandleChart: React.FC<{ candles: Candle[] }> = ({ candles }) => {
  const geometry = useMemo(() => {
    if (!candles.length) return null;
    const highs = candles.map((bar) => num(bar.h));
    const lows = candles.map((bar) => num(bar.l));
    const max = Math.max(...highs);
    const min = Math.min(...lows);
    const span = max - min || max * 0.02 || 1;
    const width = 640;
    const height = 240;
    const slot = width / candles.length;
    const bodyWidth = Math.max(1.5, slot * 0.6);
    const y = (price: number): number => height - ((price - min) / span) * (height - 16) - 8;
    const bars = candles.map((bar, index) => {
      const open = num(bar.o);
      const close = num(bar.c);
      const high = num(bar.h);
      const low = num(bar.l);
      const x = index * slot + slot / 2;
      const top = y(Math.max(open, close));
      const bottom = y(Math.min(open, close));
      return {
        key: `${bar.t}-${index}`,
        x,
        top,
        bottom: Math.max(bottom, top + 1),
        high: y(high),
        low: y(low),
        color: close >= open ? UP : DOWN,
        bodyWidth,
      };
    });
    return { width, height, bars, max, min };
  }, [candles]);

  if (!geometry) {
    return <div className="text-xs text-gray-500 py-10 text-center">暂无成交，等待第一笔撮合</div>;
  }

  return (
    <div className="space-y-1">
      <svg viewBox={`0 0 ${geometry.width} ${geometry.height}`} className="w-full h-56">
        <rect x={0} y={0} width={geometry.width} height={geometry.height} fill="transparent" />
        {geometry.bars.map((bar) => (
          <g key={bar.key}>
            <line x1={bar.x} y1={bar.high} x2={bar.x} y2={bar.low} stroke={bar.color} strokeWidth={1} />
            <rect
              x={bar.x - bar.bodyWidth / 2}
              y={bar.top}
              width={bar.bodyWidth}
              height={bar.bottom - bar.top}
              fill={bar.color}
            />
          </g>
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-gray-500">
        <span>低 {money(geometry.min)}</span>
        <span>高 {money(geometry.max)}</span>
        <span>{candles.length} 根</span>
      </div>
    </div>
  );
};

const StockMarketPanel: React.FC = () => {
  const [tab, setTab] = useState<Tab>("book");
  const [stocks, setStocks] = useState<StockRow[]>([]);
  const [ticker, setTicker] = useState<string>("");
  const [detail, setDetail] = useState<any>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [interval, setInterval_] = useState<(typeof INTERVALS)[number]>("1m");
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [indices, setIndices] = useState<IndexRow[]>([]);
  const [message, setMessage] = useState<string>("");

  const loadStocks = useCallback(async () => {
    try {
      const data = await ServerApi.request("/api/v1/stocks");
      const rows: StockRow[] = data?.stocks || data?.listings || [];
      setStocks(rows);
      if (!ticker && rows.length) setTicker(rows[0].ticker);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "读取行情失败");
    }
  }, [ticker]);

  const loadIndices = useCallback(async () => {
    try {
      const data = await ServerApi.request("/api/v1/market/indices");
      setIndices(data?.indices || []);
    } catch {
      // the index is decorative; never block the panel on it
    }
  }, []);

  const loadDetail = useCallback(async (symbol: string) => {
    if (!symbol) return;
    try {
      setDetail(await ServerApi.request(`/api/v1/stocks/${encodeURIComponent(symbol)}`));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "读取盘口失败");
    }
  }, []);

  const loadCandles = useCallback(async (symbol: string, span: string) => {
    if (!symbol) return;
    try {
      const data = await ServerApi.request(
        `/api/v1/stocks/${encodeURIComponent(symbol)}/candles?interval=${span}&limit=120`,
      );
      setCandles(data?.candles || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "读取 K 线失败");
    }
  }, []);

  const loadPortfolio = useCallback(async () => {
    try {
      const data = await ServerApi.request("/api/v1/stocks/portfolio");
      setHoldings(data?.holdings || data?.positions || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "读取持仓失败");
    }
  }, []);

  useEffect(() => {
    void loadStocks();
    void loadIndices();
  }, [loadStocks, loadIndices]);

  useEffect(() => {
    void loadDetail(ticker);
    void loadCandles(ticker, interval);
    void loadPortfolio();
  }, [ticker, interval, loadDetail, loadCandles, loadPortfolio]);

  const selected = stocks.find((row) => row.ticker === ticker);
  const bids: Level[] = detail?.order_book?.bids || [];
  const asks: Level[] = detail?.order_book?.asks || [];
  const trades = detail?.recent_trades || [];

  const renderBook = () => (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
        <div className="mb-2 flex items-center justify-between text-[11px] text-gray-400">
          <span>卖盘</span>
          <span>价格 / 数量</span>
        </div>
        <div className="space-y-1 font-mono text-[11px]">
          {asks.length ? (
            asks.slice(0, 8).reverse().map((level) => (
              <div key={`ask-${level.price}`} className="flex justify-between">
                <span style={{ color: DOWN }}>{level.price}</span>
                <span className="text-gray-400">{level.quantity}</span>
              </div>
            ))
          ) : (
            <div className="text-gray-600">无卖单</div>
          )}
        </div>
      </div>
      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
        <div className="mb-2 flex items-center justify-between text-[11px] text-gray-400">
          <span>买盘</span>
          <span>价格 / 数量</span>
        </div>
        <div className="space-y-1 font-mono text-[11px]">
          {bids.length ? (
            bids.slice(0, 8).map((level) => (
              <div key={`bid-${level.price}`} className="flex justify-between">
                <span style={{ color: UP }}>{level.price}</span>
                <span className="text-gray-400">{level.quantity}</span>
              </div>
            ))
          ) : (
            <div className="text-gray-600">无买单</div>
          )}
        </div>
      </div>
      <div className="md:col-span-2 rounded-lg border border-white/10 bg-black/20 p-3">
        <div className="mb-2 text-[11px] text-gray-400">最近成交</div>
        <div className="space-y-1 font-mono text-[11px]">
          {trades.length ? (
            trades.slice(0, 6).map((trade: any, index: number) => (
              <div key={`trade-${index}`} className="flex justify-between">
                <span className="text-gray-200">{trade.price}</span>
                <span className="text-gray-500">{trade.quantity}</span>
                <span className="text-gray-600">{String(trade.executed_at || "").slice(11, 19)}</span>
              </div>
            ))
          ) : (
            <div className="text-gray-600">暂无成交</div>
          )}
        </div>
      </div>
    </div>
  );

  const renderChart = () => (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {INTERVALS.map((span) => (
          <button
            key={span}
            onClick={() => setInterval_(span)}
            className={`rounded px-2 py-1 text-[11px] ${
              span === interval
                ? "bg-indigo-500/30 text-indigo-100"
                : "bg-white/5 text-gray-400 hover:bg-white/10"
            }`}
          >
            {span}
          </button>
        ))}
      </div>
      <CandleChart candles={candles} />
    </div>
  );

  const renderPortfolio = () => (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      {holdings.length ? (
        <table className="w-full text-[11px]">
          <thead className="text-gray-400">
            <tr>
              <th className="text-left font-normal">标的</th>
              <th className="text-right font-normal">数量</th>
              <th className="text-right font-normal">成本</th>
              <th className="text-right font-normal">现价</th>
              <th className="text-right font-normal">浮动盈亏</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {holdings.map((row) => {
              const pnl = num(row.unrealized_pnl);
              return (
                <tr key={row.ticker} className="border-t border-white/5">
                  <td className="py-1 text-gray-200">{row.ticker}</td>
                  <td className="py-1 text-right text-gray-300">{row.shares}</td>
                  <td className="py-1 text-right text-gray-400">{row.avg_cost}</td>
                  <td className="py-1 text-right text-gray-300">{row.last_price || "-"}</td>
                  <td className="py-1 text-right" style={{ color: changeColor(pnl) }}>
                    {row.unrealized_pnl || "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div className="py-6 text-center text-xs text-gray-500">尚无持仓</div>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {indices.map((row) => (
          <div key={row.code} className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2">
            <div className="text-[10px] text-gray-400">{row.name}</div>
            <div className="font-mono text-sm text-white">
              {num(row.value).toFixed(2)}{" "}
              <span style={{ color: changeColor(num(row.change_pct)) }}>
                {num(row.change_pct) >= 0 ? "+" : ""}
                {num(row.change_pct).toFixed(2)}%
              </span>
            </div>
          </div>
        ))}
        <select
          value={ticker}
          onChange={(event) => setTicker(event.target.value)}
          className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-gray-200"
        >
          {stocks.length ? (
            stocks.map((row) => (
              <option key={row.ticker} value={row.ticker}>
                {row.ticker} · {row.last_price}
              </option>
            ))
          ) : (
            <option value="">暂无上市股票</option>
          )}
        </select>
        {selected && (
          <div className="font-mono text-sm">
            <span className="text-white">{selected.last_price}</span>{" "}
            <span style={{ color: changeColor(num(selected.change_pct)) }}>
              {selected.change_pct ? `${selected.change_pct}%` : ""}
            </span>
          </div>
        )}
      </div>

      <div className="flex gap-1">
        {(
          [
            ["book", "盘口"],
            ["chart", "K 线"],
            ["portfolio", "持仓"],
          ] as Array<[Tab, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`rounded px-3 py-1 text-xs ${
              tab === id ? "bg-indigo-500/30 text-indigo-100" : "bg-white/5 text-gray-400 hover:bg-white/10"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "book" && renderBook()}
      {tab === "chart" && renderChart()}
      {tab === "portfolio" && renderPortfolio()}

      {message && <div className="text-[11px] text-amber-300">{message}</div>}
    </div>
  );
};

export default StockMarketPanel;

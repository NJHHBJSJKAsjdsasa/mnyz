// panels/MarketPanel.tsx — the market panel registry (06 §2, T-67b).
//
// One owner for the data every sub-tab needs (listings, indices, portfolio,
// orders, exchanges) and one owner for the selected listing's detail. Sub-tabs
// receive values and callbacks; they never re-fetch the core slice themselves.
//
// Writes are intentionally not centralised here: `OrdersTab`, `MarginTab`, etc.
// own their forms and use `_shared/useWrite`, so a tab can be moved to another
// file without dragging a provider along.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Panel, Tabs, toast } from "../ui/index.ts";
import {
  fetchExchanges,
  fetchIndices,
  fetchOrders,
  fetchPortfolio,
  fetchStock,
  fetchStocks,
} from "../ui/api.ts";
import { messageOf } from "./_shared/errors.ts";
import Notice from "./_shared/Notice.tsx";
import OrdersTab from "./Market/OrdersTab.tsx";
import PortfolioTab from "./Market/PortfolioTab.tsx";
import IndicesTab from "./Market/IndicesTab.tsx";
import MarginTab from "./Market/MarginTab.tsx";
import IpoTab from "./Market/IpoTab.tsx";
import MmTab from "./Market/MmTab.tsx";
import VenuesTab from "./Market/VenuesTab.tsx";
import ActionsTab from "./Market/ActionsTab.tsx";
import BrokersTab from "./Market/BrokersTab.tsx";
import QuotesTab from "./Market/QuotesTab.tsx";

const PAGE = 100;

type TabId =
  | "quotes"
  | "orders"
  | "portfolio"
  | "margin"
  | "ipo"
  | "mm"
  | "venues"
  | "actions"
  | "indices"
  | "brokers";

export const MarketPanel: React.FC = () => {
  const [tab, setTab] = useState<TabId>("quotes");
  const [stocks, setStocks] = useState<any[]>([]);
  const [indices, setIndices] = useState<any[]>([]);
  const [portfolio, setPortfolio] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [exchanges, setExchanges] = useState<any[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCore = useCallback(async () => {
    setLoading(true);
    const [stockResult, indexResult, portfolioResult, orderResult, exchangeResult] = await Promise.allSettled([
      fetchStocks({ limit: PAGE }),
      fetchIndices(),
      fetchPortfolio(),
      fetchOrders(),
      fetchExchanges(),
    ]);

    const failures: string[] = [];

    if (stockResult.status === "fulfilled") {
      setStocks(stockResult.value?.stocks ?? []);
      setCursor(stockResult.value?.next_cursor ?? null);
      setHasMore(Boolean(stockResult.value?.has_more));
    } else {
      failures.push(`行情：${messageOf(stockResult.reason)}`);
    }
    if (indexResult.status === "fulfilled") {
      setIndices(indexResult.value?.indices ?? []);
    } else {
      failures.push(`指数：${messageOf(indexResult.reason)}`);
    }
    if (portfolioResult.status === "fulfilled") {
      setPortfolio(portfolioResult.value ?? null);
    } else {
      failures.push(`持仓：${messageOf(portfolioResult.reason)}`);
    }
    if (orderResult.status === "fulfilled") {
      setOrders(orderResult.value?.orders ?? []);
    } else {
      failures.push(`委托：${messageOf(orderResult.reason)}`);
    }
    if (exchangeResult.status === "fulfilled") {
      setExchanges(exchangeResult.value?.exchanges ?? []);
    } else {
      failures.push(`交易所：${messageOf(exchangeResult.reason)}`);
    }

    setError(failures.length ? failures.join(" · ") : null);
    setLoading(false);
  }, []);

  const openStock = useCallback(async (ticker: string) => {
    const symbol = ticker.trim().toUpperCase();
    if (!symbol) return;
    setSelected(symbol);
    setDetailLoading(true);
    try {
      setDetail(await fetchStock(symbol));
      setError(null);
    } catch (raw) {
      setDetail(null);
      setError(messageOf(raw));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const refreshDetail = useCallback(() => {
    if (selected) void openStock(selected);
  }, [selected, openStock]);

  const refreshAll = useCallback(async () => {
    await loadCore();
    refreshDetail();
  }, [loadCore, refreshDetail]);

  const loadMore = async () => {
    if (!cursor) return;
    try {
      const page = await fetchStocks({ limit: PAGE, cursor });
      setStocks((prev) => prev.concat(page?.stocks ?? []));
      setCursor(page?.next_cursor ?? null);
      setHasMore(Boolean(page?.has_more));
    } catch (raw) {
      toast(messageOf(raw), "danger");
    }
  };

  useEffect(() => {
    void loadCore();
  }, [loadCore]);

  useEffect(() => {
    if (!selected && stocks.length > 0) void openStock(String(stocks[0].ticker));
    // Only seed once; changing the page must not steal an explicit selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stocks.length]);

  const items = useMemo(
    () => [
      { id: "quotes", label: "行情" },
      { id: "orders", label: "我的委托", badge: orders.length ? String(orders.length) : undefined },
      { id: "portfolio", label: "持仓", badge: portfolio?.positions?.length ? String(portfolio.positions.length) : undefined },
      { id: "margin", label: "融资融券" },
      { id: "ipo", label: "发行" },
      { id: "mm", label: "做市" },
      { id: "venues", label: "交易所" },
      { id: "actions", label: "公司行动" },
      { id: "indices", label: "指数" },
      { id: "brokers", label: "券商与场地" },
    ],
    [orders.length, portfolio],
  );

  return (
    <div style={{ display: "grid", gap: "var(--atlas-3)" }}>
      <Panel
        title="市场"
        hint={`${stocks.length} 只 · ${indices.length} 个指数 · ${exchanges.length} 个交易所${hasMore ? " · 还有更多" : ""}`}
        actions={
          <>
            {hasMore ? (
              <Button size="sm" onClick={() => void loadMore()}>
                加载更多
              </Button>
            ) : null}
            <Button size="sm" onClick={() => void refreshAll()} loading={loading || detailLoading}>
              刷新
            </Button>
          </>
        }
      >
        <Tabs items={items} active={tab} onChange={(id) => setTab(id as TabId)} dense />
        <Notice text={error} />
      </Panel>

      {tab === "quotes" ? (
        <QuotesTab
          stocks={stocks}
          indices={indices}
          selected={selected}
          detail={detail}
          portfolio={portfolio}
          orders={orders}
          loading={loading}
          onSelect={(ticker) => void openStock(ticker)}
          onChanged={() => void loadCore()}
        />
      ) : null}

      {tab === "orders" ? (
        <OrdersTab orders={orders} loading={loading} onChanged={() => void loadCore()} />
      ) : null}

      {tab === "portfolio" ? <PortfolioTab portfolio={portfolio} loading={loading} /> : null}

      {tab === "margin" ? (
        <MarginTab
          stocks={stocks}
          selected={selected}
          onSelect={(ticker) => void openStock(ticker)}
          onChanged={() => void loadCore()}
        />
      ) : null}

      {tab === "ipo" ? <IpoTab exchanges={exchanges} onChanged={() => void loadCore()} /> : null}

      {tab === "mm" ? (
        <MmTab
          stocks={stocks}
          selected={selected}
          onSelect={(ticker) => void openStock(ticker)}
          onChanged={() => void loadCore()}
        />
      ) : null}

      {tab === "venues" ? <VenuesTab exchanges={exchanges} onChanged={() => void loadCore()} /> : null}

      {tab === "actions" ? (
        <ActionsTab
          stocks={stocks}
          selected={selected}
          detail={detail}
          portfolio={portfolio}
          orders={orders}
          onSelect={(ticker) => void openStock(ticker)}
          onRefreshDetail={refreshDetail}
          onRefreshCore={() => void loadCore()}
        />
      ) : null}

      {tab === "indices" ? <IndicesTab indices={indices} loading={loading} /> : null}

      {tab === "brokers" ? (
        <BrokersTab
          stocks={stocks}
          exchanges={exchanges}
          selected={selected}
          onSelect={(ticker) => void openStock(ticker)}
          onChanged={() => void loadCore()}
        />
      ) : null}

      {detailLoading ? (
        <div style={{ color: "var(--atlas-n-700)", fontSize: "var(--atlas-t-micro)" }}>读取盘口…</div>
      ) : null}
    </div>
  );
};

export default MarketPanel;

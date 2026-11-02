// panels/Market/BrokersTab.tsx — the three roles must stay separate (06 §2.7):
// firm (a licensed securities company), membership (firm admitted to a venue),
// client account (a player trading through that firm), and listing venues
// (where one ticker is quoted).
//
// "No firm" is not an error: `GET /brokers/me` returns 403 until the player
// registers one, so the tab renders the registration form instead of a red box.

import React, { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Button,
  EmptyState,
  Money,
  NumberInput,
  Panel,
  Select,
  Table,
} from "../../ui/index.ts";
import {
  addListingVenue,
  closeBrokerAccount,
  fetchBrokerAccount,
  fetchBrokerBook,
  fetchStockVenues,
  joinBrokerMembership,
  openBrokerAccount,
  registerBrokerFirm,
  removeListingVenue,
} from "../../ui/api.ts";
import { useWrite } from "../_shared/useWrite.ts";
import { messageOf } from "../_shared/errors.ts";

export interface BrokersTabProps {
  stocks: any[];
  exchanges: any[];
  selected: string | null;
  onSelect: (ticker: string) => void;
  onChanged: () => void;
}

export const BrokersTab: React.FC<BrokersTabProps> = ({ stocks, exchanges, selected, onSelect, onChanged }) => {
  const [ticker, setTicker] = useState(selected ?? stocks[0]?.ticker ?? "");
  const [account, setAccount] = useState<any>(null);
  const [book, setBook] = useState<any>(null);
  const [venues, setVenues] = useState<any[]>([]);
  const [bookError, setBookError] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [capital, setCapital] = useState("0");
  const [memberExchange, setMemberExchange] = useState("");
  const [memberBps, setMemberBps] = useState("5");
  const [brokerCode, setBrokerCode] = useState("");
  const [accountBps, setAccountBps] = useState("");
  const [venueExchange, setVenueExchange] = useState("");
  const [venueFee, setVenueFee] = useState("");

  useEffect(() => {
    if (selected) setTicker(selected);
  }, [selected]);

  const reload = useCallback(async () => {
    setLoading(true);
    const [accountResult, bookResult, venueResult] = await Promise.allSettled([
      fetchBrokerAccount(),
      fetchBrokerBook(),
      ticker ? fetchStockVenues(ticker) : Promise.resolve({ venues: [] }),
    ]);
    setAccount(accountResult.status === "fulfilled" ? accountResult.value?.account ?? null : null);
    if (bookResult.status === "fulfilled") {
      setBook(bookResult.value);
      setBookError(null);
    } else {
      // 403 = not a licensed firm yet; anything else is a real read failure.
      setBook(null);
      setBookError(messageOf(bookResult.reason));
    }
    setVenues(venueResult.status === "fulfilled" ? venueResult.value?.venues ?? [] : []);
    setReadError(
      accountResult.status === "rejected"
        ? messageOf(accountResult.reason)
        : venueResult.status === "rejected"
          ? messageOf(venueResult.reason)
          : null,
    );
    setLoading(false);
  }, [ticker]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const write = useWrite(async () => {
    await reload();
    onChanged();
  });

  const exchangeOptions = exchanges
    .filter((row) => row.status === "active")
    .map((row) => ({ value: String(row.code), label: `${row.code} · ${row.name}` }));
  const tickerOptions = stocks.map((row) => ({ value: String(row.ticker), label: `${row.ticker} · ${row.company ?? ""}` }));
  const listing = stocks.find((row) => row.ticker === ticker);
  const primaryExchange = listing?.exchange_code ? String(listing.exchange_code) : null;
  const activeExchanges = exchangeOptions.map((row) => row.value);
  const memberships: any[] = book?.memberships ?? [];
  const recentCommissions: any[] = book?.recent_commissions ?? [];

  return (
    <div style={{ display: "grid", gap: "var(--atlas-3)" }}>
      <Panel
        title="券商与场地"
        hint="券商牌照 / 会籍 / 经纪账户 / 挂牌场地"
        actions={<Button size="sm" onClick={() => void reload()}>刷新</Button>}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--atlas-2)", fontSize: "var(--atlas-t-small)", color: "var(--atlas-n-800)" }}>
          <span><b>券商</b>：持牌证券公司（2,000 cc4 牌照费）。</span>
          <span><b>会籍</b>：券商加入某交易所（每所 500）。</span>
          <span><b>经纪账户</b>：玩家委托某券商交易，佣金叠加在交易所费之上。</span>
          <span><b>挂牌场地</b>：某只票在哪个交易所报价，各有费率。</span>
        </div>
        {readError ? <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-small)" }}>{readError}</div> : null}
        {write.error ? <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-small)" }}>{write.error}</div> : null}
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "var(--atlas-3)" }}>
        <Panel title="我的券商" hint={book?.firm ? `状态 ${book.firm.status}` : "未持牌"}>
          {book?.firm ? (
            <div style={{ display: "grid", gap: "var(--atlas-2)" }}>
              <div style={{ display: "flex", gap: "var(--atlas-3)", flexWrap: "wrap", fontSize: "var(--atlas-t-small)" }}>
                <span>资本 <Money value={book.firm.capital} currency="cc4" /></span>
                <span>客户 <span className="atlas-tabular">{book.clients?.length ?? 0}</span></span>
                <span>会籍 <span className="atlas-tabular">{book.memberships?.length ?? 0}</span></span>
              </div>
              <Table
                ariaLabel="券商会籍"
                rows={memberships}
                rowKey={(row) => String(row.membership_id)}
                empty={<EmptyState title="还没有会籍" hint="在下方加入一个交易所。" />}
                columns={[
                  { key: "exchange", header: "交易所", width: 100, render: (row) => row.exchange },
                  { key: "name", header: "名称", width: 160, render: (row) => row.exchange_name },
                  { key: "bps", header: "佣金上限", width: 100, align: "right", render: (row) => <span className="atlas-tabular">{row.commission_bps}bp</span> },
                  { key: "status", header: "状态", width: 90, render: (row) => <Badge tone={row.status === "active" ? "down" : "warn"}>{row.status}</Badge> },
                ]}
              />
            </div>
          ) : (
            <>
              <div style={{ color: "var(--atlas-n-700)", fontSize: "var(--atlas-t-small)", marginBottom: "var(--atlas-2)" }}>
                {bookError ? `读取券商信息失败：${bookError}` : "你还没有证券公司牌照。"}
              </div>
              <div style={{ display: "flex", gap: "var(--atlas-2)", alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>注册资本 cc4</div>
                  <NumberInput value={capital} onChange={setCapital} min={0} decimals={4} step={1000} />
                </div>
                <Button
                  variant="primary"
                  loading={write.busy}
                  onClick={() => void write.run(() => registerBrokerFirm(capital), "券商牌照已取得")}
                >
                  申请牌照
                </Button>
              </div>
            </>
          )}
        </Panel>

        <Panel title="我的经纪账户" hint={account ? `佣金 ${account.commission_bps}bp` : "未开户"}>
          {account ? (
            <div style={{ display: "grid", gap: "var(--atlas-2)", fontSize: "var(--atlas-t-small)" }}>
              <span>券商 <span className="atlas-tabular">{account.broker}</span></span>
              <span>佣金 <span className="atlas-tabular">{account.commission_bps}bp</span></span>
              <span>状态 <Badge tone={account.status === "active" ? "down" : "neutral"}>{account.status}</Badge></span>
              <div>
                <Button
                  loading={write.busy}
                  onClick={() => void write.run(() => closeBrokerAccount(), "经纪账户已关闭")}
                >
                  关闭账户
                </Button>
              </div>
              <div style={{ color: "var(--atlas-n-600)", fontSize: "var(--atlas-t-micro)" }}>
                关闭后成交不再收券商佣金；持仓仍记在你自己名下。
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gap: "var(--atlas-2)" }}>
              <div>
                <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>券商代码或 actor id</div>
                <input
                  value={brokerCode}
                  onChange={(event) => setBrokerCode(event.target.value)}
                  placeholder="ACME_FIRM"
                  style={{
                    width: "100%",
                    height: 32,
                    padding: "0 var(--atlas-2)",
                    background: "var(--atlas-plate-2)",
                    border: "1px solid var(--atlas-line-strong)",
                    borderRadius: "var(--atlas-r-md)",
                    color: "var(--atlas-n-950)",
                    fontFamily: "var(--atlas-mono)",
                  }}
                />
              </div>
              <div>
                <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>约定佣金 bp（留空 = 券商上限）</div>
                <NumberInput value={accountBps} onChange={setAccountBps} min={0} max={100} placeholder="券商上限" />
              </div>
              <Button
                variant="primary"
                loading={write.busy}
                disabled={!brokerCode.trim()}
                onClick={() =>
                  void write.run(
                    () => openBrokerAccount(brokerCode.trim(), accountBps === "" ? null : Math.floor(Number(accountBps))),
                    "经纪账户已开立",
                  )
                }
              >
                开立账户
              </Button>
              <div style={{ color: "var(--atlas-n-600)", fontSize: "var(--atlas-t-micro)" }}>
                每个玩家只能有一个生效账户；佣金不得超过券商在该交易所的会籍上限。
              </div>
            </div>
          )}
        </Panel>
      </div>

      <Panel title="加入交易所会籍" hint="需先持牌">
        <div style={{ display: "flex", gap: "var(--atlas-2)", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ minWidth: 220 }}>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>交易所</div>
            <Select
              value={memberExchange}
              onChange={(event) => setMemberExchange(event.target.value)}
              options={[{ value: "", label: "选择交易所" }, ...exchangeOptions]}
            />
          </div>
          <div style={{ width: 150 }}>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>佣金 bp</div>
            <NumberInput value={memberBps} onChange={setMemberBps} min={0} max={100} />
          </div>
          <Button
            loading={write.busy}
            disabled={!book?.firm || !memberExchange}
            onClick={() =>
              void write.run(() => joinBrokerMembership(memberExchange, Math.floor(Number(memberBps) || 5)), "会籍已加入")
            }
          >
            加入会籍
          </Button>
          {!book?.firm ? <span style={{ color: "var(--atlas-n-600)", fontSize: "var(--atlas-t-micro)" }}>先取得券商牌照。</span> : null}
        </div>
      </Panel>

      <Panel title="挂牌场地" hint={`${ticker || "—"} · ${venues.length} 个`}>
        <div style={{ display: "flex", gap: "var(--atlas-2)", alignItems: "flex-end", flexWrap: "wrap", marginBottom: "var(--atlas-2)" }}>
          <div style={{ minWidth: 200 }}>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>标的</div>
            <Select
              value={ticker}
              onChange={(event) => {
                setTicker(event.target.value);
                onSelect(event.target.value);
              }}
              options={tickerOptions.length ? tickerOptions : [{ value: "", label: "暂无上市股票" }]}
            />
          </div>
          <div style={{ color: "var(--atlas-n-600)", fontSize: "var(--atlas-t-micro)", paddingBottom: 8 }}>
            主挂牌 {primaryExchange ?? "—"} · 撤牌只暂停该场地，不强制平仓。
          </div>
        </div>

        <Table
          ariaLabel="挂牌场地"
          loading={loading}
          rows={venues}
          rowKey={(row) => String(row.exchange)}
          empty={<EmptyState title="没有挂牌场地" />}
          columns={[
            { key: "exchange", header: "交易所", width: 100, render: (row) => <span style={{ color: "var(--atlas-n-950)" }}>{row.exchange}</span> },
            { key: "name", header: "名称", width: 160, render: (row) => row.exchange_name },
            { key: "kind", header: "类型", width: 90, render: (row) => <Badge tone={row.kind === "official" ? "signal" : "neutral"}>{row.kind}</Badge> },
            { key: "fee", header: "费率", width: 80, align: "right", render: (row) => <span className="atlas-tabular">{row.fee_bps}bp</span> },
            { key: "bid", header: "买一", width: 110, align: "right", render: (row) => (row.best_bid == null ? "—" : <Money value={row.best_bid} muted />) },
            { key: "ask", header: "卖一", width: 110, align: "right", render: (row) => (row.best_ask == null ? "—" : <Money value={row.best_ask} muted />) },
            { key: "status", header: "状态", width: 90, render: (row) => <Badge tone={row.status === "active" ? "down" : "warn"}>{row.status}</Badge> },
            {
              key: "action",
              header: "操作",
              width: 110,
              align: "right",
              render: (row) =>
                row.exchange === primaryExchange ? (
                  <span style={{ color: "var(--atlas-n-600)", fontSize: "var(--atlas-t-micro)" }}>主所不可撤</span>
                ) : (
                  <Button
                    size="sm"
                    loading={write.busy}
                    onClick={() =>
                      void write.run(() => removeListingVenue(ticker, String(row.exchange)), "已暂停该场地挂牌")
                    }
                  >
                    撤牌
                  </Button>
                ),
            },
          ]}
        />

        <div style={{ borderTop: "1px solid var(--atlas-line)", paddingTop: "var(--atlas-2)", display: "flex", gap: "var(--atlas-2)", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ minWidth: 200 }}>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>新增场地</div>
            <Select
              value={venueExchange}
              onChange={(event) => setVenueExchange(event.target.value)}
              options={[
                { value: "", label: "选择交易所" },
                ...exchangeOptions.filter(
                  (row) => !venues.some((venue) => venue.exchange === row.value && venue.status === "active"),
                ),
              ]}
            />
          </div>
          <div style={{ width: 150 }}>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>费率 bp（留空 = 默认）</div>
            <NumberInput value={venueFee} onChange={setVenueFee} min={0} max={100} placeholder="默认" />
          </div>
          <Button
            loading={write.busy}
            disabled={!venueExchange}
            onClick={() =>
              void write.run(
                () =>
                  addListingVenue(ticker, {
                    exchange_code: venueExchange,
                    ...(venueFee === "" ? {} : { fee_bps: Math.floor(Number(venueFee)) }),
                  }),
                "场地已新增",
              )
            }
          >
            新增挂牌
          </Button>
          <span style={{ color: "var(--atlas-n-600)", fontSize: "var(--atlas-t-micro)", paddingBottom: 8 }}>
            仅交易所运营方或运维可引入挂牌。同一只票在不同板的价格可能不同，默认按最优价成交。
          </span>
        </div>
        {activeExchanges.length === 0 ? (
          <div style={{ color: "var(--atlas-warn)", fontSize: "var(--atlas-t-micro)" }}>没有营业中的交易所。</div>
        ) : null}
      </Panel>

      {recentCommissions.length ? (
        <Panel title="最近佣金" hint={`${recentCommissions.length} 笔`}>
          <Table
            ariaLabel="最近佣金"
            rows={recentCommissions}
            rowKey={(row) => String(row.trade_id) + String(row.ticker)}
            columns={[
              { key: "ticker", header: "标的", width: 90, render: (row) => row.ticker },
              { key: "notional", header: "成交额", width: 130, align: "right", render: (row) => <Money value={row.notional} currency={row.currency_code} /> },
              { key: "bps", header: "佣金", width: 90, align: "right", render: (row) => <span className="atlas-tabular">{row.commission_bps}bp</span> },
              { key: "amount", header: "金额", width: 120, align: "right", render: (row) => <Money value={row.amount} currency={row.currency_code} /> },
              {
                key: "at",
                header: "时间",
                width: 150,
                render: (row) => (
                  <span className="atlas-tabular" style={{ color: "var(--atlas-n-700)", fontSize: "var(--atlas-t-micro)" }}>
                    {String(row.at ?? "").slice(0, 16).replace("T", " ")}
                  </span>
                ),
              },
            ]}
          />
        </Panel>
      ) : null}
    </div>
  );
};

export default BrokersTab;

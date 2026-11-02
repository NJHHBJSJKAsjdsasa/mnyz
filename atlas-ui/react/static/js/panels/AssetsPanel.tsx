// panels/AssetsPanel.tsx — everything the player owns (06 §1, T-67c).
//
// The overview reads the shell snapshot for headline numbers and only fetches the
// detail slices it actually shows. No valuation is computed here that the server
// already returns; the property tab lists server appraisals, the debt tab lists
// server outstanding amounts.

import React, { useCallback, useEffect, useState } from "react";
import { Badge, Button, EmptyState, Money, NumberInput, Panel, Select, Table, Tabs } from "../ui/index.ts";
import {
  buildStation,
  claimFleet,
  claimStation,
  fetchAssets,
  recruitFleet,
  fetchBankAccounts,
  fetchLeaderboard,
  fetchLoans,
  fetchMyProperties,
  fetchPortfolio,
  fetchWallet,
  fetchWalletEntries,
  listProperty,
  payPropertyTax,
  repayLoan,
  setFleetTask,
} from "../ui/api.ts";
import { formatAmount, toNumber } from "../ui/Money.tsx";
import { useWrite } from "./_shared/useWrite.ts";
import { messageOf } from "./_shared/errors.ts";
import Notice from "./_shared/Notice.tsx";

export interface AssetsPanelProps {
  snapshot: any;
}

type Tab = "overview" | "currencies" | "holdings" | "properties" | "debts" | "rank";

const TABS = [
  { id: "overview", label: "概览" },
  { id: "currencies", label: "货币" },
  { id: "holdings", label: "持仓" },
  { id: "properties", label: "产权" },
  { id: "debts", label: "负债" },
  { id: "rank", label: "排名" },
];

export const AssetsPanel: React.FC<AssetsPanelProps> = ({ snapshot }) => {
  const [tab, setTab] = useState<Tab>("overview");
  const [wallet, setWallet] = useState<any>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [portfolio, setPortfolio] = useState<any>(null);
  const [property, setProperty] = useState<any>(null);
  const [loans, setLoans] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [assets, setAssets] = useState<any>(null);
  const [leaders, setLeaders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState("");
  const [listPrice, setListPrice] = useState("1000");
  const [listKind, setListKind] = useState<"fixed" | "auction">("fixed");
  const [listDays, setListDays] = useState("30");
  const [repayLoanId, setRepayLoanId] = useState("");
  const [repayAmount, setRepayAmount] = useState("100");
  const [planetKey, setPlanetKey] = useState("");
  const [fleetName, setFleetName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      fetchWallet(),
      fetchWalletEntries(50),
      fetchPortfolio(),
      fetchMyProperties(),
      fetchLoans(),
      fetchBankAccounts(),
      fetchAssets(),
      fetchLeaderboard(),
    ]);
    const names = ["钱包", "流水", "持仓", "产权", "贷款", "银行账户", "空间站/舰队", "排行榜"];
    const failures: string[] = [];
    const value = (index: number) => (results[index].status === "fulfilled" ? (results[index] as PromiseFulfilledResult<any>).value : null);
    if (results[0].status === "fulfilled") setWallet(value(0));
    else failures.push(`${names[0]}：${messageOf(results[0].reason)}`);
    if (results[1].status === "fulfilled") setEntries(value(1)?.entries ?? []);
    else failures.push(`${names[1]}：${messageOf(results[1].reason)}`);
    if (results[2].status === "fulfilled") setPortfolio(value(2));
    else failures.push(`${names[2]}：${messageOf(results[2].reason)}`);
    if (results[3].status === "fulfilled") setProperty(value(3));
    else failures.push(`${names[3]}：${messageOf(results[3].reason)}`);
    if (results[4].status === "fulfilled") setLoans(value(4)?.loans ?? []);
    else failures.push(`${names[4]}：${messageOf(results[4].reason)}`);
    if (results[5].status === "fulfilled") setAccounts(value(5)?.accounts ?? []);
    else failures.push(`${names[5]}：${messageOf(results[5].reason)}`);
    if (results[6].status === "fulfilled") setAssets(value(6));
    else failures.push(`${names[6]}：${messageOf(results[6].reason)}`);
    if (results[7].status === "fulfilled") setLeaders(value(7)?.entries ?? []);
    else failures.push(`${names[7]}：${messageOf(results[7].reason)}`);
    setError(failures.length ? failures.join(" · ") : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const write = useWrite(load);

  const balances: any[] = wallet?.currencies ?? [];
  const positions: any[] = portfolio?.positions ?? [];
  const shorts: any[] = portfolio?.shorts ?? [];
  const myProperties: any[] = property?.properties ?? [];
  const bills: any[] = property?.bills ?? [];
  const stations: any[] = assets?.stations ?? [];
  const fleet: any[] = assets?.fleet ?? [];
  const propertyValue = myProperties.reduce((sum, row) => sum + toNumber(row.appraised_value), 0);
  const debtValue = loans.reduce((sum, row) => sum + toNumber(row.outstanding) + toNumber(row.accrued_interest), 0);
  const debtCurrencies = new Set(loans.map((row) => String(row.currency_code)));
  const debtCurrency = debtCurrencies.size === 1 ? [...debtCurrencies][0] : null;

  const doList = async () => {
    if (!selectedAsset) return;
    await write.run(
      () =>
        listProperty(selectedAsset, {
          price: listPrice,
          kind: listKind,
          days: Math.floor(toNumber(listDays)),
        }),
      "产权已挂牌",
    );
  };

  return (
    <div style={{ display: "grid", gap: "var(--atlas-3)" }}>
      <Panel
        title="资产"
        hint="各币种分别列示，不跨币种相加"
        actions={<Button size="sm" onClick={() => void load()} loading={loading}>刷新</Button>}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: "var(--atlas-4)", flexWrap: "wrap" }}>
          <span>
            <span style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginRight: 6 }}>钱包 Q1 等值</span>
            <Money value={snapshot?.wallet_summary?.total_q1} currency="Q1" size="var(--atlas-t-h1)" />
          </span>
          <span style={{ color: "var(--atlas-n-700)", fontSize: "var(--atlas-t-small)" }}>
            股票市值 <Money value={portfolio?.market_value} currency="cc4" muted /> · 产权估值 <Money value={propertyValue} muted /> · 负债{" "}
            {debtCurrency ? <Money value={debtValue} currency={debtCurrency} muted /> : debtCurrencies.size === 0 ? "—" : "多币种"}
          </span>
        </div>
        <Tabs items={TABS} active={tab} onChange={(id) => setTab(id as Tab)} dense />
        <Notice text={error} />
      </Panel>

      {tab === "overview" ? (
        <div style={{ display: "grid", gap: "var(--atlas-3)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--atlas-3)" }}>
            <Panel title="可用现金"><Money value={snapshot?.wallet_summary?.total_q1} currency="Q1" size="var(--atlas-t-h1)" /></Panel>
            <Panel title="股票市值"><Money value={portfolio?.market_value} currency="cc4" size="var(--atlas-t-h1)" /></Panel>
            <Panel title="产权估值"><Money value={propertyValue} size="var(--atlas-t-h1)" /></Panel>
            <Panel title="负债余额">
              {debtCurrency ? <Money value={debtValue} currency={debtCurrency} size="var(--atlas-t-h1)" /> : "多币种 / —"}
            </Panel>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "var(--atlas-3)" }}>
            <Panel title="空间站" hint={`${stations.length} 座`}>
              <Table
                ariaLabel="空间站"
                loading={loading}
                rows={stations}
                rowKey={(row) => String(row.id)}
                empty={<EmptyState title="还没有空间站" hint="在行星页建造后会出现在这里。" />}
                columns={[
                  { key: "name", header: "位置", width: 180, render: (row) => row.planet_name || row.planet_key },
                  {
                    key: "stored",
                    header: "待领取",
                    width: 160,
                    render: (row) => (
                      <span className="atlas-tabular" style={{ color: "var(--atlas-n-800)" }}>
                        {Object.entries(row.stored ?? {}).map(([code, amount]) => `${code} ${amount}`).join(" · ") || "—"}
                      </span>
                    ),
                  },
                  {
                    key: "action",
                    header: "操作",
                    width: 96,
                    align: "right",
                    render: (row) => (
                      <Button size="sm" loading={write.busy} onClick={() => void write.run(() => claimStation(String(row.id)), "已领取空间站产出")}>
                        领取
                      </Button>
                    ),
                  },
                ]}
              />
            </Panel>

            <Panel title="舰队" hint={`${fleet.length} 支`}>
              <Table
                ariaLabel="舰队"
                loading={loading}
                rows={fleet}
                rowKey={(row) => String(row.id)}
                empty={<EmptyState title="还没有舰队" hint="在资产页招募后会出现在这里。" />}
                columns={[
                  { key: "name", header: "名称", width: 150, render: (row) => row.name },
                  {
                    key: "task",
                    header: "任务",
                    width: 120,
                    render: (row) => (
                      <Select
                        value={row.task}
                        onChange={(event) => void write.run(() => setFleetTask(String(row.id), event.target.value), "舰队任务已更新")}
                        options={[
                          { value: "idle", label: "待命" },
                          { value: "mine", label: "采矿" },
                          { value: "survey", label: "勘探" },
                          { value: "trade", label: "贸易" },
                        ]}
                        aria-label={`${row.name} 任务`}
                      />
                    ),
                  },
                  {
                    key: "stored",
                    header: "待领取",
                    width: 130,
                    render: (row) => (
                      <span className="atlas-tabular" style={{ color: "var(--atlas-n-800)" }}>
                        {Object.entries(row.stored ?? {}).map(([code, amount]) => `${code} ${amount}`).join(" · ") || "—"}
                      </span>
                    ),
                  },
                  {
                    key: "action",
                    header: "操作",
                    width: 96,
                    align: "right",
                    render: (row) => (
                      <Button size="sm" loading={write.busy} onClick={() => void write.run(() => claimFleet(String(row.id)), "已领取舰队产出")}>
                        领取
                      </Button>
                    ),
                  },
                ]}
              />
            </Panel>
          </div>

          <Panel title="建造与招募" hint="空间站上限 3 座 · 舰队上限 3 支">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--atlas-2)" }}>
              <div style={{ display: "flex", gap: "var(--atlas-2)", alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>行星键</div>
                  <input value={planetKey} onChange={(event) => setPlanetKey(event.target.value)} placeholder="planet_..." style={{ width: "100%", height: 32, padding: "0 var(--atlas-2)", background: "var(--atlas-plate-2)", border: "1px solid var(--atlas-line-strong)", borderRadius: "var(--atlas-r-md)", color: "var(--atlas-n-950)", fontFamily: "var(--atlas-mono)" }} />
                </div>
                <Button loading={write.busy} disabled={!planetKey.trim()} onClick={() => void write.run(() => buildStation(planetKey.trim()), "空间站已开始建造")}>建造空间站</Button>
              </div>
              <div style={{ display: "flex", gap: "var(--atlas-2)", alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>舰队名称</div>
                  <input value={fleetName} onChange={(event) => setFleetName(event.target.value)} placeholder="远征队" style={{ width: "100%", height: 32, padding: "0 var(--atlas-2)", background: "var(--atlas-plate-2)", border: "1px solid var(--atlas-line-strong)", borderRadius: "var(--atlas-r-md)", color: "var(--atlas-n-950)" }} />
                </div>
                <Button loading={write.busy} disabled={!fleetName.trim()} onClick={() => void write.run(() => recruitFleet(fleetName.trim()), "舰队已招募")}>招募舰队</Button>
              </div>
            </div>
            {write.error ? <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-small)" }}>{write.error}</div> : null}
          </Panel>
        </div>
      ) : null}

      {tab === "currencies" ? (
        <div style={{ display: "grid", gap: "var(--atlas-3)" }}>
          <Panel title="九级货币" hint={`${balances.length} 个账户`}>
            <Table
              ariaLabel="货币余额"
              loading={loading}
              rows={balances}
              rowKey={(row) => String(row.code)}
              empty={<EmptyState title="还没有货币账户" hint="在银行兑换或领取产出后会显示。" />}
              columns={[
                { key: "code", header: "代码", width: 80, render: (row) => row.code },
                { key: "name", header: "名称", width: 160, render: (row) => row.name },
                { key: "quality", header: "品质", width: 70, render: (row) => <Badge tone="neutral">Q{row.quality}</Badge> },
                { key: "balance", header: "余额", width: 140, align: "right", render: (row) => <Money value={row.balance} /> },
                { key: "frozen", header: "冻结", width: 130, align: "right", render: (row) => <Money value={row.frozen} muted /> },
                { key: "q1", header: "折 Q1", width: 140, align: "right", render: (row) => <Money value={row.q1_equiv} muted /> },
              ]}
            />
          </Panel>

          <Panel title="最近流水" hint={`${entries.length} 条`}>
            <Table
              ariaLabel="钱包流水"
              rows={entries}
              rowKey={(row, index) => `${row.tx_id}-${index}`}
              empty={<EmptyState title="暂无流水" />}
              columns={[
                { key: "time", header: "时间", width: 130, render: (row) => <span className="atlas-tabular" style={{ color: "var(--atlas-n-700)", fontSize: "var(--atlas-t-micro)" }}>{String(row.created_at ?? "").slice(5, 19).replace("T", " ")}</span> },
                { key: "kind", header: "类型", width: 150, render: (row) => row.kind },
                { key: "currency", header: "币种", width: 70, render: (row) => row.currency_code },
                { key: "delta", header: "变动", width: 120, align: "right", render: (row) => <Money value={row.delta} delta={row.delta} /> },
                { key: "after", header: "余额后", width: 130, align: "right", render: (row) => <Money value={row.balance_after} /> },
                { key: "ref", header: "关联", width: 130, render: (row) => row.ref_type ? `${row.ref_type}:${String(row.ref_id ?? "").slice(0, 8)}` : "—" },
              ]}
            />
          </Panel>
        </div>
      ) : null}

      {tab === "holdings" ? (
        <div style={{ display: "grid", gap: "var(--atlas-3)" }}>
          <Panel title="股票持仓" hint={`${positions.length} 只`}>
            <Table
              ariaLabel="股票持仓"
              loading={loading}
              rows={positions}
              rowKey={(row) => String(row.ticker)}
              empty={<EmptyState title="尚无股票持仓" />}
              columns={[
                { key: "ticker", header: "标的", width: 90, render: (row) => row.ticker },
                { key: "shares", header: "股数", width: 100, align: "right", render: (row) => <span className="atlas-tabular">{row.shares}</span> },
                { key: "cost", header: "成本", width: 110, align: "right", render: (row) => <Money value={row.avg_cost} muted /> },
                { key: "last", header: "现价", width: 110, align: "right", render: (row) => <Money value={row.last_price} /> },
                { key: "value", header: "市值", width: 130, align: "right", render: (row) => <Money value={row.market_value} /> },
                { key: "pnl", header: "浮盈", width: 130, align: "right", render: (row) => <Money value={row.unrealized_pnl} delta={row.unrealized_pnl} /> },
              ]}
            />
          </Panel>
          <Panel title="空头" hint={`${shorts.length} 笔`}>
            <Table
              ariaLabel="空头持仓"
              rows={shorts}
              rowKey={(row) => String(row.id)}
              empty={<EmptyState title="没有空头持仓" />}
              columns={[
                { key: "ticker", header: "标的", width: 90, render: (row) => row.ticker },
                { key: "qty", header: "数量", width: 100, align: "right", render: (row) => <span className="atlas-tabular">{row.quantity}</span> },
                { key: "entry", header: "开仓价", width: 110, align: "right", render: (row) => <Money value={row.entry_price} muted /> },
                { key: "last", header: "现价", width: 110, align: "right", render: (row) => <Money value={row.last_price} /> },
                { key: "pnl", header: "浮盈", width: 130, align: "right", render: (row) => <Money value={row.unrealized_pnl} delta={row.unrealized_pnl} /> },
              ]}
            />
          </Panel>
        </div>
      ) : null}

      {tab === "properties" ? (
        <div style={{ display: "grid", gap: "var(--atlas-3)" }}>
          <Panel title="我的产权" hint={`${myProperties.length} 项`}>
            <Table
              ariaLabel="我的产权"
              loading={loading}
              rows={myProperties}
              rowKey={(row) => String(row.asset_key)}
              empty={<EmptyState title="还没有产权" hint="产权登记目前由 CCMC 执行。" />}
              columns={[
                { key: "asset", header: "资产键", width: 220, render: (row) => row.asset_key },
                { key: "kind", header: "类型", width: 80, render: (row) => row.kind },
                { key: "name", header: "名称", width: 160, render: (row) => row.name },
                { key: "value", header: "估值", width: 140, align: "right", render: (row) => <Money value={row.appraised_value} /> },
                { key: "status", header: "状态", width: 90, render: (row) => <Badge tone={row.status === "owned" ? "down" : "warn"}>{row.status}</Badge> },
                { key: "action", header: "挂牌", width: 80, align: "right", render: (row) => <Button size="sm" onClick={() => setSelectedAsset(String(row.asset_key))}>选择</Button> },
              ]}
            />
          </Panel>

          <Panel title="挂牌出售" hint={selectedAsset ? selectedAsset : "先在上表选择资产"}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "var(--atlas-2)" }}>
              <div>
                <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>价格 cc1</div>
                <NumberInput value={listPrice} onChange={setListPrice} min={0} decimals={4} step={100} />
              </div>
              <div>
                <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>形式</div>
                <Select
                  value={listKind}
                  onChange={(event) => setListKind(event.target.value as "fixed" | "auction")}
                  options={[
                    { value: "fixed", label: "固定价" },
                    { value: "auction", label: "拍卖" },
                  ]}
                />
              </div>
              <div>
                <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>天数（1–90）</div>
                <NumberInput value={listDays} onChange={setListDays} min={1} max={90} />
              </div>
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <Button variant="primary" loading={write.busy} disabled={!selectedAsset} onClick={() => void doList()}>
                  挂牌
                </Button>
              </div>
            </div>
            {write.error ? <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-small)" }}>{write.error}</div> : null}
          </Panel>

          <Panel title="持有税单" hint={`${bills.length} 张`}>
            <Table
              ariaLabel="持有税单"
              rows={bills}
              rowKey={(row) => String(row.id)}
              empty={<EmptyState title="没有待缴税单" />}
              columns={[
                { key: "asset", header: "资产键", width: 220, render: (row) => row.asset_key },
                { key: "amount", header: "金额", width: 120, align: "right", render: (row) => <Money value={row.amount} /> },
                { key: "due", header: "到期", width: 130, render: (row) => <span className="atlas-tabular" style={{ color: "var(--atlas-n-700)", fontSize: "var(--atlas-t-micro)" }}>{String(row.due_at ?? "").slice(0, 10)}</span> },
                { key: "status", header: "状态", width: 90, render: (row) => <Badge tone={row.status === "due" ? "warn" : "neutral"}>{row.status}</Badge> },
                {
                  key: "action",
                  header: "操作",
                  width: 96,
                  align: "right",
                  render: (row) =>
                    row.status === "due" ? (
                      <Button size="sm" loading={write.busy} onClick={() => void write.run(() => payPropertyTax(String(row.id)), "税单已缴纳")}>
                        缴纳
                      </Button>
                    ) : null,
                },
              ]}
            />
          </Panel>
        </div>
      ) : null}

      {tab === "debts" ? (
        <div style={{ display: "grid", gap: "var(--atlas-3)" }}>
          <Panel title="银行贷款" hint={`${loans.length} 笔`}>
            <Table
              ariaLabel="银行贷款"
              loading={loading}
              rows={loans}
              rowKey={(row) => String(row.id)}
              empty={<EmptyState title="没有未结清贷款" hint="贷款申请在「银行 · 存贷」分区。" />}
              columns={[
                { key: "currency", header: "币种", width: 70, render: (row) => row.currency_code },
                { key: "principal", header: "本金", width: 120, align: "right", render: (row) => <Money value={row.principal} muted /> },
                { key: "outstanding", header: "未还本金", width: 130, align: "right", render: (row) => <Money value={row.outstanding} /> },
                { key: "interest", header: "应计利息", width: 120, align: "right", render: (row) => <Money value={row.accrued_interest} muted /> },
                { key: "rate", header: "利率", width: 80, align: "right", render: (row) => <span className="atlas-tabular">{(toNumber(row.rate_bps) / 100).toFixed(2)}%</span> },
                { key: "due", header: "到期", width: 130, render: (row) => String(row.due_at ?? "").slice(0, 10) },
                { key: "status", header: "状态", width: 90, render: (row) => <Badge tone={row.status === "active" ? "signal" : "warn"}>{row.status}</Badge> },
                { key: "pick", header: "还款", width: 76, align: "right", render: (row) => <Button size="sm" onClick={() => setRepayLoanId(String(row.id))}>选择</Button> },
              ]}
            />
            <div style={{ display: "flex", gap: "var(--atlas-2)", alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ minWidth: 220 }}>
                <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>贷款</div>
                <Select
                  value={repayLoanId}
                  onChange={(event) => setRepayLoanId(event.target.value)}
                  options={[{ value: "", label: "选择贷款" }, ...loans.map((row) => ({ value: String(row.id), label: `${row.id.slice(0, 8)} · ${formatAmount(row.outstanding)}` }))]}
                />
              </div>
              <div style={{ minWidth: 140 }}>
                <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>还款金额</div>
                <NumberInput value={repayAmount} onChange={setRepayAmount} min={0} decimals={4} step={100} />
              </div>
              <Button
                loading={write.busy}
                disabled={!repayLoanId || toNumber(repayAmount) <= 0}
                onClick={() => void write.run(() => repayLoan(repayLoanId, repayAmount), "还款已提交")}
              >
                还款
              </Button>
            </div>
          </Panel>

          <Panel title="银行存款" hint={`${accounts.length} 个账户`}>
            <Table
              ariaLabel="银行存款"
              rows={accounts}
              rowKey={(row) => String(row.id)}
              empty={<EmptyState title="没有银行存款" />}
              columns={[
                { key: "bank", header: "银行", width: 180, render: (row) => `${row.bank_name} (${row.bank_code})` },
                { key: "currency", header: "币种", width: 80, render: (row) => row.currency_code },
                { key: "balance", header: "余额", width: 150, align: "right", render: (row) => <Money value={row.balance} /> },
              ]}
            />
          </Panel>
        </div>
      ) : null}

      {tab === "rank" ? (
        <Panel title="全服排行" hint="按旗舰等级、反物质排序">
          <Table
            ariaLabel="排行榜"
            loading={loading}
            rows={leaders}
            rowKey={(row) => String(row.player_id)}
            empty={<EmptyState title="排行榜为空" />}
            columns={[
              { key: "no", header: "#", width: 50, render: (_row, index) => <span className="atlas-tabular">{index + 1}</span> },
              { key: "name", header: "玩家", width: 200, render: (row) => row.name },
              { key: "level", header: "旗舰等级", width: 110, align: "right", render: (row) => <span className="atlas-tabular">{row.ship_level}</span> },
              { key: "antimatter", header: "反物质", width: 140, align: "right", render: (row) => <span className="atlas-tabular">{formatAmount(row.antimatter)}</span> },
            ]}
          />
        </Panel>
      ) : null}
    </div>
  );
};

export default AssetsPanel;

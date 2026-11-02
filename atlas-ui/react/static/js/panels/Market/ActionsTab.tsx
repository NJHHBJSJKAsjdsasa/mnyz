// panels/Market/ActionsTab.tsx — corporate actions: split, dividends, delisting
// status (05 §7 / 06 §2.3). Split cancels every resting order: the confirmation
// says so instead of hiding it behind a generic "are you sure".

import React, { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Button,
  EmptyState,
  Modal,
  Money,
  NumberInput,
  Panel,
  Select,
  Table,
} from "../../ui/index.ts";
import {
  fetchAdjustmentFactors,
  fetchDelisting,
  fetchDividends,
  payDividend,
  splitStock,
} from "../../ui/api.ts";
import { formatAmount, toNumber } from "../../ui/Money.tsx";
import { useWrite } from "../_shared/useWrite.ts";
import { messageOf } from "../_shared/errors.ts";

export interface ActionsTabProps {
  stocks: any[];
  selected: string | null;
  detail: any;
  portfolio: any;
  orders: any[];
  onSelect: (ticker: string) => void;
  onRefreshDetail: () => void;
  onRefreshCore: () => void;
}

const MIN_RATIO = 0.01;
const MAX_RATIO = 100;

export const ActionsTab: React.FC<ActionsTabProps> = ({
  stocks,
  selected,
  detail,
  portfolio,
  orders,
  onSelect,
  onRefreshDetail,
  onRefreshCore,
}) => {
  const [ticker, setTicker] = useState(selected ?? stocks[0]?.ticker ?? "");
  const [ratio, setRatio] = useState("2");
  const [perShare, setPerShare] = useState("0.1");
  const [dividends, setDividends] = useState<any[]>([]);
  const [delisting, setDelisting] = useState<any>(null);
  const [factors, setFactors] = useState<any[]>([]);
  const [extraLoading, setExtraLoading] = useState(false);
  const [extraError, setExtraError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [splitResult, setSplitResult] = useState<any>(null);

  useEffect(() => {
    if (selected) setTicker(selected);
  }, [selected]);

  const loadExtras = useCallback(async () => {
    if (!ticker) {
      setDividends([]);
      setDelisting(null);
      setFactors([]);
      return;
    }
    setExtraLoading(true);
    try {
      const [dividendResult, delistingResult, factorResult] = await Promise.allSettled([
        fetchDividends(ticker),
        fetchDelisting(ticker),
        fetchAdjustmentFactors(ticker),
      ]);
      setDividends(dividendResult.status === "fulfilled" ? dividendResult.value?.dividends ?? [] : []);
      setDelisting(delistingResult.status === "fulfilled" ? delistingResult.value : null);
      setFactors(factorResult.status === "fulfilled" ? factorResult.value?.splits ?? [] : []);
      setExtraError(
        dividendResult.status === "rejected"
          ? messageOf(dividendResult.reason)
          : delistingResult.status === "rejected"
            ? messageOf(delistingResult.reason)
            : factorResult.status === "rejected"
              ? messageOf(factorResult.reason)
              : null,
      );
    } finally {
      setExtraLoading(false);
    }
  }, [ticker]);

  useEffect(() => {
    void loadExtras();
  }, [loadExtras]);

  const splitWrite = useWrite(async () => {
    onRefreshDetail();
    onRefreshCore();
    await loadExtras();
  });
  const dividendWrite = useWrite(async () => {
    onRefreshDetail();
    await loadExtras();
  });

  const ratioValue = toNumber(ratio);
  const ratioOk = ratioValue >= MIN_RATIO && ratioValue <= MAX_RATIO && ratioValue !== 1;
  const positions: any[] = portfolio?.positions ?? [];
  const position = positions.find((row) => row.ticker === ticker);
  const openOrders = orders.filter(
    (row) => row.ticker === ticker && (row.status === "open" || row.status === "partial"),
  ).length;

  const last = toNumber(detail?.last_price);
  const totalShares = toNumber(detail?.total_shares);
  const myShares = toNumber(position?.shares);
  const myCost = toNumber(position?.avg_cost);
  const postPrice = last > 0 ? last / ratioValue : 0;
  const postTotal = totalShares * ratioValue;
  const postMine = myShares * ratioValue;
  const postCost = myCost / ratioValue;

  const options = stocks.map((row) => ({ value: String(row.ticker), label: `${row.ticker} · ${row.company ?? ""}` }));

  const doSplit = async () => {
    const outcome = await splitWrite.run(() => splitStock(ticker, ratio), "拆股已执行");
    setConfirmOpen(false);
    if (outcome.ok) setSplitResult(outcome.value);
  };

  return (
    <div style={{ display: "grid", gap: "var(--atlas-3)" }}>
      <Panel title="公司行动" hint="仅公司控股方可执行拆股与分红">
        <div style={{ display: "flex", gap: "var(--atlas-2)", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ minWidth: 220 }}>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>标的</div>
            <Select
              value={ticker}
              onChange={(event) => {
                setTicker(event.target.value);
                onSelect(event.target.value);
              }}
              options={options.length ? options : [{ value: "", label: "暂无上市股票" }]}
              aria-label="公司行动标的"
            />
          </div>
          {detail ? (
            <span style={{ fontSize: "var(--atlas-t-small)", color: "var(--atlas-n-800)" }}>
              {detail.company || detail.ticker} · 现价 <Money value={detail.last_price} /> · 前收 <Money value={detail.prev_close} />
            </span>
          ) : null}
        </div>
        {splitWrite.error ? <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-small)" }}>{splitWrite.error}</div> : null}
        {dividendWrite.error ? <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-small)" }}>{dividendWrite.error}</div> : null}
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "var(--atlas-3)" }}>
        <Panel title="拆股 / 合股" hint={`${MIN_RATIO}–${MAX_RATIO}，不能为 1`}>
          <div style={{ display: "flex", gap: "var(--atlas-2)", alignItems: "flex-end" }}>
            <div style={{ width: 160 }}>
              <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>比例</div>
              <NumberInput value={ratio} onChange={setRatio} min={MIN_RATIO} max={MAX_RATIO} decimals={4} step={0.5} />
            </div>
            <span className="atlas-tabular" style={{ color: "var(--atlas-n-800)", paddingBottom: 7 }}>
              : 1
            </span>
            <Button
              variant="danger"
              loading={splitWrite.busy}
              disabled={!ticker || !ratioOk}
              onClick={() => setConfirmOpen(true)}
            >
              执行拆股
            </Button>
          </div>
          {!ratioOk && ratio !== "" ? (
            <div style={{ color: "var(--atlas-warn)", fontSize: "var(--atlas-t-micro)" }}>
              比例必须在 {MIN_RATIO}–{MAX_RATIO} 之间且不等于 1。
            </div>
          ) : null}

          <div style={{ borderTop: "1px solid var(--atlas-line)", paddingTop: "var(--atlas-2)", display: "grid", gap: 4 }}>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)" }}>影响预览（前端示意，以执行结果为准）</div>
            <Preview label="股价" before={last} after={postPrice} />
            <Preview label="总股本" before={totalShares} after={postTotal} integer />
            <Preview label="我的持股" before={myShares} after={postMine} integer />
            <Preview label="我的成本" before={myCost} after={postCost} />
            <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-small)" }}>
              我的未成交挂单 {openOrders} 笔，执行后将全部撤销（不重新定价）。
            </div>
            <div style={{ color: "var(--atlas-n-600)", fontSize: "var(--atlas-t-micro)" }}>
              该操作不可撤销；比例大于 1 为拆股（价格下降、股数上升），小于 1 为合股。
            </div>
          </div>
        </Panel>

        <Panel title="分红" hint="从公司金库按持仓发放">
          <div style={{ display: "flex", gap: "var(--atlas-2)", alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>每股分红 cc4</div>
              <NumberInput value={perShare} onChange={setPerShare} min={0} decimals={4} step={0.01} />
            </div>
            <Button
              variant="primary"
              loading={dividendWrite.busy}
              disabled={!ticker || toNumber(perShare) <= 0}
              onClick={() => void dividendWrite.run(() => payDividend(ticker, perShare), "分红已发放")}
            >
              发放
            </Button>
          </div>
          {dividendWrite.error ? <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-small)" }}>{dividendWrite.error}</div> : null}
          <Table
            ariaLabel="分红记录"
            loading={extraLoading}
            rows={dividends}
            rowKey={(row) => String(row.id)}
            empty={<EmptyState title="暂无分红记录" />}
            columns={[
              { key: "per", header: "每股", width: 110, align: "right", render: (row) => <Money value={row.per_share} /> },
              { key: "total", header: "总额", width: 130, align: "right", render: (row) => <Money value={row.total_paid} /> },
              { key: "status", header: "状态", width: 90, render: (row) => <Badge tone={row.status === "paid" ? "down" : "warn"}>{row.status}</Badge> },
              {
                key: "pay",
                header: "发放时间",
                width: 150,
                render: (row) => (
                  <span className="atlas-tabular" style={{ color: "var(--atlas-n-700)", fontSize: "var(--atlas-t-micro)" }}>
                    {String(row.pay_at ?? "").slice(0, 16).replace("T", " ")}
                  </span>
                ),
              },
            ]}
          />
        </Panel>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "var(--atlas-3)" }}>
        <Panel title="退市状态">
          {extraError ? <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-small)" }}>{extraError}</div> : null}
          {!delisting ? (
            <EmptyState title="无法读取退市状态" />
          ) : !delisting.case ? (
            <div style={{ color: "var(--atlas-n-700)", fontSize: "var(--atlas-t-small)" }}>
              当前状态 <Badge tone="neutral">{delisting.status}</Badge> · 没有进行中的退市程序。
            </div>
          ) : (
            <div style={{ display: "grid", gap: 4, fontSize: "var(--atlas-t-small)" }}>
              <span>标的 <Badge tone={delisting.status === "suspended" ? "warn" : "neutral"}>{delisting.status}</Badge></span>
              <span>原因 {delisting.case.reason}</span>
              <span>程序 <Badge tone="warn">{delisting.case.status}</Badge></span>
              <span>最后价 <Money value={delisting.case.last_price} /></span>
              <span className="atlas-tabular" style={{ color: "var(--atlas-n-700)", fontSize: "var(--atlas-t-micro)" }}>
                触发 {String(delisting.case.triggered_at ?? "").slice(0, 16).replace("T", " ")}
              </span>
            </div>
          )}
        </Panel>

        <Panel title="复权因子" hint={`${factors.length} 次拆并股`}>
          <Table
            ariaLabel="复权因子"
            loading={extraLoading}
            rows={factors}
            rowKey={(row) => String(row.split_id)}
            empty={<EmptyState title="没有拆并股记录" />}
            columns={[
              { key: "ratio", header: "比例", width: 90, align: "right", render: (row) => <span className="atlas-tabular">{row.ratio}</span> },
              { key: "factor", header: "累计因子", width: 110, align: "right", render: (row) => <span className="atlas-tabular">{row.factor}</span> },
              {
                key: "at",
                header: "执行时间",
                width: 150,
                render: (row) => (
                  <span className="atlas-tabular" style={{ color: "var(--atlas-n-700)", fontSize: "var(--atlas-t-micro)" }}>
                    {String(row.executed_at ?? "").slice(0, 16).replace("T", " ")}
                  </span>
                ),
              },
            ]}
          />
        </Panel>
      </div>

      {splitResult ? (
        <Panel title="拆股结果">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "var(--atlas-2)" }}>
            <span>比例 <span className="atlas-tabular">{splitResult.ratio}</span></span>
            <span>现价 <Money value={splitResult.last_price} /></span>
            <span>前收 <Money value={splitResult.prev_close} /></span>
            <span>撤销挂单 <span className="atlas-tabular">{splitResult.cancelled_orders}</span></span>
            <span>碎股折现 <Money value={splitResult.cash_in_lieu} /></span>
            <span>受影响人数 <span className="atlas-tabular">{splitResult.holders_rounded}</span></span>
            <span>
              复权范围{" "}
              {(splitResult.adjusts ?? []).map((item: unknown) => (
                <Badge key={String(item)} tone="down">
                  {({ listing: "挂牌", holders: "持有人", candles: "K 线" } as Record<string, string>)[String(item)] ??
                    String(item)}
                </Badge>
              ))}
            </span>
          </div>
        </Panel>
      ) : null}

      <Modal
        open={confirmOpen}
        title="确认拆股"
        onClose={() => setConfirmOpen(false)}
        dismissible={!splitWrite.busy}
        footer={
          <>
            <Button onClick={() => setConfirmOpen(false)} disabled={splitWrite.busy}>取消</Button>
            <Button variant="danger" loading={splitWrite.busy} onClick={() => void doSplit()}>
              确认拆股（不可撤销）
            </Button>
          </>
        }
      >
        <div style={{ display: "grid", gap: "var(--atlas-2)" }}>
          <div>
            标的 <span className="atlas-tabular">{ticker}</span> · 比例 <span className="atlas-tabular">{ratio || "0"} : 1</span>
          </div>
          <div>股价 {formatAmount(last)} → {formatAmount(postPrice)}</div>
          <div>我的持股 {formatAmount(myShares)} → {formatAmount(postMine)}</div>
          <div style={{ color: "var(--atlas-danger)" }}>
            ⚠ 该操作不可撤销；所有未成交挂单（{openOrders} 笔）会被直接撤销而非重新定价。
          </div>
        </div>
      </Modal>
    </div>
  );
};

const Preview: React.FC<{ label: string; before: number; after: number; integer?: boolean }> = ({ label, before, after, integer }) => (
  <div style={{ display: "flex", gap: "var(--atlas-2)", fontSize: "var(--atlas-t-small)" }}>
    <span style={{ color: "var(--atlas-n-700)", width: 88 }}>{label}</span>
    <span className="atlas-tabular" style={{ color: "var(--atlas-n-800)" }}>
      {integer ? Math.floor(before).toLocaleString("en-US") : formatAmount(before)}
    </span>
    <span style={{ color: "var(--atlas-n-600)" }}>→</span>
    <span className="atlas-tabular" style={{ color: "var(--atlas-n-950)" }}>
      {integer ? Math.floor(after).toLocaleString("en-US") : formatAmount(after)}
    </span>
  </div>
);

export default ActionsTab;

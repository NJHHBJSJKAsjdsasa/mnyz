// panels/Legal/PropertyTab.tsx — my deeds, tax bills and the public listing market
// (06 §5). A sale burns 2% transfer tax and pays 1% commission; the confirmation
// block shows that split but always says the settlement response is authoritative.

import React, { useCallback, useEffect, useState } from "react";
import { Badge, Button, EmptyState, Money, NumberInput, Panel, Select, Table } from "../../ui/index.ts";
import {
  bidProperty,
  buyProperty,
  fetchMyProperties,
  fetchPropertyListings,
  listProperty,
  payPropertyTax,
} from "../../ui/api.ts";
import { formatAmount, toNumber } from "../../ui/Money.tsx";
import { useWrite } from "../_shared/useWrite.ts";
import { messageOf } from "../_shared/errors.ts";

const TAX_BPS = 200;
const COMMISSION_BPS = 100;

export const PropertyTab: React.FC = () => {
  const [mine, setMine] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assetKey, setAssetKey] = useState("");
  const [price, setPrice] = useState("1000");
  const [kind, setKind] = useState<"fixed" | "auction">("fixed");
  const [days, setDays] = useState("30");
  const [bidListing, setBidListing] = useState("");
  const [bidAmount, setBidAmount] = useState("1000");

  const load = useCallback(async () => {
    setLoading(true);
    const [mineResult, listResult] = await Promise.allSettled([fetchMyProperties(), fetchPropertyListings()]);
    if (mineResult.status === "fulfilled") {
      setMine(mineResult.value?.properties ?? []);
      setBills(mineResult.value?.bills ?? []);
    }
    if (listResult.status === "fulfilled") setListings(listResult.value?.listings ?? []);
    setError(
      mineResult.status === "rejected"
        ? messageOf(mineResult.reason)
        : listResult.status === "rejected"
          ? messageOf(listResult.reason)
          : null,
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const write = useWrite(load);
  const fixed = listings.find((row) => row.id === bidListing);
  const tax = fixed ? (toNumber(fixed.price) * TAX_BPS) / 10_000 : 0;
  const commission = fixed ? (toNumber(fixed.price) * COMMISSION_BPS) / 10_000 : 0;
  const sellerNet = fixed ? toNumber(fixed.price) - tax - commission : 0;

  return (
    <div style={{ display: "grid", gap: "var(--atlas-3)" }}>
      <Panel title="我的产权" hint={`${mine.length} 项`} actions={<Button size="sm" loading={loading} onClick={() => void load()}>刷新</Button>}>
        {error ? <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-small)" }}>{error}</div> : null}
        <Table
          ariaLabel="我的产权"
          loading={loading}
          rows={mine}
          rowKey={(row) => String(row.asset_key)}
          empty={<EmptyState title="还没有产权" hint="产权登记需 CCMC/运维执行。" />}
          columns={[
            { key: "asset", header: "资产键", width: 230, render: (row) => row.asset_key },
            { key: "kind", header: "类型", width: 80, render: (row) => row.kind },
            { key: "name", header: "名称", width: 160, render: (row) => row.name },
            { key: "value", header: "估值", width: 140, align: "right", render: (row) => <Money value={row.appraised_value} /> },
            { key: "status", header: "状态", width: 90, render: (row) => <Badge tone={row.status === "owned" ? "down" : "warn"}>{row.status}</Badge> },
            { key: "action", header: "挂牌", width: 80, align: "right", render: (row) => <Button size="sm" onClick={() => setAssetKey(String(row.asset_key))}>选择</Button> },
          ]}
        />
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "var(--atlas-3)" }}>
        <Panel title="挂牌出售" hint={assetKey || "先在上表选择资产"}>
          <div style={{ display: "grid", gap: "var(--atlas-2)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--atlas-2)" }}>
              <div>
                <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>价格 cc1</div>
                <NumberInput value={price} onChange={setPrice} min={0} decimals={4} step={100} />
              </div>
              <div>
                <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>形式</div>
                <Select value={kind} onChange={(event) => setKind(event.target.value as "fixed" | "auction")} options={[{ value: "fixed", label: "固定价" }, { value: "auction", label: "拍卖" }]} />
              </div>
              <div>
                <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>天数（1–90）</div>
                <NumberInput value={days} onChange={setDays} min={1} max={90} />
              </div>
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <Button
                  variant="primary"
                  loading={write.busy}
                  disabled={!assetKey}
                  onClick={() => void write.run(() => listProperty(assetKey, { price, kind, days: Math.floor(toNumber(days)) }), "产权已挂牌")}
                >
                  挂牌
                </Button>
              </div>
            </div>
            <div style={{ color: "var(--atlas-n-600)", fontSize: "var(--atlas-t-micro)" }}>
              成交时买家支付挂牌价；卖家实收 = 挂牌价 − 2% 交易税 − 1% 佣金。以结算响应为准。
            </div>
          </div>
        </Panel>

        <Panel title="持有税单" hint={`${bills.length} 张`}>
          <Table
            ariaLabel="持有税单"
            rows={bills}
            rowKey={(row) => String(row.id)}
            empty={<EmptyState title="没有待缴税单" />}
            columns={[
              { key: "asset", header: "资产键", width: 180, render: (row) => row.asset_key },
              { key: "amount", header: "金额", width: 110, align: "right", render: (row) => <Money value={row.amount} /> },
              { key: "due", header: "到期", width: 110, render: (row) => String(row.due_at ?? "").slice(0, 10) },
              { key: "status", header: "状态", width: 80, render: (row) => <Badge tone={row.status === "due" ? "warn" : "neutral"}>{row.status}</Badge> },
              {
                key: "action",
                header: "操作",
                width: 84,
                align: "right",
                render: (row) =>
                  row.status === "due" ? (
                    <Button size="sm" loading={write.busy} onClick={() => void write.run(() => payPropertyTax(String(row.id)), "税单已缴纳")}>缴纳</Button>
                  ) : null,
              },
            ]}
          />
        </Panel>
      </div>

      <Panel title="产权市场" hint={`${listings.length} 条挂牌`}>
        {write.error ? <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-small)" }}>{write.error}</div> : null}
        <Table
          ariaLabel="产权挂牌"
          loading={loading}
          rows={listings}
          rowKey={(row) => String(row.id)}
          empty={<EmptyState title="暂无挂牌" />}
          columns={[
            { key: "asset", header: "资产", width: 210, render: (row) => `${row.asset_key} · ${row.name}` },
            { key: "kind", header: "形式", width: 80, render: (row) => <Badge tone={row.kind === "fixed" ? "neutral" : "warn"}>{row.kind === "fixed" ? "固定价" : "拍卖"}</Badge> },
            { key: "price", header: "价格", width: 130, align: "right", render: (row) => <Money value={row.price} currency="cc1" /> },
            { key: "appraisal", header: "估值", width: 130, align: "right", render: (row) => <Money value={row.appraised_value} muted /> },
            { key: "expires", header: "到期", width: 130, render: (row) => String(row.expires_at ?? "").slice(0, 16).replace("T", " ") },
            {
              key: "action",
              header: "操作",
              width: 96,
              align: "right",
              render: (row) =>
                row.kind === "fixed" ? (
                  <Button size="sm" variant="primary" loading={write.busy} onClick={() => void write.run(() => buyProperty(String(row.id)), "产权已买入")}>购买</Button>
                ) : (
                  <Button size="sm" onClick={() => setBidListing(String(row.id))}>出价</Button>
                ),
            },
          ]}
        />

        {bidListing ? (
          <div style={{ borderTop: "1px solid var(--atlas-line)", paddingTop: "var(--atlas-2)", display: "grid", gap: "var(--atlas-2)" }}>
            <div style={{ display: "flex", gap: "var(--atlas-2)", alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ minWidth: 200 }}>
                <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>出价（拍卖）</div>
                <NumberInput value={bidAmount} onChange={setBidAmount} min={0} decimals={4} step={100} />
              </div>
              <Button loading={write.busy} onClick={() => void write.run(() => bidProperty(bidListing, bidAmount), "出价已提交")}>提交出价</Button>
              <Button size="sm" variant="ghost" onClick={() => setBidListing("")}>取消</Button>
            </div>
            {fixed ? (
              <div style={{ display: "grid", gap: 2, fontSize: "var(--atlas-t-small)" }}>
                <div className="atlas-kv"><span className="atlas-kv-label">挂牌价</span><Money value={fixed.price} currency="cc1" /></div>
                <div className="atlas-kv"><span className="atlas-kv-label">交易税 2%</span><span className="atlas-tabular">-{formatAmount(tax)}</span></div>
                <div className="atlas-kv"><span className="atlas-kv-label">佣金 1%</span><span className="atlas-tabular">-{formatAmount(commission)}</span></div>
                <div className="atlas-kv"><span className="atlas-kv-label">卖家实收</span><span className="atlas-tabular">{formatAmount(sellerNet)}</span></div>
                <div style={{ color: "var(--atlas-n-600)", fontSize: "var(--atlas-t-micro)" }}>以成交结果为准。</div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Panel>
    </div>
  );
};

export default PropertyTab;

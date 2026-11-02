// panels/Market/VenuesTab.tsx — exchange list and the sub-exchange licence form
// (06 §2.2). The licence fee and the four writable fields are the implementation
// contract; the form never invents a `currency_code`.

import React, { useCallback, useEffect, useState } from "react";
import { Badge, Button, Money, NumberInput, Panel, Table } from "../../ui/index.ts";
import { createExchange, fetchWallet } from "../../ui/api.ts";
import { toNumber } from "../../ui/Money.tsx";
import { useWrite } from "../_shared/useWrite.ts";
import { messageOf } from "../_shared/errors.ts";

const LICENCE_FEE = 5000;
const CODE_RE = /^[A-Z0-9]{3,8}$/;

export interface VenuesTabProps {
  exchanges: any[];
  onChanged: () => void | Promise<void>;
}

export const VenuesTab: React.FC<VenuesTabProps> = ({ exchanges, onChanged }) => {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [feeBps, setFeeBps] = useState("25");
  const [listingFee, setListingFee] = useState("1200");
  const [maxListings, setMaxListings] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [created, setCreated] = useState<any>(null);

  const loadBalance = useCallback(async () => {
    try {
      const data = await fetchWallet();
      const cc4 = (data?.currencies ?? []).find((row: any) => row.code === "cc4");
      setBalance(numberOf(cc4?.balance));
      setBalanceError(null);
    } catch (raw) {
      setBalanceError(messageOf(raw));
    }
  }, []);

  useEffect(() => {
    void loadBalance();
  }, [loadBalance]);

  const write = useWrite(async () => {
    await onChanged();
    await loadBalance();
  });

  const codeOk = CODE_RE.test(code.trim().toUpperCase());
  const enough = balance != null && balance >= LICENCE_FEE;
  const parsedMax = maxListings.trim() === "" ? null : Math.floor(toNumber(maxListings));
  const maxOk = parsedMax == null || parsedMax >= 1;
  const canSubmit = codeOk && name.trim().length > 0 && enough && maxOk && !write.busy;

  const submit = async () => {
    const outcome = await write.run(
      () =>
        createExchange({
          code: code.trim().toUpperCase(),
          name: name.trim(),
          fee_bps: Math.floor(toNumber(feeBps)),
          listing_fee: listingFee.trim() || "0",
          ...(parsedMax == null ? {} : { max_listings: parsedMax }),
        }),
      "子交易所已开设",
    );
    if (outcome.ok) {
      setCreated(outcome.value);
      setCode("");
      setName("");
    }
  };

  return (
    <div style={{ display: "grid", gap: "var(--atlas-3)" }}>
      <Panel title="交易所" hint={`${exchanges.length} 个`}>
        <Table
          ariaLabel="交易所列表"
          rows={exchanges}
          rowKey={(row) => String(row.id)}
          empty={<div style={{ color: "var(--atlas-n-600)" }}>暂无交易所。</div>}
          columns={[
            { key: "code", header: "代码", width: 90, render: (row) => <span style={{ color: "var(--atlas-n-950)" }}>{row.code}</span> },
            { key: "name", header: "名称", width: 180, render: (row) => row.name },
            {
              key: "kind",
              header: "类型",
              width: 84,
              render: (row) => <Badge tone={row.kind === "official" ? "signal" : "neutral"}>{row.kind === "official" ? "官方" : "子所"}</Badge>,
            },
            { key: "currency", header: "币种", width: 72, render: (row) => row.currency_code },
            {
              key: "status",
              header: "状态",
              width: 84,
              render: (row) => <Badge tone={row.status === "active" ? "down" : "warn"}>{row.status}</Badge>,
            },
            { key: "fee", header: "费率", width: 76, align: "right", render: (row) => <span className="atlas-tabular">{row.fee_bps}bp</span> },
            { key: "listing", header: "上市费", width: 110, align: "right", render: (row) => <Money value={row.listing_fee} currency={row.currency_code} muted /> },
            {
              key: "count",
              header: "挂牌数",
              width: 110,
              align: "right",
              render: (row) => (
                <span className="atlas-tabular">
                  {row.listing_count ?? 0}
                  {row.max_listings != null ? ` / ${row.max_listings}` : ""}
                </span>
              ),
            },
            {
              key: "operator",
              header: "运营方",
              width: 160,
              render: (row) => (
                <span style={{ color: "var(--atlas-n-700)", fontSize: "var(--atlas-t-micro)" }}>
                  {row.operator_actor_id ? String(row.operator_actor_id).slice(0, 8) : "系统"}
                </span>
              ),
            },
          ]}
        />
      </Panel>

      <Panel title="申请子交易所" hint="一次性牌照费 5,000 cc4 付给财政">
        {balanceError ? <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-small)" }}>{balanceError}</div> : null}
        {write.error ? <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-small)" }}>{write.error}</div> : null}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "var(--atlas-3)" }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)" }}>代码（3–8 位大写字母/数字）</span>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              maxLength={8}
              placeholder="ALPHA"
              style={{
                height: 32,
                padding: "0 var(--atlas-2)",
                background: "var(--atlas-plate-2)",
                border: `1px solid ${code && !codeOk ? "var(--atlas-danger)" : "var(--atlas-line-strong)"}`,
                borderRadius: "var(--atlas-r-md)",
                color: "var(--atlas-n-950)",
                fontFamily: "var(--atlas-mono)",
              }}
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)" }}>名称（≤ 80 字）</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              placeholder="Alpha 板"
              style={{
                height: 32,
                padding: "0 var(--atlas-2)",
                background: "var(--atlas-plate-2)",
                border: "1px solid var(--atlas-line-strong)",
                borderRadius: "var(--atlas-r-md)",
                color: "var(--atlas-n-950)",
              }}
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)" }}>费率 bp（0–100）</span>
            <NumberInput value={feeBps} onChange={setFeeBps} min={0} max={100} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)" }}>上市费 cc4</span>
            <NumberInput value={listingFee} onChange={setListingFee} min={0} decimals={4} step={100} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)" }}>挂牌上限（留空 = 不限）</span>
            <NumberInput value={maxListings} onChange={setMaxListings} min={1} placeholder="不限" />
          </label>
        </div>

        <div style={{ display: "flex", gap: "var(--atlas-4)", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: "var(--atlas-t-small)", color: "var(--atlas-n-800)" }}>
            将从你的 cc4 余额扣除 <Money value={LICENCE_FEE} currency="cc4" />；当前可用{" "}
            {balance == null ? "读取中" : <Money value={balance} currency="cc4" />}
          </span>
          {balance != null && !enough ? <Badge tone="danger">余额不足</Badge> : null}
          {balance == null && balanceError ? <Badge tone="warn">余额未知</Badge> : null}
        </div>

        <div>
          <Button variant="primary" loading={write.busy} disabled={!canSubmit} onClick={() => void submit()}>
            确认开设
          </Button>
        </div>

        <div style={{ borderTop: "1px solid var(--atlas-line)", paddingTop: "var(--atlas-2)", color: "var(--atlas-n-700)", fontSize: "var(--atlas-t-micro)", lineHeight: 1.7 }}>
          按 03 分册规划，开所还需议会动议与央行审查；当前版本以实现为准：缴费即开。
          表单只提交代码、名称、费率、上市费与挂牌上限；币种固定 cc4。
        </div>
        {created ? (
          <div style={{ color: "var(--atlas-signal)", fontSize: "var(--atlas-t-small)" }}>
            {created.code} 已开设 · 牌照费 <Money value={created.licence_fee} currency="cc4" /> · 挂牌上限{" "}
            {created.max_listings ?? "不限"}
          </div>
        ) : null}
      </Panel>
    </div>
  );
};

// `balance` comes back as a decimal string; keep the check numeric but never
// format it here — `Money` owns display.
function numberOf(value: unknown): number {
  const n = Number(String(value ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

export default VenuesTab;

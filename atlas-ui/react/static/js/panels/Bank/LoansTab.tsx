// panels/Bank/LoansTab.tsx — loan origination, outstanding loans and repayment.

import React, { useCallback, useEffect, useState } from "react";
import { Badge, Button, Checkbox, EmptyState, Money, NumberInput, Panel, Select, Table } from "../../ui/index.ts";
import { fetchLoans, fetchMyProperties, openLoan, repayLoan } from "../../ui/api.ts";
import { formatAmount, toNumber } from "../../ui/Money.tsx";
import { useWrite } from "../_shared/useWrite.ts";
import { messageOf } from "../_shared/errors.ts";
import type { BankCommon } from "../BankPanel.tsx";

export interface LoansTabProps {
  common: BankCommon;
}

const TERMS = [30, 90, 180];

export const LoansTab: React.FC<LoansTabProps> = ({ common }) => {
  const [loans, setLoans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bankId, setBankId] = useState(common.banks[0]?.id ?? "");
  const [currency, setCurrency] = useState("cc4");
  const [amount, setAmount] = useState("1000");
  const [term, setTerm] = useState("90");
  const [repayLoanId, setRepayLoanId] = useState("");
  const [repayAmount, setRepayAmount] = useState("100");
  const [deeds, setDeeds] = useState<any[]>([]);
  const [pledged, setPledged] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchLoans();
      setLoans(data?.loans ?? []);
      setError(null);
    } catch (raw) {
      setError(messageOf(raw));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!bankId && common.banks.length) setBankId(String(common.banks[0].id));
  }, [bankId, common.banks]);

  useEffect(() => {
    // Collateral is optional; the list is just the deeds the player could pledge.
    void fetchMyProperties()
      .then((data) => setDeeds((data?.properties ?? []).filter((row: any) => row.status === "owned")))
      .catch(() => setDeeds([]));
  }, []);

  const write = useWrite(async () => {
    await load();
    await common.reload();
  });

  const togglePledge = (assetId: string, next: boolean) =>
    setPledged((prev) => (next ? [...prev, assetId] : prev.filter((row) => row !== assetId)));
  const pledgedValue = deeds
    .filter((row) => pledged.includes(String(row.id)))
    .reduce((sum, row) => sum + toNumber(row.appraised_value), 0);
  // 130% cover, mirroring PLEDGE_COVER_BPS on the server; the server still decides.
  const coverOk = pledged.length === 0 || pledgedValue >= toNumber(amount) * 1.3;

  const bankOptions = common.banks.length ? common.banks.map((row) => ({ value: String(row.id), label: `${row.name} (${row.code})` })) : [{ value: "", label: "暂无银行" }];
  const currencyOptions = (common.wallet?.currencies ?? []).map((row: any) => ({ value: String(row.code), label: `${row.code} · ${row.name}` }));
  const options = currencyOptions.length ? currencyOptions : [{ value: "cc4", label: "cc4" }];

  return (
    <div style={{ display: "grid", gap: "var(--atlas-3)" }}>
      <Panel title="申请贷款" hint="期限仅支持 30/90/180 天，利率由银行牌价决定">
        {write.error ? <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-small)" }}>{write.error}</div> : null}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "var(--atlas-2)" }}>
          <div>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>银行</div>
            <Select value={bankId} onChange={(event) => setBankId(event.target.value)} options={bankOptions} />
          </div>
          <div>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>币种</div>
            <Select value={currency} onChange={(event) => setCurrency(event.target.value)} options={options} />
          </div>
          <div>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>金额</div>
            <NumberInput value={amount} onChange={setAmount} min={0} decimals={4} step={100} />
          </div>
          <div>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>期限</div>
            <Select value={term} onChange={(event) => setTerm(event.target.value)} options={TERMS.map((days) => ({ value: String(days), label: `${days} 天` }))} />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <Button
              variant="primary"
              loading={write.busy}
              disabled={!bankId || toNumber(amount) <= 0 || !coverOk}
              onClick={() =>
                void write.run(
                  () =>
                    openLoan(bankId, {
                      currency_code: currency,
                      amount,
                      term_days: Math.floor(toNumber(term)),
                      collateral_asset_ids: pledged,
                    }),
                  "贷款已发放",
                )
              }
            >
              借款
            </Button>
          </div>
        </div>

        <div style={{ marginTop: "var(--atlas-2)" }}>
          <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>
            抵押产权（可选，覆盖率需 ≥130%{pledged.length ? ` · 已选 ${formatAmount(pledgedValue)}` : ""}）
          </div>
          {deeds.length === 0 ? (
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)" }}>没有可抵押的产权</div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--atlas-3)" }}>
              {deeds.map((row) => (
                <Checkbox
                  key={String(row.id)}
                  checked={pledged.includes(String(row.id))}
                  onChange={(next) => togglePledge(String(row.id), next)}
                  label={`${row.name || row.asset_key} · ${formatAmount(row.appraised_value)}`}
                />
              ))}
            </div>
          )}
          {!coverOk ? (
            <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-micro)", marginTop: 4 }}>
              抵押物不足覆盖额的 {(toNumber(amount) * 1.3).toFixed(2)}
            </div>
          ) : null}
        </div>
      </Panel>

      <Panel title="我的贷款" hint={`${loans.length} 笔`}>
        {error ? <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-small)" }}>{error}</div> : null}
        <Table
          ariaLabel="我的贷款"
          loading={loading}
          rows={loans}
          rowKey={(row) => String(row.id)}
          empty={<EmptyState title="没有贷款" />}
          columns={[
            { key: "currency", header: "币种", width: 70, render: (row) => row.currency_code },
            { key: "principal", header: "本金", width: 120, align: "right", render: (row) => <Money value={row.principal} muted /> },
            { key: "outstanding", header: "未还", width: 120, align: "right", render: (row) => <Money value={row.outstanding} /> },
            { key: "interest", header: "利息", width: 120, align: "right", render: (row) => <Money value={row.accrued_interest} muted /> },
            { key: "rate", header: "利率", width: 80, align: "right", render: (row) => <span className="atlas-tabular">{(toNumber(row.rate_bps) / 100).toFixed(2)}%</span> },
            { key: "due", header: "到期", width: 130, render: (row) => String(row.due_at ?? "").slice(0, 10) },
            {
              key: "collateral",
              header: "抵押",
              width: 100,
              render: (row) => {
                const rows = row.collateral ?? [];
                if (!rows.length) return <span className="atlas-kv-label">—</span>;
                const seized = rows.some((item: any) => item.status === "seized");
                return <Badge tone={seized ? "danger" : "neutral"}>{seized ? `已扣押 ${rows.length}` : `${rows.length} 处`}</Badge>;
              },
            },
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
          <Button loading={write.busy} disabled={!repayLoanId || toNumber(repayAmount) <= 0} onClick={() => void write.run(() => repayLoan(repayLoanId, repayAmount), "还款已提交")}>
            还款
          </Button>
        </div>
      </Panel>
    </div>
  );
};

export default LoansTab;

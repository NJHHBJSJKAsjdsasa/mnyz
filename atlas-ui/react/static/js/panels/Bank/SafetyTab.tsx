// panels/Bank/SafetyTab.tsx — deposit insurance fund, claims and the compliance
// fund (02 §5.3 / §12.5). The 3/4 approval and payout are ops actions; a player
// can file a claim and see the fund balance, nothing more.

import React, { useCallback, useEffect, useState } from "react";
import { Badge, Button, Money, NumberInput, Panel, Select } from "../../ui/index.ts";
import { fetchComplianceFund, fetchInsurance, fileInsuranceClaim } from "../../ui/api.ts";
import { toNumber } from "../../ui/Money.tsx";
import { useWrite } from "../_shared/useWrite.ts";
import { messageOf } from "../_shared/errors.ts";
import type { BankCommon } from "../BankPanel.tsx";

export interface SafetyTabProps {
  common: BankCommon;
}

export const SafetyTab: React.FC<SafetyTabProps> = ({ common }) => {
  const [fund, setFund] = useState<any>(null);
  const [compliance, setCompliance] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bankId, setBankId] = useState(common.banks[0]?.id ?? "");
  const [currency, setCurrency] = useState("cc1");
  const [amount, setAmount] = useState("1000");

  const load = useCallback(async () => {
    setLoading(true);
    const [fundResult, complianceResult] = await Promise.allSettled([fetchInsurance(), fetchComplianceFund()]);
    if (fundResult.status === "fulfilled") setFund(fundResult.value);
    if (complianceResult.status === "fulfilled") setCompliance(complianceResult.value);
    setError(
      fundResult.status === "rejected"
        ? messageOf(fundResult.reason)
        : complianceResult.status === "rejected"
          ? messageOf(complianceResult.reason)
          : null,
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!bankId && common.banks.length) setBankId(String(common.banks[0].id));
  }, [bankId, common.banks]);

  const write = useWrite(load);
  const bankOptions = common.banks.length ? common.banks.map((row) => ({ value: String(row.id), label: `${row.name} (${row.code})` })) : [{ value: "", label: "暂无银行" }];
  const currencyOptions = (common.wallet?.currencies ?? []).map((row: any) => ({ value: String(row.code), label: `${row.code} · ${row.name}` }));
  const options = currencyOptions.length ? currencyOptions : [{ value: "cc1", label: "cc1" }];

  return (
    <div style={{ display: "grid", gap: "var(--atlas-3)" }}>
      <Panel title="存款保险基金" hint={fund?.currency_code ? `币种 ${fund.currency_code}` : undefined}>
        {error ? <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-small)" }}>{error}</div> : null}
        {loading ? <div style={{ color: "var(--atlas-n-700)", fontSize: "var(--atlas-t-small)" }}>读取中…</div> : null}
        {fund ? (
          <div style={{ display: "flex", gap: "var(--atlas-4)", flexWrap: "wrap" }}>
            <span>基金余额 <Money value={fund.balance} currency={fund.currency_code} /></span>
            <span>单人上限 <Money value={fund.per_actor_cap_q1_equiv} currency="Q1" muted /></span>
            <Badge tone="warn">赔付需 3/4 批准</Badge>
          </div>
        ) : null}
      </Panel>

      <Panel title="理赔申请" hint="按单 actor 上限自动截断">
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
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <Button
              variant="primary"
              loading={write.busy}
              disabled={!bankId || toNumber(amount) <= 0}
              onClick={() => void write.run(() => fileInsuranceClaim({ bank_id: bankId, currency_code: currency, amount }), "理赔申请已提交")}
            >
              申请理赔
            </Button>
          </div>
        </div>
      </Panel>

      <Panel title="合规基金" hint={compliance?.currency_code ? `币种 ${compliance.currency_code}` : undefined}>
        {compliance ? (
          <div style={{ display: "grid", gap: 4, fontSize: "var(--atlas-t-small)" }}>
            <span>余额 <Money value={compliance.balance} currency={compliance.currency_code} /></span>
            <div style={{ display: "flex", gap: "var(--atlas-2)", flexWrap: "wrap" }}>
              {Object.entries(compliance.by_kind ?? {}).map(([kind, total]) => (
                <Badge key={kind} tone="neutral">{kind} {String(total)}</Badge>
              ))}
            </div>
            <span style={{ color: "var(--atlas-n-600)", fontSize: "var(--atlas-t-micro)" }}>
              合规基金与存款保险分账，仅用于反洗钱、审计与受害者补偿。
            </span>
          </div>
        ) : (
          <div style={{ color: "var(--atlas-n-700)", fontSize: "var(--atlas-t-small)" }}>读取中…</div>
        )}
      </Panel>
    </div>
  );
};

export default SafetyTab;

// panels/Bank/CertificatesTab.tsx — issue, quote, buy and redeem deposit
// certificates (02 §3.1 / §12.1). The secondary market is a quote list, not an
// order book; buying a quote transfers the certificate and burns the 0.1% fee.

import React, { useCallback, useEffect, useState } from "react";
import { Badge, Button, EmptyState, Money, NumberInput, Panel, Select, Table } from "../../ui/index.ts";
import {
  buyCertificateQuote,
  fetchCertificates,
  fetchCertificateQuotes,
  issueCertificate,
  quoteCertificate,
  redeemCertificate,
} from "../../ui/api.ts";
import { toNumber } from "../../ui/Money.tsx";
import { useWrite } from "../_shared/useWrite.ts";
import { messageOf } from "../_shared/errors.ts";
import type { BankCommon } from "../BankPanel.tsx";

export interface CertificatesTabProps {
  common: BankCommon;
}

const TERMS = [30, 90, 180, 365];

export const CertificatesTab: React.FC<CertificatesTabProps> = ({ common }) => {
  const [certificates, setCertificates] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bankId, setBankId] = useState(common.banks[0]?.id ?? "");
  const [currency, setCurrency] = useState("cc4");
  const [amount, setAmount] = useState("1000");
  const [term, setTerm] = useState("90");
  const [quoteCert, setQuoteCert] = useState("");
  const [yieldBps, setYieldBps] = useState("300");

  const load = useCallback(async () => {
    setLoading(true);
    const [certResult, quoteResult] = await Promise.allSettled([fetchCertificates(), fetchCertificateQuotes()]);
    if (certResult.status === "fulfilled") setCertificates(certResult.value?.certificates ?? []);
    if (quoteResult.status === "fulfilled") setQuotes(quoteResult.value?.quotes ?? []);
    setError(
      certResult.status === "rejected"
        ? messageOf(certResult.reason)
        : quoteResult.status === "rejected"
          ? messageOf(quoteResult.reason)
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

  const write = useWrite(async () => {
    await load();
    await common.reload();
  });

  const bankOptions = common.banks.length ? common.banks.map((row) => ({ value: String(row.id), label: `${row.name} (${row.code})` })) : [{ value: "", label: "暂无银行" }];
  const currencyOptions = (common.wallet?.currencies ?? []).map((row: any) => ({ value: String(row.code), label: `${row.code} · ${row.name}` }));
  const options = currencyOptions.length ? currencyOptions : [{ value: "cc4", label: "cc4" }];

  return (
    <div style={{ display: "grid", gap: "var(--atlas-3)" }}>
      <Panel title="发行存单" hint="期限 30/90/180/365 天，从钱包扣除本金">
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
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>本金</div>
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
              disabled={!bankId || toNumber(amount) <= 0}
              onClick={() => void write.run(() => issueCertificate(bankId, { currency_code: currency, amount, term_days: Math.floor(Number(term)) }), "存单已发行")}
            >
              发行
            </Button>
          </div>
        </div>
      </Panel>

      <Panel title="我的存单" hint={`${certificates.length} 张`}>
        {error ? <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-small)" }}>{error}</div> : null}
        <Table
          ariaLabel="我的存单"
          loading={loading}
          rows={certificates}
          rowKey={(row) => String(row.id)}
          empty={<EmptyState title="没有存单" />}
          columns={[
            { key: "currency", header: "币种", width: 70, render: (row) => row.currency_code },
            { key: "principal", header: "本金", width: 120, align: "right", render: (row) => <Money value={row.principal} /> },
            { key: "interest", header: "应计利息", width: 110, align: "right", render: (row) => <Money value={row.accrued_interest} muted /> },
            { key: "rate", header: "利率", width: 80, align: "right", render: (row) => <span className="atlas-tabular">{(toNumber(row.rate_bps) / 100).toFixed(2)}%</span> },
            { key: "matures", header: "到期", width: 130, render: (row) => String(row.matures_at ?? "").slice(0, 10) },
            { key: "status", header: "状态", width: 90, render: (row) => <Badge tone={row.status === "active" ? "down" : "neutral"}>{row.status}</Badge> },
            {
              key: "action",
              header: "操作",
              width: 150,
              align: "right",
              render: (row) => (
                <span style={{ display: "inline-flex", gap: "var(--atlas-1)" }}>
                  <Button size="sm" onClick={() => setQuoteCert(String(row.id))} disabled={row.status !== "active"}>报价</Button>
                  <Button size="sm" loading={write.busy} disabled={row.status !== "active"} onClick={() => void write.run(() => redeemCertificate(String(row.id)), "存单已兑付")}>兑付</Button>
                </span>
              ),
            },
          ]}
        />
        <div style={{ display: "flex", gap: "var(--atlas-2)", alignItems: "flex-end", flexWrap: "wrap", borderTop: "1px solid var(--atlas-line)", paddingTop: "var(--atlas-2)" }}>
          <div style={{ minWidth: 220 }}>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>存单</div>
            <Select value={quoteCert} onChange={(event) => setQuoteCert(event.target.value)} options={[{ value: "", label: "选择存单" }, ...certificates.filter((row) => row.status === "active").map((row) => ({ value: String(row.id), label: `${String(row.id).slice(0, 8)} · ${row.currency_code} ${row.principal}` }))]} />
          </div>
          <div style={{ minWidth: 140 }}>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>报价收益率 bp</div>
            <NumberInput value={yieldBps} onChange={setYieldBps} min={0} max={5000} step={50} />
          </div>
          <Button loading={write.busy} disabled={!quoteCert} onClick={() => void write.run(() => quoteCertificate(quoteCert, Math.floor(Number(yieldBps) || 0)), "报价已挂出")}>报价出售</Button>
        </div>
      </Panel>

      <Panel title="存单二级市场" hint={`${quotes.length} 条报价`}>
        <Table
          ariaLabel="存单报价"
          rows={quotes}
          rowKey={(row) => String(row.quote_id)}
          empty={<EmptyState title="暂无报价" />}
          columns={[
            { key: "currency", header: "币种", width: 70, render: (row) => row.currency_code },
            { key: "principal", header: "面额", width: 120, align: "right", render: (row) => <Money value={row.principal} /> },
            { key: "price", header: "报价", width: 120, align: "right", render: (row) => <Money value={row.price} /> },
            { key: "yield", header: "收益率", width: 90, align: "right", render: (row) => <span className="atlas-tabular">{row.ask_yield_bps}bp</span> },
            { key: "expires", header: "有效至", width: 130, render: (row) => String(row.expires_at ?? "").slice(0, 16).replace("T", " ") },
            {
              key: "action",
              header: "操作",
              width: 90,
              align: "right",
              render: (row) => <Button size="sm" loading={write.busy} onClick={() => void write.run(() => buyCertificateQuote(String(row.quote_id)), "存单已买入")}>买入</Button>,
            },
          ]}
        />
      </Panel>
    </div>
  );
};

export default CertificatesTab;

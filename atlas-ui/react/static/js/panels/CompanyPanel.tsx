// panels/CompanyPanel.tsx — company list + detail with six sub-tabs
// (06 §4, T-67e). The list and the selected company's detail/governance are the
// only shared reads; each tab owns its forms.

import React, { useCallback, useEffect, useState } from "react";
import { Badge, Button, EmptyState, Panel, Tabs } from "../ui/index.ts";
import { fetchCompanies, fetchCompany, fetchGovernance, registerCompany } from "../ui/api.ts";
import { messageOf } from "./_shared/errors.ts";
import Notice from "./_shared/Notice.tsx";
import { useWrite } from "./_shared/useWrite.ts";
import OverviewTab from "./Company/OverviewTab.tsx";
import EquityTab from "./Company/EquityTab.tsx";
import GovernanceTab from "./Company/GovernanceTab.tsx";
import FinancialsTab from "./Company/FinancialsTab.tsx";
import RelatedPartyTab from "./Company/RelatedPartyTab.tsx";
import LicensesTab from "./Company/LicensesTab.tsx";

type Tab = "overview" | "equity" | "governance" | "financials" | "related" | "licenses";

const TABS = [
  { id: "overview", label: "概览" },
  { id: "equity", label: "股权" },
  { id: "governance", label: "治理" },
  { id: "financials", label: "财报" },
  { id: "related", label: "关联交易" },
  { id: "licenses", label: "许可" },
];

export interface CompanyCommon {
  detail: any;
  governance: any;
  reload: () => Promise<void>;
  onChanged: () => void;
}

export const CompanyPanel: React.FC = () => {
  const [companies, setCompanies] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [governance, setGovernance] = useState<any>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTicker, setNewTicker] = useState("");
  const [newName, setNewName] = useState("");
  const [newShares, setNewShares] = useState("1000000");
  const [newSector, setNewSector] = useState("core");

  const loadCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCompanies();
      const rows: any[] = data?.companies ?? [];
      setCompanies(rows);
      if (!selected && rows.length) setSelected(String(rows[0].ticker));
      setError(null);
    } catch (raw) {
      setError(messageOf(raw));
    } finally {
      setLoading(false);
    }
  }, [selected]);

  const loadDetail = useCallback(async (ticker: string) => {
    try {
      const [companyResult, governanceResult] = await Promise.allSettled([fetchCompany(ticker), fetchGovernance(ticker)]);
      if (companyResult.status === "fulfilled") setDetail(companyResult.value);
      else {
        setDetail(null);
        setError(messageOf(companyResult.reason));
      }
      if (governanceResult.status === "fulfilled") setGovernance(governanceResult.value);
      else setGovernance(null);
    } catch (raw) {
      setError(messageOf(raw));
    }
  }, []);

  useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

  useEffect(() => {
    if (selected) void loadDetail(selected);
  }, [selected, loadDetail]);

  const reload = useCallback(async () => {
    await loadCompanies();
    if (selected) await loadDetail(selected);
  }, [loadCompanies, loadDetail, selected]);

  const write = useWrite(reload);
  const common: CompanyCommon = {
    detail,
    governance,
    reload,
    onChanged: () => {
      void loadCompanies();
      if (selected) void loadDetail(selected);
    },
  };

  const createCompany = async () => {
    const outcome = await write.run(
      () =>
        registerCompany({
          ticker: newTicker.trim().toUpperCase(),
          name: newName.trim(),
          shares_total: Math.floor(Number(newShares) || 1_000_000),
          jurisdiction_sector: newSector.trim() || "core",
        }),
      "公司已注册",
    );
    if (outcome.ok) {
      setNewTicker("");
      setNewName("");
    }
  };

  return (
    <div style={{ display: "grid", gap: "var(--atlas-3)" }}>
      <Panel title="公司" hint={`${companies.length} 家`} actions={<Button size="sm" loading={loading} onClick={() => void reload()}>刷新</Button>}>
        <Notice text={error} />
        <div style={{ display: "grid", gridTemplateColumns: "300px minmax(0, 1fr)", gap: "var(--atlas-3)", alignItems: "start" }}>
          <div style={{ display: "grid", gap: "var(--atlas-2)" }}>
            <div className="atlas-scroll" style={{ maxHeight: 420, overflowY: "auto", display: "grid", gap: 2 }}>
              {companies.length === 0 && !loading ? <EmptyState title="还没有公司" hint="在下方注册第一家。" /> : null}
              {companies.map((row) => {
                const active = row.ticker === selected;
                return (
                  <button
                    key={row.ticker}
                    type="button"
                    onClick={() => {
                      setSelected(String(row.ticker));
                      setTab("overview");
                    }}
                    style={{
                      textAlign: "left",
                      cursor: "pointer",
                      background: active ? "var(--atlas-plate-2)" : "transparent",
                      border: "none",
                      borderLeft: `2px solid ${active ? "var(--atlas-signal)" : "transparent"}`,
                      borderBottom: "1px solid var(--atlas-line)",
                      padding: "7px 8px",
                      fontFamily: "var(--atlas-font)",
                      color: "var(--atlas-n-900)",
                    }}
                  >
                    <span style={{ color: "var(--atlas-n-950)" }}>{row.ticker}</span>
                    <span style={{ display: "block", fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-600)" }}>
                      {row.name} · <Badge tone={row.status === "private" ? "neutral" : "signal"}>{row.status}</Badge>
                    </span>
                  </button>
                );
              })}
            </div>

            <div style={{ borderTop: "1px solid var(--atlas-line)", paddingTop: "var(--atlas-2)", display: "grid", gap: "var(--atlas-1)" }}>
              <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)" }}>注册公司</div>
              <input value={newTicker} onChange={(event) => setNewTicker(event.target.value.toUpperCase())} placeholder="TICKER" maxLength={8} style={{ height: 30, padding: "0 var(--atlas-2)", background: "var(--atlas-plate-2)", border: "1px solid var(--atlas-line-strong)", borderRadius: "var(--atlas-r-md)", color: "var(--atlas-n-950)", fontFamily: "var(--atlas-mono)" }} />
              <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="公司名称" maxLength={64} style={{ height: 30, padding: "0 var(--atlas-2)", background: "var(--atlas-plate-2)", border: "1px solid var(--atlas-line-strong)", borderRadius: "var(--atlas-r-md)", color: "var(--atlas-n-950)" }} />
              <div style={{ display: "flex", gap: "var(--atlas-1)" }}>
                <input value={newShares} onChange={(event) => setNewShares(event.target.value)} placeholder="股本" style={{ flex: 1, minWidth: 0, height: 30, padding: "0 var(--atlas-2)", background: "var(--atlas-plate-2)", border: "1px solid var(--atlas-line-strong)", borderRadius: "var(--atlas-r-md)", color: "var(--atlas-n-950)", fontFamily: "var(--atlas-mono)" }} />
                <input value={newSector} onChange={(event) => setNewSector(event.target.value)} placeholder="sector" style={{ width: 80, height: 30, padding: "0 var(--atlas-2)", background: "var(--atlas-plate-2)", border: "1px solid var(--atlas-line-strong)", borderRadius: "var(--atlas-r-md)", color: "var(--atlas-n-950)" }} />
              </div>
              <Button variant="primary" loading={write.busy} disabled={!newTicker.trim() || newName.trim().length < 2} onClick={() => void createCompany()}>
                注册
              </Button>
              {write.error ? <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-micro)" }}>{write.error}</div> : null}
            </div>
          </div>

          <div style={{ display: "grid", gap: "var(--atlas-3)", minWidth: 0 }}>
            {!selected || !detail ? (
              <Panel title="公司详情"><EmptyState title={selected ? "读取中…" : "选择一家公司"} /></Panel>
            ) : (
              <>
                <Panel
                  title={`${detail.ticker} · ${detail.name}`}
                  hint={`股本 ${Number(detail.shares_total).toLocaleString("en-US")} · 净资产 ${formatMoney(detail.book_value)}`}
                  actions={<Badge tone={detail.status === "private" ? "neutral" : "signal"}>{detail.status}</Badge>}
                >
                  <Tabs items={TABS} active={tab} onChange={(id) => setTab(id as Tab)} dense />
                </Panel>
                {tab === "overview" ? <OverviewTab common={common} /> : null}
                {tab === "equity" ? <EquityTab common={common} /> : null}
                {tab === "governance" ? <GovernanceTab common={common} /> : null}
                {tab === "financials" ? <FinancialsTab common={common} /> : null}
                {tab === "related" ? <RelatedPartyTab common={common} /> : null}
                {tab === "licenses" ? <LicensesTab /> : null}
              </>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
};

function formatMoney(value: unknown): string {
  const number = Number(String(value ?? "0"));
  return Number.isFinite(number) ? number.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "0";
}

export default CompanyPanel;

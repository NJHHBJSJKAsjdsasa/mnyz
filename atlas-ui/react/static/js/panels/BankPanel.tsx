// panels/BankPanel.tsx — the seven bank sub-surfaces (06 §3, T-67d).
//
// Parent owns the slow reads that every tab needs (banks, rates, wallet, deposit
// accounts). Tabs own their own writes through `_shared/useWrite`, so moving a tab
// file does not drag a provider with it.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Panel, Tabs } from "../ui/index.ts";
import { fetchBankAccounts, fetchBankRates, fetchBanks, fetchWallet, fetchWalletEntries } from "../ui/api.ts";
import { messageOf } from "./_shared/errors.ts";
import Notice from "./_shared/Notice.tsx";
import WalletTab from "./Bank/WalletTab.tsx";
import ExchangeTab from "./Bank/ExchangeTab.tsx";
import BanksTab from "./Bank/BanksTab.tsx";
import LoansTab from "./Bank/LoansTab.tsx";
import CertificatesTab from "./Bank/CertificatesTab.tsx";
import InterbankTab from "./Bank/InterbankTab.tsx";
import SafetyTab from "./Bank/SafetyTab.tsx";

type Tab = "wallet" | "exchange" | "banks" | "loans" | "cd" | "interbank" | "safety";

const TABS = [
  { id: "wallet", label: "钱包" },
  { id: "exchange", label: "兑换" },
  { id: "banks", label: "银行" },
  { id: "loans", label: "存贷" },
  { id: "cd", label: "存单" },
  { id: "interbank", label: "同业" },
  { id: "safety", label: "保障" },
];

export interface BankCommon {
  banks: any[];
  rates: any;
  wallet: any;
  accounts: any[];
  entries: any[];
  reload: () => Promise<void>;
}

export const BankPanel: React.FC = () => {
  const [tab, setTab] = useState<Tab>("wallet");
  const [banks, setBanks] = useState<any[]>([]);
  const [rates, setRates] = useState<any>(null);
  const [wallet, setWallet] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled([fetchBanks(), fetchBankRates(), fetchWallet(), fetchBankAccounts(), fetchWalletEntries(50)]);
    const failures: string[] = [];
    if (results[0].status === "fulfilled") setBanks(results[0].value?.banks ?? []);
    else failures.push(`银行：${messageOf(results[0].reason)}`);
    if (results[1].status === "fulfilled") setRates(results[1].value);
    else failures.push(`利率：${messageOf(results[1].reason)}`);
    if (results[2].status === "fulfilled") setWallet(results[2].value);
    else failures.push(`钱包：${messageOf(results[2].reason)}`);
    if (results[3].status === "fulfilled") setAccounts(results[3].value?.accounts ?? []);
    else failures.push(`存款：${messageOf(results[3].reason)}`);
    if (results[4].status === "fulfilled") setEntries(results[4].value?.entries ?? []);
    else failures.push(`流水：${messageOf(results[4].reason)}`);
    setError(failures.length ? failures.join(" · ") : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const common = useMemo<BankCommon>(() => ({ banks, rates, wallet, accounts, entries, reload }), [banks, rates, wallet, accounts, entries, reload]);

  return (
    <div style={{ display: "grid", gap: "var(--atlas-3)" }}>
      <Panel
        title="银行"
        hint={rates ? `基准 ${(rates.policy_rate_bps / 100).toFixed(2)}% · 存款 ${(rates.deposit_rate_bps / 100).toFixed(2)}% · 贷款 ${(rates.lend_rate_bps / 100).toFixed(2)}%` : undefined}
        actions={<Button size="sm" loading={loading} onClick={() => void reload()}>刷新</Button>}
      >
        <Tabs items={TABS} active={tab} onChange={(id) => setTab(id as Tab)} dense />
        <Notice text={error} />
      </Panel>

      {tab === "wallet" ? <WalletTab common={common} /> : null}
      {tab === "exchange" ? <ExchangeTab common={common} /> : null}
      {tab === "banks" ? <BanksTab common={common} /> : null}
      {tab === "loans" ? <LoansTab common={common} /> : null}
      {tab === "cd" ? <CertificatesTab common={common} /> : null}
      {tab === "interbank" ? <InterbankTab /> : null}
      {tab === "safety" ? <SafetyTab common={common} /> : null}
    </div>
  );
};

export default BankPanel;

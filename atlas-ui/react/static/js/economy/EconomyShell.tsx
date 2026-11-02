// EconomyShell — panel registry + wiring into <AtlasShell>.
//
// Before 2026-10-28 this file was 299 lines: launcher + hash router + polling +
// TopRail + NavRail + PanelHost + StatusBar. The seven pieces now live in
// Shell/* (and panels/PanelHost), each with one job. What is left here is the part
// that is genuinely about *economy*: which panels exist and what each renders.
//
// Adding a panel = one entry in PANELS + one case in renderPanel.
// 2026-10-29: the old `economy/{Assets,Bank,Log,Market}Panel.tsx` were deleted
// (822 lines, zero imports after T-67 shipped). This file is the only survivor.

import React from "react";
import { createRoot, type Root } from "react-dom/client";
import AtlasShell from "../Shell/AtlasShell.tsx";
import AssetsPanel from "../panels/AssetsPanel.tsx";
import BankPanel from "../panels/BankPanel.tsx";
import CompanyPanel from "../panels/CompanyPanel.tsx";
import LegalPanel from "../panels/LegalPanel.tsx";
import LogPanel from "../panels/LogPanel.tsx";
import MarketPanel from "../panels/MarketPanel.tsx";

export type PanelId = "assets" | "bank" | "market" | "company" | "legal" | "log";

const PANELS = [
  { id: "assets", label: "资产", hint: "钱包·持仓·到期" },
  { id: "bank", label: "银行", hint: "存贷·兑换·存单" },
  { id: "market", label: "市场", hint: "指数·行情·做市" },
  { id: "company", label: "公司", hint: "股权·治理·财报" },
  { id: "legal", label: "法务", hint: "产权·诉讼·破产" },
  { id: "log", label: "活动", hint: "事件流" },
];

const EconomyShell: React.FC = () => (
  <AtlasShell
    panels={PANELS}
    label="经济"
    renderPanel={(id, snapshot) => {
      switch (id) {
        case "assets":
          return <AssetsPanel snapshot={snapshot} />;
        case "bank":
          return <BankPanel />;
        case "market":
          return <MarketPanel />;
        case "company":
          return <CompanyPanel />;
        case "legal":
          return <LegalPanel />;
        case "log":
          return <LogPanel />;
        default:
          return null;
      }
    }}
  />
);

export default EconomyShell;

let mountedShell: Root | null = null;

/**
 * Mount the economy shell into `document.body`, once.
 *
 * The shell used to exist only inside `Layouts/__main__.tsx`, so the galaxy,
 * system and planet pages had no way to reach the economy panels at all — the
 * 74 endpoints behind them were unreachable from where players actually spend
 * their time (2026-10-29, 8 Layout 接入).
 *
 * Mounted imperatively rather than added to seven layouts: the shell is
 * `position: fixed` and self-contained, and one call site per entry point cannot
 * drift the way seven copies of `<EconomyShell />` would.
 */
export const ensureEconomyShell = (): void => {
  if (mountedShell || typeof document === "undefined") return;
  const host = document.createElement("div");
  host.id = "atlas-economy-shell";
  document.body.appendChild(host);
  mountedShell = createRoot(host);
  mountedShell.render(<EconomyShell />);
};

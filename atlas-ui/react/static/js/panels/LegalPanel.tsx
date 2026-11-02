// panels/LegalPanel.tsx — property, court and insolvency in one place
// (06 §5–6, T-67f). Property is the only surface with a public market; court and
// insolvency are case-id driven because the backend exposes no case list for
// insolvency and no panel id on a case detail.

import React, { useState } from "react";
import { Panel, Tabs } from "../ui/index.ts";
import PropertyTab from "./Legal/PropertyTab.tsx";
import CourtTab from "./Legal/CourtTab.tsx";
import InsolvencyTab from "./Legal/InsolvencyTab.tsx";

type Tab = "property" | "court" | "insolvency";

const TABS = [
  { id: "property", label: "产权" },
  { id: "court", label: "诉讼" },
  { id: "insolvency", label: "破产" },
];

export const LegalPanel: React.FC = () => {
  const [tab, setTab] = useState<Tab>("property");
  return (
    <div style={{ display: "grid", gap: "var(--atlas-3)" }}>
      <Panel title="法务" hint="产权 / 诉讼 / 破产">
        <Tabs items={TABS} active={tab} onChange={(id) => setTab(id as Tab)} dense />
      </Panel>
      {tab === "property" ? <PropertyTab /> : null}
      {tab === "court" ? <CourtTab /> : null}
      {tab === "insolvency" ? <InsolvencyTab /> : null}
    </div>
  );
};

export default LegalPanel;

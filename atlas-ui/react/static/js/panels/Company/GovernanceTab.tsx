// panels/Company/GovernanceTab.tsx — charter, officers, meetings and resolutions.
//
// The charter is a JSON document with six required sections; the server validates
// it. The editor therefore starts from the current document (or `{}`) and never
// invents clauses.

import React, { useEffect, useState } from "react";
import { Badge, Button, Checkbox, EmptyState, NumberInput, Panel, Select, Table } from "../../ui/index.ts";
import { formatAmount, toNumber } from "../../ui/Money.tsx";
import { closeResolution, conveneMeeting, proposeResolution, submitCharter, voteResolution } from "../../ui/api.ts";
import { useWrite } from "../_shared/useWrite.ts";
import { messageOf } from "../_shared/errors.ts";
import type { CompanyCommon } from "../CompanyPanel.tsx";

export interface GovernanceTabProps {
  common: CompanyCommon;
}

const RESOLUTION_KINDS = [
  "charter_amendment",
  "officer_appointment",
  "dividend",
  "buyback",
  "issuance",
  "reduction",
  "related_party",
  "dissolution",
  "other",
];

export const GovernanceTab: React.FC<GovernanceTabProps> = ({ common }) => {
  const detail = common.detail ?? {};
  const governance = common.governance ?? {};
  const [charter, setCharter] = useState("{}");
  const [resolutionKind, setResolutionKind] = useState("charter_amendment");
  const [resolutionPayload, setResolutionPayload] = useState("{}");
  const [error, setError] = useState<string | null>(null);
  // 08 §4 capital actions: the money only moves when the resolution closes, so
  // the panel shows what the close actually executed.
  const [capitalKind, setCapitalKind] = useState("buyback");
  const [capitalPrice, setCapitalPrice] = useState("1");
  const [capitalShares, setCapitalShares] = useState("1000");
  const [placement, setPlacement] = useState(false);
  const [applied, setApplied] = useState<any>(null);

  useEffect(() => {
    setCharter(JSON.stringify(governance.charter?.document ?? {}, null, 2));
  }, [governance.charter?.version]);

  const write = useWrite(common.onChanged);

  const parse = (text: string): Record<string, unknown> | null => {
    try {
      const value = JSON.parse(text || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : null;
    } catch {
      return null;
    }
  };

  const saveCharter = async () => {
    const document = parse(charter);
    if (!document) {
      setError("章程必须是 JSON 对象");
      return;
    }
    setError(null);
    await write.run(() => submitCharter(String(detail.ticker), document), "章程已提交");
  };

  const propose = async () => {
    const payload = parse(resolutionPayload);
    if (!payload) {
      setError("决议 payload 必须是 JSON 对象");
      return;
    }
    setError(null);
    await write.run(() => proposeResolution(String(detail.ticker), resolutionKind, payload), "决议已提出");
  };

  const proposeCapital = async () => {
    const payload: Record<string, unknown> = {
      price: capitalPrice,
      shares: Math.floor(toNumber(capitalShares)),
    };
    if (capitalKind === "issuance" && placement) {
      // The buyer pays, and the server only accepts the proposer as buyer.
      payload.buyer_actor_id = detail.my_actor_id;
    }
    setError(null);
    await write.run(() => proposeResolution(String(detail.ticker), capitalKind, payload), "资本动作决议已提出");
  };

  const close = async (resolutionId: string) => {
    const result = await write.run(() => closeResolution(resolutionId), "决议已结束");
    if (result.ok) setApplied((result.value as any)?.applied ?? null);
  };

  const resolutions: any[] = governance.resolutions ?? [];
  const officers: any[] = governance.officers ?? [];
  const board: any[] = governance.board ?? [];

  return (
    <div style={{ display: "grid", gap: "var(--atlas-3)" }}>
      <Panel title="章程" hint={governance.charter ? `版本 ${governance.charter.version}` : "尚未通过"}>
        {error || write.error ? <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-small)" }}>{error ?? write.error}</div> : null}
        <textarea
          value={charter}
          onChange={(event) => setCharter(event.target.value)}
          spellCheck={false}
          rows={10}
          style={{ width: "100%", background: "var(--atlas-deep)", color: "var(--atlas-n-900)", border: "1px solid var(--atlas-line-strong)", borderRadius: "var(--atlas-r-md)", padding: "var(--atlas-2)", fontFamily: "var(--atlas-mono)", fontSize: "var(--atlas-t-small)" }}
        />
        <div style={{ display: "flex", gap: "var(--atlas-2)", alignItems: "center" }}>
          <Button variant="primary" loading={write.busy} onClick={() => void saveCharter()}>提交章程</Button>
          <span style={{ color: "var(--atlas-n-600)", fontSize: "var(--atlas-t-micro)" }}>
            需要 share_classes / board / meetings / capital / related_party / dispute 六个条款。
          </span>
        </div>
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "var(--atlas-3)" }}>
        <Panel title="高管" hint={`${officers.length} 位`}>
          <Table
            ariaLabel="高管"
            rows={officers}
            rowKey={(row) => `${row.actor_id}-${row.role}`}
            empty={<EmptyState title="尚无高管" />}
            columns={[
              { key: "name", header: "姓名", width: 140, render: (row) => row.display_name },
              { key: "role", header: "角色", width: 120, render: (row) => <Badge tone="neutral">{row.role}</Badge> },
              { key: "term", header: "任期至", width: 130, render: (row) => row.term_until ? String(row.term_until).slice(0, 10) : "—" },
            ]}
          />
        </Panel>
        <Panel title="董事会" hint={`${board.length} 席`}>
          <Table
            ariaLabel="董事会"
            rows={board}
            rowKey={(row) => String(row.seat_no)}
            empty={<EmptyState title="尚无董事" />}
            columns={[
              { key: "seat", header: "席位", width: 70, render: (row) => row.seat_no },
              { key: "name", header: "董事", width: 160, render: (row) => row.display_name || (row.actor_id ? String(row.actor_id).slice(0, 10) : "空席") },
            ]}
          />
        </Panel>
      </div>

      <Panel title="股东会与决议" hint={`${resolutions.length} 项`}>
        <div style={{ display: "flex", gap: "var(--atlas-2)", flexWrap: "wrap" }}>
          <Button loading={write.busy} onClick={() => void write.run(() => conveneMeeting(String(detail.ticker), "extraordinary"), "股东会已召集")}>召集临时股东会</Button>
          <Button loading={write.busy} onClick={() => void write.run(() => conveneMeeting(String(detail.ticker), "annual"), "年度股东会已召集")}>召集年度股东会</Button>
        </div>

        <Table
          ariaLabel="决议"
          rows={resolutions}
          rowKey={(row) => String(row.id)}
          empty={<EmptyState title="暂无决议" />}
          columns={[
            { key: "kind", header: "类型", width: 150, render: (row) => row.kind },
            { key: "special", header: "特别", width: 70, render: (row) => (row.special ? <Badge tone="warn">2/3</Badge> : <Badge tone="neutral">过半</Badge>) },
            { key: "yes", header: "赞成", width: 90, align: "right", render: (row) => <span className="atlas-tabular">{row.yes}</span> },
            { key: "no", header: "反对", width: 90, align: "right", render: (row) => <span className="atlas-tabular">{row.no}</span> },
            { key: "abstain", header: "弃权", width: 90, align: "right", render: (row) => <span className="atlas-tabular">{row.abstain}</span> },
            { key: "status", header: "状态", width: 90, render: (row) => <Badge tone={row.status === "passed" ? "down" : row.status === "rejected" ? "danger" : "neutral"}>{row.status}</Badge> },
            {
              key: "action",
              header: "操作",
              width: 240,
              align: "right",
              render: (row) =>
                row.status === "draft" ? (
                  <span style={{ display: "inline-flex", gap: "var(--atlas-1)" }}>
                    <Button size="sm" loading={write.busy} onClick={() => void write.run(() => voteResolution(String(row.id), "yes"), "已投赞成")}>赞成</Button>
                    <Button size="sm" loading={write.busy} onClick={() => void write.run(() => voteResolution(String(row.id), "no"), "已投反对")}>反对</Button>
                    <Button size="sm" loading={write.busy} onClick={() => void write.run(() => voteResolution(String(row.id), "abstain"), "已投弃权")}>弃权</Button>
                    <Button size="sm" loading={write.busy} onClick={() => void close(String(row.id))}>结束</Button>
                  </span>
                ) : null,
            },
          ]}
        />

        {applied ? (
          <div style={{ borderTop: "1px solid var(--atlas-line)", paddingTop: "var(--atlas-2)", color: "var(--atlas-signal)", fontSize: "var(--atlas-t-small)" }}>
            最近执行：{applied.action} · {applied.shares} 股 @ {applied.price}
            {applied.cost ? ` · 支出 ${formatAmount(applied.cost)}` : ""}
            {applied.paid_out ? ` · 派发 ${formatAmount(applied.paid_out)}` : ""}
            {applied.raised && applied.raised !== "0.0000" ? ` · 募资 ${formatAmount(applied.raised)}` : ""}
            {applied.treasury_stock ? " · 计入库存股" : ""}
            {applied.mode === "offering" ? " · 已挂卖单" : ""}
          </div>
        ) : null}

        <div style={{ borderTop: "1px solid var(--atlas-line)", paddingTop: "var(--atlas-2)", display: "flex", gap: "var(--atlas-2)", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ minWidth: 150 }}>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>资本动作</div>
            <Select
              value={capitalKind}
              onChange={(event) => setCapitalKind(event.target.value)}
              options={[
                { value: "buyback", label: "回购" },
                { value: "issuance", label: "增发" },
                { value: "reduction", label: "减资" },
              ]}
            />
          </div>
          <div style={{ minWidth: 130 }}>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>每股价格</div>
            <NumberInput value={capitalPrice} onChange={setCapitalPrice} min={0} decimals={4} step={1} />
          </div>
          <div style={{ minWidth: 130 }}>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>股数</div>
            <NumberInput value={capitalShares} onChange={setCapitalShares} min={0} decimals={0} step={1000} />
          </div>
          {capitalKind === "issuance" ? (
            <div style={{ paddingBottom: 6 }}>
              <Checkbox checked={placement} onChange={setPlacement} label="定向增发（自己认购）" />
            </div>
          ) : null}
          <Button
            variant="primary"
            loading={write.busy}
            disabled={toNumber(capitalPrice) <= 0 || toNumber(capitalShares) <= 0}
            onClick={() => void proposeCapital()}
          >
            提出资本动作
          </Button>
          <span style={{ color: "var(--atlas-n-600)", fontSize: "var(--atlas-t-micro)" }}>
            通过后立即执行：金库付款 / 铸股挂单 / 按比例注销。
          </span>
        </div>

        <div style={{ borderTop: "1px solid var(--atlas-line)", paddingTop: "var(--atlas-2)", display: "flex", gap: "var(--atlas-2)", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ minWidth: 200 }}>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>决议类型</div>
            <Select value={resolutionKind} onChange={(event) => setResolutionKind(event.target.value)} options={RESOLUTION_KINDS.map((kind) => ({ value: kind, label: kind }))} />
          </div>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>payload（JSON）</div>
            <textarea
              value={resolutionPayload}
              onChange={(event) => setResolutionPayload(event.target.value)}
              rows={3}
              spellCheck={false}
              style={{ width: "100%", background: "var(--atlas-deep)", color: "var(--atlas-n-900)", border: "1px solid var(--atlas-line-strong)", borderRadius: "var(--atlas-r-md)", padding: "var(--atlas-2)", fontFamily: "var(--atlas-mono)", fontSize: "var(--atlas-t-small)" }}
            />
          </div>
          <Button loading={write.busy} onClick={() => void propose()}>提出决议</Button>
        </div>
        {error ? <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-micro)" }}>{messageOf(error)}</div> : null}
      </Panel>
    </div>
  );
};

export default GovernanceTab;

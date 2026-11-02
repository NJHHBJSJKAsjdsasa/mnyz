// panels/Legal/CourtTab.tsx — commercial cases, evidence, appeal, enforcement and
// the player panel (06 §6.1). The panel is loaded by id because case detail does
// not carry its panel id.

import React, { useCallback, useEffect, useState } from "react";
import { Badge, Button, EmptyState, Money, NumberInput, Panel, Select, Table } from "../../ui/index.ts";
import {
  addCourtEvidence,
  appealCourtCase,
  enforceCourtCase,
  fetchCourtCase,
  fetchCourtCases,
  fetchCourtPanel,
  fileCourtCase,
  requestJudgmentRecognition,
  appealRecognition,
  strikeCourtPanel,
  voteCourtPanel,
} from "../../ui/api.ts";
import { useWrite } from "../_shared/useWrite.ts";
import { messageOf } from "../_shared/errors.ts";

const CASE_KINDS = ["contract", "tort", "corporate", "insolvency", "takeover", "regulatory"];

export const CourtTab: React.FC = () => {
  const [cases, setCases] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [defendant, setDefendant] = useState("");
  const [caseKind, setCaseKind] = useState("contract");
  const [amount, setAmount] = useState("0");
  const [claim, setClaim] = useState("");
  const [currency, setCurrency] = useState("cc1");
  const [companyTicker, setCompanyTicker] = useState("");
  const [evidence, setEvidence] = useState("");
  const [region, setRegion] = useState("");
  const [panelId, setPanelId] = useState("");
  const [panel, setPanel] = useState<any>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [strikeMember, setStrikeMember] = useState("");
  const [panelReason, setPanelReason] = useState("");

  const loadCases = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCourtCases();
      setCases(data?.cases ?? []);
      setError(null);
    } catch (raw) {
      setError(messageOf(raw));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (caseId: string) => {
    try {
      setDetail(await fetchCourtCase(caseId));
    } catch (raw) {
      setDetail(null);
      setError(messageOf(raw));
    }
  }, []);

  useEffect(() => {
    void loadCases();
  }, [loadCases]);

  useEffect(() => {
    if (selected) void loadDetail(selected);
  }, [selected, loadDetail]);

  const write = useWrite(async () => {
    await loadCases();
    if (selected) await loadDetail(selected);
  });

  const submitCase = async () => {
    const outcome = await write.run(
      () =>
        fileCourtCase({
          kind: caseKind,
          defendant_actor_id: defendant.trim(),
          amount,
          claim,
          currency_code: currency,
          company_ticker: companyTicker.trim() || undefined,
        }),
      "诉讼已提交",
    );
    if (outcome.ok) {
      setDefendant("");
      setClaim("");
    }
  };

  const loadPanel = async () => {
    if (!panelId.trim()) return;
    setPanelError(null);
    try {
      setPanel(await fetchCourtPanel(panelId.trim()));
    } catch (raw) {
      setPanel(null);
      setPanelError(messageOf(raw));
    }
  };

  const selectedRow = cases.find((row) => row.id === selected);
  const evidenceRows: any[] = detail?.evidence ?? [];
  const panelMembers: any[] = panel?.members ?? [];
  const recognitions: any[] = detail?.recognitions ?? [];

  return (
    <div style={{ display: "grid", gap: "var(--atlas-3)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "360px minmax(0, 1fr)", gap: "var(--atlas-3)", alignItems: "start" }}>
        <Panel title="我的案件" hint={`${cases.length} 宗`} actions={<Button size="sm" loading={loading} onClick={() => void loadCases()}>刷新</Button>}>
          {error ? <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-small)" }}>{error}</div> : null}
          <Table
            ariaLabel="案件列表"
            loading={loading}
            rows={cases}
            rowKey={(row) => String(row.id)}
            onRowClick={(row) => setSelected(String(row.id))}
            activeKey={selected}
            empty={<EmptyState title="还没有案件" />}
            columns={[
              { key: "kind", header: "类型", width: 100, render: (row) => row.kind },
              { key: "status", header: "状态", width: 100, render: (row) => <Badge tone={row.status === "judgment" ? "warn" : row.status === "closed" ? "down" : "neutral"}>{row.status}</Badge> },
              { key: "amount", header: "标的", width: 120, align: "right", render: (row) => <Money value={row.amount} currency={row.currency_code} /> },
            ]}
          />
          <div style={{ display: "grid", gap: "var(--atlas-1)", borderTop: "1px solid var(--atlas-line)", paddingTop: "var(--atlas-2)" }}>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)" }}>发起诉讼</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--atlas-1)" }}>
              <Select value={caseKind} onChange={(event) => setCaseKind(event.target.value)} options={CASE_KINDS.map((kind) => ({ value: kind, label: kind }))} />
              <Select value={currency} onChange={(event) => setCurrency(event.target.value)} options={[{ value: "cc1", label: "cc1" }, { value: "cc4", label: "cc4" }, { value: "cc5", label: "cc5" }]} />
            </div>
            <input value={defendant} onChange={(event) => setDefendant(event.target.value)} placeholder="被告 actor_id" style={{ height: 30, padding: "0 var(--atlas-2)", background: "var(--atlas-plate-2)", border: "1px solid var(--atlas-line-strong)", borderRadius: "var(--atlas-r-md)", color: "var(--atlas-n-950)", fontFamily: "var(--atlas-mono)" }} />
            <input value={companyTicker} onChange={(event) => setCompanyTicker(event.target.value.toUpperCase())} placeholder="公司 ticker（可选）" maxLength={8} style={{ height: 30, padding: "0 var(--atlas-2)", background: "var(--atlas-plate-2)", border: "1px solid var(--atlas-line-strong)", borderRadius: "var(--atlas-r-md)", color: "var(--atlas-n-950)", fontFamily: "var(--atlas-mono)" }} />
            <NumberInput value={amount} onChange={setAmount} min={0} decimals={4} step={100} />
            <textarea value={claim} onChange={(event) => setClaim(event.target.value)} placeholder="诉请（≤2000 字）" rows={3} style={{ width: "100%", background: "var(--atlas-deep)", color: "var(--atlas-n-900)", border: "1px solid var(--atlas-line-strong)", borderRadius: "var(--atlas-r-md)", padding: "var(--atlas-2)", fontFamily: "var(--atlas-font)", fontSize: "var(--atlas-t-small)" }} />
            <Button variant="primary" loading={write.busy} disabled={!defendant.trim()} onClick={() => void submitCase()}>提交诉讼</Button>
            {write.error ? <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-micro)" }}>{write.error}</div> : null}
          </div>
        </Panel>

        <div style={{ display: "grid", gap: "var(--atlas-3)", minWidth: 0 }}>
          {!selected || !detail ? (
            <Panel title="案件详情"><EmptyState title={selected ? "读取中…" : "从左侧选择案件"} /></Panel>
          ) : (
            <>
              <Panel
                title={`案件 ${String(detail.id).slice(0, 8)}`}
                hint={`${detail.kind} · ${detail.status}`}
                actions={<Badge tone={detail.status === "judgment" ? "warn" : "neutral"}>{detail.currency_code}</Badge>}
              >
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "var(--atlas-2)", fontSize: "var(--atlas-t-small)" }}>
                  <span>原告 <span className="atlas-tabular">{String(detail.plaintiff_actor_id).slice(0, 10)}</span></span>
                  <span>被告 <span className="atlas-tabular">{String(detail.defendant_actor_id).slice(0, 10)}</span></span>
                  <span>标的 <Money value={detail.amount} currency={detail.currency_code} /></span>
                  <span>立案 <span className="atlas-tabular">{String(detail.filed_at ?? "").slice(0, 10)}</span></span>
                  <span>开庭 <span className="atlas-tabular">{detail.hearing_at ? String(detail.hearing_at).slice(0, 16).replace("T", " ") : "—"}</span></span>
                  <span>诉请 {detail.claim || "—"}</span>
                </div>
              </Panel>

              <Panel title="证据" hint={`${evidenceRows.length} 条`}>
                <Table
                  ariaLabel="证据"
                  rows={evidenceRows}
                  rowKey={(row) => String(row.id)}
                  empty={<EmptyState title="暂无证据" />}
                  columns={[
                    { key: "side", header: "提交方", width: 90, render: (row) => <Badge tone={row.side === "plaintiff" ? "signal" : "warn"}>{row.side === "plaintiff" ? "原告" : "被告"}</Badge> },
                    { key: "summary", header: "摘要", width: 400, render: (row) => row.summary },
                    { key: "at", header: "时间", width: 140, render: (row) => String(row.created_at ?? "").slice(0, 16).replace("T", " ") },
                  ]}
                />
                <div style={{ display: "flex", gap: "var(--atlas-2)", alignItems: "flex-end" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>新增证据摘要</div>
                    <input value={evidence} onChange={(event) => setEvidence(event.target.value)} maxLength={1000} style={{ width: "100%", height: 32, padding: "0 var(--atlas-2)", background: "var(--atlas-plate-2)", border: "1px solid var(--atlas-line-strong)", borderRadius: "var(--atlas-r-md)", color: "var(--atlas-n-950)" }} />
                  </div>
                  <Button loading={write.busy} disabled={!evidence.trim()} onClick={() => void write.run(() => addCourtEvidence(String(detail.id), { summary: evidence }), "证据已提交")}>提交证据</Button>
                </div>
              </Panel>

              <Panel title="判决与执行">
                {detail.judgment ? (
                  <div style={{ display: "grid", gap: 2, fontSize: "var(--atlas-t-small)" }}>
                    <span>判决 <Badge tone={detail.judgment.status === "enforced" ? "down" : "warn"}>{detail.judgment.status}</Badge></span>
                    <span>主文 {String(detail.judgment.judgment?.verdict ?? "")} · 评分 {String(detail.judgment.judgment?.score ?? "")}</span>
                    <span>救济 <Money value={detail.judgment.remedy?.pay ?? "0"} currency={detail.judgment.remedy?.currency_code ?? detail.currency_code} /></span>
                    <span style={{ color: "var(--atlas-n-600)", fontSize: "var(--atlas-t-micro)" }}>{detail.judgment.judgment?.reason}</span>
                  </div>
                ) : (
                  <EmptyState title="尚未判决" hint="判决由法院/运维开庭后产生。" />
                )}
                {detail.appeal ? (
                  <div style={{ display: "flex", gap: "var(--atlas-2)", alignItems: "center" }}>
                    <Badge tone="warn">上诉 {detail.appeal.status}</Badge>
                    <span style={{ color: "var(--atlas-n-700)", fontSize: "var(--atlas-t-small)" }}>{detail.appeal.outcome?.result ?? ""}</span>
                  </div>
                ) : null}
                <div style={{ display: "flex", gap: "var(--atlas-2)", flexWrap: "wrap", alignItems: "flex-end" }}>
                  <Button loading={write.busy} onClick={() => void write.run(() => appealCourtCase(String(detail.id), false), "上诉已提交")}>普通上诉</Button>
                  <Button loading={write.busy} onClick={() => void write.run(() => appealCourtCase(String(detail.id), true), "合议庭上诉已提交")}>合议庭上诉</Button>
                  <div style={{ minWidth: 140 }}>
                    <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>执行区域（留空 = 本区）</div>
                    <input value={region} onChange={(event) => setRegion(event.target.value)} placeholder="region" style={{ width: "100%", height: 32, padding: "0 var(--atlas-2)", background: "var(--atlas-plate-2)", border: "1px solid var(--atlas-line-strong)", borderRadius: "var(--atlas-r-md)", color: "var(--atlas-n-950)" }} />
                  </div>
                  <Button loading={write.busy} disabled={detail.status !== "judgment"} onClick={() => void write.run(() => enforceCourtCase(String(detail.id), region), "执行已提交")}>执行判决</Button>
                  {detail.judgment ? (
                    <Button
                      loading={write.busy}
                      disabled={!region.trim()}
                      onClick={() => void write.run(() => requestJudgmentRecognition(detail.judgment.id, region.trim()), "承认申请已提交")}
                    >
                      申请跨区承认
                    </Button>
                  ) : null}
                </div>
              </Panel>

              <Panel title="合议庭" hint="输入 panel_id 查询 / 投票 / 回避">
                <div style={{ display: "flex", gap: "var(--atlas-2)", alignItems: "flex-end", flexWrap: "wrap" }}>
                  <div style={{ minWidth: 240 }}>
                    <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>panel_id</div>
                    <input value={panelId} onChange={(event) => setPanelId(event.target.value)} style={{ width: "100%", height: 32, padding: "0 var(--atlas-2)", background: "var(--atlas-plate-2)", border: "1px solid var(--atlas-line-strong)", borderRadius: "var(--atlas-r-md)", color: "var(--atlas-n-950)", fontFamily: "var(--atlas-mono)" }} />
                  </div>
                  <Button onClick={() => void loadPanel()}>查询</Button>
                </div>
                {panelError ? <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-small)" }}>{panelError}</div> : null}
                {panel ? (
                  <>
                    <div style={{ display: "flex", gap: "var(--atlas-3)", flexWrap: "wrap" }}>
                      <span>状态 <Badge tone={panel.status === "serving" ? "warn" : "down"}>{panel.status}</Badge></span>
                      <span>裁决 {panel.verdict ?? "—"}</span>
                      <span>赞成 {panel.votes?.upheld ?? 0} / 否决 {panel.votes?.overturned ?? 0} / 需 {panel.votes?.needed ?? 0}</span>
                    </div>
                    <Table
                      ariaLabel="合议庭成员"
                      rows={panelMembers}
                      rowKey={(row) => String(row.actor_id)}
                      columns={[
                        { key: "slot", header: "席位", width: 60, render: (row) => row.slot },
                        { key: "name", header: "成员", width: 160, render: (row) => row.display_name },
                        { key: "role", header: "角色", width: 90, render: (row) => row.role },
                        { key: "status", header: "状态", width: 90, render: (row) => row.status },
                        { key: "vote", header: "投票", width: 100, render: (row) => row.vote ?? "—" },
                        { key: "action", header: "回避", width: 80, align: "right", render: (row) => <Button size="sm" onClick={() => setStrikeMember(String(row.actor_id))}>回避</Button> },
                      ]}
                    />
                    <div style={{ display: "flex", gap: "var(--atlas-1)", flexWrap: "wrap" }}>
                      <Button size="sm" loading={write.busy} onClick={() => void write.run(() => voteCourtPanel(panel.id, { choice: "upheld", reason: panelReason }), "已投票维持")}>投票维持</Button>
                      <Button size="sm" loading={write.busy} onClick={() => void write.run(() => voteCourtPanel(panel.id, { choice: "overturned", reason: panelReason }), "已投票推翻")}>投票推翻</Button>
                      <input value={strikeMember} onChange={(event) => setStrikeMember(event.target.value)} placeholder="回避成员 actor_id" style={{ flex: 1, minWidth: 180, height: 26, padding: "0 var(--atlas-2)", background: "var(--atlas-plate-2)", border: "1px solid var(--atlas-line-strong)", borderRadius: "var(--atlas-r-md)", color: "var(--atlas-n-950)", fontFamily: "var(--atlas-mono)" }} />
                      <Button size="sm" loading={write.busy} disabled={!strikeMember.trim()} onClick={() => void write.run(() => strikeCourtPanel(panel.id, { member_actor_id: strikeMember.trim(), for_cause: false }), "回避已提交")}>提交回避</Button>
                    </div>
                    <input value={panelReason} onChange={(event) => setPanelReason(event.target.value)} placeholder="投票理由（可选）" style={{ width: "100%", height: 30, padding: "0 var(--atlas-2)", background: "var(--atlas-plate-2)", border: "1px solid var(--atlas-line-strong)", borderRadius: "var(--atlas-r-md)", color: "var(--atlas-n-950)" }} />
                  </>
                ) : null}
              </Panel>
            </>
          )}
        </div>
      </div>

      {selectedRow ? (
        <Panel title="跨区承认">
          <div style={{ color: "var(--atlas-n-800)", fontSize: "var(--atlas-t-small)" }}>
            {recognitions.length ? (
              <Table
                ariaLabel="跨区承认"
                rows={recognitions}
                rowKey={(row) => String(row.id)}
                columns={[
                  { key: "region", header: "区域", width: 100, render: (row) => row.region },
                  { key: "status", header: "状态", width: 100, render: (row) => row.status },
                  { key: "reason", header: "原因", width: 160, render: (row) => row.reason_label || row.reason || "—" },
                  {
                    key: "action",
                    header: "操作",
                    width: 80,
                    align: "right",
                    render: (row) => (
                      <Button size="sm" loading={write.busy} onClick={() => void write.run(() => appealRecognition(String(row.id)), "承认异议已提交")}>
                        异议
                      </Button>
                    ),
                  },
                ]}
              />
            ) : "暂无跨区承认记录。"}
          </div>
        </Panel>
      ) : null}
    </div>
  );
};

export default CourtTab;

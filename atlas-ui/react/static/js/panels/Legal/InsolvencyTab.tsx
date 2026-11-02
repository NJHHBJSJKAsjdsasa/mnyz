// panels/Legal/InsolvencyTab.tsx — file a case, file a claim, vote on and confirm
// a reorganisation plan (06 §6.2). There is no insolvency case list endpoint, so
// the detail is loaded by the case id returned at filing or entered manually.

import React, { useState } from "react";
import { Badge, Button, EmptyState, Money, NumberInput, Panel, Select, Table } from "../../ui/index.ts";
import {
  confirmInsolvencyPlan,
  createInsolvencyPlan,
  fetchInsolvency,
  fileInsolvency,
  fileInsolvencyClaim,
  voteInsolvencyPlan,
} from "../../ui/api.ts";
import { useWrite } from "../_shared/useWrite.ts";
import { messageOf } from "../_shared/errors.ts";

const CLAIM_CLASSES = ["secured", "priority", "unsecured", "equity"];

export const InsolvencyTab: React.FC = () => {
  const [ticker, setTicker] = useState("");
  const [kind, setKind] = useState<"reorganization" | "liquidation">("reorganization");
  const [reason, setReason] = useState("");
  const [caseId, setCaseId] = useState("");
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimKind, setClaimKind] = useState("unsecured");
  const [claimAmount, setClaimAmount] = useState("1000");
  const [planDocument, setPlanDocument] = useState("{}");
  const [planClass, setPlanClass] = useState("unsecured");
  const [planChoice, setPlanChoice] = useState<"yes" | "no">("yes");

  const loadCase = async (id = caseId) => {
    if (!id.trim()) return;
    setLoading(true);
    setError(null);
    try {
      setDetail(await fetchInsolvency(id.trim()));
    } catch (raw) {
      setDetail(null);
      setError(messageOf(raw));
    } finally {
      setLoading(false);
    }
  };

  const write = useWrite(async () => {
    if (caseId) await loadCase();
  });

  const file = async () => {
    const outcome = await write.run(() => fileInsolvency({ ticker: ticker.trim().toUpperCase(), kind, reason }), "破产申请已提交");
    if (outcome.ok) {
      const id = String((outcome.value as any)?.case_id ?? "");
      setCaseId(id);
      await loadCase(id);
    }
  };

  const parsePlan = (): Record<string, unknown> | null => {
    try {
      const value = JSON.parse(planDocument || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : null;
    } catch {
      return null;
    }
  };

  const submitPlan = async () => {
    const document = parsePlan();
    if (!document) {
      setError("重整计划必须是 JSON 对象");
      return;
    }
    await write.run(() => createInsolvencyPlan(caseId, document), "重整计划已提交");
  };

  const plan = detail?.plan;
  const claims: any[] = detail?.claims ?? [];
  const planVotes: any[] = plan?.votes ?? [];

  return (
    <div style={{ display: "grid", gap: "var(--atlas-3)" }}>
      <Panel title="申请破产" hint="股东需公司资不抵债；债权人类别另有校验">
        {error || write.error ? <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-small)" }}>{error ?? write.error}</div> : null}
        <div style={{ display: "flex", gap: "var(--atlas-2)", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ width: 140 }}>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>公司 ticker</div>
            <input value={ticker} onChange={(event) => setTicker(event.target.value.toUpperCase())} maxLength={8} style={{ width: "100%", height: 32, padding: "0 var(--atlas-2)", background: "var(--atlas-plate-2)", border: "1px solid var(--atlas-line-strong)", borderRadius: "var(--atlas-r-md)", color: "var(--atlas-n-950)", fontFamily: "var(--atlas-mono)" }} />
          </div>
          <div style={{ width: 160 }}>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>程序</div>
            <Select value={kind} onChange={(event) => setKind(event.target.value as "reorganization" | "liquidation")} options={[{ value: "reorganization", label: "重整" }, { value: "liquidation", label: "清算" }]} />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>理由</div>
            <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} style={{ width: "100%", height: 32, padding: "0 var(--atlas-2)", background: "var(--atlas-plate-2)", border: "1px solid var(--atlas-line-strong)", borderRadius: "var(--atlas-r-md)", color: "var(--atlas-n-950)" }} />
          </div>
          <Button variant="primary" loading={write.busy} disabled={!ticker.trim()} onClick={() => void file()}>提交</Button>
        </div>
      </Panel>

      <Panel title="案件详情" hint="输入 case_id 查询" actions={<Button size="sm" loading={loading} onClick={() => void loadCase()}>查询</Button>}>
        <div style={{ display: "flex", gap: "var(--atlas-2)", alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>case_id</div>
            <input value={caseId} onChange={(event) => setCaseId(event.target.value)} style={{ width: "100%", height: 32, padding: "0 var(--atlas-2)", background: "var(--atlas-plate-2)", border: "1px solid var(--atlas-line-strong)", borderRadius: "var(--atlas-r-md)", color: "var(--atlas-n-950)", fontFamily: "var(--atlas-mono)" }} />
          </div>
        </div>

        {!detail ? (
          <EmptyState title={loading ? "读取中…" : "尚未加载案件"} />
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "var(--atlas-2)", fontSize: "var(--atlas-t-small)" }}>
              <span>公司 <span className="atlas-tabular">{detail.ticker}</span></span>
              <span>程序 <Badge tone="warn">{detail.kind}</Badge></span>
              <span>状态 <Badge tone={detail.status === "closed" ? "down" : "signal"}>{detail.status}</Badge></span>
              <span>中止期至 <span className="atlas-tabular">{String(detail.automatic_stay_until ?? "").slice(0, 10)}</span></span>
              <span>立案 <span className="atlas-tabular">{String(detail.filed_at ?? "").slice(0, 10)}</span></span>
            </div>

            <div style={{ borderTop: "1px solid var(--atlas-line)", paddingTop: "var(--atlas-2)" }}>
              <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>债权申报</div>
              <Table
                ariaLabel="债权申报"
                rows={claims}
                rowKey={(row) => String(row.id)}
                empty={<EmptyState title="暂无债权" />}
                columns={[
                  { key: "kind", header: "类别", width: 100, render: (row) => <Badge tone="neutral">{row.kind}</Badge> },
                  { key: "amount", header: "申报", width: 130, align: "right", render: (row) => <Money value={row.amount} /> },
                  { key: "paid", header: "已偿", width: 130, align: "right", render: (row) => <Money value={row.paid} muted /> },
                  { key: "status", header: "状态", width: 100, render: (row) => row.status },
                ]}
              />
              <div style={{ display: "flex", gap: "var(--atlas-2)", alignItems: "flex-end", flexWrap: "wrap", marginTop: "var(--atlas-2)" }}>
                <div style={{ width: 150 }}>
                  <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>类别</div>
                  <Select value={claimKind} onChange={(event) => setClaimKind(event.target.value)} options={["secured", "priority", "unsecured", "equity", "fine"].map((value) => ({ value, label: value }))} />
                </div>
                <div style={{ width: 150 }}>
                  <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>金额</div>
                  <NumberInput value={claimAmount} onChange={setClaimAmount} min={0} decimals={4} step={100} />
                </div>
                <Button loading={write.busy} disabled={Number(claimAmount) <= 0} onClick={() => void write.run(() => fileInsolvencyClaim(detail.id, { kind: claimKind, amount: claimAmount }), "债权已申报")}>申报债权</Button>
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--atlas-line)", paddingTop: "var(--atlas-2)", display: "grid", gap: "var(--atlas-2)" }}>
              <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)" }}>重整计划</div>
              {plan ? (
                <>
                  <div style={{ display: "flex", gap: "var(--atlas-2)", flexWrap: "wrap" }}>
                    <Badge tone={plan.status === "confirmed" ? "down" : plan.status === "rejected" ? "danger" : "warn"}>{plan.status}</Badge>
                    <span style={{ color: "var(--atlas-n-700)", fontSize: "var(--atlas-t-small)" }}>plan_id {String(plan.id).slice(0, 8)}</span>
                  </div>
                  <Table
                    ariaLabel="重整计划表决"
                    rows={planVotes}
                    rowKey={(row) => String(row.class)}
                    empty={<EmptyState title="尚未投票" />}
                    columns={[
                      { key: "class", header: "类别", width: 100, render: (row) => row.class },
                      { key: "yesAmount", header: "赞成额", width: 130, align: "right", render: (row) => <Money value={row.yes_amount} /> },
                      { key: "noAmount", header: "反对额", width: 130, align: "right", render: (row) => <Money value={row.no_amount} muted /> },
                      { key: "yesCount", header: "赞成数", width: 100, align: "right", render: (row) => row.yes_count },
                      { key: "noCount", header: "反对数", width: 100, align: "right", render: (row) => row.no_count },
                    ]}
                  />
                  <div style={{ display: "flex", gap: "var(--atlas-2)", alignItems: "flex-end", flexWrap: "wrap" }}>
                    <div style={{ width: 130 }}>
                      <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>我的类别</div>
                      <Select value={planClass} onChange={(event) => setPlanClass(event.target.value)} options={CLAIM_CLASSES.map((value) => ({ value, label: value }))} />
                    </div>
                    <Select value={planChoice} onChange={(event) => setPlanChoice(event.target.value as "yes" | "no")} options={[{ value: "yes", label: "赞成" }, { value: "no", label: "反对" }]} />
                    <Button loading={write.busy} onClick={() => void write.run(() => voteInsolvencyPlan(detail.id, { plan_id: plan.id, claim_class: planClass, choice: planChoice }), "计划投票已提交")}>投票</Button>
                  </div>
                </>
              ) : (
                <EmptyState title="尚未提交计划" hint="仅重整案件可提交计划。" />
              )}
              <textarea
                value={planDocument}
                onChange={(event) => setPlanDocument(event.target.value)}
                rows={4}
                spellCheck={false}
                style={{ width: "100%", background: "var(--atlas-deep)", color: "var(--atlas-n-900)", border: "1px solid var(--atlas-line-strong)", borderRadius: "var(--atlas-r-md)", padding: "var(--atlas-2)", fontFamily: "var(--atlas-mono)", fontSize: "var(--atlas-t-small)" }}
              />
              <div style={{ display: "flex", gap: "var(--atlas-2)" }}>
                <Button loading={write.busy} disabled={detail.kind !== "reorganization"} onClick={() => void submitPlan()}>提交计划</Button>
                {plan ? <Button loading={write.busy} onClick={() => void write.run(() => confirmInsolvencyPlan(detail.id, plan.id), "计划已确认")}>确认计划</Button> : null}
              </div>
              <div style={{ color: "var(--atlas-n-600)", fontSize: "var(--atlas-t-micro)" }}>
                清算分配只允许法院/运维执行；确认计划会按类别重新计算是否全部通过。
              </div>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
};

export default InsolvencyTab;

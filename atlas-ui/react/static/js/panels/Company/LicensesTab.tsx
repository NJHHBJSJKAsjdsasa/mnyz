// panels/Company/LicensesTab.tsx — my commercial licences and the catalogue
// (03 §3). Applying is free and idempotent; the first month is charged when the
// reviewer approves, so the UI says so instead of quoting a price it cannot take.

import React, { useCallback, useEffect, useState } from "react";
import { Badge, Button, EmptyState, Money, Panel, Table } from "../../ui/index.ts";
import { applyLicence, fetchLicenses, fetchLicenceCatalogue } from "../../ui/api.ts";
import { useWrite } from "../_shared/useWrite.ts";
import { messageOf } from "../_shared/errors.ts";

export const LicensesTab: React.FC = () => {
  const [mine, setMine] = useState<any[]>([]);
  const [catalogue, setCatalogue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [myResult, catResult] = await Promise.allSettled([fetchLicenses(), fetchLicenceCatalogue()]);
    if (myResult.status === "fulfilled") setMine(myResult.value?.licenses ?? []);
    if (catResult.status === "fulfilled") setCatalogue(catResult.value?.licences ?? []);
    setError(
      myResult.status === "rejected"
        ? messageOf(myResult.reason)
        : catResult.status === "rejected"
          ? messageOf(catResult.reason)
          : null,
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const write = useWrite(load);

  return (
    <div style={{ display: "grid", gap: "var(--atlas-3)" }}>
      <Panel title="我的许可" hint={`${mine.length} 项`}>
        {error ? <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-small)" }}>{error}</div> : null}
        <Table
          ariaLabel="我的许可"
          loading={loading}
          rows={mine}
          rowKey={(row) => String(row.id)}
          empty={<EmptyState title="暂无商业许可" hint="从下方目录申请，审核通过后生效。" />}
          columns={[
            { key: "kind", header: "类型", width: 170, render: (row) => row.kind },
            { key: "status", header: "状态", width: 100, render: (row) => <Badge tone={row.status === "active" ? "down" : row.status === "pending" ? "warn" : "neutral"}>{row.status}</Badge> },
            { key: "fee", header: "月费", width: 130, align: "right", render: (row) => <Money value={row.monthly_fee} currency={row.fee_currency ?? "cc4"} muted /> },
            { key: "expires", header: "到期", width: 140, render: (row) => row.expires_at ? String(row.expires_at).slice(0, 10) : "—" },
          ]}
        />
      </Panel>

      <Panel title="许可目录" hint={`${catalogue.length} 类`}>
        <Table
          ariaLabel="许可目录"
          loading={loading}
          rows={catalogue}
          rowKey={(row) => String(row.kind)}
          empty={<EmptyState title="目录为空" />}
          columns={[
            { key: "kind", header: "类型", width: 170, render: (row) => row.kind },
            { key: "currency", header: "币种", width: 80, render: (row) => row.currency },
            { key: "fee", header: "月费", width: 120, align: "right", render: (row) => <Money value={row.monthly_fee} currency={row.currency} /> },
            { key: "capital", header: "资本金门槛", width: 140, align: "right", render: (row) => <Money value={row.min_capital} currency={row.currency} muted /> },
            { key: "term", header: "期限", width: 80, align: "right", render: (row) => `${row.term_days} 天` },
            {
              key: "action",
              header: "操作",
              width: 100,
              align: "right",
              render: (row) => (
                <Button
                  size="sm"
                  loading={write.busy}
                  onClick={() => void write.run(() => applyLicence(String(row.kind)), `${row.kind} 许可已申请`)}
                >
                  申请
                </Button>
              ),
            },
          ]}
        />
        <div style={{ color: "var(--atlas-n-600)", fontSize: "var(--atlas-t-micro)" }}>
          申请免费且幂等；审核通过时扣首月费。审核入口在 CCMC/运维，普通面板不提供。
        </div>
      </Panel>
    </div>
  );
};

export default LicensesTab;

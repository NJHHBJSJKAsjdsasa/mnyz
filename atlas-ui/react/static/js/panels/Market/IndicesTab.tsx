// panels/Market/IndicesTab.tsx — index cards plus the point series behind one
// (06 §2.4). `GET /market/indices` is one call; points are fetched only when a
// card is opened, because the overview deliberately carries no inline series.

import React, { useCallback, useEffect, useState } from "react";
import { EmptyState, Money, Panel, Sparkline, Skeleton } from "../../ui/index.ts";
import { fetchIndexPoints } from "../../ui/api.ts";
import { formatPct, toNumber } from "../../ui/Money.tsx";
import { toneOfChange } from "./_constants.ts";

export interface IndicesTabProps {
  indices: any[];
  loading: boolean;
}

export const IndicesTab: React.FC<IndicesTabProps> = ({ indices, loading }) => {
  const [selected, setSelected] = useState<string | null>(null);
  const [points, setPoints] = useState<any[]>([]);
  const [loadingPoints, setLoadingPoints] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(async (code: string) => {
    setSelected(code);
    setLoadingPoints(true);
    setError(null);
    try {
      const data = await fetchIndexPoints(code, 120);
      setPoints(data?.points ?? []);
    } catch (raw) {
      setError(raw instanceof Error ? raw.message : String(raw));
      setPoints([]);
    } finally {
      setLoadingPoints(false);
    }
  }, []);

  useEffect(() => {
    if (!selected && indices.length > 0) void open(String(indices[0].code));
    // Only auto-open the first card; changing `indices` must not steal the
    // player's current selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indices.length]);

  const current = indices.find((row) => row.code === selected) ?? null;
  const series = points.map((row) => toNumber(row.v));
  const first = series.length ? series[0] : 0;
  const last = series.length ? series[series.length - 1] : 0;
  const seriesPct = first > 0 ? ((last - first) / first) * 100 : 0;

  if (loading) return <Panel title="指数"><Skeleton rows={5} /></Panel>;

  return (
    <div style={{ display: "grid", gap: "var(--atlas-3)" }}>
      <Panel title="指数" hint={`${indices.length} 个`}>
        {indices.length === 0 ? (
          <EmptyState title="暂无活跃指数" />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "var(--atlas-2)" }}>
            {indices.map((index) => {
              const active = index.code === selected;
              return (
                <button
                  key={index.code}
                  type="button"
                  onClick={() => void open(String(index.code))}
                  style={{
                    textAlign: "left",
                    cursor: "pointer",
                    background: active ? "var(--atlas-plate-2)" : "transparent",
                    border: `1px solid ${active ? "var(--atlas-signal)" : "var(--atlas-line)"}`,
                    borderRadius: "var(--atlas-r-md)",
                    padding: "var(--atlas-2)",
                    fontFamily: "var(--atlas-font)",
                  }}
                >
                  <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)" }}>
                    {index.code} · {index.name}
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "var(--atlas-2)", marginTop: 2 }}>
                    <Money value={index.value} size="var(--atlas-t-h1)" />
                    <span className="atlas-tabular" style={{ color: toneOfChange(index.change_pct), fontSize: "var(--atlas-t-small)" }}>
                      {formatPct(index.change_pct)}
                    </span>
                  </div>
                  <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-600)", marginTop: 2 }}>
                    {index.sample_size} 只成分
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Panel>

      {current ? (
        <Panel
          title={`${current.code} 点位`}
          hint={loadingPoints ? "读取中" : `${points.length} 点 · 区间 ${formatPct(seriesPct)}`}
        >
          {error ? <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-small)" }}>{error}</div> : null}
          {loadingPoints ? <Skeleton rows={4} /> : <Sparkline points={series} width={640} height={160} ariaLabel={`${current.name} 点位`} />}
          <div style={{ display: "flex", gap: "var(--atlas-4)", color: "var(--atlas-n-700)", fontSize: "var(--atlas-t-micro)" }}>
            <span>最新 {current.value}</span>
            <span>成分 {current.sample_size}</span>
            <span>{current.name}</span>
          </div>
        </Panel>
      ) : null}
    </div>
  );
};

export default IndicesTab;

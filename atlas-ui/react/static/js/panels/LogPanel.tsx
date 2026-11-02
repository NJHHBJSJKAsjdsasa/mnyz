// panels/LogPanel.tsx — the activity stream (06 §7, T-67g).
//
// `GET /events?since=<seq>` is a cursor, not a page: the panel keeps the highest
// seq it has seen and asks only for newer rows. Polling stops when the tab is
// hidden; there is no local write, so the stream is safe to leave open.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, EmptyState, Panel, Skeleton } from "../ui/index.ts";
import { fetchEvents } from "../ui/api.ts";
import { messageOf } from "./_shared/errors.ts";
import Notice from "./_shared/Notice.tsx";

interface EventRow {
  seq: number;
  type: string;
  aggregate: string;
  payload: Record<string, unknown>;
  created_at: string;
}

const POLL_MS = 10_000;

const FILTERS = [
  { id: "all", label: "全部", prefix: "" },
  { id: "money", label: "资金", prefix: "ledger." },
  { id: "trade", label: "交易", prefix: "stock." },
  { id: "court", label: "诉讼", prefix: "court." },
  { id: "governance", label: "治理", prefix: "company." },
  { id: "property", label: "产权", prefix: "property." },
  { id: "loan", label: "贷款", prefix: "loan." },
];

const TONE: Record<string, "neutral" | "signal" | "warn" | "danger" | "down"> = {
  "stock.split": "warn",
  "stock.dividend": "signal",
  "exchange.created": "down",
  "court.judgment": "danger",
  "loan.overdue": "warn",
  "loan.defaulted": "danger",
};

export const LogPanel: React.FC = () => {
  const [rows, setRows] = useState<EventRow[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [since, setSince] = useState(0);
  const sinceRef = useRef(0);

  const pull = useCallback(async () => {
    try {
      const data = await fetchEvents(sinceRef.current, 100);
      const incoming: EventRow[] = data?.events ?? [];
      if (incoming.length) setRows((prev) => [...incoming].reverse().concat(prev).slice(0, 300));
      sinceRef.current = Number(data?.next_since ?? sinceRef.current);
      setSince(sinceRef.current);
      setError(null);
    } catch (raw) {
      setError(messageOf(raw));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void pull();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void pull();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [pull]);

  const active = FILTERS.find((row) => row.id === filter) ?? FILTERS[0];
  const visible = active.prefix ? rows.filter((row) => String(row.type).startsWith(active.prefix)) : rows;

  return (
    <Panel
      title="活动流"
      hint={`游标 ${since} · 每 ${POLL_MS / 1000}s 增量拉取`}
      actions={<Button size="sm" onClick={() => void pull()}>刷新</Button>}
    >
      <div style={{ display: "flex", gap: "var(--atlas-1)", flexWrap: "wrap" }}>
        {FILTERS.map((item) => (
          <Button
            key={item.id}
            size="sm"
            variant={item.id === filter ? "secondary" : "ghost"}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      <Notice text={error} />
      {loading ? <Skeleton rows={5} /> : null}
      {!loading && visible.length === 0 ? (
        <EmptyState title="还没有事件" hint="交易、拆股、判决、逾期会出现在这里。" />
      ) : null}

      <div className="atlas-scroll" style={{ display: "grid", gap: 2, maxHeight: 520, overflowY: "auto" }}>
        {visible.map((row) => (
          <div
            key={row.seq}
            style={{
              display: "grid",
              gridTemplateColumns: "64px 180px 1fr auto",
              alignItems: "baseline",
              gap: "var(--atlas-2)",
              padding: "7px 8px",
              borderBottom: "1px solid var(--atlas-line)",
              fontSize: "var(--atlas-t-small)",
            }}
          >
            <span className="atlas-tabular" style={{ color: "var(--atlas-n-600)", fontSize: "var(--atlas-t-micro)" }}>
              #{row.seq}
            </span>
            <span title={row.type}>
              <Badge tone={TONE[row.type] ?? "neutral"}>{row.type}</Badge>
            </span>
            <span style={{ color: "var(--atlas-n-800)", overflow: "hidden", textOverflow: "ellipsis" }}>
              {row.aggregate}
            </span>
            <span className="atlas-tabular" style={{ color: "var(--atlas-n-600)", fontSize: "var(--atlas-t-micro)" }}>
              {String(row.created_at ?? "").slice(5, 19).replace("T", " ")}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
};

export default LogPanel;

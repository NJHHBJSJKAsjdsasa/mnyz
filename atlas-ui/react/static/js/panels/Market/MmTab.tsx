// panels/Market/MmTab.tsx — standing market-maker programs (06 §2.1).
//
// `last_run_at` is the server's proof that a 60 s job is working; the relative
// label is rendered from a local 15 s tick and never causes a request. `last_error`
// is a backend code, translated to Chinese in the cell and kept verbatim in `title`.

import React, { useCallback, useEffect, useState } from "react";
import { Badge, Button, EmptyState, NumberInput, Panel, Select, Table } from "../../ui/index.ts";
import { enrollMmProgram, errorText, fetchMmPrograms, pauseMmProgram, placeQuotes } from "../../ui/api.ts";
import { useWrite } from "../_shared/useWrite.ts";
import { messageOf } from "../_shared/errors.ts";

export interface MmTabProps {
  stocks: any[];
  selected: string | null;
  onSelect: (ticker: string) => void;
  onChanged: () => void;
}

const relative = (iso: unknown, now: number): string => {
  if (!iso) return "—";
  const at = Date.parse(String(iso));
  if (!Number.isFinite(at)) return "—";
  const seconds = Math.max(0, Math.floor((now - at) / 1000));
  if (seconds < 60) return `${seconds} 秒前`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  return `${Math.floor(seconds / 3600)} 小时前`;
};

const errorLabel = (code: unknown): string => {
  const text = String(code ?? "");
  if (!text) return "";
  return /^[a-z0-9_.-]+$/i.test(text) ? errorText(text) : text;
};

export const MmTab: React.FC<MmTabProps> = ({ stocks, selected, onSelect, onChanged }) => {
  const [ticker, setTicker] = useState(selected ?? stocks[0]?.ticker ?? "");
  const [programs, setPrograms] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("200");
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    if (!ticker) {
      setPrograms([]);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchMmPrograms(ticker);
      setPrograms(data?.programs ?? []);
      setReadError(null);
    } catch (raw) {
      setReadError(messageOf(raw));
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (selected) setTicker(selected);
  }, [selected]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const write = useWrite(async () => {
    await load();
    onChanged();
  });

  const options = stocks.map((row) => ({ value: String(row.ticker), label: `${row.ticker} · ${row.company ?? ""}` }));
  const qty = Math.floor(Number(quantity) || 0);

  return (
    <div style={{ display: "grid", gap: "var(--atlas-3)" }}>
      <Panel
        title="做市程序"
        hint="后台每 60 秒自动重挂双边报价"
        actions={<Button size="sm" onClick={() => void load()}>刷新</Button>}
      >
        <div style={{ display: "flex", gap: "var(--atlas-2)", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ minWidth: 220 }}>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>标的</div>
            <Select
              value={ticker}
              onChange={(event) => {
                setTicker(event.target.value);
                onSelect(event.target.value);
              }}
              options={options.length ? options : [{ value: "", label: "暂无上市股票" }]}
              aria-label="做市标的"
            />
          </div>
          <div style={{ minWidth: 140 }}>
            <div style={{ fontSize: "var(--atlas-t-micro)", color: "var(--atlas-n-700)", marginBottom: 4 }}>数量</div>
            <NumberInput value={quantity} onChange={setQuantity} min={1} />
          </div>
          <Button
            variant="primary"
            loading={write.busy}
            disabled={!ticker || qty <= 0}
            onClick={() => void write.run(() => enrollMmProgram(ticker, qty), `已登记 ${ticker} 做市程序`)}
          >
            登记做市
          </Button>
          <Button
            loading={write.busy}
            disabled={!ticker || qty <= 0}
            onClick={() => void write.run(() => placeQuotes(ticker, { quantity: qty, refresh: true }), "双边报价已刷新")}
          >
            立即刷新
          </Button>
        </div>

        {readError ? <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-small)" }}>{readError}</div> : null}
        {write.error ? <div style={{ color: "var(--atlas-danger)", fontSize: "var(--atlas-t-small)" }}>{write.error}</div> : null}
      </Panel>

      <Panel title={`${ticker || "—"} 的程序`} hint={`${programs.length} 个`}>
        <Table
          ariaLabel="做市程序"
          loading={loading}
          rows={programs}
          rowKey={(row) => String(row.program_id)}
          empty={<EmptyState title="还没有做市程序" hint="选择标的与数量后点「登记做市」。" />}
          columns={[
            { key: "ticker", header: "标的", width: 90, render: (row) => <span style={{ color: "var(--atlas-n-950)" }}>{row.ticker}</span> },
            { key: "quantity", header: "数量", width: 100, align: "right", render: (row) => <span className="atlas-tabular">{row.quantity}</span> },
            {
              key: "status",
              header: "状态",
              width: 100,
              render: (row) => (
                <Badge tone={row.last_error ? "warn" : row.status === "active" ? "down" : "neutral"}>
                  {row.status === "active" ? "运行中" : row.status === "paused" ? "已暂停" : row.status}
                </Badge>
              ),
            },
            {
              key: "last_run",
              header: "上次运行",
              width: 140,
              render: (row) => (
                <span className="atlas-tabular" style={{ color: "var(--atlas-n-800)", fontSize: "var(--atlas-t-small)" }} title={String(row.last_run_at ?? "")}>
                  {relative(row.last_run_at, now)}
                </span>
              ),
            },
            {
              key: "health",
              header: "健康度",
              width: 220,
              render: (row) =>
                row.last_error ? (
                  <span title={String(row.last_error)} style={{ color: "var(--atlas-warn)", fontSize: "var(--atlas-t-small)" }}>
                    ⚠ {errorLabel(row.last_error)}
                  </span>
                ) : (
                  <span style={{ color: "var(--atlas-down)", fontSize: "var(--atlas-t-small)" }}>● 正常</span>
                ),
            },
            {
              key: "action",
              header: "操作",
              width: 160,
              align: "right",
              render: (row) => (
                <span style={{ display: "inline-flex", gap: "var(--atlas-1)" }}>
                  {row.status === "active" ? (
                    <Button size="sm" loading={write.busy} onClick={() => void write.run(() => pauseMmProgram(row.ticker), "已暂停做市")}>
                      暂停
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="primary"
                      loading={write.busy}
                      disabled={qty <= 0}
                      onClick={() => void write.run(() => enrollMmProgram(row.ticker, qty), "已恢复做市")}
                    >
                      恢复
                    </Button>
                  )}
                  <Button
                    size="sm"
                    loading={write.busy}
                    disabled={qty <= 0}
                    onClick={() => void write.run(() => placeQuotes(row.ticker, { quantity: qty, refresh: true }), "双边报价已刷新")}
                  >
                    刷新
                  </Button>
                </span>
              ),
            },
          ]}
        />
        <div style={{ color: "var(--atlas-n-600)", fontSize: "var(--atlas-t-micro)" }}>
          暂停只会把程序置为「已暂停」，不会删除；恢复与刷新需要正整数数量。
        </div>
      </Panel>
    </div>
  );
};

export default MmTab;

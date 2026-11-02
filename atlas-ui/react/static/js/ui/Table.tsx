// ui/Table.tsx — hairline table with fixed columns, right-aligned numerics and an
// explicit empty state (05 §5.3). Panels supply cells; they do not style <td>.
//
// Column widths are declared per column because the real column policy differs
// between portfolios (ticker wide) and ledgers (amount wide); a shared guess would
// only make both wrong.
//
// Density (2026-10-30): a telemetry table, not a spreadsheet. 26px rows, 4px
// vertical padding, 10px mono headers, tabular figures on every right-aligned
// column, zebra by a 1.5% wash instead of borders on both sides. Numbers line up
// because the type is mono, so the eye can scan a column without grid lines.

import React from "react";
import EmptyState from "./EmptyState.tsx";
import Skeleton from "./Skeleton.tsx";

export interface TableColumn<T> {
  key: string;
  header: React.ReactNode;
  width?: number | string;
  align?: "left" | "right";
  render: (row: T, index: number) => React.ReactNode;
}

export interface TableProps<T> {
  columns: Array<TableColumn<T>>;
  rows: T[];
  rowKey: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  activeKey?: string | null;
  loading?: boolean;
  empty?: React.ReactNode;
  maxHeight?: number;
  ariaLabel?: string;
}

const HEAD: React.CSSProperties = {
  fontSize: "var(--atlas-t-micro)",
  fontFamily: "var(--atlas-mono)",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--atlas-n-600)",
  fontWeight: 500,
  padding: "3px 8px 5px",
  borderBottom: "1px solid var(--atlas-line-strong)",
  whiteSpace: "nowrap",
  position: "sticky",
  top: 0,
  background: "var(--atlas-plate)",
  zIndex: 1,
};

export const Table = <T,>({
  columns,
  rows,
  rowKey,
  onRowClick,
  activeKey,
  loading = false,
  empty,
  maxHeight,
  ariaLabel,
}: TableProps<T>) => {
  if (loading) return <Skeleton rows={4} />;
  if (rows.length === 0) {
    return <>{empty ?? <EmptyState title="暂无数据" />}</>;
  }

  return (
    <div
      className="atlas-scroll"
      style={{ overflowX: "auto", overflowY: maxHeight ? "auto" : undefined, maxHeight }}
    >
      <table
        aria-label={ariaLabel}
        className="atlas-table"
        style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}
      >
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" style={{ ...HEAD, width: column.width, textAlign: column.align ?? "left" }}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const key = rowKey(row, index);
            const selected = activeKey != null && key === activeKey;
            return (
              <tr
                key={key}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                aria-selected={activeKey != null ? selected : undefined}
                className={selected ? "is-active" : undefined}
                style={{
                  cursor: onRowClick ? "pointer" : undefined,
                  background: selected ? "var(--atlas-plate-2)" : undefined,
                  boxShadow: selected ? "inset 2px 0 0 var(--atlas-signal)" : undefined,
                }}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    style={{
                      textAlign: column.align ?? "left",
                      padding: "3px 8px 4px",
                      fontSize: "var(--atlas-t-small)",
                      lineHeight: 1.35,
                      color: "var(--atlas-n-900)",
                      fontVariantNumeric: column.align === "right" ? "tabular-nums" : undefined,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {column.render(row, index)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default Table;

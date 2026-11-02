// Shell/AtlasShell.tsx — the economy console, **docked**, not a dialog.
//
// 2026-10-30 (third pass): the player told us the panels were "a separate thing you
// have to open with a button", so the launcher is gone. The console is now a
// permanent right-hand rail on every page: station chips across the top, the
// active panel below, a telemetry foot. It can be collapsed to a 42px spine or
// expanded to fill the screen, but it is always *there*.
//
// 2026-10-30 (fifth pass, reverted): a station pick briefly *moved* the console
// out of the rail — first to a centred window, then onto the home screen's star
// stage. The player killed it: "no need to open a window, the panel is already
// right there when I click, opening another one just shows the same thing twice."
// He is right, and it is the same reason the launcher was deleted in the third
// pass: one surface, switched in place. Picking a chip changes what the rail
// shows and nothing else. Do not reintroduce a second placement without asking.
//
// Composition is still Provider → Router → regions, and regions still read only
// from `useShell()`, so no region can start its own request.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import "../../css/tokens.css";
import CommandPalette from "./CommandPalette.tsx";
import ShellProvider, { ShellSnapshot, useShell } from "./ShellProvider.tsx";
import useShellRouter from "./ShellRouter.tsx";
import PanelHost from "../panels/PanelHost.tsx";

export interface NavItem {
  id: string;
  label: string;
  hint?: string;
  badge?: number;
}

export interface AtlasShellProps {
  panels: NavItem[];
  renderPanel: (id: string, snapshot: ShellSnapshot | null) => React.ReactNode;
  /** Unused since the dock replaced the launcher; kept for call-site clarity. */
  label?: string;
}

const VIEW_IDS = (panels: NavItem[]) => panels.map((panel) => panel.id);

const ShellBody: React.FC<AtlasShellProps> = ({ panels, renderPanel }) => {
  const { snapshot, error } = useShell();
  const views = useMemo(() => VIEW_IDS(panels), [panels]);
  const { view, open } = useShellRouter(views);
  // No hash = first station. The dock never renders an empty state.
  const active = view ?? views[0] ?? null;
  const [expanded, setExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const badges = useMemo(
    () =>
      ({
        assets: (snapshot?.obligations ?? []).length,
        market: snapshot?.portfolio_summary?.positions ?? 0,
      }) as Record<string, number>,
    [snapshot],
  );

  const items = useMemo(
    () => panels.map((panel) => ({ ...panel, badge: badges[panel.id] ?? panel.badge ?? 0 })),
    [panels, badges],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      }
      if (event.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => !prev);
    setExpanded(false);
  }, []);

  const walletTotal = snapshot?.wallet_summary?.total_q1 as string | number | undefined;
  const day = String(snapshot?.game_day ?? "----").padStart(3, "0");

  if (collapsed) {
    return (
      <aside className="hud-dock hud-corners" data-collapsed="true" aria-label="经济控制台（已收起）">
        <button
          type="button"
          onClick={toggleCollapse}
          title="展开经济控制台"
          style={{
            width: "100%",
            height: "100%",
            display: "grid",
            placeItems: "center",
            gap: 10,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--atlas-signal)",
          }}
        >
          <span className="hud-lamp" aria-hidden />
          <span
            style={{
              writingMode: "vertical-rl",
              fontFamily: "var(--atlas-mono)",
              fontSize: 10,
              letterSpacing: "0.3em",
              textTransform: "uppercase",
            }}
          >
            经济 · {walletTotal ?? "—"} Q1
          </span>
        </button>
      </aside>
    );
  }

  return (
    <aside
      className="hud-dock hud-corners"
      data-expanded={expanded ? "true" : undefined}
      aria-label="经济控制台"
    >
      {/* --- head: identity + stations + window controls ---------------------- */}
      <header
        style={{
          flexShrink: 0,
          display: "grid",
          gap: 8,
          padding: "8px 10px 9px",
          borderBottom: "1px solid rgba(46,230,255,.22)",
          background: "linear-gradient(180deg, rgba(46,230,255,.14), transparent)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span aria-hidden style={{ width: 3, height: 13, background: "var(--atlas-signal)", boxShadow: "0 0 9px rgba(46,230,255,.95)" }} />
          <span className="atlas-display" style={{ fontSize: 13, letterSpacing: "0.24em", color: "var(--atlas-n-950)" }}>
            经济控制台
          </span>
          <span className="hud-lamp" aria-hidden />
          <span
            className="atlas-tabular"
            style={{ marginLeft: "auto", fontSize: 10, letterSpacing: "0.14em", color: "var(--atlas-info)" }}
          >
            DAY {day}
          </span>
          <button type="button" className="hud-dockbtn" onClick={() => setPaletteOpen(true)} title="搜索（⌘K）">
            ⌘K
          </button>
          <button
            type="button"
            className="hud-dockbtn"
            onClick={() => setExpanded((prev) => !prev)}
            title={expanded ? "恢复侧栏" : "全屏展开"}
          >
            {expanded ? "⤡" : "⤢"}
          </button>
          <button type="button" className="hud-dockbtn" onClick={toggleCollapse} title="收起">
            ⟩
          </button>
        </div>

        <div className="atlas-scroll" style={{ display: "flex", gap: 3, overflowX: "auto" }}>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => open(item.id)}
              className="hud-tab"
              data-selected={item.id === active ? "true" : undefined}
              style={{ height: 25, padding: "0 9px", fontSize: 11 }}
              title={item.hint}
            >
              {item.label}
              {item.badge ? (
                <span
                  className="atlas-tabular"
                  style={{ color: "var(--atlas-void)", background: "var(--atlas-signal)", padding: "0 4px", marginLeft: 2 }}
                >
                  {item.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </header>

      {/* --- body: kept-alive panels ---------------------------------------- */}
      <div className="atlas-scroll hud-deck" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 0 }}>
        {error ? (
          <div
            style={{
              margin: 8,
              padding: "6px 9px",
              border: "1px solid rgba(255,77,109,.45)",
              borderLeft: "3px solid var(--atlas-danger)",
              background: "rgba(255,77,109,.1)",
              color: "var(--atlas-danger)",
              fontSize: 11.5,
            }}
          >
            状态读取失败：{error}
          </div>
        ) : null}
        {panels.map((panel) => (
          <PanelHost key={panel.id} active={active} id={panel.id}>
            {renderPanel(panel.id, snapshot)}
          </PanelHost>
        ))}
      </div>

      {/* --- foot: telemetry ------------------------------------------------ */}
      <footer
        style={{
          flexShrink: 0,
          height: 26,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 10px",
          borderTop: "1px solid rgba(46,230,255,.2)",
          background: "linear-gradient(180deg, transparent, rgba(46,230,255,.07))",
          fontFamily: "var(--atlas-mono)",
          fontSize: 9.5,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--atlas-n-600)",
        }}
      >
        <span className="hud-lamp" aria-hidden />
        <span>
          额度 <span className="atlas-tabular" style={{ color: "var(--atlas-info)" }}>{walletTotal ?? "—"} Q1</span>
        </span>
        <span style={{ color: "var(--atlas-line-strong)" }}>|</span>
        <span>
          持仓{" "}
          <span className="atlas-tabular" style={{ color: "var(--atlas-signal)" }}>
            {snapshot?.portfolio_summary?.positions ?? 0}
          </span>
        </span>
        <span style={{ color: "var(--atlas-line-strong)" }}>|</span>
        <span>
          到期{" "}
          <span className="atlas-tabular" style={{ color: "var(--atlas-signal)" }}>
            {(snapshot?.obligations ?? []).length}
          </span>
        </span>
        <span className="atlas-tabular" style={{ marginLeft: "auto", color: "var(--atlas-signal)" }}>
          {(snapshot?.server_time ?? "").slice(11, 19) || "--:--:--"}
        </span>
      </footer>

      <CommandPalette open={paletteOpen} entries={items} onSelect={open} onClose={() => setPaletteOpen(false)} />
    </aside>
  );
};

export const AtlasShell: React.FC<AtlasShellProps> = (props) => (
  <ShellProvider>
    <ShellBody {...props} />
  </ShellProvider>
);

export default AtlasShell;

// atlas-ui/react/static/js/Shell/GameTopBar.tsx — the frame's top strip, once.
//
// Extracted from `Layouts/main/HomeScreen.tsx` on 2026-10-31 (P0). Before this,
// the home screen drew its own bar while galaxy / system / planet rendered
// `Components/Header.tsx` — same colours, different structure and different
// content, so the bar visibly jumped on every navigation. There is now one bar
// and one set of slots; `Header.tsx` is deleted in P1.
//
// Slots, left to right:
//   brand · coordinates · [trail] · universe badge · ... · version · links · [trailing]
//
// `trail` is the breadcrumb (星系 › 系统 › 行星). The home screen leaves it out;
// inner views pass `<Breadcrumb />` once the router lands in P1.

import React from "react";
import { Label } from "./GameAtoms.tsx";

/** Local shape on purpose: the shell must not import from `Layouts/`. */
export interface GameCoordinates {
  x: number;
  y: number;
  z: number;
}

export interface GameTopBarProps {
  coordinates: GameCoordinates;
  isRemoteUniverse: boolean;
  version: string;
  /** Breadcrumb / level nav. Rendered after the coordinates. */
  trail?: React.ReactNode;
  /** Right-end slot for page-owned controls (account button, etc). */
  trailing?: React.ReactNode;
}

const LINK: React.CSSProperties = {
  fontFamily: "var(--atlas-mono)",
  fontSize: 10,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--atlas-n-700)",
  textDecoration: "none",
};

const GameTopBar: React.FC<GameTopBarProps> = ({ coordinates, isRemoteUniverse, version, trail, trailing }) => {
  return (
    <header
      data-zone="topbar"
      style={{
        height: 54,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "0 16px",
        borderBottom: "1px solid rgba(46,230,255,.28)",
        background: "linear-gradient(180deg, rgba(46,230,255,.1), rgba(6,10,20,.92))",
        boxShadow: "inset 0 2px 0 var(--atlas-signal)",
        zIndex: 3,
        // The crumb can be long ("A Very Long Galaxy Name › A Very Long System"),
        // and every other zone is fixed-width. Without minWidth here the bar
        // pushes the badge and links onto a second row, which makes a 54px strip
        // 70px tall. Everything after the crumb is `flexShrink: 0`; the crumb
        // gives up its width first.
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", flexShrink: 0 }}>
        <span
          aria-hidden
          style={{
            width: 26,
            height: 26,
            display: "grid",
            placeItems: "center",
            border: "1px solid rgba(46,230,255,.55)",
            boxShadow: "0 0 18px -4px rgba(46,230,255,.85), inset 0 0 12px -6px rgba(46,230,255,.9)",
            color: "var(--atlas-signal)",
            fontSize: 13,
          }}
        >
          ◈
        </span>
        <span style={{ display: "grid", gap: 1 }}>
          <span
            className="atlas-display"
            style={{
              fontSize: 17,
              letterSpacing: "0.3em",
              color: "var(--atlas-n-950)",
              textShadow: "0 0 16px rgba(46,230,255,.5)",
              lineHeight: 1,
            }}
          >
            ATLAS
          </span>
          <Label>宇宙导航 · 舰桥</Label>
        </span>
      </a>

      <span aria-hidden style={{ width: 1, height: 22, background: "var(--atlas-line-strong)", flexShrink: 0 }} />

      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0, whiteSpace: "nowrap" }}>
        <span className="hud-lamp" aria-hidden />
        <Label>当前坐标</Label>
        <span className="atlas-tabular" style={{ fontSize: 13, color: "var(--atlas-signal)", textShadow: "var(--glow-text)" }}>
          {coordinates.x} · {coordinates.y} · {coordinates.z}
        </span>
      </span>

      {trail ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10, minWidth: 0, flex: "0 1 auto", overflow: "hidden" }}>
          <span aria-hidden style={{ width: 1, height: 18, background: "var(--atlas-line)", flexShrink: 0 }} />
          {trail}
        </span>
      ) : null}

      <span
        style={{
          marginLeft: trail ? 0 : 4,
          padding: "2px 8px",
          border: `1px solid ${isRemoteUniverse ? "rgba(255,176,32,.5)" : "rgba(46,230,255,.35)"}`,
          background: isRemoteUniverse ? "rgba(255,176,32,.12)" : "rgba(46,230,255,.1)",
          color: isRemoteUniverse ? "var(--atlas-warn)" : "var(--atlas-signal)",
          fontFamily: "var(--atlas-mono)",
          fontSize: 9.5,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {isRemoteUniverse ? "多元宇宙 · 在线" : "本地宇宙"}
      </span>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <span className="atlas-tabular" style={{ fontSize: 10, color: "var(--atlas-n-600)" }}>
          v{version}
        </span>
        <a href="/universe-faq" style={LINK}>
          档案
        </a>
        <a href="/multiverse" style={LINK}>
          多元宇宙
        </a>
        {trailing}
      </div>
    </header>
  );
};

export default GameTopBar;

// atlas-ui/react/static/js/Components/Header.tsx — the page header strip.
//
// 2026-10-30 (Amber Cockpit): the strip is now a *nameplate* — a squared mark,
// a letterspaced wordmark, one hairline seam, then instrument readouts. The
// amber bar on the left edge is the only "logo"; it ties the header to the
// shell's top rail without repeating the shape.
//
// Content is unchanged (logo, 阿特拉斯 / 宇宙导航系统, multiverse status, ready
// hint). Two decorative loops were already gone; the glowing status dot went
// too — a 6px amber square says the same thing without light.

import React, { useState, useEffect } from "react";
// The header is the one component every layout renders, so it is also the
// natural place to pull the design tokens in: without this import the
// token-based styles below resolve to nothing on every page that does not
// mount the economy shell (faq / multiverse / onboarding / error).
import "../../css/tokens.css";
import { UniverseDetection } from "../Utils/UniverseDetection.tsx";
import { useMultiverseGlitch } from "../Utils/useMultiverseGlitch.tsx";
import MultiverseHeaderConnectedIcon from "../Icons/MultiverseHeaderConnectedIcon.jsx";

export interface HeaderProps {
  /** Rendered at the right end, after the status chips (e.g. the account button). */
  trailing?: React.ReactNode;
}

const MONO: React.CSSProperties = {
  fontFamily: "var(--atlas-mono)",
  fontSize: "var(--atlas-t-micro)",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};

const Header: React.FC<HeaderProps> = ({ trailing }) => {
  const [isRemoteUniverse, setIsRemoteUniverse] = useState(false);
  const glitchText = useMultiverseGlitch(isRemoteUniverse);

  useEffect(() => {
    // One-shot on purpose (2026-10-29): `#data-universe-config` is a static
    // server-rendered element, so this value cannot change without a full page
    // load — and that remounts the component anyway.
    setIsRemoteUniverse(UniverseDetection.isRemoteUniverse());
  }, []);

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--atlas-4)",
        // Matched to `Shell/GameTopBar` on 2026-11-01: same 54px height, same
        // padding, same lit lower edge. They were 52 vs 54 with two different
        // gradient stacks, which read as "the site and the game are two different
        // products" every time you crossed between them. Content still differs on
        // purpose — the game bar shows where you are, this one shows which page.
        height: 54,
        padding: "0 16px",
        background: "linear-gradient(180deg, rgba(46,230,255,.1), rgba(6,10,20,.92))",
        borderBottom: "1px solid rgba(46,230,255,.28)",
        boxShadow: "inset 0 2px 0 var(--atlas-signal)",
        fontFamily: "var(--atlas-font)",
      }}
    >
      <a
        href="/"
        style={{ display: "flex", alignItems: "center", gap: "var(--atlas-3)", textDecoration: "none" }}
      >
        {/* amber edge: the header's whole identity, costs one element */}
        <span
          aria-hidden
          style={{
            width: 3,
            height: 28,
            background: "linear-gradient(180deg, var(--atlas-signal), rgba(46,230,255,.2))",
            boxShadow: "0 0 14px rgba(46,230,255,.7)",
          }}
        />
        <img
          src="/static/atlas-logo.jpg"
          alt="Atlas Logo"
          style={{
            height: 28,
            width: 28,
            borderRadius: 2,
            border: "1px solid rgba(46,230,255,.45)",
            objectFit: "cover",
            boxShadow: "0 0 16px -4px rgba(46,230,255,.75)",
          }}
        />
        <span style={{ display: "grid", gap: 2 }}>
          <span
            className="atlas-display"
            style={{
              color: "var(--atlas-n-950)",
              fontSize: 16,
              letterSpacing: "0.32em",
              lineHeight: 1,
              textShadow: "0 0 14px rgba(46,230,255,.55)",
            }}
          >
            ATLAS
          </span>
          <span style={{ ...MONO, color: "var(--atlas-n-600)", fontSize: 10 }}>
            阿特拉斯 · 宇宙导航系统
          </span>
        </span>
      </a>

      <div style={{ display: "flex", alignItems: "center", gap: "var(--atlas-4)" }}>
        <a
          href="/multiverse"
          title="多元宇宙"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 8px",
            borderRadius: 2,
            border: `1px solid ${isRemoteUniverse ? "rgba(255,176,32,.55)" : "rgba(46,230,255,.45)"}`,
            background: isRemoteUniverse
              ? "linear-gradient(180deg, rgba(255,176,32,.18), rgba(10,18,34,.9))"
              : "linear-gradient(180deg, rgba(46,230,255,.16), rgba(10,18,34,.9))",
            boxShadow: isRemoteUniverse
              ? "0 0 16px -6px rgba(255,176,32,.8)"
              : "0 0 16px -6px rgba(46,230,255,.8)",
            color: isRemoteUniverse ? "var(--atlas-warn)" : "var(--atlas-signal)",
            ...MONO,
            textDecoration: "none",
          }}
        >
          {isRemoteUniverse ? (
            <MultiverseHeaderConnectedIcon className="w-3.5 h-3.5" />
          ) : (
            <span className="hud-lamp" aria-hidden />
          )}
          {isRemoteUniverse ? glitchText : "多元宇宙在线"}
        </a>

        <span style={{ ...MONO, color: "var(--atlas-n-600)", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span className="hud-lamp" aria-hidden />
          量子导航就绪
        </span>
        {trailing}
      </div>
    </header>
  );
};

export default Header;

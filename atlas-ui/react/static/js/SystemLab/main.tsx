// atlas-ui/react/static/js/SystemLab/main.tsx
//
// Dev-only harness (served by `npm run dev` at /systemlab.html) for the three §10 subsystems
// that came over from 3.0's explorer: the star surface, the star system and the galaxy-scale
// exotic objects. Nothing in the app imports this file.
//
// The system tab feeds synthetic payloads through the *real* adapter, so what you see is
// what the page will show once `?renderer=realistic` is on.

import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import { RealisticStarStage } from "../Components/RealisticStarStage.tsx";
import { RealisticSystemStage } from "../Components/RealisticSystemStage.tsx";
import { ExoticShowcase } from "../Components/ExoticShowcase.tsx";
import { adaptSystemPayload } from "../3DComponents/realistic3/systemAdapter.ts";
import { FIXTURES, fixtureToPayload } from "./fixture.ts";

type Tab = "star" | "system" | "exotic";

const field: React.CSSProperties = {
  width: "100%",
  background: "#0d1420",
  color: "#dbe6f2",
  border: "1px solid #1e2c3d",
  borderRadius: 6,
  padding: "5px 7px",
  font: "inherit",
};
const label: React.CSSProperties = { display: "block", marginBottom: 12 };
const caption: React.CSSProperties = {
  display: "block",
  marginBottom: 3,
  color: "#7f93a8",
  fontSize: 11,
  letterSpacing: ".04em",
  textTransform: "uppercase",
};
const tabButton = (active: boolean): React.CSSProperties => ({
  flex: 1,
  background: active ? "rgba(61,220,255,.16)" : "transparent",
  border: `1px solid ${active ? "rgba(61,220,255,.55)" : "#1e2c3d"}`,
  borderRadius: 6,
  color: active ? "#3ddcff" : "#9fb3c8",
  fontSize: 12,
  padding: "6px 8px",
  cursor: "pointer",
});

const STAR_TYPES = ["Yellow Dwarf", "Red Dwarf", "Red Giant", "Blue Giant", "White Dwarf", "Neutron Star"];
const STAR_COLORS = ["yellow", "red", "blue", "orange", "white", "purple"];

function Lab() {
  const [tab, setTab] = useState<Tab>("star");

  // star
  const [starType, setStarType] = useState("Yellow Dwarf");
  const [starColor, setStarColor] = useState("yellow");
  const [starRadius, setStarRadius] = useState(1);
  const [starSeed, setStarSeed] = useState(7);
  const [starNear, setStarNear] = useState(0.85);

  // system
  const [fixtureId, setFixtureId] = useState(FIXTURES[0].id);
  const [planetScale, setPlanetScale] = useState(4);
  const payload = useMemo(
    () => fixtureToPayload(FIXTURES.find((fixture) => fixture.id === fixtureId) ?? FIXTURES[0]),
    [fixtureId]
  );
  const adapted = useMemo(() => adaptSystemPayload(payload), [payload]);

  // exotic
  const [kinds, setKinds] = useState<Array<"blackhole" | "pulsar" | "quasar" | "torus">>([
    "blackhole",
    "pulsar",
    "quasar",
    "torus",
  ]);
  const [exoticScale, setExoticScale] = useState(1);

  return (
    <div style={{ display: "flex", height: "100%" }}>
      <aside
        style={{
          width: 286,
          flex: "0 0 286px",
          padding: 16,
          borderRight: "1px solid #16202c",
          overflowY: "auto",
          background: "#080d14",
        }}
      >
        <h1 style={{ fontSize: 13, letterSpacing: ".08em", margin: "0 0 4px", color: "var(--atlas-n-950)" }}>3.0 SYSTEM LAB</h1>
        <p style={{ margin: "0 0 12px", color: "var(--atlas-n-700)", fontSize: 11 }}>vendored 3.0.2 · 恒星 / 恒星系 / 异象</p>

        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {(["star", "system", "exotic"] as Tab[]).map((key) => (
            <button key={key} type="button" style={tabButton(tab === key)} onClick={() => setTab(key)}>
              {key === "star" ? "恒星" : key === "system" ? "恒星系" : "异象"}
            </button>
          ))}
        </div>

        {tab === "star" ? (
          <>
            <label style={label}>
              <span style={caption}>star type</span>
              <select style={field} value={starType} onChange={(event) => setStarType(event.target.value)}>
                {STAR_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>
            <label style={label}>
              <span style={caption}>colour</span>
              <select style={field} value={starColor} onChange={(event) => setStarColor(event.target.value)}>
                {STAR_COLORS.map((color) => (
                  <option key={color} value={color}>{color}</option>
                ))}
              </select>
            </label>
            <label style={label}>
              <span style={caption}>radius · {starRadius.toFixed(2)}</span>
              <input style={field} type="range" min={0.4} max={2.4} step={0.05} value={starRadius} onChange={(event) => setStarRadius(Number(event.target.value))} />
            </label>
            <label style={label}>
              <span style={caption}>seed · {starSeed}</span>
              <input style={field} type="range" min={1} max={40} value={starSeed} onChange={(event) => setStarSeed(Number(event.target.value))} />
            </label>
            <label style={label}>
              <span style={caption}>near · {starNear.toFixed(2)}（日冕强度）</span>
              <input style={field} type="range" min={0} max={1} step={0.05} value={starNear} onChange={(event) => setStarNear(Number(event.target.value))} />
            </label>
            <p style={{ color: "#4d6076", fontSize: 11, margin: "12px 0 0" }}>
              日冕是 billboard，靠近才亮；拉 `near` 到 0 就是远景里的那颗「点光源」。
            </p>
          </>
        ) : null}

        {tab === "system" ? (
          <>
            <label style={label}>
              <span style={caption}>fixture</span>
              <select style={field} value={fixtureId} onChange={(event) => setFixtureId(event.target.value)}>
                {FIXTURES.map((fixture) => (
                  <option key={fixture.id} value={fixture.id}>{fixture.label}</option>
                ))}
              </select>
            </label>
            <label style={label}>
              <span style={caption}>planet display scale · {planetScale}×</span>
              <input style={field} type="range" min={1} max={12} value={planetScale} onChange={(event) => setPlanetScale(Number(event.target.value))} />
            </label>
            <div style={{ borderTop: "1px solid #16202c", paddingTop: 10, fontSize: 11, lineHeight: 1.7, color: "#9fb3c8" }}>
              <div style={{ color: "#7f93a8", letterSpacing: ".04em", textTransform: "uppercase", marginBottom: 4 }}>
                adapter
              </div>
              <div>系统 <b style={{ color: "#3ddcff" }}>{adapted?.system.name ?? "—"}</b></div>
              <div>恒星 {adapted?.system.stars.length ?? 0} · 行星 {adapted?.system.planets.length ?? 0}</div>
              <div>外轨 {adapted?.system.max_orbital_radius.toFixed(2) ?? "—"} AU</div>
              <div>timing Δ {adapted ? Math.round(adapted.timing.current_time - adapted.timing.cosmic_origin_time).toLocaleString() : "—"} s</div>
            </div>
            <p style={{ color: "#4d6076", fontSize: 11, margin: "12px 0 0" }}>
              数据走 `fixtureToPayload → adaptSystemPayload → SystemLayer`，与真实页面同一条链。
            </p>
          </>
        ) : null}

        {tab === "exotic" ? (
          <>
            <div style={{ marginBottom: 12 }}>
              <span style={caption}>objects</span>
              {(["blackhole", "pulsar", "quasar", "torus"] as const).map((kind) => (
                <label key={kind} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={kinds.includes(kind)}
                    onChange={(event) =>
                      setKinds((current) =>
                        event.target.checked ? [...current, kind] : current.filter((item) => item !== kind)
                      )
                    }
                  />
                  <span style={{ color: "#9fb3c8" }}>{kind}</span>
                </label>
              ))}
            </div>
            <label style={label}>
              <span style={caption}>scale · {exoticScale.toFixed(2)}×</span>
              <input style={field} type="range" min={0.4} max={2.5} step={0.05} value={exoticScale} onChange={(event) => setExoticScale(Number(event.target.value))} />
            </label>
            <p style={{ color: "#4d6076", fontSize: 11, margin: "12px 0 0" }}>
              3.0 把它们放在星系点坐标上；这里做成独立展品，间距是手写的。
            </p>
          </>
        ) : null}
      </aside>

      <main style={{ flex: 1, minWidth: 0, padding: 16, overflow: "auto" }}>
        {tab === "star" ? (
          <RealisticStarStage type={starType} color={starColor} radius={starRadius} seed={starSeed} near={starNear} height="100%" />
        ) : null}
        {tab === "system" ? (
          <RealisticSystemStage payload={payload} planetScale={planetScale} height="100%" />
        ) : null}
        {tab === "exotic" ? (
          <ExoticShowcase kinds={kinds} scale={exoticScale} height="100%" />
        ) : null}
      </main>
    </div>
  );
}

const host = document.getElementById("systemlab-root");
if (host) createRoot(host).render(<Lab />);

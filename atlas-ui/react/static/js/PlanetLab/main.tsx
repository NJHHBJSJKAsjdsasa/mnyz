// atlas-ui/react/static/js/PlanetLab/main.tsx
//
// Dev-only harness (served by `npm run dev` at /planetlab.html). Renders the vendored
// 3.0 realistic planet for an arbitrary type/temperature/seed, so the transplant can be
// judged side by side with the 2.x look before anything is wired into the real pages.
// Nothing in the app imports this file.

import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import { RealisticPlanetView, type CacheStats } from "../3DComponents/realistic3/RealisticPlanetView.tsx";
import { sampleRings, type PlanetLike } from "../3DComponents/realistic3/adapter.ts";

const TYPES = [
  "Oceanic", "Super Earth", "Sub Earth", "Forest", "Savannah", "Desert", "Arid", "Tundra",
  "Swamp", "Cave", "Rocky", "Metallic", "Crystalline", "Diamond", "Icy", "Lava", "Magma",
  "Molten Core", "Toxic", "Radioactive", "Gas Giant", "Frozen Gas Giant", "Nebulous",
  "Exotic", "Anomaly", "Mirror", "Super Puff", "Super Ringed", "Ruby Cloud", "Aquifer", "Carbon",
];

const ATMOSPHERES = [
  "None", "Thin", "Carbon Dioxide", "Methane", "Nitrogen", "Oxygen-Rich", "Sulfur Dioxide",
  "Superheated", "Acidic", "Toxic", "Hydrogen", "Helium", "Ammonia", "Ionic", "Plasma",
  "Exotic Gases", "Water Vapor", "Frozen",
];

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

function Lab() {
  const [type, setType] = useState("Oceanic");
  const [temperature, setTemperature] = useState(14);
  const [atmosphere, setAtmosphere] = useState("Nitrogen");
  const [seed, setSeed] = useState("planetlab-001");
  const [spin, setSpin] = useState(40);
  const [octaves, setOctaves] = useState(7.5);
  const [life, setLife] = useState("Carbon-based");
  const [ringed, setRinged] = useState(false);
  const [moonCount, setMoonCount] = useState(0);
  const [warm, setWarm] = useState(true);
  const [cache, setCache] = useState<CacheStats | null>(null);

  const rings = useMemo(() => (ringed ? sampleRings(seed.length * 37 + 11) : null), [ringed, seed]);
  const planet: PlanetLike = useMemo(
    () => ({
      name: seed,
      planet_type: type,
      surface_temperature: temperature,
      atmosphere,
      life_forms: life,
      seed,
      rotation_period_seconds: 86400,
    }),
    [type, temperature, atmosphere, seed, life]
  );

  return (
    <div style={{ display: "flex", height: "100%" }}>
      <aside
        style={{
          width: 268,
          flex: "0 0 268px",
          padding: 16,
          borderRight: "1px solid #16202c",
          overflowY: "auto",
          background: "#080d14",
        }}
      >
        <h1 style={{ fontSize: 13, letterSpacing: ".08em", margin: "0 0 4px", color: "var(--atlas-n-950)" }}>
          3.0 RENDERER LAB
        </h1>
        <p style={{ margin: "0 0 16px", color: "var(--atlas-n-700)", fontSize: 11 }}>
          vendored 3.0.2 · realistic/ · 未接入任何页面
        </p>

        <label style={label}>
          <span style={caption}>planet type</span>
          <select style={field} value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>

        <label style={label}>
          <span style={caption}>atmosphere</span>
          <select style={field} value={atmosphere} onChange={(e) => setAtmosphere(e.target.value)}>
            {ATMOSPHERES.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>

        <label style={label}>
          <span style={caption}>surface temperature · {temperature} °C</span>
          <input
            style={field}
            type="range"
            min={-220}
            max={1200}
            value={temperature}
            onChange={(e) => setTemperature(Number(e.target.value))}
          />
        </label>

        <label style={label}>
          <span style={caption}>life forms</span>
          <select style={field} value={life} onChange={(e) => setLife(e.target.value)}>
            {["None", "Carbon-based", "Silicon-based", "Microbial", "Exotic"].map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </label>

        <label style={label}>
          <span style={caption}>seed</span>
          <input style={field} value={seed} onChange={(e) => setSeed(e.target.value)} />
        </label>

        <label style={label}>
          <span style={caption}>turn every {spin}s</span>
          <input
            style={field}
            type="range"
            min={4}
            max={120}
            value={spin}
            onChange={(e) => setSpin(Number(e.target.value))}
          />
        </label>

        <label style={{ ...label, display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={ringed} onChange={(e) => setRinged(e.target.checked)} />
          <span style={{ ...caption, marginBottom: 0 }}>rings</span>
        </label>

        <label style={label}>
          <span style={caption}>moons · {moonCount}</span>
          <input
            style={field}
            type="range"
            min={0}
            max={8}
            value={moonCount}
            onChange={(e) => setMoonCount(Number(e.target.value))}
          />
        </label>

        <label style={label}>
          <span style={caption}>max octaves · {octaves}</span>
          <input
            style={field}
            type="range"
            min={2.5}
            max={9}
            step={0.5}
            value={octaves}
            onChange={(e) => setOctaves(Number(e.target.value))}
          />
        </label>

        <label style={{ ...label, display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={warm} onChange={(e) => setWarm(e.target.checked)} />
          <span style={{ ...caption, marginBottom: 0 }}>warm shader cache</span>
        </label>

        <div style={{ borderTop: "1px solid #16202c", marginTop: 4, paddingTop: 10, fontSize: 11, lineHeight: 1.7 }}>
          <div style={{ color: "#7f93a8", letterSpacing: ".04em", textTransform: "uppercase", marginBottom: 4 }}>
            program cache
          </div>
          <div style={{ color: "#9fb3c8", fontVariantNumeric: "tabular-nums" }}>
            programs <b style={{ color: "#3ddcff" }}>{cache?.programs ?? "—"}</b>
          </div>
          <div style={{ color: "#9fb3c8", fontVariantNumeric: "tabular-nums" }}>
            {cache?.warming && cache.total > 0
              ? `warming ${cache.warmed}/${cache.total}…`
              : cache && cache.total > 0
                ? `warmed ${cache.warmed} in ${Math.round(cache.ms)} ms`
                : "idle"}
          </div>
          <div style={{ color: "#4d6076", marginTop: 4 }}>
            切类型不再重建 renderer：同 family 命中缓存即零编译。
          </div>
        </div>

        <p style={{ color: "#4d6076", fontSize: 11, margin: "16px 0 0" }}>
          拖拽旋转 · 滚轮缩放。同一 seed 应始终生成同一地形。
        </p>
      </aside>

      <main style={{ flex: 1, minWidth: 0 }}>
        <RealisticPlanetView
          key={warm ? "warm" : "cold"}
          planet={planet}
          maxOctaves={octaves}
          secondsPerRotation={spin}
          rings={rings}
          moons={moonCount}
          warmVariants={warm}
          onCacheStats={setCache}
          onError={(message) => console.error("[planetlab]", message)}
        />
      </main>
    </div>
  );
}

const host = document.getElementById("planetlab-root");
if (host) createRoot(host).render(<Lab />);

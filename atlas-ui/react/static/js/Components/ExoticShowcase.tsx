// atlas-ui/react/static/js/Components/ExoticShowcase.tsx
//
// The galaxy-scale landmarks of 3.0 (black hole with its accretion disk, pulsar with its
// beams and wind nebula, a quasar's relativistic jets, and the Singularity Void's
// primordial torus) shown as a **standalone exhibit**.
//
// §10.2 of docs/render-transplant is explicit about why they are not placed inside a galaxy
// here: 3.0 puts them at galaxy point coordinates in a floating-origin explorer, and 2.x has
// no equivalent coordinate system. So the vendored `ExoticLayer` is used as-is with a small
// hand-made set of points of interest, one exhibit per kind.
//
// Two conventions of the explorer are cancelled at the caller:
//   * `ExoticLayer.update` positions every object relative to the camera (floating origin);
//     putting `root.position` back to the camera re-absolutises them, so OrbitControls works;
//   * `time` is Unix seconds (the shaders use `time % 86400`), passed from the wall clock so
//     a pulsar's beams point the same way as they would in the explorer.

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

import { ExoticLayer } from "../3DComponents/realistic3/ExoticLayer.ts";
import type { PointOfInterest } from "../3DComponents/realistic3/GalaxyModel.ts";
import { qualityProfile } from "../3DComponents/realistic3/perf.ts";

export interface ExoticShowcaseProps {
  height?: number | string;
  /** Which exhibits to build. Defaults to all four kinds. */
  kinds?: Array<"blackhole" | "pulsar" | "quasar" | "torus">;
  /** Scene units per light year in the exhibit. */
  scale?: number;
  className?: string;
}

interface Exhibit {
  poi: PointOfInterest;
  label: string;
}

const POSITIONS: Record<string, [number, number, number]> = {
  smbh: [0, 0, 0],
  "pulsar-01": [1.75, 0.35, -0.55],
  quasar: [-1.55, -0.35, 1.05],
  torus: [0.45, 1.25, 1.6],
};

function buildExhibits(kinds: ExoticShowcaseProps["kinds"]): Exhibit[] {
  const wanted = kinds ?? ["blackhole", "pulsar", "quasar", "torus"];
  const out: Exhibit[] = [];
  if (wanted.includes("blackhole")) {
    out.push({
      poi: {
        id: "smbh",
        kind: "blackhole",
        name: "超大质量黑洞",
        position: POSITIONS.smbh,
        radius: 1,
        description: "吸积盘 + 相对论集束；近处可见引力透镜",
      },
      label: "超大质量黑洞",
    });
  }
  if (wanted.includes("pulsar")) {
    out.push({
      poi: {
        id: "pulsar-01",
        kind: "pulsar",
        name: "脉冲星",
        position: POSITIONS["pulsar-01"],
        radius: 1,
        description: "磁轴倾斜的自转束 + 风星云体积光",
      },
      label: "脉冲星",
    });
  }
  if (wanted.includes("quasar")) {
    out.push({
      poi: {
        id: "quasar",
        kind: "quasar",
        name: "类星体",
        position: POSITIONS.quasar,
        radius: 1,
        description: "核心 + 双极相对论喷流",
      },
      label: "类星体",
    });
  }
  if (wanted.includes("torus")) {
    out.push({
      poi: {
        id: "torus",
        kind: "torus",
        name: "奇点环面",
        position: POSITIONS.torus,
        radius: 1,
        description: "时间之前的原初环面 + 3×3×3 晶格回响",
      },
      label: "奇点环面",
    });
  }
  return out;
}

export const ExoticShowcase: React.FC<ExoticShowcaseProps> = ({ height = 460, kinds, scale = 1, className }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const exhibits = useMemo(() => buildExhibits(kinds), [kinds]);
  const [active, setActive] = useState<string | null>(null);
  const quality = useRef(qualityProfile());

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.current.maxPixelRatio));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setClearColor(0x04060a, 1);
    renderer.domElement.style.display = "block";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.001, 200);
    camera.position.set(2.4, 1.5, 3.4);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 0.35;
    controls.maxDistance = 12;
    controls.rotateSpeed = 0.5;
    controlsRef.current = controls;

    const resize = () => {
      const width = host.clientWidth || 1;
      const heightPx = host.clientHeight || 1;
      renderer.setSize(width, heightPx, false);
      camera.aspect = width / heightPx;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    // `galaxyRadius` only drives the quasar's jet length; `quasar` lights the central hole
    const layer = new ExoticLayer(
      exhibits.map((entry) => entry.poi),
      3,
      "Spiral",
      true
    );
    layer.root.scale.setScalar(scale);
    scene.add(layer.root);
    scene.add(new THREE.AmbientLight(0x223044, 0.2));

    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const seconds = performance.now() / 1000;
      // Unix seconds: the pulsar/disk shaders read `time % 86400`
      layer.update(Date.now() / 1000, camera.position, renderer.getPixelRatio(), renderer.domElement.height, 1, camera.projectionMatrix.elements[5]);
      // Put the floating origin back: objects sit at their own coordinates again
      layer.root.position.copy(camera.position).divideScalar(scale);
      controls.update();
      renderer.render(scene, camera);
      void seconds;
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      controls.dispose();
      layer.dispose();
      scene.clear();
      renderer.dispose();
      renderer.domElement.remove();
      controlsRef.current = null;
      cameraRef.current = null;
    };
  }, [exhibits, scale]);

  const focus = (entry: Exhibit) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const target = new THREE.Vector3(...entry.poi.position).multiplyScalar(scale);
    const distance = entry.poi.kind === "pulsar" ? 0.55 : entry.poi.kind === "torus" ? 1.4 : 0.9;
    const direction = camera.position.clone().sub(controls.target).normalize();
    if (direction.lengthSq() < 1e-6) direction.set(0.5, 0.4, 1).normalize();
    controls.target.copy(target);
    camera.position.copy(target).addScaledVector(direction, distance);
    controls.update();
    setActive(entry.poi.id);
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div
        style={{
          position: "relative",
          height,
          borderRadius: 14,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,.12)",
          background: "radial-gradient(120% 90% at 50% 45%, #0a1020 0%, #03050a 70%)",
        }}
      >
        <div ref={hostRef} style={{ width: "100%", height: "100%" }} />
        <div
          style={{
            position: "absolute",
            left: 10,
            top: 10,
            display: "flex",
            gap: 8,
            alignItems: "center",
            fontSize: 11,
            color: "rgba(230,240,255,.72)",
            pointerEvents: "none",
          }}
        >
          <span style={{ border: "1px solid rgba(61,220,255,.5)", color: "#3ddcff", borderRadius: 4, padding: "2px 6px" }}>
            realistic 3.0
          </span>
          <span style={{ opacity: 0.65 }}>星系尺度天体展品 · 拖拽旋转 / 滚轮缩放</span>
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {exhibits.map((entry) => (
          <button
            key={entry.poi.id}
            type="button"
            onClick={() => focus(entry)}
            title={entry.poi.description}
            style={{
              background: active === entry.poi.id ? "rgba(61,220,255,.16)" : "rgba(8,13,20,.7)",
              border: `1px solid ${active === entry.poi.id ? "rgba(61,220,255,.5)" : "rgba(255,255,255,.16)"}`,
              borderRadius: 4,
              color: "rgba(230,240,255,.82)",
              fontSize: 11,
              padding: "4px 9px",
              cursor: "pointer",
            }}
          >
            {entry.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default ExoticShowcase;

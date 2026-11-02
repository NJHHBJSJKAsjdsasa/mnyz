// atlas-ui/react/static/js/Components/ModelViewer.tsx — a loaded 3D model in a box.
//
// 2026-10-31. First model pipeline in this project: until now every 3D view was
// generated (points, spheres, procedural planet shaders). This one loads an
// authored mesh.
//
// Why FBX and not glTF: the assets arrived as FBX and there is no Blender on this
// machine to convert them. three ships `FBXLoader`, so this works today; if the
// pipeline becomes permanent the conversion is worth doing (a 36 MB FBX becomes a
// ~2 MB glTF+Draco), and only the loader line below changes.
//
// The station has **no textures** (`Texture` count in the file: 0), so a plain
// `MeshStandardMaterial` is applied to every mesh. That is a deliberate choice,
// not a fallback: an untextured mesh rendered with its original Phong material
// looks like flat plastic.

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export interface ModelViewerProps {
  url: string;
  /** Slow turntable rotation. Off for stills, on for previews. */
  spin?: boolean;
  /** Called with 0..1 while downloading. */
  onProgress?: (fraction: number) => void;
  onReady?: () => void;
  onError?: (message: string) => void;
}

const ModelViewer: React.FC<ModelViewerProps> = ({ url, spin = true, onProgress, onReady, onError }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let raf = 0;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 5000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    host.appendChild(renderer.domElement);

    // Metals need something to reflect. Without an environment map a
    // `MeshStandardMaterial` with metalness > 0 has only specular highlights, so
    // the whole station read as a dark silhouette against the panel background —
    // that was the "black model", not a normals problem.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = 1.35;

    // Three-point rig. A metal object with no environment map needs a strong key
    // and enough fill that the shadow side is still readable.
    const key = new THREE.DirectionalLight(0xffffff, 1.7);
    key.position.set(2.4, 2.2, 2.6);
    const fill = new THREE.DirectionalLight(0x7fb2ff, 0.75);
    fill.position.set(-2.6, -0.6, 1.4);
    const rim = new THREE.DirectionalLight(0x2ee6ff, 1.2);
    rim.position.set(-1.2, 1.6, -2.8);
    scene.add(key, fill, rim, new THREE.HemisphereLight(0x9fd8ff, 0x0a1220, 0.5));

    const pivot = new THREE.Group();
    scene.add(pivot);

    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    const applyModel = (object: THREE.Object3D) => {
        if (disposed) return;

        // Normalise: the asset's authoring scale is arbitrary. Fit it to ~2 units
        // and centre it, so the camera below can be a constant.
        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());
        const centre = box.getCenter(new THREE.Vector3());
        const longest = Math.max(size.x, size.y, size.z) || 1;
        const scale = 2 / longest;

        // Centre and scale on a **wrapper**, not on the object itself.
        //
        // Scaling `object` while also offsetting `object.position` does not work:
        // `scale` applies to the object's children but leaves its own position
        // untouched, so the centred position got divided by nothing while the mesh
        // shrank by 1/14 — the station ended up far outside the camera frustum and
        // rendered as a single pixel. A wrapper gives scale and translation
        // independent homes.
        const wrapper = new THREE.Group();
        object.position.sub(centre);
        wrapper.add(object);
        wrapper.scale.setScalar(scale);

        const metal = new THREE.MeshStandardMaterial({
          color: 0xa8b8cc,
          metalness: 0.45,
          roughness: 0.45,
          flatShading: false,
          // Optimised meshes come out of trimesh with whatever winding the source
          // OBJ had; if that is inside-out the lit face points away and the whole
          // station renders black. Double-siding costs nothing at this triangle
          // count and removes the guesswork.
          side: THREE.DoubleSide,
        });
        const glass = new THREE.MeshStandardMaterial({
          color: 0x8fe6ff,
          metalness: 0.1,
          roughness: 0.15,
          transparent: true,
          opacity: 0.55,
          emissive: new THREE.Color(0x0b3546),
          emissiveIntensity: 1,
        });

        object.traverse((child: any) => {
          if (!child.isMesh) return;
          child.castShadow = false;
          child.receiveShadow = false;
          // A draco/simplified mesh may arrive without normals; lighting is then
          // undefined (reads as black) rather than merely flat.
          if (!child.geometry?.attributes?.normal) child.geometry?.computeVertexNormals?.();
          // A draco/simplified mesh may arrive without normals; lighting is then
          // undefined (reads as black) rather than merely flat.
          if (!child.geometry?.attributes?.normal) child.geometry?.computeVertexNormals?.();
          // Keep an authored texture if the asset ever gains one.
          if (child.material?.map) return;
          const emissive = typeof child.material?.emissive === "object" && child.material.emissive?.getHex?.() > 0;
          child.material = emissive ? glass : metal;
        });

        pivot.add(wrapper);
        // Frame it: distance derived from the fit size, slight elevation so the
        // silhouette reads as a structure rather than a flat plan view.
        // High three-quarter view. The station is a flat lattice (23 units tall
        // against 25x29 across), so a level camera collapses it into a line; 40°
        // up is where the structure reads as a structure. Close in: at 320px the
        // truss details are smaller than a pixel unless the model fills the frame.
        camera.position.set(1.85, 2.05, 2.55);
        camera.lookAt(0, 0, 0);

        setStatus("ready");
        onReady?.();
    };

    const onLoadProgress = (event: ProgressEvent) => {
      if (disposed) return;
      if (event.lengthComputable && event.total > 0) onProgress?.(event.loaded / event.total);
    };
    const onLoadError = (error: unknown) => {
      if (disposed) return;
      setStatus("error");
      onError?.(error instanceof Error ? error.message : String(error));
    };

    // glTF is what the optimiser emits (2 MB instead of a 36 MB FBX); FBX stays
    // supported for assets that arrive without a conversion step.
    const isGltf = /\.(glb|gltf)(\?|$)/i.test(url);
    if (isGltf) {
      new GLTFLoader().load(url, (gltf) => applyModel(gltf.scene), onLoadProgress, onLoadError);
    } else {
      new FBXLoader().load(url, (object) => applyModel(object), onLoadProgress, onLoadError);
    }

    const clock = new THREE.Clock();
    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (spin) pivot.rotation.y += clock.getDelta() * 0.35;
      else clock.getDelta();
      renderer.render(scene, camera);
    };
    draw();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      scene.traverse((child: any) => {
        if (child.isMesh) {
          child.geometry?.dispose?.();
          const material = child.material;
          if (Array.isArray(material)) material.forEach((m) => m.dispose?.());
          else material?.dispose?.();
        }
      });
      envTarget.dispose();
      pmrem.dispose();
      envTarget.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [url, spin]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={hostRef} style={{ width: "100%", height: "100%" }} />
      {status === "loading" ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            fontFamily: "var(--atlas-mono)",
            fontSize: 9.5,
            letterSpacing: "0.2em",
            color: "var(--atlas-n-600)",
          }}
        >
          载入模型…
        </div>
      ) : null}
      {status === "error" ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            fontFamily: "var(--atlas-mono)",
            fontSize: 9.5,
            color: "var(--atlas-warn)",
          }}
        >
          模型载入失败
        </div>
      ) : null}
    </div>
  );
};

export default ModelViewer;

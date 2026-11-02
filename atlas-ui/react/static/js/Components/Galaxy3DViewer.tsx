// atlas-ui/react/static/js/Components/Galaxy3DViewer.tsx
import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import DownloadIcon from "../Icons/DownloadIcon";
import { addQRToScreenshot } from "./QRGenerator";
import { addCopyrightWatermark } from "./CopyrightWatermark";
import ExportingOverlay from "./ExportingOverlay";
import AdaptivePreloadCanvas from "./AdaptivePreloadCanvas.tsx";

interface Galaxy3DViewerProps {
  galaxyType: string;
  numSystems: number;
  blackHoles: number;
  pulsars: number;
  quasars: number;
  seed?: number;
  onExpandClick?: () => void;
  galaxyName?: string;
  galaxyUrl?: string;
}

const Galaxy3DViewer = forwardRef<{ captureScreenshot: () => void; isGeneratingImage: boolean }, Galaxy3DViewerProps>(({ galaxyType, numSystems, blackHoles, pulsars, quasars, seed = 12345, onExpandClick, galaxyName, galaxyUrl }, ref) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const galaxyGroupRef = useRef<THREE.Group | null>(null);
  const decelerateRef = useRef(false);
  const [sceneLoaded, setSceneLoaded] = useState(false);
  const [canvasHidden, setCanvasHidden] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const autorotateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const manualRotationSpeed = useRef<number>(0.002);
  const targetRotationSpeed = useRef<number>(0.002);
  const isTransitioning = useRef<boolean>(false);
  const transitionStartTime = useRef<number>(0);
  const isUserInteracting = useRef<boolean>(false);

  useImperativeHandle(ref, () => ({
    captureScreenshot: handleDownloadScreenshot,
    isGeneratingImage,
  }));

  class SeededRandom {
    private seed: number;

    constructor(seed: number) {
      this.seed = seed;
    }

    random(): number {
      const x = Math.sin(this.seed++) * 10000;
      return x - Math.floor(x);
    }

    uniform(min: number, max: number): number {
      return min + this.random() * (max - min);
    }

    gauss(mean: number, stdDev: number): number {
      let u = 0,
        v = 0;
      while (u === 0) u = this.random();
      while (v === 0) v = this.random();
      const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
      return mean + stdDev * num;
    }

    randint(min: number, max: number): number {
      return Math.floor(this.uniform(min, max + 1));
    }
  }

  const scaleGalaxyParams = (numSystems: number, baseMax: number, absoluteMaxPoints: number, baseRadius: number, maxAllowedRadius: number): { numPoints: number; maxRadius: number } => {
    if (numSystems <= baseMax) {
      return { numPoints: numSystems, maxRadius: baseRadius };
    }
    const excess = numSystems - baseMax;
    const numPoints = Math.min(Math.floor(baseMax + Math.sqrt(excess)), absoluteMaxPoints);
    const maxRadius = Math.min(baseRadius + Math.cbrt(excess) * 0.05, maxAllowedRadius);
    return { numPoints, maxRadius };
  };

  useEffect(() => {
    if (!mountRef.current) return;

    const container = mountRef.current;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    // The server says "spiral" (lowercase, `__atlas_cache_proxy` default). The
    // branch table below compared "Spiral" — so *every* galaxy, of every type,
    // fell through to the fallback and rendered as a few dozen loose points. That
    // is the whole reason the stage looked empty. Normalise once, compare lower.
    const kind = String(galaxyType || "").trim().toLowerCase();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000011);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);
    camera.position.set(0, 200, 400);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    // 2026-10-31 (P1c): fill the container instead of forcing a square. The stage
    // is now wide, and a square canvas centred in it meant the galaxy only ever
    // occupied the middle third with dead space either side — which read as "the
    // galaxy is a few dots". `camera.aspect` must track it or the disc stretches.
    renderer.setSize(containerWidth, containerHeight);
    camera.aspect = containerWidth / Math.max(1, containerHeight);
    camera.updateProjectionMatrix();
    renderer.setClearColor(0x000011, 1);
    rendererRef.current = renderer;

    renderer.domElement.className = "";
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 50;
    controls.maxDistance = 800;
    controls.autoRotate = false;
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    controls.addEventListener("start", () => {
      if (autorotateTimeoutRef.current) {
        clearTimeout(autorotateTimeoutRef.current);
      }
      isUserInteracting.current = true;
      manualRotationSpeed.current = 0;
      isTransitioning.current = false;
    });

    controls.addEventListener("end", () => {
      isUserInteracting.current = false;
      autorotateTimeoutRef.current = setTimeout(() => {
        isTransitioning.current = true;
        transitionStartTime.current = performance.now();
        manualRotationSpeed.current = 0;
      }, 3000);
    });

    const galaxyGroup = new THREE.Group();
    galaxyGroupRef.current = galaxyGroup;
    scene.add(galaxyGroup);

    const rng = new SeededRandom(seed);
    const rotationAngle = rng.uniform(0, 2 * Math.PI);

    // Viewing angle also belongs to the galaxy.
    //
    // Every galaxy was framed from the same 27° elevation, so even with different
    // arm counts and disc thickness they all read as "the same disc, rotated". A
    // face-on Sc galaxy and an edge-on one are different pictures before any
    // detail is drawn, and that difference costs one call to the RNG we already
    // have.
    const elevation = rng.uniform(0.18, 1.25); // radians above the disc plane
    const framing = rng.uniform(420, 500);
    camera.position.set(0, framing * Math.sin(elevation), framing * Math.cos(elevation));
    camera.lookAt(0, 0, 0);
    controls.maxDistance = Math.max(controls.maxDistance, framing * 2);
    controls.update();

    const starsGeometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    const colors: number[] = [];
    const sizes: number[] = [];

    let maxRadius = 300;
    let numPoints = numSystems;

    if (kind === "spiral") {
      ({ numPoints, maxRadius } = scaleGalaxyParams(numSystems, 50000, 350000, 300, 600));

      // Shape varies per galaxy, from the seed.
      //
      // These five were constants (4 arms, spread .15, tightness .5, core .1), so
      // every spiral galaxy in the universe was the same picture at a different
      // rotation — 11,038 systems or 17,475, it read as "I have seen this one".
      // The seed was already there; it just only fed the point jitter.
      const numArms = 2 + Math.floor(rng.uniform(0, 5)); // 2..6
      const armOffset = (2 * Math.PI) / numArms;
      const spread = rng.uniform(0.08, 0.24);
      const armTightness = rng.uniform(0.32, 0.92);
      const coreDensity = rng.uniform(0.06, 0.2);
      // A tighter galaxy also reads as a thinner one; tying the two keeps the
      // extremes from looking like separate generators.
      const diskHeight = rng.uniform(2.2, 5.5) * (1.2 - armTightness * 0.5);

      for (let i = 0; i < numPoints * coreDensity; i++) {
        const angle = rng.uniform(0, 2 * Math.PI);
        const radius = rng.gauss(maxRadius * 0.1, maxRadius * 0.05);
        const height = rng.gauss(0, diskHeight);

        const x = radius * Math.cos(angle);
        const z = radius * Math.sin(angle);

        positions.push(x, height, z);
        colors.push(1, 1, 1);

        const starSeed = seed + i * 1337;
        const sizeRng = new SeededRandom(starSeed);
        const baseSizeVariation = sizeRng.gauss(1, 0.3);
        const isGiant = sizeRng.random() < 0.05;
        const isDwarf = sizeRng.random() < 0.3;

        let finalSize = Math.max(0.3, baseSizeVariation);
        if (isGiant) finalSize *= 3 + sizeRng.uniform(0, 2);
        if (isDwarf) finalSize *= 0.5 + sizeRng.uniform(0, 0.3);

        if (radius < maxRadius * 0.2) {
          finalSize *= 1.8 + sizeRng.uniform(0, 0.7);
          colors[colors.length - 3] = 1.2;
          colors[colors.length - 2] = 1.1;
          colors[colors.length - 1] = 0.9;
        }

        sizes.push(Math.min(finalSize * 1.5, 12));
      }

      for (let i = 0; i < numPoints; i++) {
        const theta = armTightness * Math.sqrt(i / numPoints) * 2 * Math.PI;
        const armAngle = (i % numArms) * armOffset;
        const radius = maxRadius * Math.sqrt(i / numPoints);

        const x = radius * Math.cos(theta + armAngle + rotationAngle) + rng.uniform(-spread * radius, spread * radius);
        const z = radius * Math.sin(theta + armAngle + rotationAngle) + rng.uniform(-spread * radius, spread * radius);
        const y = rng.gauss(0, diskHeight * 0.6);

        positions.push(x, y, z);
        colors.push(1, 1, 0.8);

        const starSeed = seed + i * 1337;
        const sizeRng = new SeededRandom(starSeed);
        const baseSizeVariation = sizeRng.gauss(0.8, 0.25);
        const isGiant = sizeRng.random() < 0.03;
        const isDwarf = sizeRng.random() < 0.4;

        let finalSize = Math.max(0.2, baseSizeVariation);
        if (isGiant) finalSize *= 2.5 + sizeRng.uniform(0, 1.5);
        if (isDwarf) finalSize *= 0.4 + sizeRng.uniform(0, 0.2);

        if (radius > maxRadius * 0.7) finalSize *= 0.8;

        sizes.push(Math.min(finalSize * 1.3, 8));
      }
    } else if (kind === "elliptical") {
      ({ numPoints, maxRadius } = scaleGalaxyParams(numSystems, 100000, 350000, 300, 600));

      for (let i = 0; i < numPoints; i++) {
        const angle = rng.uniform(0, 2 * Math.PI);
        const cosTheta = rng.uniform(-1, 1);
        const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);

        const u = rng.random();

        const normalizedU = Math.pow(u, 0.6);
        const radius = -Math.log(1 - normalizedU * 0.98) * maxRadius * 0.35;

        const x = radius * sinTheta * Math.cos(angle);
        const y = radius * cosTheta * 0.6;
        const z = radius * sinTheta * Math.sin(angle);

        positions.push(x, y, z);
        colors.push(1, 0.9, 0.7);

        const starSeed = seed + i * 1337;
        const sizeRng = new SeededRandom(starSeed);
        const baseSizeVariation = sizeRng.gauss(0.6, 0.2);
        const isGiant = sizeRng.random() < 0.08;
        const isDwarf = sizeRng.random() < 0.25;

        let finalSize = Math.max(0.2, baseSizeVariation);
        if (isGiant) finalSize *= 2 + sizeRng.uniform(0, 1);
        if (isDwarf) finalSize *= 0.6 + sizeRng.uniform(0, 0.2);

        const distanceFromCenter = Math.sqrt(x * x + y * y + z * z);
        if (distanceFromCenter < maxRadius * 0.3) {
          finalSize *= 1.5 + sizeRng.uniform(0, 0.5);
        }

        sizes.push(Math.min(finalSize * 1.4, 7));
      }
    } else if (kind === "dwarf") {
      ({ numPoints, maxRadius } = scaleGalaxyParams(numSystems, 30000, 150000, 150, 300));

      for (let i = 0; i < numPoints; i++) {
        const angle = rng.uniform(0, 2 * Math.PI);
        const phi = rng.uniform(0, Math.PI);
        const radius = rng.gauss(maxRadius / 3, maxRadius * 0.3);

        const x = radius * Math.sin(phi) * Math.cos(angle);
        const y = radius * Math.cos(phi) * 0.5;
        const z = radius * Math.sin(phi) * Math.sin(angle);

        positions.push(x, y, z);
        colors.push(0.8, 0.8, 1);

        const starSeed = seed + i * 1337;
        const sizeRng = new SeededRandom(starSeed);
        const baseSizeVariation = sizeRng.gauss(0.7, 0.3);
        const isGiant = sizeRng.random() < 0.02;
        const isDwarf = sizeRng.random() < 0.6;

        let finalSize = Math.max(0.3, baseSizeVariation);
        if (isGiant) finalSize *= 2.5 + sizeRng.uniform(0, 1);
        if (isDwarf) finalSize *= 0.5 + sizeRng.uniform(0, 0.3);

        sizes.push(Math.min(finalSize * 1.6, 8));
      }
    } else if (kind === "singularity void") {
      numPoints = 10000;

      for (let i = 0; i < numPoints; i++) {
        const t = i / numPoints;
        const angle = t * 30 * Math.PI;
        const radius = maxRadius * (1 - t * 0.8) + rng.uniform(-10, 10);
        const height = (t - 0.5) * 300 + Math.sin(angle * 0.5) * 20;

        const x = radius * Math.cos(angle) + Math.sin(t * 20) * 10;
        const z = radius * Math.sin(angle) + Math.cos(t * 20) * 10;

        positions.push(x, height, z);

        const hue = (t + Math.sin(angle * 0.1)) % 1;
        const color = new THREE.Color();
        color.setHSL(hue, 1, 0.5 + Math.sin(t * 10) * 0.3);
        colors.push(color.r, color.g, color.b);
        sizes.push(rng.uniform(0.3, 2) * (1 + Math.sin(t * 50) * 0.5));
      }

      const createPsychedelicSphere = (radius: number, opacity: number, speed: number = 1) => {
        const sphereGeometry = new THREE.SphereGeometry(radius, 64, 64);

        const vertexShader = `
          varying vec2 vUv;
          varying vec3 vPosition;
          varying vec3 vNormal;
          void main() {
            vUv = uv;
            vPosition = position;
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `;

        const fragmentShader = `
          varying vec2 vUv;
          varying vec3 vPosition;
          varying vec3 vNormal;
          uniform float time;
          uniform float speed;

          void main() {
            float theta = atan(vPosition.z, vPosition.x);
            float phi = acos(vPosition.y / length(vPosition));
            vec2 p = vec2(theta / 3.14159, phi / 3.14159);

            float a = time * 40.0 * speed;
            float d, e, f, g = 1.0 / 40.0, h, i, r, q;

            e = 400.0 * (p.x * 0.5 + 0.5);
            f = 400.0 * (p.y * 0.5 + 0.5);
            i = 200.0 + sin(e * g + a / 150.0) * 20.0;
            d = 200.0 + cos(f * g / 2.0) * 18.0 + cos(e * g) * 7.0;
            r = sqrt(pow(abs(i - e), 2.0) + pow(abs(d - f), 2.0));
            q = f / r;
            e = (r * cos(q)) - a / 2.0;
            f = (r * sin(q)) - a / 2.0;
            d = sin(e * g) * 176.0 + sin(e * g) * 164.0 + r;
            h = ((f + d) + a / 2.0) * g;
            i = cos(h + r * p.x / 1.3) * (e + e + a) + cos(q * g * 6.0) * (r + h / 3.0);
            h = sin(f * g) * 144.0 - sin(e * g) * 212.0 * p.x;
            h = (h + (f - e) * q + sin(r - (a + h) / 7.0) * 10.0 + i / 4.0) * g;
            i += cos(h * 2.3 * sin(a / 350.0 - q)) * 184.0 * sin(q - (r * 4.3 + a / 12.0) * g) + tan(r * g + h) * 184.0 * cos(r * g + h);
            i = mod(i / 5.6, 256.0) / 64.0;
            if (i < 0.0) i += 4.0;
            if (i >= 2.0) i = 4.0 - i;
            d = r / 350.0;
            d += sin(d * d * 8.0) * 0.52;
            f = (sin(a * g) + 1.0) / 2.0;

            vec3 color = vec3(f * i / 1.6, i / 2.0 + d / 13.0, i) * d * p.x +
                         vec3(i / 1.3 + d / 8.0, i / 2.0 + d / 18.0, i) * d * (1.0 - p.x);

            float depth = dot(vNormal, vec3(0.0, 0.0, 1.0));
            color *= 0.7 + depth * 0.3;

            color = mix(color, vec3(0.5, 0.0, 1.0), 0.3);

            float edgeFactor = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.0);
            color += vec3(0.5, 0.0, 1.0) * edgeFactor * 0.5;

            gl_FragColor = vec4(color, ${opacity});
          }
        `;

        const shaderMaterial = new THREE.ShaderMaterial({
          uniforms: {
            time: { value: 0 },
            speed: { value: speed },
          },
          vertexShader: vertexShader,
          fragmentShader: fragmentShader,
          transparent: true,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          depthWrite: false,
        });

        const sphere = new THREE.Mesh(sphereGeometry, shaderMaterial);
        (sphere as any).isSingularityShader = true;
        (sphere as any).shaderSpeed = speed;
        return sphere;
      };

      const outerSphere = createPsychedelicSphere(250, 0.3, 1);
      galaxyGroup.add(outerSphere);

      const middleSphere = createPsychedelicSphere(180, 0.4, -0.7);
      galaxyGroup.add(middleSphere);

      const innerSphere = createPsychedelicSphere(120, 0.5, 1.5);
      galaxyGroup.add(innerSphere);

      const invertedSphere = createPsychedelicSphere(300, 0.2, 0.5);
      invertedSphere.scale.set(-1, 1, 1);
      galaxyGroup.add(invertedSphere);

      const lensGeometry = new THREE.SphereGeometry(350, 32, 32);
      const lensMaterial = new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0 },
        },
        vertexShader: `
          varying vec3 vPosition;
          varying vec3 vNormal;
          uniform float time;
          void main() {
            vPosition = position;
            vNormal = normalize(normalMatrix * normal);


            vec3 distortedPosition = position;
            float distortion = sin(time * 0.5 + length(position) * 0.01) * 5.0;
            distortedPosition += normal * distortion;

            gl_Position = projectionMatrix * modelViewMatrix * vec4(distortedPosition, 1.0);
          }
        `,
        fragmentShader: `
          varying vec3 vPosition;
          varying vec3 vNormal;
          uniform float time;

          void main() {

            float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 3.0);
            float wave = sin(time * 2.0 + length(vPosition) * 0.05) * 0.5 + 0.5;

            vec3 color = vec3(0.1, 0.0, 0.3) * fresnel * wave;
            float alpha = fresnel * 0.1 * wave;

            gl_FragColor = vec4(color, alpha);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        depthWrite: false,
      });

      const lensSphere = new THREE.Mesh(lensGeometry, lensMaterial);
      (lensSphere as any).isSingularityShader = true;
      (lensSphere as any).shaderSpeed = 0.3;
      galaxyGroup.add(lensSphere);

      const glitchGeometry = new THREE.BufferGeometry();
      const glitchPositions: number[] = [];
      const glitchColors: number[] = [];

      for (let i = 0; i < 1000; i++) {
        const x = rng.uniform(-maxRadius, maxRadius);
        const y = rng.uniform(-maxRadius / 2, maxRadius / 2);
        const z = rng.uniform(-maxRadius, maxRadius);

        const offsetX = rng.uniform(-50, 50);
        const offsetY = rng.uniform(-30, 30);
        const offsetZ = rng.uniform(-50, 50);

        glitchPositions.push(x, y, z);
        glitchPositions.push(x + offsetX, y + offsetY, z + offsetZ);

        const hue = rng.random();
        const color = new THREE.Color();
        color.setHSL(hue, 1, 0.6);
        glitchColors.push(color.r, color.g, color.b);
        glitchColors.push(color.r * 0.5, color.g * 0.5, color.b * 0.5);
      }

      glitchGeometry.setAttribute("position", new THREE.Float32BufferAttribute(glitchPositions, 3));
      glitchGeometry.setAttribute("color", new THREE.Float32BufferAttribute(glitchColors, 3));

      const glitchMaterial = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
      });

      const glitchLines = new THREE.LineSegments(glitchGeometry, glitchMaterial);
      (glitchLines as any).isGlitchLines = true;
      galaxyGroup.add(glitchLines);

      const blackHoleGroup = new THREE.Group();

      const eventHorizonGeometry = new THREE.SphereGeometry(20, 32, 32);
      const eventHorizonMaterial = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.95,
      });
      const eventHorizon = new THREE.Mesh(eventHorizonGeometry, eventHorizonMaterial);
      blackHoleGroup.add(eventHorizon);

      const diskGeometry = new THREE.RingGeometry(25, 80, 64);
      const diskMaterial = new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0 },
          innerRadius: { value: 25 },
          outerRadius: { value: 80 },
        },
        vertexShader: `
          varying vec2 vUv;
          varying float vRadius;
          void main() {
            vUv = uv;
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vRadius = length(worldPosition.xy);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float time;
          uniform float innerRadius;
          uniform float outerRadius;
          varying vec2 vUv;
          varying float vRadius;

          void main() {
            float normalizedRadius = (vRadius - innerRadius) / (outerRadius - innerRadius);
            float angle = atan(vUv.y - 0.5, vUv.x - 0.5);


            float swirl = sin(angle * 5.0 - time * 2.0 + normalizedRadius * 10.0) * 0.5 + 0.5;
            float intensity = 1.0 - normalizedRadius;


            vec3 hotColor = vec3(1.0, 0.5, 0.0);
            vec3 coldColor = vec3(0.0, 0.3, 1.0);
            vec3 color = mix(coldColor, hotColor, intensity);


            color *= (0.7 + swirl * 0.3);


            float alpha = intensity * 0.8;

            gl_FragColor = vec4(color, alpha);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });

      const accretionDisk = new THREE.Mesh(diskGeometry, diskMaterial);
      accretionDisk.rotation.x = Math.PI / 2;
      (accretionDisk as any).isAccretionDisk = true;
      blackHoleGroup.add(accretionDisk);

      for (let i = 0; i < 8; i++) {
        const ringRadius = 30 + i * 20;
        const ringGeometry = new THREE.TorusGeometry(ringRadius, 1 + i * 0.5, 8, 64);
        const ringMaterial = new THREE.MeshBasicMaterial({
          color: new THREE.Color().setHSL((0.7 + i * 0.05) % 1, 1, 0.5),
          transparent: true,
          opacity: 0.3 - i * 0.03,
          wireframe: true,
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = rng.uniform(0, Math.PI);
        ring.rotation.y = rng.uniform(0, Math.PI);
        (ring as any).isDistortionRing = true;
        (ring as any).rotationSpeed = rng.uniform(0.001, 0.005) * (i % 2 === 0 ? 1 : -1);
        blackHoleGroup.add(ring);
      }

      galaxyGroup.add(blackHoleGroup);

      const jetGeometry = new THREE.ConeGeometry(5, 100, 8);
      const jetMaterial = new THREE.MeshStandardMaterial({
        color: 0xff00ff,
        transparent: true,
        opacity: 0.6,
        emissive: 0xff00ff,
        emissiveIntensity: 1,
        blending: THREE.AdditiveBlending,
      });

      const jet1 = new THREE.Mesh(jetGeometry, jetMaterial);
      jet1.position.y = 50;
      galaxyGroup.add(jet1);

      const jet2 = new THREE.Mesh(jetGeometry, jetMaterial);
      jet2.position.y = -50;
      jet2.rotation.z = Math.PI;
      galaxyGroup.add(jet2);
    }

    const blackHolePositions: Array<{ x: number; y: number; z: number; sizeMultiplier: number }> = [];
    const bhRng = new SeededRandom(seed + 999);
    for (let i = 0; i < blackHoles; i++) {
      const x = bhRng.uniform(-50, 50);
      const y = bhRng.uniform(-20, 20);
      const z = bhRng.uniform(-50, 50);
      const sizeMultiplier = bhRng.uniform(0.5, 1.0);
      blackHolePositions.push({ x, y, z, sizeMultiplier });
    }

    if (galaxyType !== "Singularity Void") {
      const processedPositions: number[] = [];
      const processedColors: number[] = [];
      const processedSizes: number[] = [];
      const stretchedLinePositions: number[] = [];
      const stretchedLineColors: number[] = [];
      const eventHorizonRadius = 0.4;
      const tidalRadius = eventHorizonRadius * 25;

      for (let i = 0; i < positions.length; i += 3) {
        const starX = positions[i];
        const starY = positions[i + 1];
        const starZ = positions[i + 2];

        let closestDistance = Infinity;
        let closestBlackHole = null;

        for (const bh of blackHolePositions) {
          const distance = Math.sqrt(Math.pow(starX - bh.x, 2) + Math.pow(starY - bh.y, 2) + Math.pow(starZ - bh.z, 2));

          if (distance < closestDistance) {
            closestDistance = distance;
            closestBlackHole = bh;
          }
        }

        if (closestDistance < eventHorizonRadius) {
          continue;
        } else if (closestDistance < tidalRadius && closestBlackHole) {
          const tidalStrength = 1 - (closestDistance - eventHorizonRadius) / (tidalRadius - eventHorizonRadius);

          const dirX = closestBlackHole.x - starX;
          const dirY = closestBlackHole.y - starY;
          const dirZ = closestBlackHole.z - starZ;
          const dirLength = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);

          const normalizedDirX = dirX / dirLength;
          const normalizedDirY = dirY / dirLength;
          const normalizedDirZ = dirZ / dirLength;

          const stretchLength = tidalStrength * 8;

          const orbitalAngle = Math.atan2(starZ - closestBlackHole.z, starX - closestBlackHole.x);
          const curvature = tidalStrength * 0.8;

          const numCurvePoints = 8;
          for (let j = 0; j < numCurvePoints - 1; j++) {
            const t = j / (numCurvePoints - 1);
            const nextT = (j + 1) / (numCurvePoints - 1);

            const currentRadius = closestDistance * (1 - t * curvature * 0.7);
            const currentAngle = orbitalAngle + t * curvature * 1.5;
            const currentX = closestBlackHole.x + currentRadius * Math.cos(currentAngle);
            const currentY = starY + (closestBlackHole.y - starY) * t * 0.3;
            const currentZ = closestBlackHole.z + currentRadius * Math.sin(currentAngle);

            const nextRadius = closestDistance * (1 - nextT * curvature * 0.7);
            const nextAngle = orbitalAngle + nextT * curvature * 1.5;
            const nextX = closestBlackHole.x + nextRadius * Math.cos(nextAngle);
            const nextY = starY + (closestBlackHole.y - starY) * nextT * 0.3;
            const nextZ = closestBlackHole.z + nextRadius * Math.sin(nextAngle);

            stretchedLinePositions.push(currentX, currentY, currentZ);
            stretchedLinePositions.push(nextX, nextY, nextZ);
          }

          const redshift = tidalStrength * 1.5;
          const originalR = colors[i];
          const originalG = colors[i + 1];
          const originalB = colors[i + 2];

          const stretchedR = Math.min(originalR + redshift, 2.0);
          const stretchedG = Math.max(originalG * (1 - redshift * 0.6), 0.1);
          const stretchedB = Math.max(originalB * (1 - redshift * 0.8), 0.1);

          for (let j = 0; j < numCurvePoints - 1; j++) {
            const t = j / (numCurvePoints - 1);
            const nextT = (j + 1) / (numCurvePoints - 1);

            const currentOpacity = Math.pow(t, 0.5) * (1 - t * tidalStrength * 0.3);
            const nextOpacity = Math.pow(nextT, 0.5) * (1 - nextT * tidalStrength * 0.3);

            const currentRedshift = redshift * (0.5 + t * 0.5);
            const nextRedshift = redshift * (0.5 + nextT * 0.5);

            stretchedLineColors.push(Math.min(stretchedR + currentRedshift * 0.3, 2.0) * currentOpacity, Math.max(stretchedG * (1 - currentRedshift * 0.2), 0.1) * currentOpacity, Math.max(stretchedB * (1 - currentRedshift * 0.4), 0.1) * currentOpacity);

            stretchedLineColors.push(Math.min(stretchedR + nextRedshift * 0.3, 2.0) * nextOpacity, Math.max(stretchedG * (1 - nextRedshift * 0.2), 0.1) * nextOpacity, Math.max(stretchedB * (1 - nextRedshift * 0.4), 0.1) * nextOpacity);
          }

          processedPositions.push(starX, starY, starZ);
          processedColors.push(stretchedR, stretchedG, stretchedB);
          processedSizes.push(Math.max(sizes[i / 3] * (1 - tidalStrength * 0.5), 0.3));
        } else {
          processedPositions.push(starX, starY, starZ);
          processedColors.push(colors[i], colors[i + 1], colors[i + 2]);
          processedSizes.push(sizes[i / 3]);
        }
      }

      starsGeometry.setAttribute("position", new THREE.Float32BufferAttribute(processedPositions, 3));
      starsGeometry.setAttribute("color", new THREE.Float32BufferAttribute(processedColors, 3));
      starsGeometry.setAttribute("size", new THREE.Float32BufferAttribute(processedSizes, 1));

      const bhPosVectors: THREE.Vector3[] = [];
      for (let bi = 0; bi < Math.min(blackHolePositions.length, 20); bi++) {
        const bh = blackHolePositions[bi];
        bhPosVectors.push(new THREE.Vector3(bh.x, bh.y, bh.z));
      }
      while (bhPosVectors.length < 20) {
        bhPosVectors.push(new THREE.Vector3(99999, 99999, 99999));
      }

      const starMaterial = new THREE.ShaderMaterial({
        uniforms: {
          viewportHeight: { value: containerHeight },
          bhPositions: { value: bhPosVectors },
          bhCount: { value: Math.min(blackHolePositions.length, 20) },
          cameraPos: { value: camera.position.clone() },
        },
        vertexShader: `
          attribute float size;
          varying vec3 vColor;
          uniform float viewportHeight;
          uniform vec3 bhPositions[20];
          uniform int bhCount;
          uniform vec3 cameraPos;
          void main() {
            vColor = color;
            vec3 pos = position;
            for (int i = 0; i < 20; i++) {
              if (i >= bhCount) break;
              vec3 diff = pos - bhPositions[i];
              float dist = length(diff);
              float lensRadius = 10.0;
              if (dist < lensRadius && dist > 0.5) {
                float strength = pow(1.0 - dist / lensRadius, 2.0);
                pos += normalize(diff) * strength * 5.0;
              }
            }
            for (int i = 0; i < 20; i++) {
              if (i >= bhCount) break;
              vec3 toBH = bhPositions[i] - pos;
              float distToBH = length(toBH);
              float redshiftRadius = 15.0;
              if (distToBH < redshiftRadius && distToBH > 0.5) {
                vec3 toCamera = normalize(cameraPos - pos);
                vec3 toBHDir = normalize(toBH);
                float behindFactor = dot(toCamera, toBHDir);
                float proximity = 1.0 - distToBH / redshiftRadius;
                float shift = behindFactor * proximity;
                if (shift > 0.0) {
                  vColor.r += shift * 0.6;
                  vColor.g *= 1.0 - shift * 0.3;
                  vColor.b *= 1.0 - shift * 0.5;
                } else {
                  vColor.b += abs(shift) * 0.4;
                  vColor.g += abs(shift) * 0.1;
                  vColor.r *= 1.0 - abs(shift) * 0.3;
                }
              }
            }
            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
            gl_PointSize = size * (viewportHeight / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        fragmentShader: `
          varying vec3 vColor;
          void main() {

            vec2 center = gl_PointCoord - vec2(0.5);
            float distanceFromCenter = length(center);

            if (distanceFromCenter > 0.5) {
              discard;
            }


            float alpha = 1.0 - (distanceFromCenter / 0.5);
            alpha = pow(alpha, 2.0);

            gl_FragColor = vec4(vColor, alpha * 0.8);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        vertexColors: true,
        depthWrite: false,
      });

      const stars = new THREE.Points(starsGeometry, starMaterial);
      galaxyGroup.add(stars);

      if (stretchedLinePositions.length > 0) {
        const stretchedGeometry = new THREE.BufferGeometry();
        stretchedGeometry.setAttribute("position", new THREE.Float32BufferAttribute(stretchedLinePositions, 3));
        stretchedGeometry.setAttribute("color", new THREE.Float32BufferAttribute(stretchedLineColors, 3));

        const stretchedMaterial = new THREE.LineBasicMaterial({
          vertexColors: true,
          transparent: true,
          opacity: 0.8,
          linewidth: 2,
          blending: THREE.AdditiveBlending,
        });

        const stretchedLines = new THREE.LineSegments(stretchedGeometry, stretchedMaterial);
        galaxyGroup.add(stretchedLines);
      }
    } else {
      starsGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      starsGeometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      starsGeometry.setAttribute("size", new THREE.Float32BufferAttribute(sizes, 1));

      const starMaterial = new THREE.PointsMaterial({
        // 2 → 3.4: at the old square-canvas camera distance a 2px attenuated point
        // was a single lit pixel, so a 1,000-system galaxy read as a dozen dots.
        size: 3.4,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      });

      const stars = new THREE.Points(starsGeometry, starMaterial);
      galaxyGroup.add(stars);
    }

    const accDiskVertexShader = `
      varying vec2 vLocalPos;
      void main() {
        vLocalPos = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;
    const makeAccDiskFragShader = (alphaBase: string, swirlPhase: string = "0.0") => `
      uniform float time;
      uniform float innerRadius;
      uniform float outerRadius;
      uniform float flareIntensity;
      varying vec2 vLocalPos;
      void main() {
        float radius = length(vLocalPos);
        float t = clamp((radius - innerRadius) / (outerRadius - innerRadius), 0.0, 1.0);
        float angle = atan(vLocalPos.y, vLocalPos.x);
        float intensity = pow(1.0 - t, 1.5);
        float doppler = 1.0 + sin(angle) * 0.4;
        float swirl = 1.0 + sin(angle * 3.0 - time * 2.0 + ${swirlPhase}) * 0.1;
        vec3 hotColor = vec3(1.0, 0.9, 0.7);
        vec3 warmColor = vec3(1.0, 0.4, 0.0);
        vec3 coldColor = vec3(0.3, 0.0, 0.0);
        vec3 color = t < 0.5
          ? mix(hotColor, warmColor, t * 2.0)
          : mix(warmColor, coldColor, (t - 0.5) * 2.0);
        float flare = 1.0 + flareIntensity * pow(1.0 - t, 3.0);
        color *= intensity * doppler * swirl * flare;
        float alpha = intensity * ${alphaBase} * min(flare, 1.5);
        gl_FragColor = vec4(color, alpha);
      }
    `;

    for (let i = 0; i < blackHoles; i++) {
      const blackHoleGroup = new THREE.Group();

      const bhData =
        galaxyType !== "Singularity Void" && i < blackHolePositions.length
          ? blackHolePositions[i]
          : {
              x: rng.uniform(-50, 50),
              y: rng.uniform(-20, 20),
              z: rng.uniform(-50, 50),
              sizeMultiplier: rng.uniform(0.5, 1.0),
            };

      const { x, y, z, sizeMultiplier } = bhData;

      const bhGeometry = new THREE.SphereGeometry(0.8 * sizeMultiplier, 16, 16);
      const bhMaterial = new THREE.MeshBasicMaterial({
        color: 0x000000,
      });
      const bhMesh = new THREE.Mesh(bhGeometry, bhMaterial);
      blackHoleGroup.add(bhMesh);

      const photonRingGeometry = new THREE.TorusGeometry(1.0 * sizeMultiplier, 0.06 * sizeMultiplier, 16, 64);
      const photonRingMaterial = new THREE.MeshBasicMaterial({
        color: 0xffcc66,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const photonRing = new THREE.Mesh(photonRingGeometry, photonRingMaterial);
      photonRing.rotation.x = Math.PI / 2;
      (photonRing as any).isAccretionRing = true;
      (photonRing as any).rotationSpeed = 0.003;
      blackHoleGroup.add(photonRing);

      const glowCanvas = document.createElement("canvas");
      glowCanvas.width = 64;
      glowCanvas.height = 64;
      const glowCtx = glowCanvas.getContext("2d")!;
      const glowGradient = glowCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
      glowGradient.addColorStop(0, "rgba(255, 200, 120, 0.5)");
      glowGradient.addColorStop(0.2, "rgba(255, 150, 50, 0.3)");
      glowGradient.addColorStop(0.5, "rgba(255, 80, 0, 0.1)");
      glowGradient.addColorStop(1, "rgba(0, 0, 0, 0)");
      glowCtx.fillStyle = glowGradient;
      glowCtx.fillRect(0, 0, 64, 64);
      const glowTexture = new THREE.CanvasTexture(glowCanvas);
      const glowMaterial = new THREE.SpriteMaterial({
        map: glowTexture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const glowSprite = new THREE.Sprite(glowMaterial);
      glowSprite.scale.set(8 * sizeMultiplier, 8 * sizeMultiplier, 1);
      blackHoleGroup.add(glowSprite);

      const accDiskGeometry = new THREE.RingGeometry(1.2 * sizeMultiplier, 3.5 * sizeMultiplier, 64);
      const accDiskMaterial = new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0 },
          innerRadius: { value: 1.2 * sizeMultiplier },
          outerRadius: { value: 3.5 * sizeMultiplier },
          flareIntensity: { value: 0 },
        },
        vertexShader: accDiskVertexShader,
        fragmentShader: makeAccDiskFragShader("0.7"),
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const accDisk = new THREE.Mesh(accDiskGeometry, accDiskMaterial);
      accDisk.rotation.x = Math.PI / 2;
      (accDisk as any).isAccretionDisk = true;
      blackHoleGroup.add(accDisk);

      const accDisk2 = new THREE.Mesh(
        new THREE.RingGeometry(1.3 * sizeMultiplier, 3.2 * sizeMultiplier, 64),
        new THREE.ShaderMaterial({
          uniforms: {
            time: { value: 0 },
            innerRadius: { value: 1.3 * sizeMultiplier },
            outerRadius: { value: 3.2 * sizeMultiplier },
            flareIntensity: { value: 0 },
          },
          vertexShader: accDiskVertexShader,
          fragmentShader: makeAccDiskFragShader("0.4", "1.0"),
          transparent: true,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      accDisk2.rotation.x = Math.PI / 2 + 0.15;
      accDisk2.rotation.z = 0.3;
      (accDisk2 as any).isAccretionDisk = true;
      blackHoleGroup.add(accDisk2);

      const accDisk3 = new THREE.Mesh(
        new THREE.RingGeometry(1.4 * sizeMultiplier, 3.0 * sizeMultiplier, 64),
        new THREE.ShaderMaterial({
          uniforms: {
            time: { value: 0 },
            innerRadius: { value: 1.4 * sizeMultiplier },
            outerRadius: { value: 3.0 * sizeMultiplier },
            flareIntensity: { value: 0 },
          },
          vertexShader: accDiskVertexShader,
          fragmentShader: makeAccDiskFragShader("0.3", "2.0"),
          transparent: true,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      accDisk3.rotation.x = Math.PI / 2 - 0.12;
      accDisk3.rotation.z = -0.2;
      (accDisk3 as any).isAccretionDisk = true;
      blackHoleGroup.add(accDisk3);

      blackHoleGroup.position.set(x, y, z);
      galaxyGroup.add(blackHoleGroup);
    }

    for (let i = 0; i < pulsars; i++) {
      const pulsarSize = rng.uniform(0.6, 1.0);
      const pulsarGeometry = new THREE.SphereGeometry(pulsarSize, 8, 8);
      const pulsarMaterial = new THREE.MeshStandardMaterial({
        color: 0xffff00,
        emissive: 0xffff00,
        emissiveIntensity: 1,
      });
      const pulsar = new THREE.Mesh(pulsarGeometry, pulsarMaterial);

      pulsar.position.set(rng.uniform(-maxRadius, maxRadius), rng.uniform(-maxRadius / 4, maxRadius / 4), rng.uniform(-maxRadius, maxRadius));

      (pulsar as any).isPulsar = true;
      (pulsar as any).pulseSpeed = rng.uniform(1, 3);

      galaxyGroup.add(pulsar);
    }

    for (let i = 0; i < quasars; i++) {
      const quasarGroup = new THREE.Group();

      const quasarSize = rng.uniform(0.8, 1.3);
      const coreGeometry = new THREE.SphereGeometry(quasarSize, 16, 16);
      const coreMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 2,
      });
      const core = new THREE.Mesh(coreGeometry, coreMaterial);
      quasarGroup.add(core);

      const jetGeometry = new THREE.ConeGeometry(0.5 * quasarSize, 12 * quasarSize, 8);
      const jetMaterial = new THREE.MeshStandardMaterial({
        color: 0xff0000,
        transparent: true,
        opacity: 0.6,
        emissive: 0xff0000,
        emissiveIntensity: 0.5,
      });

      const jet1 = new THREE.Mesh(jetGeometry, jetMaterial);
      jet1.position.y = 6 * quasarSize;
      quasarGroup.add(jet1);

      const jet2 = new THREE.Mesh(jetGeometry, jetMaterial);
      jet2.position.y = -6 * quasarSize;
      jet2.rotation.z = Math.PI;
      quasarGroup.add(jet2);

      quasarGroup.position.set(rng.uniform(-maxRadius, maxRadius), rng.uniform(-maxRadius / 4, maxRadius / 4), rng.uniform(-maxRadius, maxRadius));

      galaxyGroup.add(quasarGroup);
    }

    const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0xffffff, 0.5, 1000);
    pointLight.position.set(0, 100, 0);
    scene.add(pointLight);

    // LOD management
    const lodLevels = [
      { distance: 100, quality: 1.0 },    // Close - full quality
      { distance: 300, quality: 0.6 },     // Medium - 60% quality
      { distance: 600, quality: 0.3 },     // Far - 30% quality
      { distance: 1000, quality: 0.1 }     // Very far - 10% quality
    ];

    let currentLODQuality = 1.0;
    let starsMesh: THREE.Points | null = null;

    // Store the full geometry for LOD
    let fullStarsGeometry: THREE.BufferGeometry | null = null;
    let fullPositions: Float32Array | null = null;
    let fullColors: Float32Array | null = null;
    let fullSizes: Float32Array | null = null;

    // Find the stars mesh after creation
    galaxyGroup.children.forEach((child) => {
      if (child instanceof THREE.Points) {
        starsMesh = child;
        fullStarsGeometry = child.geometry.clone();
        const positionAttribute = child.geometry.attributes.position;
        const colorAttribute = child.geometry.attributes.color;
        const sizeAttribute = child.geometry.attributes.size;
        if (positionAttribute && colorAttribute && sizeAttribute) {
          fullPositions = new Float32Array(positionAttribute.array);
          fullColors = new Float32Array(colorAttribute.array);
          fullSizes = new Float32Array(sizeAttribute.array);
        }
      }
    });

    const updateLOD = () => {
      if (!starsMesh || !fullStarsGeometry || !fullPositions || !fullColors || !fullSizes) return;

      const distance = camera.position.length();
      let targetQuality = 1.0;

      for (const level of lodLevels) {
        if (distance > level.distance) {
          targetQuality = level.quality;
        } else {
          break;
        }
      }

      if (Math.abs(targetQuality - currentLODQuality) < 0.05) return;

      currentLODQuality = targetQuality;
      const numPoints = Math.floor(fullPositions.length / 3 * targetQuality);
      
      if (numPoints < 100) return;

      const newPositions = new Float32Array(numPoints * 3);
      const newColors = new Float32Array(numPoints * 3);
      const newSizes = new Float32Array(numPoints);

      const step = Math.floor(fullPositions.length / 3 / numPoints);
      for (let i = 0; i < numPoints; i++) {
        const index = i * step * 3;
        newPositions[i * 3] = fullPositions[index];
        newPositions[i * 3 + 1] = fullPositions[index + 1];
        newPositions[i * 3 + 2] = fullPositions[index + 2];
        
        newColors[i * 3] = fullColors[index];
        newColors[i * 3 + 1] = fullColors[index + 1];
        newColors[i * 3 + 2] = fullColors[index + 2];
        
        newSizes[i] = fullSizes[i * step];
      }

      const newGeometry = new THREE.BufferGeometry();
      newGeometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
      newGeometry.setAttribute('color', new THREE.Float32BufferAttribute(newColors, 3));
      newGeometry.setAttribute('size', new THREE.Float32BufferAttribute(newSizes, 1));

      starsMesh.geometry.dispose();
      starsMesh.geometry = newGeometry;
    };

    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      const time = performance.now() / 1000;

      if (galaxyGroupRef.current && !isUserInteracting.current) {
        if (isTransitioning.current) {
          const currentTime = performance.now();
          const elapsed = currentTime - transitionStartTime.current;
          const duration = 3000;

          if (elapsed < duration) {
            const t = elapsed / duration;
            const easedT = t * t * t;
            manualRotationSpeed.current = targetRotationSpeed.current * easedT;
          } else {
            manualRotationSpeed.current = targetRotationSpeed.current;
            isTransitioning.current = false;
          }
        }

        galaxyGroupRef.current.rotation.y += manualRotationSpeed.current;
      }

      galaxyGroup.children.forEach((child) => {
        if ((child as any).isPulsar) {
          const pulseSpeed = (child as any).pulseSpeed || 1;
          child.scale.setScalar(1 + Math.sin(Date.now() * 0.001 * pulseSpeed) * 0.3);
        }

        if ((child as any).isSingularityShader && child instanceof THREE.Mesh) {
          const material = child.material as THREE.ShaderMaterial;
          if (material.uniforms && material.uniforms.time) {
            material.uniforms.time.value = time;
          }

          const shaderSpeed = (child as any).shaderSpeed || 1;
          child.rotation.y += 0.001 * shaderSpeed;
          child.rotation.x += 0.0005 * shaderSpeed;
        }

        if ((child as any).isAccretionDisk && child instanceof THREE.Mesh) {
          const material = child.material as THREE.ShaderMaterial;
          if (material.uniforms && material.uniforms.time) {
            material.uniforms.time.value = time;
          }
          if (material.uniforms?.flareIntensity) {
            const flareWave = Math.sin(time * 7.3 + child.id) * Math.sin(time * 13.1 + child.id * 0.7);
            material.uniforms.flareIntensity.value = Math.max(0, flareWave) * 2.0;
          }
          child.rotation.z += 0.002;
        }

        if ((child as any).isDistortionRing) {
          const rotSpeed = (child as any).rotationSpeed || 0.001;
          child.rotation.x += rotSpeed;
          child.rotation.y += rotSpeed * 0.7;
          child.scale.setScalar(1 + Math.sin(time * 2) * 0.1);
        }

        if ((child as any).isGlitchLines && child instanceof THREE.LineSegments) {
          const material = child.material as THREE.LineBasicMaterial;
          material.opacity = 0.2 + Math.sin(time * 3) * 0.2;
          child.rotation.z += 0.0005;
        }

        if (child instanceof THREE.Group) {
          child.children.forEach((subchild) => {
            if ((subchild as any).isAccretionDisk && subchild instanceof THREE.Mesh) {
              const material = subchild.material as THREE.ShaderMaterial;
              if (material.uniforms && material.uniforms.time) {
                material.uniforms.time.value = time;
              }
              if (material.uniforms?.flareIntensity) {
                const flareWave = Math.sin(time * 7.3 + subchild.id) * Math.sin(time * 13.1 + subchild.id * 0.7);
                material.uniforms.flareIntensity.value = Math.max(0, flareWave) * 2.0;
              }
              subchild.rotation.z += 0.002;
            }

            if ((subchild as any).isAccretionRing && subchild instanceof THREE.Mesh) {
              const rotSpeed = (subchild as any).rotationSpeed || 0.002;
              subchild.rotation.z += rotSpeed;
            }

            if ((subchild as any).isDistortionRing) {
              const rotSpeed = (subchild as any).rotationSpeed || 0.001;
              subchild.rotation.x += rotSpeed;
              subchild.rotation.y += rotSpeed * 0.7;
              subchild.scale.setScalar(1 + Math.sin(time * 2) * 0.1);
            }
          });
        }
      });

      galaxyGroup.traverse((obj: any) => {
        if (obj.isPoints && obj.material?.uniforms?.cameraPos) {
          obj.material.uniforms.cameraPos.value.copy(camera.position);
        }
      });

      // Update LOD based on camera distance
      updateLOD();

      if (controlsRef.current) {
        controlsRef.current.update();
      }

      renderer.render(scene, camera);
    };

    animate();

    setTimeout(() => {
      setSceneLoaded(true);
      setCanvasHidden(true);
      decelerateRef.current = true;
    }, 800);

    const handleResize = () => {
      if (!mountRef.current || !renderer) return;
      const container = mountRef.current;
      const width = container.clientWidth;
      const height = container.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      galaxyGroup.traverse((obj: any) => {
        if (obj.isPoints && obj.material?.uniforms?.viewportHeight) {
          obj.material.uniforms.viewportHeight.value = height;
        }
      });
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);

      if (autorotateTimeoutRef.current) {
        clearTimeout(autorotateTimeoutRef.current);
      }

      if (controlsRef.current) {
        controlsRef.current.dispose();
      }

      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }

      if (container && renderer.domElement) {
        container.removeChild(renderer.domElement);
      }

      renderer.dispose();
    };
  }, [galaxyType, numSystems, blackHoles, pulsars, quasars, seed]);

  const handleDownloadScreenshot = () => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current || isGeneratingImage) return;

    setIsGeneratingImage(true);

    if (controlsRef.current) {
      controlsRef.current.enabled = false;
    }

    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;

    const originalWidth = renderer.domElement.width;
    const originalHeight = renderer.domElement.height;

    const scaleFactor = 3840 / originalWidth;

    const pointMaterials: any[] = [];
    scene.traverse((object: any) => {
      if (object.isPoints && object.material) {
        const mat = object.material;
        if (mat.size !== undefined) {
          pointMaterials.push({ material: mat, originalSize: mat.size });
          mat.size = mat.size * scaleFactor * 1;
        }
        if (mat.uniforms && mat.uniforms.scale) {
          pointMaterials.push({ material: mat, originalScale: mat.uniforms.scale.value });
          mat.uniforms.scale.value = mat.uniforms.scale.value * scaleFactor * 1;
        }
        if (object.geometry && object.geometry.attributes.size) {
          const sizeAttribute = object.geometry.attributes.size;
          const originalSizes = sizeAttribute.array.slice();
          pointMaterials.push({
            geometry: object.geometry,
            originalSizeArray: originalSizes,
          });

          for (let i = 0; i < sizeAttribute.array.length; i++) {
            sizeAttribute.array[i] *= scaleFactor * 1;
          }
          sizeAttribute.needsUpdate = true;
        }
      }
    });

    const width = 3840;
    const height = 3840;
    renderer.setSize(width, height);
    camera.aspect = 1;
    camera.updateProjectionMatrix();

    renderer.render(scene, camera);

    renderer.domElement.toBlob(
      (blob) => {
        if (blob) {
          const tempCanvas = document.createElement("canvas");
          const ctx = tempCanvas.getContext("2d");
          tempCanvas.width = width;
          tempCanvas.height = height;

          if (ctx) {
            const img = new Image();
            img.onload = async () => {
              ctx.drawImage(img, 0, 0);

              addCopyrightWatermark(ctx, { imageWidth: width, imageHeight: height });

              if (galaxyUrl) {
                await addQRToScreenshot(ctx, width, height, {
                  type: "galaxy",
                  stargateUrl: galaxyUrl,
                });
              }

              tempCanvas.toBlob(
                (watermarkedBlob) => {
                  if (watermarkedBlob) {
                    const url = URL.createObjectURL(watermarkedBlob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = `galaxy_${galaxyName || galaxyType}_${Date.now()}.jpg`;
                    link.click();
                    URL.revokeObjectURL(url);
                  }
                },
                "image/jpeg",
                1.0,
              );
            };

            const url = URL.createObjectURL(blob);
            img.src = url;
          }
        }

        pointMaterials.forEach(({ material, originalSize, originalScale, geometry, originalSizeArray }) => {
          if (originalSize !== undefined) material.size = originalSize;
          if (originalScale !== undefined) material.uniforms.scale.value = originalScale;
          if (geometry && originalSizeArray) {
            const sizeAttribute = geometry.attributes.size;
            for (let i = 0; i < originalSizeArray.length; i++) {
              sizeAttribute.array[i] = originalSizeArray[i];
            }
            sizeAttribute.needsUpdate = true;
          }
        });

        renderer.setSize(originalWidth, originalHeight);
        camera.aspect = 1;
        camera.updateProjectionMatrix();

        if (controlsRef.current) {
          controlsRef.current.enabled = true;
        }
        setIsGeneratingImage(false);
      },
      "image/jpeg",
      1.0,
    );
  };

  return (
    <div className="relative w-full h-full bg-black rounded">
      <AdaptivePreloadCanvas hidden={canvasHidden} decelerateRef={decelerateRef} />

      <div className={`absolute inset-0 w-full h-full transition-all duration-500 ${sceneLoaded ? "opacity-100 blur-0" : "opacity-0 blur-[25px]"}`}>
        <div ref={mountRef} className="w-full h-full border border-white/20 rounded bg-black/20" />

        <ExportingOverlay isVisible={isGeneratingImage} />

        {sceneLoaded && galaxyName && (
          <div className="absolute bottom-0 left-0 p-2 text-white bg-black bg-opacity-50 max-w-xs rounded-tr-lg">
            <h3 className="text-xs font-bold">{galaxyName}</h3>
          </div>
        )}

        {sceneLoaded && (
          <div className="absolute top-2 right-2 flex gap-2 z-10">
            <button onClick={handleDownloadScreenshot} disabled={isGeneratingImage} className={`p-2 border border-white/30 rounded-lg transition-all duration-200  shadow-lg ${isGeneratingImage ? "bg-black/40 cursor-not-allowed opacity-50" : "bg-black/60 hover:bg-black/80"}`} title={isGeneratingImage ? "Generating image..." : "Download 4K screenshot"}>
              {isGeneratingImage ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <DownloadIcon className="w-4 h-4 text-white" />}
            </button>
            {onExpandClick && (
              <button onClick={onExpandClick} disabled={isGeneratingImage} className={`p-2 border border-white/30 rounded-lg transition-all duration-200  shadow-lg ${isGeneratingImage ? "bg-black/40 cursor-not-allowed opacity-50" : "bg-black/60 hover:bg-black/80"}`} title={isGeneratingImage ? "Please wait..." : "Expand to fullscreen"}>
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

Galaxy3DViewer.displayName = "Galaxy3DViewer";

export default Galaxy3DViewer;

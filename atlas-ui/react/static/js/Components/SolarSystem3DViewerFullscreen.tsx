// atlas-ui/react/static/js/Components/SolarSystem3DViewerFullscreen.tsx

import React, { useRef, useEffect } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

interface Planet {
  name: string;
  planet_type: string;
  diameter: number;
  orbital_radius: number;
  orbital_period_seconds: number;
  orbital_speed: number;
  axial_tilt: number;
  rotation_period_seconds: number;
  initial_orbital_angle: number;
  eccentricity_factor: number;
  mass: number;
}

interface Star {
  Type: string;
  Size: string;
  Color: string;
}

interface SolarSystem3DViewerFullscreenProps {
  planets: Planet[];
  stars: Star[];
  systemName: string;
  cosmicOriginTime: number;
  currentTime: number;
  onTimeOffsetChange: (offset: number) => void;
}

const getOrbitalInclination = (planetName: string): number => {
  let hash = 0;
  for (let i = 0; i < planetName.length; i++) {
    hash = (hash << 5) - hash + planetName.charCodeAt(i);
    hash = hash & hash;
  }
  return ((Math.abs(hash) % 10000) / 10000) * 0.15;
};

const getAscendingNode = (planetName: string): number => {
  let hash = 0;
  for (let i = 0; i < planetName.length; i++) {
    hash = (hash << 3) - hash + planetName.charCodeAt(i) * 7;
    hash = hash & hash;
  }
  return ((Math.abs(hash) % 10000) / 10000) * Math.PI * 2;
};

const calculateEllipticalPosition = (angle: number, semiMajorAxis: number, eccentricity: number, inclination: number, ascendingNode: number): THREE.Vector3 => {
  const r = (semiMajorAxis * (1 - eccentricity * eccentricity)) / (1 + eccentricity * Math.cos(angle));
  const xOrbital = r * Math.cos(angle);
  const yOrbital = r * Math.sin(angle);
  const x = xOrbital * Math.cos(ascendingNode) - yOrbital * Math.sin(ascendingNode) * Math.cos(inclination);
  const z = xOrbital * Math.sin(ascendingNode) + yOrbital * Math.cos(ascendingNode) * Math.cos(inclination);
  const y = yOrbital * Math.sin(inclination);
  return new THREE.Vector3(x, y, z);
};

const SolarSystem3DViewerFullscreen: React.FC<SolarSystem3DViewerFullscreenProps> = ({ planets, stars, systemName, cosmicOriginTime, currentTime, onTimeOffsetChange }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const planetsRef = useRef<THREE.Mesh[]>([]);
  const orbitsRef = useRef<THREE.Line[]>([]);
  const planetLabelsRef = useRef<THREE.Sprite[]>([]);
  const currentTimeRef = useRef<number>(0);
  const controlsRef = useRef<OrbitControls | null>(null);

  const createTextSprite = (text: string, color: string = "#ffffff") => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return null;

    canvas.width = 768;
    canvas.height = 192;

    context.fillStyle = "rgba(0, 0, 0, 0.8)";
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.strokeStyle = "#ffffff";
    context.lineWidth = 3;
    context.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);

    context.fillStyle = color;
    context.font = "bold 48px Arial";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, 384, 96);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.1,
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(30, 7.5, 1);

    return sprite;
  };

  currentTimeRef.current = currentTime;

  useEffect(() => {
    if (!mountRef.current) return;

    const container = mountRef.current;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000011);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, containerWidth / containerHeight, 0.1, 10000);
    camera.position.set(0, 120, 180);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(containerWidth, containerHeight);
    renderer.setClearColor(0x000011, 1);
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    const planetColors: { [key: string]: string } = {
      "Gas Giant": "#FFA500",
      Anomaly: "#FFFFFF",
      Rocky: "#808080",
      Icy: "#ADD8E6",
      Oceanic: "#0000FF",
      Desert: "#FFD700",
      Lava: "#FF0000",
      Arid: "#800000",
      Swamp: "#008000",
      Tundra: "#F0F8FF",
      Forest: "#006400",
      Savannah: "#F4A460",
      Cave: "#D1D1D1",
      Crystalline: "#00FFFF",
      Metallic: "#C0C0C0",
      Toxic: "#800080",
      Radioactive: "#00FF00",
      Magma: "#FF4500",
      "Molten Core": "#FF8C00",
      Carbon: "#090909",
      Diamond: "#87CEFA",
      "Super Earth": "#90EE90",
      "Sub Earth": "#006400",
      "Frozen Gas Giant": "#ADD8E6",
      Nebulous: "#FFC0CB",
      Aquifer: "#00FFFF",
      Exotic: "#FF00FF",
      "Super Puff": "#F7C6D9",
      "Super Ringed": "#E3C99A",
      "Mirror": "#D9DEE6",
      "Ruby Cloud": "#9B111E",
    };

    const starColors: { [key: string]: string } = {
      red: "#FF4444",
      orange: "#FF8844",
      yellow: "#FFFF44",
      white: "#FFFFFF",
      blue: "#4488FF",
      purple: "#8844FF",
    };

    const starGroup = new THREE.Group();
    stars.forEach((star, index) => {
      const starRadius = parseFloat(star.Size) * 2.5;
      const starGeometry = new THREE.SphereGeometry(starRadius, 32, 32);
      const starColor = starColors[star.Color] || "#FFFF44";
      const starMaterial = new THREE.MeshBasicMaterial({
        color: starColor,
        transparent: true,
        opacity: 0.9,
      });

      const starMesh = new THREE.Mesh(starGeometry, starMaterial);

      const starRadii = stars.map((s, i) => parseFloat(s.Size) * 2.5);
      const maxStarRadius = Math.max(...starRadii);
      const spacing = maxStarRadius * 3;

      if (stars.length === 1) {
        starMesh.position.set(0, 0, 0);
      } else if (stars.length === 2) {
        starMesh.position.set(index === 0 ? -spacing : spacing, 0, 0);
      } else {
        if (index === 0) starMesh.position.set(-spacing, 0, 0);
        else if (index === 1) starMesh.position.set(spacing, 0, 0);
        else starMesh.position.set(0, spacing, 0);
      }

      const glowGeometry = new THREE.SphereGeometry(starRadius * 1.5, 32, 32);
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: starColor,
        transparent: true,
        opacity: 0.3,
      });
      const glow = new THREE.Mesh(glowGeometry, glowMaterial);
      starMesh.add(glow);

      starGroup.add(starMesh);
    });
    scene.add(starGroup);

    const maxOrbitalRadius = Math.max(...planets.map((p) => p.orbital_radius));
    const scaleFactor = 150;

    const starRadiiForOrbit = stars.map((s) => parseFloat(s.Size) * 2.5);
    const maxStarRadiusWithGlow = Math.max(...starRadiiForOrbit) * 1.5;
    const minOrbitRadius = Math.max(40, maxStarRadiusWithGlow + 15);

    planets.forEach((planet, index) => {
      const relativeOrbitRadius = planet.orbital_radius / maxOrbitalRadius;
      const orbitRadius = minOrbitRadius + relativeOrbitRadius * scaleFactor;

      const eccentricity = planet.eccentricity_factor;
      const semiMajorAxis = orbitRadius;

      const inclination = getOrbitalInclination(planet.name);
      const ascendingNode = getAscendingNode(planet.name);

      const numSegments = 360;
      const dashLength = 2;
      const gapLength = 4;

      for (let k = 0; k < numSegments; k += dashLength + gapLength) {
        const dashPoints = [];
        for (let j = k; j < Math.min(k + dashLength, numSegments - 1); j++) {
          const angle = (j / numSegments) * 2 * Math.PI;

          const pos = calculateEllipticalPosition(angle, semiMajorAxis, eccentricity, inclination, ascendingNode);
          dashPoints.push(pos);
        }

        if (dashPoints.length > 1) {
          const dashGeometry = new THREE.BufferGeometry().setFromPoints(dashPoints);
          const dashMaterial = new THREE.LineBasicMaterial({
            color: 0x708090,
            transparent: true,
            opacity: 0.8,
            linewidth: 2,
          });
          const dashLine = new THREE.Line(dashGeometry, dashMaterial);
          scene.add(dashLine);
          orbitsRef.current.push(dashLine);
        }
      }

      const basePlanetRadius = planet.diameter / 6000;
      const planetRadius = Math.max(Math.min(basePlanetRadius, 10.0), 2.0);
      const planetGeometry = new THREE.SphereGeometry(planetRadius, 32, 32);
      const planetColor = planetColors[planet.planet_type] || "#FFFFFF";
      const planetMaterial = new THREE.MeshBasicMaterial({
        color: planetColor,
        transparent: true,
        opacity: 0.9,
      });

      const planetMesh = new THREE.Mesh(planetGeometry, planetMaterial);

      const planetGlow = new THREE.Mesh(
        new THREE.SphereGeometry(planetRadius * 1.5, 32, 32),
        new THREE.MeshBasicMaterial({
          color: planetColor,
          transparent: true,
          opacity: 0.2,
        })
      );
      planetMesh.add(planetGlow);

      scene.add(planetMesh);
      planetsRef.current.push(planetMesh);

      (planetMesh as any).planetData = planet;
      (planetMesh as any).orbitRadius = orbitRadius;
      (planetMesh as any).semiMajorAxis = semiMajorAxis;
      (planetMesh as any).eccentricity = eccentricity;
      (planetMesh as any).inclination = inclination;
      (planetMesh as any).ascendingNode = ascendingNode;

      const planetName = planet.name.replace(/_/g, " ");
      const nameSprite = createTextSprite(planetName, "#ffffff");
      if (nameSprite) {
        nameSprite.position.copy(planetMesh.position);
        nameSprite.position.y += planetRadius + 10;

        (nameSprite as any).planetData = planet;

        scene.add(nameSprite);
        planetLabelsRef.current.push(nameSprite);
      }
    });

    const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0xffffff, 1, 2000);
    pointLight.position.set(0, 0, 0);
    scene.add(pointLight);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 50;
    controls.maxDistance = 800;
    controls.autoRotate = false;
    controls.autoRotateSpeed = 0.5;
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    const handleKeyWheel = (event: WheelEvent) => {
      if (event.ctrlKey) {
        event.preventDefault();
        if (event.deltaY > 0) {
          onTimeOffsetChange(604800);
        } else {
          onTimeOffsetChange(-604800);
        }
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        document.dispatchEvent(new CustomEvent("solar-system-close-fullscreen"));
      }
    };

    const canvas = renderer.domElement;
    canvas.addEventListener("wheel", handleKeyWheel);
    document.addEventListener("keydown", handleKeyDown);

    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);

      if (controlsRef.current) {
        controlsRef.current.update();
      }

      planetsRef.current.forEach((planetMesh, index) => {
        const planet = (planetMesh as any).planetData;
        const semiMajorAxis = (planetMesh as any).semiMajorAxis;
        const eccentricity = (planetMesh as any).eccentricity;
        const inclination = (planetMesh as any).inclination;
        const ascendingNode = (planetMesh as any).ascendingNode;

        const orbitalPeriod = planet.orbital_period_seconds;
        const angleVelocityOrbit = (2 * Math.PI) / orbitalPeriod;
        const angleOrbit = (planet.initial_orbital_angle + currentTimeRef.current * angleVelocityOrbit) % (2 * Math.PI);

        const position = calculateEllipticalPosition(angleOrbit, semiMajorAxis, eccentricity, inclination, ascendingNode);
        planetMesh.position.copy(position);

        const rotationPeriodSeconds = planet.rotation_period_seconds;
        const angleVelocityRotation = (2 * Math.PI) / rotationPeriodSeconds;
        planetMesh.rotation.y = (currentTimeRef.current * angleVelocityRotation) % (2 * Math.PI);

        if (planetLabelsRef.current[index]) {
          const planetRadius = (planetMesh.geometry as THREE.SphereGeometry).parameters?.radius || 2;
          planetLabelsRef.current[index].position.copy(planetMesh.position);
          planetLabelsRef.current[index].position.y += planetRadius + 10;
        }
      });

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;

      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("keydown", handleKeyDown);
      canvas.removeEventListener("wheel", handleKeyWheel);

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

      planetsRef.current = [];
      orbitsRef.current = [];
      planetLabelsRef.current = [];
    };
  }, [planets, stars, cosmicOriginTime]);

  return <div ref={mountRef} className="w-full h-full" />;
};

export default SolarSystem3DViewerFullscreen;

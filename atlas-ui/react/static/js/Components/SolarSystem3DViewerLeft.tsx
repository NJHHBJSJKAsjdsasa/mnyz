// atlas-ui/react/static/js/Components/SolarSystem3DViewerLeft.tsx

import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import SolarSystem3DViewerFullscreen from "./SolarSystem3DViewerFullscreen.tsx";
import DownloadIcon from "../Icons/DownloadIcon";
import { addQRToScreenshot } from "./QRGenerator";
import { addCopyrightWatermark } from "./CopyrightWatermark";
import ExportingOverlay from "./ExportingOverlay";
import { VerticalTimeSlider, sliderToTimeOffset, timeOffsetToSlider } from "./VerticalTimeSlider";

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

interface SolarSystem3DViewerLeftProps {
  planets: Planet[];
  stars: Star[];
  systemName: string;
  cosmicOriginTime: number;
  systemUrl?: string;
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

const SolarSystem3DViewerLeft = forwardRef<{ captureScreenshot: () => void; isGeneratingImage: boolean }, SolarSystem3DViewerLeftProps>(({ planets, stars, systemName, cosmicOriginTime, systemUrl }, ref) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const planetsRef = useRef<THREE.Mesh[]>([]);
  const orbitsRef = useRef<THREE.Line[]>([]);
  const planetLabelsRef = useRef<THREE.Sprite[]>([]);
  const controlsRef = useRef<OrbitControls | null>(null);
  const currentTimeRef = useRef<number>(0);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  const realCurrentTime = Math.floor(Date.now() / 1000);
  const [timeOffset, setTimeOffset] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isEntering, setIsEntering] = useState(false);
  const [sliderPosition, setSliderPosition] = useState(0); // -100 to 100 for vertical slider
  const [sliderTimeOffset, setSliderTimeOffset] = useState(0); // actual seconds

  const minTimeOffset = cosmicOriginTime ? cosmicOriginTime - Date.now() / 1000 : undefined;

  const handleSliderChange = (newPosition: number) => {
    const minSliderPos = minTimeOffset !== undefined ? Math.max(-100, timeOffsetToSlider(minTimeOffset)) : -100;
    const clampedPosition = Math.max(minSliderPos, Math.min(100, newPosition));
    setSliderPosition(clampedPosition);
    setSliderTimeOffset(sliderToTimeOffset(clampedPosition));
  };

  const resetSliderToNow = () => {
    setSliderPosition(0);
    setSliderTimeOffset(0);
  };

  const [systemData, setSystemData] = useState<any>(null);
  const [loadingAPI, setLoadingAPI] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  useImperativeHandle(ref, () => ({
    captureScreenshot: () => handleDownloadScreenshot(),
    isGeneratingImage,
  }));

  const currentTime = realCurrentTime - cosmicOriginTime + timeOffset;

  currentTimeRef.current = currentTime;

  useEffect(() => {
    const fetchSystemData = async () => {
      try {
        setLoadingAPI(true);
        setApiError(null);

        const response = await fetch("/api/system/rendering-data");

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();

        if (result.success) {
          setSystemData(result.system_data);
        } else {
          throw new Error(result.error || "Failed to fetch system data");
        }
      } catch (error) {
        setApiError(error instanceof Error ? error.message : "Unknown error");
      } finally {
        setLoadingAPI(false);
      }
    };

    fetchSystemData();
  }, []);

  const handleCloseFullscreen = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsFullscreen(false);
      setIsClosing(false);
    }, 300);
  };

  const createTextSprite = (text: string, color: string = "#ffffff") => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return null;

    canvas.width = 512;
    canvas.height = 128;

    context.fillStyle = "rgba(0, 0, 0, 0.7)";
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.strokeStyle = "#ffffff";
    context.lineWidth = 2;
    context.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);

    context.fillStyle = color;
    context.font = "bold 32px Arial";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, 256, 64);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.1,
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(20, 5, 1);

    return sprite;
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isFullscreen) {
        handleCloseFullscreen();
      }
    };

    if (isFullscreen) {
      setSliderTimeOffset(timeOffset);
    }

    document.addEventListener("solar-system-close-fullscreen", handleCloseFullscreen);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("solar-system-close-fullscreen", handleCloseFullscreen);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullscreen, timeOffset]);

  useEffect(() => {
    if (isFullscreen && isEntering) {
      const timer = setTimeout(() => {
        setIsEntering(false);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isFullscreen, isEntering]);

  useEffect(() => {
    if (loadingAPI || (!systemData && !planets.length) || !mountRef.current) {
      return;
    }

    (window as any).tonnirLoggedInSystem = false;

    const container = mountRef.current;
    let resizeObserver: ResizeObserver | null = null;
    
    // 使用 requestAnimationFrame 确保 DOM 渲染完成
    const initializeScene = () => {
      if (!mountRef.current) return;
      
      const containerWidth = mountRef.current.clientWidth;
      const containerHeight = mountRef.current.clientHeight;
      
      // 确保容器有尺寸
      if (containerWidth === 0 || containerHeight === 0) {
        // 如果容器还没有尺寸，再试一次
        requestAnimationFrame(initializeScene);
        return;
      }

      const size = Math.min(containerWidth, containerHeight);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000011);
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);
      // 设置更合理的初始相机位置，让系统在初始视图中可见
      camera.position.set(0, 150, 0);
      camera.lookAt(0, 0, 0);
      cameraRef.current = camera;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(size, size);
      renderer.setClearColor(0x000011, 1);
      rendererRef.current = renderer;

      renderer.domElement.className = "";
      mountRef.current.appendChild(renderer.domElement);

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
      };

      const starColors: { [key: string]: string } = {
        red: "#FF4444",
        orange: "#FF8844",
        yellow: "#FFFF44",
        white: "#FFFFFF",
        blue: "#4488FF",
        purple: "#8844FF",
      };

      // 确定要使用的数据（必须在创建恒星之前声明）
      const useSystemData = systemData && systemData.planets && systemData.stars;
      const displayPlanets = useSystemData ? systemData.planets : planets;
      const displayStars = useSystemData ? systemData.stars : stars;

      const starGroup = new THREE.Group();
      displayStars.forEach((star, index) => {
        const starRadius = parseFloat(star.Size) * 1.75;
        const starGeometry = new THREE.SphereGeometry(starRadius, 16, 16);
        const starColor = starColors[star.Color] || "#FFFF44";
        const starMaterial = new THREE.MeshBasicMaterial({
          color: starColor,
          transparent: true,
          opacity: 0.9,
        });

        const starMesh = new THREE.Mesh(starGeometry, starMaterial);

        const starRadii = displayStars.map((s, i) => parseFloat(s.Size) * 1.75);
        const maxStarRadius = Math.max(...starRadii);
        const spacing = maxStarRadius * 3;

        if (displayStars.length === 1) {
          starMesh.position.set(0, 0, 0);
        } else if (displayStars.length === 2) {
          starMesh.position.set(index === 0 ? -spacing : spacing, 0, 0);
        } else {
          if (index === 0) starMesh.position.set(-spacing, 0, 0);
          else if (index === 1) starMesh.position.set(spacing, 0, 0);
          else starMesh.position.set(0, spacing, 0);
        }

        const glowGeometry = new THREE.SphereGeometry(starRadius * 1.5, 16, 16);
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

      // 计算最大轨道半径
      let maxOrbitalRadius = 1;
      if (useSystemData && systemData.timing) {
        maxOrbitalRadius = systemData.timing.max_orbital_radius;
      } else {
        // 从行星数据中计算最大轨道半径
        displayPlanets.forEach(planet => {
          if (planet.orbital_radius > maxOrbitalRadius) {
            maxOrbitalRadius = planet.orbital_radius;
          }
        });
      }
      
      // 增加缩放因子，使行星和轨道在初始视图中更明显
      const scaleFactor = 120;

      const starRadiiForOrbit = displayStars.map((s) => parseFloat(s.Size) * 1.75);
      const maxStarRadiusWithGlow = Math.max(...starRadiiForOrbit) * 1.5;
      const minOrbitRadius = Math.max(20, maxStarRadiusWithGlow + 5);

      (window as any).systemMaxOrbitalRadius = maxOrbitalRadius;

      displayPlanets.forEach((planet, index) => {
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

        const basePlanetRadius = planet.diameter / 8000;
        const planetRadius = Math.max(Math.min(basePlanetRadius, 8.0), 1.5);
        const planetGeometry = new THREE.SphereGeometry(planetRadius, 16, 16);
        const planetColor = planetColors[planet.planet_type] || "#FFFFFF";
        const planetMaterial = new THREE.MeshBasicMaterial({
          color: planetColor,
          transparent: true,
          opacity: 0.9,
        });

        const planetMesh = new THREE.Mesh(planetGeometry, planetMaterial);

        const planetGlow = new THREE.Mesh(
          new THREE.SphereGeometry(planetRadius * 1.5, 16, 16),
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

        planetLabelsRef.current.push(null as any);
      });

      const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
      scene.add(ambientLight);

      const pointLight = new THREE.PointLight(0xffffff, 1, 1000);
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
            setTimeOffset((prev) => prev + 604800);
          } else {
            setTimeOffset((prev) => prev - 604800);
          }
        } else {
          event.preventDefault();
          const zoomSpeed = 0.1;
          const currentDistance = camera.position.distanceTo(new THREE.Vector3(0, 0, 0));

          if (event.deltaY > 0 && currentDistance < 500) {
            camera.position.multiplyScalar(1 + zoomSpeed);
          } else if (event.deltaY < 0 && currentDistance > 20) {
            camera.position.multiplyScalar(1 - zoomSpeed);
          }
        }
      };

      const canvas = renderer.domElement;
      canvas.style.borderRadius = "8px";
      canvas.addEventListener("wheel", handleKeyWheel);

      const animate = () => {
        animationIdRef.current = requestAnimationFrame(animate);

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
        });

        if (controlsRef.current) {
          controlsRef.current.update();
        }

        renderer.render(scene, camera);
      };

      animate();

      const handleResize = () => {
        if (!mountRef.current || !renderer) return;
        const containerRef = mountRef.current;
        const newSize = Math.min(containerRef.clientWidth, containerRef.clientHeight);
        renderer.setSize(newSize, newSize);
        camera.aspect = 1;
        camera.updateProjectionMatrix();
      };

      // 使用 ResizeObserver 监听容器尺寸变化
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
          handleResize();
        });
        resizeObserver.observe(mountRef.current);
      }

      window.addEventListener("resize", handleResize);

      // 清理函数
      const cleanup = () => {
        window.removeEventListener("resize", handleResize);
        canvas.removeEventListener("wheel", handleKeyWheel);
        
        if (resizeObserver) {
          resizeObserver.disconnect();
        }

        if (controlsRef.current) {
          controlsRef.current.dispose();
        }

        if (animationIdRef.current) {
          cancelAnimationFrame(animationIdRef.current);
        }

        if (mountRef.current && renderer.domElement) {
          mountRef.current.removeChild(renderer.domElement);
        }

        renderer.dispose();

        planetsRef.current = [];
        orbitsRef.current = [];
        planetLabelsRef.current = [];
      };

      // 将 cleanup 存储为引用，以便在组件卸载时使用
      (window as any).solarSystemCleanup = cleanup;
    };

    // 开始初始化场景
    requestAnimationFrame(initializeScene);

    return () => {
      if ((window as any).solarSystemCleanup) {
        (window as any).solarSystemCleanup();
      }
    };
  }, [planets, stars, cosmicOriginTime, systemData, timeOffset, loadingAPI]);

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

    const scaledObjects: any[] = [];
    scene.traverse((object: any) => {
      if (object.isPoints && object.material) {
        const mat = object.material;
        if (mat.size !== undefined) {
          scaledObjects.push({ material: mat, originalSize: mat.size });
          mat.size = mat.size * scaleFactor * 1;
        }
        if (object.geometry && object.geometry.attributes.size) {
          const sizeAttribute = object.geometry.attributes.size;
          const originalSizes = sizeAttribute.array.slice();
          scaledObjects.push({
            geometry: object.geometry,
            originalSizeArray: originalSizes,
          });

          for (let i = 0; i < sizeAttribute.array.length; i++) {
            sizeAttribute.array[i] *= scaleFactor * 1;
          }
          sizeAttribute.needsUpdate = true;
        }
      }
      if (object.isSprite) {
        scaledObjects.push({
          object: object,
          originalScale: object.scale.clone(),
        });
        object.scale.multiplyScalar(scaleFactor * 1);
      }
      if (object.isLine && object.material) {
        const mat = object.material;
        if (mat.linewidth !== undefined) {
          scaledObjects.push({ material: mat, originalLinewidth: mat.linewidth });
          mat.linewidth = mat.linewidth * scaleFactor * 1;
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

              if (systemUrl) {
                await addQRToScreenshot(ctx, width, height, {
                  type: "system",
                  stargateUrl: systemUrl,
                });
              }

              tempCanvas.toBlob(
                (watermarkedBlob) => {
                  if (watermarkedBlob) {
                    const url = URL.createObjectURL(watermarkedBlob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = `system_${systemName}_${Date.now()}.jpg`;
                    link.click();
                    URL.revokeObjectURL(url);
                  }
                },
                "image/jpeg",
                1.0
              );
            };

            const url = URL.createObjectURL(blob);
            img.src = url;
          }
        }

        scaledObjects.forEach(({ material, object, originalSize, originalScale, originalLinewidth, geometry, originalSizeArray }) => {
          if (originalSize !== undefined) material.size = originalSize;
          if (originalScale !== undefined) object.scale.copy(originalScale);
          if (originalLinewidth !== undefined) material.linewidth = originalLinewidth;
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
      1.0
    );
  };

  const formatTime = (seconds: number) => {
    const years = Math.floor(seconds / (365.25 * 24 * 3600));
    const days = Math.floor((seconds % (365.25 * 24 * 3600)) / (24 * 3600));
    const hours = Math.floor((seconds % (24 * 3600)) / 3600);

    if (years > 0) return `${years}y ${days}d ${hours}h`;
    if (days > 0) return `${days}d ${hours}h`;
    return `${hours}h`;
  };

  const formatName = (name: string) => {
    return name.replace(/_/g, " ");
  };

  return (
    <>
      <div className="flex flex-col items-center w-full h-full">
        <div className="relative w-full h-full">
          <div ref={mountRef} className="w-full h-full border border-white/20 rounded bg-black/20" />

          <ExportingOverlay isVisible={isGeneratingImage} />

          {!loadingAPI && !apiError && systemName && (
            <div className="absolute bottom-0 left-0 p-2 text-white bg-black bg-opacity-50 max-w-xs rounded-tr-lg">
              <h3 className="text-xs font-bold">{formatName(systemName)}</h3>
            </div>
          )}

          <div className="absolute top-2 right-2 flex gap-2 z-10">
            <button onClick={handleDownloadScreenshot} disabled={isGeneratingImage} className={`p-2 border border-white/30 rounded-lg transition-all duration-200 backdrop-blur-sm shadow-lg ${isGeneratingImage ? "bg-black/40 cursor-not-allowed opacity-50" : "bg-black/60 hover:bg-black/80"}`} title={isGeneratingImage ? "Generating image..." : "Download 4K screenshot"}>
              {isGeneratingImage ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <DownloadIcon className="w-4 h-4 text-white" />}
            </button>
            <button
              onClick={() => {
                if (!isGeneratingImage) {
                  setIsFullscreen(true);
                  setIsEntering(true);
                }
              }}
              disabled={isGeneratingImage}
              className={`p-2 border border-white/30 rounded-lg transition-all duration-200 backdrop-blur-sm shadow-lg ${isGeneratingImage ? "bg-black/40 cursor-not-allowed opacity-50" : "bg-black/60 hover:bg-black/80"}`}
              title={isGeneratingImage ? "Please wait..." : "Expand to fullscreen"}
            >
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {isFullscreen &&
        createPortal(
          <div className={`fixed inset-0 z-50 bg-black/95 backdrop-blur-xl transition-all duration-300 ${isClosing ? "opacity-0 scale-95" : isEntering ? "opacity-0 scale-95" : "opacity-100 scale-100"}`}>
            <div className={`w-full h-full flex flex-col p-1 sm:p-2 transition-all duration-300 delay-75 ${isClosing ? "opacity-0 translate-y-4" : isEntering ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"}`}>
              <div className="flex items-center justify-between mb-2 sm:mb-4">
                <div className="block sm:hidden">
                  <h2 className="text-xs font-medium text-white">{formatName(systemName)}</h2>
                </div>

                <div className="hidden sm:flex items-center gap-4 flex-1">
                  <h2 className="text-xl font-bold text-white">{formatName(systemName)}</h2>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-yellow-400 rounded-full"></div>
                      <span className="text-sm text-gray-300">Star(s)</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-blue-400 rounded-full"></div>
                      <span className="text-sm text-gray-300">{systemData?.planets?.length || planets.length} Planets</span>
                    </div>
                    <div className="text-sm text-gray-400">Time: {formatTime(realCurrentTime - cosmicOriginTime + sliderTimeOffset)}</div>
                  </div>
                </div>

                <button onClick={handleCloseFullscreen} className="p-0.5 sm:p-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded transition-colors duration-200 text-red-400 hover:text-red-300" title="Close">
                  <svg className="w-3 h-3 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 border border-white/20 rounded-lg bg-black/20 overflow-hidden min-h-0 relative">
                <SolarSystem3DViewerFullscreen
                  planets={systemData?.planets || planets}
                  stars={systemData?.stars || stars}
                  systemName={systemName}
                  cosmicOriginTime={cosmicOriginTime}
                  currentTime={realCurrentTime - cosmicOriginTime + sliderTimeOffset}
                  onTimeOffsetChange={(delta) => {
                    const newTimeOffset = sliderTimeOffset + delta;
                    const newSliderPos = timeOffsetToSlider(newTimeOffset);
                    handleSliderChange(newSliderPos);
                  }}
                />
                <VerticalTimeSlider sliderPosition={sliderPosition} timeOffset={sliderTimeOffset} onSliderChange={handleSliderChange} onReset={resetSliderToNow} minTimeOffset={minTimeOffset} />
              </div>

              <div className="mt-2 sm:mt-4 text-center text-xs sm:text-sm text-gray-400">
                <div className="hidden sm:block">Scroll: Zoom • Ctrl+Scroll: +1week/-1week • Drag: Rotate View • ESC: Close</div>
                <div className="sm:hidden">Pinch: Zoom • Drag: Rotate • ESC: Close</div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
});

SolarSystem3DViewerLeft.displayName = "SolarSystem3DViewerLeft";
export default SolarSystem3DViewerLeft;

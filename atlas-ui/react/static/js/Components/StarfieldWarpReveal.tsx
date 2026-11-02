// atlas-ui/react/static/js/Components/StarfieldWarpReveal.tsx

import React, { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import contentFilter from "../Utils/ContentFilter.jsx";
import PhotosensitivityWarning from "./PhotosensitivityWarning";
import PhotosensitivePlaceholder from "./PhotosensitivePlaceholder";

interface StarfieldWarpRevealProps {
  seedData?: {
    primordial_seed: string;
    sha256_seed: string;
    decimal_seed: string;
    cosmic_origin_time?: number;
    cosmic_origin_datetime?: string;
  } | null;
  onComplete?: () => void;
}

const StarfieldWarpReveal: React.FC<StarfieldWarpRevealProps> = ({ seedData, onComplete }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const composerRef = useRef<EffectComposer | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const [showWarning, setShowWarning] = useState(true);
  const [canStartAnimation, setCanStartAnimation] = useState(false);
  const [showPlaceholder, setShowPlaceholder] = useState(false);
  const [showDataOverlay, setShowDataOverlay] = useState(false);
  const [dataOpacity, setDataOpacity] = useState(0);
  const [decryptedPrimordial, setDecryptedPrimordial] = useState("");
  const [decryptedHash, setDecryptedHash] = useState("");
  const [decryptedDecimal, setDecryptedDecimal] = useState("");
  const [decryptedTime, setDecryptedTime] = useState("");
  const [showPrimordial, setShowPrimordial] = useState(false);
  const [showHash, setShowHash] = useState(false);
  const [showDecimal, setShowDecimal] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const [headerStatus, setHeaderStatus] = useState("ACTIVE");
  const [isMatrixMode, setIsMatrixMode] = useState(true);
  const [canStartTextDecryption, setCanStartTextDecryption] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [showStarAccelerationBadge, setShowStarAccelerationBadge] = useState(false);
  const [starAccelerationFadingOut, setStarAccelerationFadingOut] = useState(false);
  const [showWarpSpeedBadge, setShowWarpSpeedBadge] = useState(false);
  const [warpSpeedFadingOut, setWarpSpeedFadingOut] = useState(false);
  const [showDataManifestationBadge, setShowDataManifestationBadge] = useState(false);
  const [dataManifestationFadingOut, setDataManifestationFadingOut] = useState(false);
  const [containerBackgroundOpacity, setContainerBackgroundOpacity] = useState(1);
  const [needsTransparency, setNeedsTransparency] = useState(false);
  const [canvasOpacity, setCanvasOpacity] = useState(1);
  const [blurAmount, setBlurAmount] = useState(0);
  // Escape hatch. This overlay is `fixed inset-0 z-[9999]`; while it is up, it eats
  // every click on the page — and it used to run for 15.5 seconds with no way out,
  // so the home screen was unusable on arrival. The countdown is now 6s, and a
  // click or Esc ends it immediately.
  const skippedRef = useRef(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") skippedRef.current = true;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const rawPrimordialSeed = seedData?.primordial_seed || "COSMOS-" + Date.now() + "-GENESIS";
  const primordialSeed = contentFilter.getDisplayText(rawPrimordialSeed);
  const sha256Seed =
    seedData?.sha256_seed ||
    Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16))
      .join("")
      .toUpperCase();
  const decimalSeed = seedData?.decimal_seed || Array.from({ length: 77 }, () => Math.floor(Math.random() * 10)).join("");
  const createCircleTexture = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;

    ctx.clearRect(0, 0, 64, 64);

    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255,255,255,1.0)");
    gradient.addColorStop(0.3, "rgba(255,255,255,0.8)");
    gradient.addColorStop(0.7, "rgba(255,255,255,0.2)");
    gradient.addColorStop(1, "rgba(255,255,255,0.0)");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(32, 32, 32, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.premultiplyAlpha = false;
    texture.format = THREE.RGBAFormat;
    return texture;
  };

  const WarpShader = {
    uniforms: {
      tDiffuse: { value: null },
      warpAmount: { value: 0.0 },
      time: { value: 0.0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float warpAmount;
      uniform float time;
      varying vec2 vUv;
      
      void main() {
        vec2 center = vec2(0.5, 0.5);
        vec2 direction = vUv - center;
        float distance = length(direction);
        
        float stretchBase = 1.0 + warpAmount * distance * distance * 6.0;
        vec2 stretchedUv = center + direction * stretchBase;
        
        float aberrationAmount = warpAmount * distance * 1.0;
        vec2 redOffset = direction * aberrationAmount * 0.4;
        vec2 blueOffset = direction * aberrationAmount * -0.4;
        
        float red = texture2D(tDiffuse, stretchedUv + redOffset).r;
        float green = texture2D(tDiffuse, stretchedUv).g;
        float blue = texture2D(tDiffuse, stretchedUv + blueOffset).b;
        
        float lineFrequency = 8.0 + warpAmount * 12.0;
        float lines = sin(atan(direction.y, direction.x) * lineFrequency + time * (20.0 + warpAmount * 80.0)) * 0.5 + 0.5;
        float lineIntensity = warpAmount * warpAmount;
        float lineEffect = lines * lineIntensity * 0.2 * distance;
        
        vec3 color = vec3(red, green, blue);
        color += vec3(lineEffect * 0.3, lineEffect * 0.5, lineEffect * 0.8) * smoothstep(0.0, 1.0, warpAmount);
        
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  };

  const initScene = () => {
    if (!mountRef.current) return;

    try {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000000);
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 1000);
      camera.position.set(0, 0, 0);
      cameraRef.current = camera;

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
      });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setClearColor(0x000000, 1);
      mountRef.current.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      const composer = new EffectComposer(renderer);
      const renderPass = new RenderPass(scene, camera);
      composer.addPass(renderPass);

      const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.3, 0.6, 0.3);
      composer.addPass(bloomPass);

      const warpPass = new ShaderPass(WarpShader);
      composer.addPass(warpPass);

      composerRef.current = composer;

      const starCount = 7500;
      const starsGeometry = new THREE.BufferGeometry();
      const positions = new Float32Array(starCount * 3);
      const colors = new Float32Array(starCount * 3);
      const sizes = new Float32Array(starCount);
      const velocities = new Float32Array(starCount * 3);
      const initialZ = new Float32Array(starCount);

      for (let i = 0; i < starCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * 50 + 5;
        const z = -Math.random() * 200 - 50;

        positions[i * 3] = Math.cos(angle) * radius;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 100;
        positions[i * 3 + 2] = z;

        initialZ[i] = z;

        velocities[i * 3] = 0;
        velocities[i * 3 + 1] = 0;
        velocities[i * 3 + 2] = 0.5;

        const intensity = Math.random() * 0.6 + 0.4;
        colors[i * 3] = intensity * 0.8;
        colors[i * 3 + 1] = intensity * 0.9;
        colors[i * 3 + 2] = intensity;

        sizes[i] = Math.random() * 1.6 + 0.6;
      }

      starsGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      starsGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      starsGeometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

      const starsMaterial = new THREE.PointsMaterial({
        size: 0.2,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        map: createCircleTexture(),
      });

      const stars = new THREE.Points(starsGeometry, starsMaterial);
      scene.add(stars);
      const streakCount = 200;
      const streaksGeometry = new THREE.BufferGeometry();
      const streakPositions = new Float32Array(streakCount * 6);
      const streakColors = new Float32Array(streakCount * 6);

      for (let i = 0; i < streakCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * 30 + 10;

        streakPositions[i * 6] = Math.cos(angle) * radius;
        streakPositions[i * 6 + 1] = (Math.random() - 0.5) * 60;
        streakPositions[i * 6 + 2] = 10;

        streakPositions[i * 6 + 3] = Math.cos(angle) * radius;
        streakPositions[i * 6 + 4] = streakPositions[i * 6 + 1];
        streakPositions[i * 6 + 5] = -20;

        const intensity = Math.random() * 0.5 + 0.5;
        for (let j = 0; j < 2; j++) {
          streakColors[i * 6 + j * 3] = intensity * 0.7;
          streakColors[i * 6 + j * 3 + 1] = intensity * 0.8;
          streakColors[i * 6 + j * 3 + 2] = intensity;
        }
      }

      streaksGeometry.setAttribute("position", new THREE.BufferAttribute(streakPositions, 3));
      streaksGeometry.setAttribute("color", new THREE.BufferAttribute(streakColors, 3));

      const streaksMaterial = new THREE.LineBasicMaterial({
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0,
        linewidth: 2,
      });

      const streaks = new THREE.LineSegments(streaksGeometry, streaksMaterial);
      scene.add(streaks);
      let startTime = Date.now();
      let speed = 0.3;
      let maxSpeed = 20;
      let warpTriggered = false;
      let dataRevealStarted = false;

      const ACCELERATION_PHASE = 4;
      const MAX_SPEED_HOLD = 7;
      const DECELERATION_START = 8;
      const COMPLETE_STOP = 12;
      const STAR_FADEOUT_START = 9;
      const TOTAL_DURATION = 6;
      const initialWarpPass = composerRef.current?.passes[2] as ShaderPass;
      if (initialWarpPass) {
        initialWarpPass.uniforms.warpAmount.value = 0.0005;
      }

      const animate = () => {
        const elapsed = (Date.now() - startTime) / 1000;

        if (elapsed > 0.8 && elapsed < 0.9 && !showStarAccelerationBadge) {
          setShowStarAccelerationBadge(true);
          setTimeout(() => {
            setStarAccelerationFadingOut(true);
            setTimeout(() => {
              setShowStarAccelerationBadge(false);
              setStarAccelerationFadingOut(false);
            }, 300);
          }, 2000);
        }
        if (elapsed < ACCELERATION_PHASE) {
          const t = elapsed / ACCELERATION_PHASE;
          const curve = Math.pow(t, 2.2);
          speed = 0.3 + (maxSpeed - 0.3) * curve;

          if (speed > maxSpeed * 0.75 && !warpTriggered) {
            warpTriggered = true;
            setShowWarpSpeedBadge(true);
            setTimeout(() => {
              setWarpSpeedFadingOut(true);
              setTimeout(() => {
                setShowWarpSpeedBadge(false);
                setWarpSpeedFadingOut(false);
              }, 300);
            }, 2000);
          }
        } else if (elapsed < MAX_SPEED_HOLD) {
          speed = maxSpeed;
        } else if (elapsed < COMPLETE_STOP) {
          const decelerationTime = elapsed - DECELERATION_START;
          const decelerationDuration = COMPLETE_STOP - DECELERATION_START;
          const t = decelerationTime / decelerationDuration;
          const decelerationCurve = Math.pow(1 - t, 2);
          speed = 0.001 + (maxSpeed - 0.001) * decelerationCurve;
          if (!dataRevealStarted && elapsed >= DECELERATION_START) {
            dataRevealStarted = true;
            setShowDataOverlay(true);
            setShowDataManifestationBadge(true);
            setTimeout(() => {
              setDataManifestationFadingOut(true);
              setTimeout(() => {
                setShowDataManifestationBadge(false);
                setDataManifestationFadingOut(false);
              }, 300);
            }, 1800);

            setTimeout(() => {
              setDataOpacity(1);
              setTimeout(() => {
                setCanStartTextDecryption(true);
              }, 1500);
              setTimeout(() => {
                const startTransparency = () => {
                  let progress = 0;
                  const duration = 2500;
                  const interval = 50;
                  const steps = duration / interval;
                  const opacityStep = 1.0 / steps;
                  const blurStep = 100 / steps;

                  const timer = setInterval(() => {
                    progress += 1;
                    const currentOpacity = Math.max(0, 1 - opacityStep * progress);
                    const currentBlur = Math.min(100, blurStep * progress);

                    setContainerBackgroundOpacity(currentOpacity);
                    setCanvasOpacity(currentOpacity);
                    setBlurAmount(currentBlur);

                    if (progress >= steps) {
                      clearInterval(timer);
                      setNeedsTransparency(true);
                    }
                  }, interval);
                };
                startTransparency();
              }, 2000);
            }, 100);
          }
        } else if (elapsed < TOTAL_DURATION) {
          speed = 0.001;
        } else {
          speed = 0.001;
        }

        const positions = starsGeometry.attributes.position.array as Float32Array;

        let starOpacity = 1;

        if (elapsed >= STAR_FADEOUT_START) {
          const fadeTime = elapsed - STAR_FADEOUT_START;
          const totalFadeTime = COMPLETE_STOP - STAR_FADEOUT_START;

          if (fadeTime < totalFadeTime) {
            const fadeProgress = fadeTime / totalFadeTime;
            starOpacity = Math.max(0, 1 - Math.pow(fadeProgress, 0.5));
          } else {
            starOpacity = 0;
          }
        }

        if (elapsed >= DECELERATION_START) {
          scene.background = null;
          renderer.setClearColor(0x000000, 0);
        } else if (elapsed > DECELERATION_START - 1) {
          scene.background = null;
          renderer.setClearColor(0x000000, 0);
        } else {
          scene.background = new THREE.Color(0x000000);
          renderer.setClearColor(0x000000, 1);
        }

        const starMaterial = stars.material as THREE.PointsMaterial;
        starMaterial.opacity = starOpacity;

        for (let i = 0; i < starCount; i++) {
          positions[i * 3 + 2] += speed;

          if (positions[i * 3 + 2] > 10) {
            positions[i * 3 + 2] = initialZ[i];

            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * 50 + 5;
            positions[i * 3] = Math.cos(angle) * radius;
            positions[i * 3 + 1] = (Math.random() - 0.5) * 100;
          }
        }
        starsGeometry.attributes.position.needsUpdate = true;

        if (speed > 2) {
          const streakProgress = (speed - 2) / (maxSpeed - 2);
          let streakIntensity = Math.pow(streakProgress, 1.5);

          if (elapsed > 10) {
            const fadeTime = elapsed - 10;
            const fadeProgress = Math.min(1, fadeTime / 1);
            streakIntensity *= 1 - fadeProgress;
          }

          streaksMaterial.opacity = streakIntensity * 0.9;

          const streakPositions = streaksGeometry.attributes.position.array as Float32Array;
          for (let i = 0; i < streakCount; i++) {
            const streakSpeed = speed * (1.0 + streakIntensity * 1.0);
            streakPositions[i * 6 + 2] += streakSpeed;

            const stretchFactor = 5 + speed * 2;
            streakPositions[i * 6 + 5] = streakPositions[i * 6 + 2] - stretchFactor;

            if (streakPositions[i * 6 + 2] > 20) {
              const angle = Math.random() * Math.PI * 2;
              const radius = Math.random() * 30 + 10;

              streakPositions[i * 6] = Math.cos(angle) * radius;
              streakPositions[i * 6 + 1] = (Math.random() - 0.5) * 60;
              streakPositions[i * 6 + 2] = -100;

              streakPositions[i * 6 + 3] = streakPositions[i * 6];
              streakPositions[i * 6 + 4] = streakPositions[i * 6 + 1];
              streakPositions[i * 6 + 5] = -100 - stretchFactor;
            }
          }
          streaksGeometry.attributes.position.needsUpdate = true;
        } else {
          streaksMaterial.opacity = 0;
        }

        const bloomPass = composer?.passes[1] as UnrealBloomPass;
        const warpPass = composer?.passes[2] as ShaderPass;

        if (bloomPass && warpPass) {
          let speedRatio = speed / maxSpeed;
          let normalizedSpeed = speed / maxSpeed;

          if (elapsed > 10) {
            const effectFadeTime = elapsed - 10;
            const maxFadeTime = 1;
            if (effectFadeTime < maxFadeTime) {
              const fadeProgress = effectFadeTime / maxFadeTime;
              const fadeMultiplier = Math.max(0, 1 - fadeProgress);
              speedRatio *= fadeMultiplier;
              normalizedSpeed *= fadeMultiplier;
            } else {
              speedRatio = 0;
              normalizedSpeed = 0;
            }
          }

          bloomPass.strength = 0.15 + speedRatio * 1.05;
          bloomPass.radius = 0.4 + speedRatio * 0.5;

          const warpValue = Math.pow(normalizedSpeed, 1.8) * 0.8;

          warpPass.uniforms.warpAmount.value = Math.max(0.001, warpValue);
          warpPass.uniforms.time.value = elapsed;
        }

        if (speed > 3) {
          let shakeProgress = Math.pow((speed - 3) / (maxSpeed - 3), 2.5);

          if (elapsed > 10) {
            const fadeTime = elapsed - 10;
            const fadeProgress = Math.min(1, fadeTime / 1);
            shakeProgress *= 1 - fadeProgress;
          }

          const shakeIntensity = shakeProgress * 1.2;

          const shakeX = (Math.random() - 0.5) * shakeIntensity;
          const shakeY = (Math.random() - 0.5) * shakeIntensity;

          camera.position.x = shakeX * (0.2 + shakeProgress * 0.8);
          camera.position.y = shakeY * (0.2 + shakeProgress * 0.8);
        } else {
          camera.position.x *= 0.98;
          camera.position.y *= 0.98;
        }

        let fovNormalizedSpeed = speed / maxSpeed;

        if (elapsed > 10) {
          const returnTime = elapsed - 10;
          const maxReturnTime = 1;
          if (returnTime < maxReturnTime) {
            const fadeProgress = returnTime / maxReturnTime;
            fovNormalizedSpeed *= Math.max(0, 1 - fadeProgress);
          } else {
            fovNormalizedSpeed = 0;
          }
        }

        const fovCurve = Math.pow(fovNormalizedSpeed, 0.7);
        camera.fov = 75 + fovCurve * 25;
        camera.updateProjectionMatrix();

        if (elapsed > 14 && showDataOverlay) {
          setDataOpacity(0);
          setTimeout(() => {
            setShowDataOverlay(false);
          }, 1000);
        }

        if (needsTransparency) {
          renderer.render(scene, camera);
        } else if (composerRef.current) {
          composerRef.current.render();
        } else {
          renderer.render(scene, camera);
        }

        if (skippedRef.current || elapsed > TOTAL_DURATION + 0.5) {
          setIsFadingOut(true);
          setTimeout(() => {
            if (onComplete) onComplete();
          }, 300);
          return;
        }

        animationIdRef.current = requestAnimationFrame(animate);
      };

      animate();
    } catch (error) {
      console.error("Error initializing scene:", error);
    }
  };

  useEffect(() => {
    if (rendererRef.current && rendererRef.current.domElement) {
      rendererRef.current.domElement.style.opacity = canvasOpacity.toString();
      rendererRef.current.domElement.style.transition = "opacity 2s ease-out";
    }
  }, [canvasOpacity]);

  const handleWarningProceed = () => {
    setShowWarning(false);
    setCanStartAnimation(true);
  };

  const handleWarningSkip = () => {
    setShowWarning(false);
    setShowPlaceholder(true);
  };

  const handlePlaceholderComplete = () => {
    setShowPlaceholder(false);
    if (onComplete) {
      onComplete();
    }
  };

  useEffect(() => {
    if (!canStartAnimation) {
      return;
    }

    initScene();

    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      if (rendererRef.current && mountRef.current && rendererRef.current.domElement.parentNode) {
        mountRef.current.removeChild(rendererRef.current.domElement);
        rendererRef.current.dispose();
      }
    };
  }, [canStartAnimation]);

  useEffect(() => {
    if (!canStartTextDecryption) return;

    const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    const decryptTerminalText = (terminalText: string, setter: React.Dispatch<React.SetStateAction<string>>, delay: number, onComplete?: () => void) => {
      setTimeout(() => {
        let iteration = 0;
        const interval = setInterval(() => {
          setter(
            terminalText
              .split("")
              .map((char, index) => {
                if (index < iteration) {
                  return terminalText[index];
                }
                if (char === " " || char === "\n" || char === ">" || char === "|" || char === "-") {
                  return char;
                }
                return chars[Math.floor(Math.random() * chars.length)];
              })
              .join(""),
          );

          if (iteration >= terminalText.length) {
            clearInterval(interval);
            if (onComplete) onComplete();
          }
          iteration += 1;
        }, 6);
      }, delay);
    };

    const stopMatrixEffect = () => {
      setIsMatrixMode(false);
    };

    const primordialLine = `atlas@cube:~ $ > DEPLOY _\n> Universe Primordial Seed: ${primordialSeed}`;
    const hashLine = `atlas@cube:~ $ > CYPHER _\n> Quantum Overlay: ${sha256Seed}`;
    const decimalLine = `atlas@cube:~ $ > CREATE _\n> Universal Constant: ${decimalSeed}`;
    const timeLine = seedData?.cosmic_origin_time ? `atlas@cube:~ $ > RUN _\n> Genesis: ${seedData.cosmic_origin_time} Unix ${new Date(seedData.cosmic_origin_time * 1000).toLocaleString("es-ES")}` : "";

    setShowPrimordial(true);
    decryptTerminalText(primordialLine, setDecryptedPrimordial, 50, () => {
      setTimeout(() => {
        setShowHash(true);
        decryptTerminalText(hashLine, setDecryptedHash, 0, () => {
          setTimeout(() => {
            setShowDecimal(true);
            decryptTerminalText(decimalLine, setDecryptedDecimal, 0, () => {
              if (timeLine) {
                setTimeout(() => {
                  setShowTime(true);
                  decryptTerminalText(timeLine, setDecryptedTime, 0, () => {
                    stopMatrixEffect();
                    setTimeout(() => {
                      setShowCompletion(true);
                    }, 100);
                  });
                }, 100);
              } else {
                stopMatrixEffect();
                setTimeout(() => {
                  setShowCompletion(true);
                }, 100);
              }
            });
          }, 100);
        });
      }, 100);
    });
  }, [canStartTextDecryption, primordialSeed, sha256Seed, decimalSeed, seedData]);

  useEffect(() => {
    if (!isMatrixMode) {
      setHeaderStatus("ACTIVE");
      return;
    }

    const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    const matrixInterval = setInterval(() => {
      const randomText = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");

      setHeaderStatus(randomText);
    }, 15);

    return () => clearInterval(matrixInterval);
  }, [isMatrixMode]);

  if (showWarning) {
    return (
      <PhotosensitivityWarning onProceed={handleWarningProceed} onSkip={handleWarningSkip}>
        {null}
      </PhotosensitivityWarning>
    );
  }

  if (showPlaceholder) {
    return <PhotosensitivePlaceholder onComplete={handlePlaceholderComplete} duration={3000} />;
  }

  return (
    <div
      className={`fixed inset-0 z-[9999] overflow-hidden ${isFadingOut ? "animate-fadeOut" : "animate-fadeIn"}`}
      onClick={() => {
        skippedRef.current = true;
      }}
      title="点击跳过"
      style={{
        backgroundColor: containerBackgroundOpacity > 0 ? `rgba(0, 0, 0, ${containerBackgroundOpacity})` : "transparent",
        backdropFilter: blurAmount > 0 ? `blur(${blurAmount}px)` : "none",
        WebkitBackdropFilter: blurAmount > 0 ? `blur(${blurAmount}px)` : "none",
        transition: "background-color 0.1s ease-out, backdrop-filter 0.1s ease-out",
      }}
    >
      <div ref={mountRef} className="absolute inset-0" />

      {showDataOverlay && (
        <div
          className="absolute inset-0 flex items-center justify-center z-[60] pointer-events-none p-4"
          style={{
            opacity: dataOpacity,
            transition: "opacity 1.5s ease-in-out",
          }}
        >
          <div className="w-full max-w-4xl mx-auto px-2 sm:px-4">
            <div
              className="bg-black/95 border border-green-400/60 shadow-2xl overflow-hidden backdrop-blur-sm rounded-lg"
              style={{
                fontFamily: "Courier New, monospace",
                backdropFilter: "blur(12px)",
                minHeight: "320px",
              }}
            >
              <div className={`px-3 sm:px-6 py-3 border-b border-green-400/50 flex items-center justify-between transition-all duration-500 ${isMatrixMode ? "bg-green-900/30" : "bg-green-500/20 border-green-300"}`}>
                <div className={`text-xs sm:text-sm font-mono uppercase tracking-wider transition-colors duration-500 break-words sm:break-normal overflow-hidden ${isMatrixMode ? "text-green-400" : "text-green-300"}`}>
                  <span className="hidden lg:inline">&gt; ATLAS INITIALIZATION PROTOCOL v2.10.434 &lt;</span>
                  <span className="hidden sm:inline lg:hidden">&gt; ATLAS INIT PROTOCOL v2.10.434 &lt;</span>
                  <span className="sm:hidden">&gt; ATLAS INIT v2.10.434 &lt;</span>
                </div>
                <div className="flex gap-1 items-center">
                  <div className={`w-2 h-2 transition-colors duration-500 ${isMatrixMode ? "bg-green-400 animate-pulse" : "bg-green-300"}`}></div>
                  <div className={`text-xs sm:text-sm font-mono transition-colors duration-500 ${isMatrixMode ? "text-green-400 animate-pulse" : "text-green-300 font-bold"}`}>{headerStatus}</div>
                </div>
              </div>

              <div className="p-3 sm:p-6 text-green-400 font-mono text-xs leading-relaxed bg-black/70 overflow-x-auto min-h-[420px] lg:min-h-[300px]">
                {showPrimordial && (
                  <div className="animate-fadeIn text-green-300 mb-3 break-words overflow-wrap-anywhere">
                    <span className="whitespace-pre-wrap">{decryptedPrimordial}</span>
                  </div>
                )}

                {showHash && (
                  <div className="animate-fadeIn text-green-300 mb-3 break-words overflow-wrap-anywhere">
                    <span className="whitespace-pre-wrap">{decryptedHash}</span>
                  </div>
                )}

                {showDecimal && (
                  <div className="animate-fadeIn text-green-300 mb-3 break-words overflow-wrap-anywhere">
                    <span className="whitespace-pre-wrap">{decryptedDecimal}</span>
                  </div>
                )}

                {showTime && (
                  <div className="animate-fadeIn text-green-300 mb-4 break-words overflow-wrap-anywhere">
                    <span className="whitespace-pre-wrap">{decryptedTime}</span>
                  </div>
                )}

                {showCompletion && (
                  <div
                    className="text-green-400 tracking-wider mt-8 break-words"
                    style={{
                      animation: "0.5s ease-out, blink 0.8s infinite",
                    }}
                  >
                    &gt; ATLAS INITIALIZATION PROTOCOL COMPLETED
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-[60]">
        {showStarAccelerationBadge && <div className={`bg-blue-500/20 text-blue-400 px-3 py-1 rounded-lg font-mono text-xs uppercase tracking-wider border border-blue-400/30 backdrop-blur-sm ${starAccelerationFadingOut ? "animate-phaseSlideDownFadeOut" : "animate-phaseSlideUpFadeIn"}`}>IMMERSION</div>}
        {showWarpSpeedBadge && <div className={`bg-cyan-500/20 text-cyan-400 px-3 py-1 rounded-lg font-mono text-xs uppercase tracking-wider border border-cyan-400/30 backdrop-blur-sm ${warpSpeedFadingOut ? "animate-phaseSlideDownFadeOut" : "animate-phaseSlideUpFadeIn"}`}>WARP JUMP</div>}
        {showDataManifestationBadge && <div className={`bg-green-500/20 text-green-400 px-3 py-1 rounded-lg font-mono text-xs uppercase tracking-wider border border-green-400/30 backdrop-blur-sm ${dataManifestationFadingOut ? "animate-phaseSlideDownFadeOut" : "animate-phaseSlideUpFadeIn"}`}>GNOSIS</div>}
      </div>
    </div>
  );
};

export default StarfieldWarpReveal;

// atlas-ui/react/static/js/Components/SystemVisualizationUniversal.tsx
import React, { useEffect, useRef, useState } from "react";
import SolarSystem3DViewerLeft from "./SolarSystem3DViewerLeft.tsx";
import StargateButton from "./StargateButton";
import MiningAnimationOverlay from "./MiningAnimationOverlay.tsx";
import { ResourceEventManager } from "../Utils/ResourceEventManager.tsx";
import AdaptivePreloadCanvas from "./AdaptivePreloadCanvas.tsx";
import RealisticSystemStage from "./RealisticSystemStage.tsx";
import { readRenderer, writeRenderer } from "../Utils/RendererFlag.tsx";

interface System {
  name: string;
  index: number;
  star_system_type: string;
  num_planets: number;
  stars: Array<{
    Type: string;
    Size: string;
    Color: string;
  }>;
  planets: Array<{
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
  }>;
}

interface SystemVisualizationUniversalProps {
  systemUrl: string;
  system?: System;
  cosmicOriginTime?: number;
  /**
   * Fill the parent instead of sitting in a 384px square. Set by the shell's
   * stage (P1b); the square is right for a column layout, wrong when the 3D view
   * is supposed to be the screen.
   */
  fill?: boolean;
}

const SystemVisualizationUniversal: React.FC<SystemVisualizationUniversalProps> = ({ systemUrl, system, cosmicOriginTime, fill = false }) => {
  const decelerateRef = useRef(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [canvasHidden, setCanvasHidden] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [showMiningAnimation, setShowMiningAnimation] = useState(false);
  const solarSystemRendererRef = useRef<{ captureScreenshot: () => void; isGeneratingImage: boolean } | null>(null);
  // 3.0 star system is opt-in, same flag as the planet page (docs/render-transplant §10.2)
  const [renderer] = useState(() => readRenderer());
  const [realisticFailed, setRealisticFailed] = useState(false);
  const useRealistic = renderer === "realistic" && !realisticFailed;

  useEffect(() => {
    setImageLoaded(true);

    setTimeout(() => {
      setCanvasHidden(true);
      decelerateRef.current = true;
    }, 500); // 减少延迟时间，让内容更快显示
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (solarSystemRendererRef.current && isGeneratingImage) {
        const rendererState = solarSystemRendererRef.current.isGeneratingImage;
        if (!rendererState && isGeneratingImage) {
          setIsGeneratingImage(false);
        }
      }
    }, 50);
    return () => clearInterval(interval);
  }, [isGeneratingImage]);

  useEffect(() => {
    const handleMiningCompleted = () => {
      setShowMiningAnimation(true);
    };

    const unsubscribe = ResourceEventManager.subscribe("mining_completed", handleMiningCompleted);

    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <div className="h-full flex flex-col">
      <div className={fill ? "hidden" : "flex items-center justify-between mb-3"}>
        <h3 className="text-lg sm:text-xl font-bold text-white">System Visualization</h3>
      </div>

      <div
        className={
          fill
            ? "relative w-full flex-1 min-h-[280px] bg-black flex justify-center items-center rounded-none overflow-hidden border border-[rgba(46,230,255,.25)]"
            : "relative w-full max-w-80 sm:max-w-96 aspect-square mx-auto bg-black flex justify-center items-center rounded-none overflow-hidden border-2 border-blue-400/30 mb-4"
        }
      >
        <AdaptivePreloadCanvas hidden={canvasHidden} decelerateRef={decelerateRef} />

        {imageLoaded && system && (
          <div className={`absolute inset-0 w-full h-full transition-all duration-500 ${imageLoaded && canvasHidden ? "opacity-100 blur-0" : "opacity-0 blur-[25px]"}`}>
            {useRealistic ? (
              <RealisticSystemStage
                systemIndex={system.index ?? 0}
                cosmicOriginTime={cosmicOriginTime || 0}
                height="100%"
                onFallback={() => setRealisticFailed(true)}
              />
            ) : (
              <SolarSystem3DViewerLeft ref={solarSystemRendererRef} planets={system.planets} stars={system.stars} systemName={system.name} cosmicOriginTime={cosmicOriginTime || 0} systemUrl={systemUrl} />
            )}
          </div>
        )}

        <MiningAnimationOverlay
          isActive={showMiningAnimation}
          onAnimationComplete={() => {
            setShowMiningAnimation(false);
          }}
        />
      </div>

      <div className="text-center mt-auto">
        <StargateButton
          href={systemUrl}
          onTakeScreenshot={() => {
            if (solarSystemRendererRef.current && !isGeneratingImage) {
              setIsGeneratingImage(true);
              solarSystemRendererRef.current.captureScreenshot();
            }
          }}
          isGeneratingImage={isGeneratingImage}
        />

        {useRealistic ? null : (
          <button
            type="button"
            onClick={() => writeRenderer("realistic")}
            className="mt-2 text-xs text-cyan-300/70 hover:text-cyan-200 transition-colors"
            title="试用 3.0 恒星系渲染（可随时切回）"
          >
            试用真实渲染 →
          </button>
        )}

        <div className="mt-2 text-xs text-gray-500 text-center">Gateway to the stars</div>
      </div>
    </div>
  );
};

export default SystemVisualizationUniversal;

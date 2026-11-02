// atlas-ui/react/static/js/Components/GalaxyVisualization.tsx
import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Galaxy3DViewer from "./Galaxy3DViewer.tsx";
import Galaxy3DViewerFullscreen from "./Galaxy3DViewerFullscreen.tsx";
import StargateButton from "./StargateButton";
import MiningAnimationOverlay from "./MiningAnimationOverlay.tsx";
import { ResourceEventManager } from "../Utils/ResourceEventManager.tsx";

interface GalaxyVisualizationProps {
  galaxyUrl: string;
  galaxyType?: string;
  numSystems?: number;
  blackHoles?: number;
  pulsars?: number;
  quasars?: number;
  galaxyName?: string;
  seed?: number;
  /**
   * Fill the parent instead of sitting in a 384px square. Set by the shell's
   * stage (P1b); the square is right for a column layout, wrong when the 3D view
   * is supposed to be the screen.
   */
  fill?: boolean;
}

const GalaxyVisualization: React.FC<GalaxyVisualizationProps> = ({ galaxyUrl, galaxyType = "Spiral", numSystems = 10000, blackHoles = 5, pulsars = 10, quasars = 3, galaxyName, seed, fill = false }) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isEntering, setIsEntering] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [showMiningAnimation, setShowMiningAnimation] = useState(false);
  const galaxyRendererRef = useRef<{ captureScreenshot: () => void; isGeneratingImage: boolean } | null>(null);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      [data-rmiz-modal-overlay="visible"] {
        background-color: rgba(0, 0, 0, 0.8) !important;
        backdrop-filter: blur(20px) !important;
        -webkit-backdrop-filter: blur(20px) !important;
        transition: backdrop-filter 0.3s ease-in-out !important;
      }
      
      [data-rmiz-modal-img] {
        border-radius: 1rem !important;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8) !important;
      }
      
      [data-rmiz-modal-overlay="hidden"] {
        backdrop-filter: blur(0px) !important;
        -webkit-backdrop-filter: blur(0px) !important;
        transition: backdrop-filter 0.3s ease-in-out !important;
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const handleCloseFullscreen = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsFullscreen(false);
      setIsClosing(false);
    }, 300);
  };

  useEffect(() => {
    document.addEventListener("galaxy-close-fullscreen", handleCloseFullscreen);

    return () => {
      document.removeEventListener("galaxy-close-fullscreen", handleCloseFullscreen);
    };
  }, []);

  useEffect(() => {
    if (isEntering) {
      const timer = setTimeout(() => setIsEntering(false), 50);
      return () => clearTimeout(timer);
    }
  }, [isEntering]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (galaxyRendererRef.current && isGeneratingImage) {
        const rendererState = galaxyRendererRef.current.isGeneratingImage;
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
        <h3 className="text-lg sm:text-xl font-bold text-white">Galaxy Visualization</h3>
      </div>

      <div
        className={
          fill
            ? "relative w-full flex-1 min-h-[280px] bg-black/50 flex justify-center items-center rounded-none overflow-hidden border border-[rgba(46,230,255,.25)]"
            : "relative w-full max-w-80 sm:max-w-96 aspect-square mx-auto bg-black/50 flex justify-center items-center rounded-none overflow-hidden border-2 border-blue-400/30 mb-4"
        }
      >
        <Galaxy3DViewer
          ref={galaxyRendererRef}
          galaxyType={galaxyType}
          numSystems={numSystems}
          blackHoles={blackHoles}
          pulsars={pulsars}
          quasars={quasars}
          seed={seed}
          galaxyName={galaxyName}
          galaxyUrl={galaxyUrl}
          onExpandClick={() => {
            setIsFullscreen(true);
            setIsEntering(true);
          }}
        />

        <MiningAnimationOverlay
          isActive={showMiningAnimation}
          onAnimationComplete={() => {
            setShowMiningAnimation(false);
          }}
        />
      </div>

      <div className="text-center mt-auto">
        <StargateButton
          href={galaxyUrl}
          onTakeScreenshot={() => {
            if (galaxyRendererRef.current && !isGeneratingImage) {
              setIsGeneratingImage(true);
              galaxyRendererRef.current.captureScreenshot();
            }
          }}
          isGeneratingImage={isGeneratingImage}
        />

        <div className="mt-2 text-xs text-gray-500 text-center">Gateway to the stars</div>
      </div>

      {isFullscreen &&
        createPortal(
          <div className={`fixed inset-0 z-50 bg-black/95 transition-all duration-300 ${isClosing ? "opacity-0 scale-95" : isEntering ? "opacity-0 scale-95" : "opacity-100 scale-100"}`}>
            <div className={`w-full h-full flex flex-col p-1 sm:p-2 transition-all duration-300 delay-75 ${isClosing ? "opacity-0 translate-y-4" : isEntering ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"}`}>
              <div className="flex items-center justify-between mb-2 sm:mb-4">
                <div className="block sm:hidden">
                  <h2 className="text-xs font-medium text-white">Galaxy View</h2>
                </div>
                <div className="hidden sm:block">
                  <div>
                    <h2 className="text-lg font-bold text-white">Galaxy Visualization</h2>
                    <div className="text-sm text-gray-400">
                      Type: {galaxyType} • Systems: {numSystems.toLocaleString()}
                    </div>
                  </div>
                </div>

                <button onClick={handleCloseFullscreen} className="p-0.5 sm:p-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded transition-colors duration-200 text-red-400 hover:text-red-300" title="Close">
                  <svg className="w-3 h-3 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 border border-white/20 rounded-lg bg-black/20 overflow-hidden min-h-0">
                <Galaxy3DViewerFullscreen galaxyType={galaxyType} numSystems={numSystems} blackHoles={blackHoles} pulsars={pulsars} quasars={quasars} seed={seed} galaxyName={galaxyName} />
              </div>

              <div className="mt-2 sm:mt-4 text-center text-xs sm:text-sm text-gray-400">
                <div className="hidden sm:block">Scroll: Zoom • Drag: Rotate View • ESC: Close</div>
                <div className="sm:hidden">Pinch: Zoom • Drag: Rotate • ESC: Close</div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default GalaxyVisualization;

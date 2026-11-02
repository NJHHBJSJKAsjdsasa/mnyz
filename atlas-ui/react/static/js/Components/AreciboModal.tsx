import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import AreciboMessage from "./AreciboMessage.tsx";

interface AreciboModalProps {
  isOpen: boolean;
  onClose: () => void;
  lifeForm: string;
  planetName: string;
}

const AreciboModal: React.FC<AreciboModalProps> = ({ isOpen, onClose, lifeForm, planetName }) => {
  const [shouldRender, setShouldRender] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => {
      setShouldRender(false);
      onClose();
    }, 300);
  };

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsVisible(true);
        });
      });
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!shouldRender) return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      style={{
        opacity: isVisible ? 1 : 0,
        transition: "opacity 300ms ease-in-out",
      }}
      onClick={handleClose}
    >
      <div
        className="bg-black/90 border border-purple-400/30 rounded-none shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] relative"
        style={{
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? "scale(1)" : "scale(0.95)",
          transition: "opacity 300ms ease-in-out, transform 300ms ease-in-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-purple-600/20 hover:bg-blue-600/20 rounded-t-2xl">
          <div className="flex-1">
            <h3 className="text-white font-bold text-lg flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width={20} height={20} viewBox="0 0 24 24" className="animate-spin">
                <path fill="currentColor" d="M12.735 14.654a.75.75 0 0 1-.23-1.44c.224-.094.441-.237.645-.44a.75.75 0 0 1 .996-.058a.75.75 0 0 1 .705.954c-.21.746-.6 1.477-1.105 2.147a.75.75 0 0 1-1.197-.903q.098-.13.186-.26m-2.248.041a.75.75 0 0 0 .953-.707a.75.75 0 0 0-.058-.994a2 2 0 0 1-.442-.646a.75.75 0 0 0-1.438.23a7 7 0 0 1-.26-.186a.75.75 0 0 0-.903 1.198c.67.505 1.4.894 2.148 1.105m-3.811-2.749a.75.75 0 0 0 1.18-.925a8 8 0 0 1-1.01-1.677a.75.75 0 1 0-1.372.604c.317.72.728 1.394 1.202 1.998M4.84 7.672a.75.75 0 0 0 1.49-.178a5.1 5.1 0 0 1 .108-1.862a.75.75 0 0 0-1.454-.366a6.6 6.6 0 0 0-.144 2.406M6.008 3.08a.75.75 0 1 0 1.218.875q.265-.37.62-.727a.75.75 0 0 0-1.06-1.061a7.4 7.4 0 0 0-.778.912m5.755 6.007a7 7 0 0 0-.187.26a.75.75 0 0 1 .23 1.439a2 2 0 0 0-.645.441a.75.75 0 0 1-.995.058a.752.752 0 0 1-.706-.954c.211-.746.6-1.477 1.105-2.147a.75.75 0 0 1 1.198.903m2.062.219a.75.75 0 0 0-.954.707a.75.75 0 0 0 .059.994c.204.204.347.421.441.645a.75.75 0 0 0 1.439-.23q.13.09.26.187a.75.75 0 0 0 .902-1.198c-.67-.505-1.4-.894-2.147-1.105m3.81 2.749a.75.75 0 1 0-1.18.925c.4.511.746 1.079 1.01 1.677a.75.75 0 0 0 1.372-.604a9.4 9.4 0 0 0-1.202-1.998m1.837 4.274a.75.75 0 1 0-1.49.178a5.1 5.1 0 0 1-.109 1.862a.75.75 0 0 0 1.455.366a6.6 6.6 0 0 0 .143-2.406m-1.167 4.592a.75.75 0 0 0-1.218-.875a6 6 0 0 1-.621.727a.75.75 0 0 0 1.06 1.06q.44-.439.779-.911M12.082 7.573a.75.75 0 0 1 .127-1.053a9.4 9.4 0 0 1 1.998-1.202a.75.75 0 0 1 .604 1.373a8 8 0 0 0-1.677 1.01a.75.75 0 0 1-1.053-.128m3.747-2.056a.75.75 0 0 1 .656-.833a6.6 6.6 0 0 1 2.405.143a.75.75 0 1 1-.366 1.455a5.1 5.1 0 0 0-1.862-.109a.75.75 0 0 1-.834-.656m4.203.506a.75.75 0 0 1 1.046-.171q.472.339.912.778a.75.75 0 1 1-1.06 1.06a6 6 0 0 0-.728-.62a.75.75 0 0 1-.17-1.047M12.103 17.48a.75.75 0 0 0-.926-1.18A8 8 0 0 1 9.5 17.31a.75.75 0 1 0 .604 1.372a9.4 9.4 0 0 0 1.999-1.202m-4.275 1.836a.75.75 0 1 0-.178-1.49a5.1 5.1 0 0 1-1.862-.108a.75.75 0 1 0-.366 1.454a6.6 6.6 0 0 0 2.406.144m-4.592-1.168a.75.75 0 1 0 .875-1.218a6 6 0 0 1-.727-.62a.75.75 0 0 0-1.06 1.06q.439.44.912.778" opacity={0.5}></path>
                <path fill="currentColor" d="M8.928 12.453c.406.836 1.016 1.541 1.825 1.942c-.793.183-1.71.22-2.648.087C5.315 14.087 2.75 12.284 2.75 9a.75.75 0 0 0-1.5 0c0 4.316 3.436 6.513 6.645 6.968c1.612.228 3.27.042 4.558-.584c.868-.422 1.596-1.065 1.988-1.921c.142.741.162 1.578.041 2.432c-.395 2.79-2.198 5.355-5.482 5.355a.75.75 0 0 0 0 1.5c4.316 0 6.513-3.436 6.968-6.645c.228-1.612.042-3.27-.584-4.558c-.346-.712-.84-1.33-1.48-1.745a7.7 7.7 0 0 1 1.99.027c2.792.396 5.356 2.198 5.356 5.483a.75.75 0 0 0 1.5 0c0-4.316-3.436-6.513-6.645-6.968c-1.612-.228-3.27-.043-4.558.584c-.692.336-1.294.812-1.709 1.425a7.6 7.6 0 0 1-.009-2.248c.396-2.79 2.198-5.355 5.483-5.355a.75.75 0 0 0 0-1.5c-4.316 0-6.513 3.436-6.968 6.645c-.228 1.612-.043 3.27.584 4.558"></path>
              </svg>
              Atlas Life Form Analysis
            </h3>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-white transition-colors duration-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4">
          <div className="flex justify-center mb-4">
            <div
              style={{
                filter: "none",
                boxShadow: "inset 0 0 0 1px var(--atlas-line-strong)",
              }}
            >
              <AreciboMessage lifeForm={lifeForm} planetName={planetName} scale={6} className="" showControls={false} showInfo={false} />
            </div>
          </div>

          <div className="text-center">
            <p className="text-[10px] text-gray-400">
              Trying to understand the Life Form analyzed?{" "}
              <a href="https://en.wikipedia.org/wiki/Arecibo_message" target="_blank" rel="nofollow noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline transition-colors">
                Click here
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AreciboModal;

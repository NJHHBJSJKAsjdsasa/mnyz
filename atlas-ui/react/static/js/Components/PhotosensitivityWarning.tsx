// atlas-ui/react/static/js/Components/PhotosensitivityWarning.tsx

import React, { useState, useEffect } from "react";
import { PhotosensitivityManager } from "../Utils/PhotosensitivityManager";

interface PhotosensitivityWarningProps {
  onProceed: () => void;
  onSkip: () => void;
  children: React.ReactNode;
}

const PhotosensitivityWarning: React.FC<PhotosensitivityWarningProps> = ({ onProceed, onSkip, children }) => {
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const hasPreference = localStorage.getItem("atlas_photosensitivity_mode") !== null;

    if (hasPreference) {
      const isPhotosensitive = PhotosensitivityManager.isEnabled();

      if (isPhotosensitive) {
        onSkip();
      } else {
        onProceed();
      }
      return;
    }

    setShowWarning(true);

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleProceedAndSave();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleProceedAndSave = () => {
    PhotosensitivityManager.disable();
    setIsVisible(false);
    setTimeout(() => {
      setShowWarning(false);
      onProceed();
    }, 300);
  };

  const handleEnablePhotosensitivityMode = () => {
    PhotosensitivityManager.enable();
    setIsVisible(false);
    setTimeout(() => {
      setShowWarning(false);
      onSkip();
    }, 300);
  };

  if (!showWarning) {
    return <>{children}</>;
  }

  return (
    <div className={`fixed inset-0 z-[9999] bg-black flex items-center justify-center p-4 transition-opacity duration-300 ${isVisible ? "opacity-100" : "opacity-0"}`}>
      <div className="max-w-2xl w-full">
        <div className="space-y-4 sm:space-y-6 md:space-y-8">
          {/* Warning Icon */}
          <div className="flex justify-center">
            <svg className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>

          {/* Title */}
          <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-white text-center tracking-tight px-2">光敏性警告</h1>

          {/* Content */}
          <div className="space-y-2 sm:space-y-3 text-gray-300 px-2">
            <p className="text-sm sm:text-base md:text-lg leading-relaxed text-center">
              以下体验包含 <span className="font-bold text-white">闪烁灯光</span>、<span className="font-bold text-white">快速移动</span> 和
              <span className="font-bold text-white">强烈的3D视觉效果</span>。
            </p>
            <p className="text-xs sm:text-sm md:text-base leading-relaxed text-center text-gray-400">这些可能会触发光敏性癫痫或类似疾病患者的癫痫发作。</p>
          </div>

          {/* Countdown */}
          <div className="text-center py-3 sm:py-4 md:py-6">
            <p className="text-xs sm:text-sm text-gray-400 mb-2 sm:mb-3">将在以下时间自动继续</p>
            <div className="text-5xl sm:text-6xl md:text-7xl font-bold text-white tabular-nums">{countdown}</div>
          </div>

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-2 sm:pt-4 px-2">
            <button onClick={handleProceedAndSave} className="flex-1 bg-white hover:bg-gray-100 text-black font-bold py-3 sm:py-4 px-6 sm:px-8 rounded-lg sm:rounded-none transition-all duration-200 transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-white/50 text-base sm:text-lg">
              继续
            </button>
            <button onClick={handleEnablePhotosensitivityMode} className="flex-1 bg-gray-800 hover:bg-gray-700 border-2 border-gray-600 text-white font-bold py-3 sm:py-4 px-6 sm:px-8 rounded-lg sm:rounded-none transition-all duration-200 transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-gray-600/50 text-base sm:text-lg">
              我有光敏性
            </button>
          </div>

          {/* Footer note */}
          <p className="text-[10px] sm:text-xs text-gray-500 text-center leading-relaxed pt-2 sm:pt-4 px-2">您的偏好将被保存。您可以随时从页脚设置中更改它。</p>
        </div>
      </div>
    </div>
  );
};

export default PhotosensitivityWarning;

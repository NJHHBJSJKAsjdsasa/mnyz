// atlas-ui/react/static/js/Components/VersionFooter.tsx
// Version line + photosensitivity switch. The six glyphs live in footer/icons;
// the `showBadge` prop was declared but never read, so it is gone.

import React, { useEffect, useState } from "react";
import { PhotosensitivityManager } from "../Utils/PhotosensitivityManager";
import { GitHubIcon } from "./footer/icons.tsx";

interface VersionFooterProps {
  version: string;
}

const VersionFooter: React.FC<VersionFooterProps> = ({ version }) => {
  const [isPhotosensitivityEnabled, setIsPhotosensitivityEnabled] = useState(false);

  useEffect(() => {
    setIsPhotosensitivityEnabled(PhotosensitivityManager.isEnabled());

    const handleChange = (event: CustomEvent) => {
      setIsPhotosensitivityEnabled(event.detail.enabled);
    };

    window.addEventListener("photosensitivityChange", handleChange as EventListener);
    return () => {
      window.removeEventListener("photosensitivityChange", handleChange as EventListener);
    };
  }, []);

  const handleTogglePhotosensitivity = () => {
    PhotosensitivityManager.toggle();
    setIsPhotosensitivityEnabled(PhotosensitivityManager.isEnabled());
  };

  return (
    <footer className="bg-black/30 border-t border-white/10 mt-8 w-full">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col">
          {/* Row 1: version + links */}
          <div className="flex flex-col lg:flex-row items-center justify-between gap-3 mb-3">
            <div className="flex flex-row items-center gap-3">
              <div className="flex items-center space-x-3">
                <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium text-gray-300">Atlas v{version}</span>
              </div>
              <span className="text-gray-600">•</span>
              <span className="text-xs text-gray-500">
                Created by <span className="text-gray-400 font-medium">SurceBeats</span>
              </span>
            </div>

            <div className="flex items-center flex-wrap justify-center gap-3">
              <a
                href="https://github.com/SurceBeats/Atlas"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-2 px-3 py-2 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 transition-all duration-200 group"
                title="View Atlas source on GitHub"
              >
                <GitHubIcon />
                <span className="text-sm text-gray-400 group-hover:text-white">Atlas</span>
              </a>
            </div>
          </div>

          {/* Row 2: photosensitive centered */}
          <div className="flex justify-center border-t border-white/5 py-3">
            <div className="flex items-center space-x-3 px-4 py-2 rounded-lg bg-gray-800/50 border border-gray-700/50">
              <div className="flex items-center space-x-2">
                <svg className={`w-5 h-5 transition-colors duration-200 ${isPhotosensitivityEnabled ? "text-orange-400" : "text-gray-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="text-xs text-gray-400 font-medium">光敏模式</span>
              </div>
              <button
                onClick={handleTogglePhotosensitivity}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 ${
                  isPhotosensitivityEnabled ? "bg-orange-600 focus:ring-orange-500" : "bg-gray-600 focus:ring-gray-500"
                }`}
                title={isPhotosensitivityEnabled ? "禁用光敏模式" : "启用光敏模式"}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${isPhotosensitivityEnabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default VersionFooter;

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  title?: string;
  onTakeScreenshot?: () => void;
  isGeneratingImage?: boolean;
}

const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, url, title = "分享此链接", onTakeScreenshot, isGeneratingImage = false }) => {
  const [copied, setCopied] = useState(false);
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

  if (!shouldRender) return null;

  const handleCopyLink = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = url;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        textArea.remove();
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleShareFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, "_blank", "width=600,height=400");
  };

  const handleShareWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(title + " " + url)}`, "_blank");
  };

  const handleShareEmail = () => {
    window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}`;
  };

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      style={{
        opacity: isVisible ? 1 : 0,
        transition: "opacity 300ms ease-in-out",
      }}
      onClick={handleClose}
    >
      <div
        className="bg-slate-800 rounded-none shadow-2xl w-full max-w-md p-6 relative"
        style={{
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? "scale(1)" : "scale(0.95)",
          transition: "opacity 300ms ease-in-out, transform 300ms ease-in-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={handleClose} className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors" aria-label="Close">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-xl font-semibold text-white mb-4">分享星门链接</h2>

        <div className="mb-6">
          <div className="flex items-center gap-2 p-3 bg-slate-700/50 rounded-lg">
            <input type="text" value={url} readOnly className="flex-1 bg-transparent text-gray-300 outline-none text-sm" />
            <button onClick={handleCopyLink} className={`px-3 py-1 rounded transition-all ${copied ? "bg-green-600 text-white" : "bg-slate-600 hover:bg-slate-500 text-gray-200"}`}>
              {copied ? "已复制!" : "复制"}
            </button>
          </div>
        </div>

        <div className={`grid ${onTakeScreenshot ? "grid-cols-3" : "grid-cols-3"} gap-3`}>
          <button onClick={handleShareFacebook} className="flex flex-col items-center gap-2 p-3 rounded-lg bg-slate-700/50 hover:bg-slate-700 transition-colors group">
            <svg className="w-6 h-6 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
            <span className="text-xs text-gray-400 group-hover:text-gray-300">Facebook</span>
          </button>

          <button onClick={handleShareWhatsApp} className="flex flex-col items-center gap-2 p-3 rounded-lg bg-slate-700/50 hover:bg-slate-700 transition-colors group">
            <svg className="w-6 h-6 text-green-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.149-.67.149-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
            </svg>
            <span className="text-xs text-gray-400 group-hover:text-gray-300">WhatsApp</span>
          </button>

          <button onClick={handleShareEmail} className="flex flex-col items-center gap-2 p-3 rounded-lg bg-slate-700/50 hover:bg-slate-700 transition-colors group">
            <svg className="w-6 h-6 text-gray-400 group-hover:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span className="text-xs text-gray-400 group-hover:text-gray-300">Email</span>
          </button>

          {onTakeScreenshot && (
            <button onClick={onTakeScreenshot} disabled={isGeneratingImage} className={`flex flex-col items-center gap-2 p-3 rounded-lg transition-colors group ${isGeneratingImage ? "bg-slate-700/30 cursor-not-allowed opacity-50" : "bg-slate-700/50 hover:bg-slate-700"}`}>
              {isGeneratingImage ? (
                <>
                  <div className="w-6 h-6 border-2 border-gray-400 border-t-white rounded-full animate-spin" />
                  <span className="text-xs text-gray-500">Generating...</span>
                </>
              ) : (
                <>
                  <svg className="w-6 h-6 text-purple-400 group-hover:text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-xs text-purple-400 group-hover:text-purple-300">Screenshot</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ShareModal;

"use client";

import React, { useRef, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

interface CameraCaptureProps {
  onCapture: (base64: string, mimeType: string) => void;
  isLoading?: boolean;
}

export default function CameraCapture({ onCapture, isLoading }: CameraCaptureProps) {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setError(null);

    // Client-side resize using canvas
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.src = url;

    img.onload = () => {
      URL.revokeObjectURL(url);
      
      let width = img.width;
      let height = img.height;
      
      const MAX_DIMENSION = 1200;

      if (width > height && width > MAX_DIMENSION) {
        height *= MAX_DIMENSION / width;
        width = MAX_DIMENSION;
      } else if (height > MAX_DIMENSION) {
        width *= MAX_DIMENSION / height;
        height = MAX_DIMENSION;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setError("Could not resize image.");
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      
      // Export as jpeg, 0.8 quality
      const mimeType = "image/jpeg";
      const dataUrl = canvas.toDataURL(mimeType, 0.8);
      
      // Extract base64 without prefix
      const base64 = dataUrl.split(",")[1];
      onCapture(base64, mimeType);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError("Failed to load image.");
    };
  };

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={fileInputRef}
        onChange={handleCapture}
        className="hidden"
      />
      
      {error && (
        <div className="text-red-400 bg-red-950/50 px-4 py-2 rounded-lg border border-red-500/30 text-sm">
          {error}
        </div>
      )}

      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={isLoading}
        className={`relative group w-full overflow-hidden rounded-2xl p-[1px] transition-all duration-300 ${
          isLoading ? "opacity-70 cursor-not-allowed" : "hover:scale-[1.02] active:scale-[0.98]"
        }`}
      >
        <span className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl opacity-70 group-hover:opacity-100 transition-opacity animate-pulse-glow" />
        <div className="relative glass-card flex items-center justify-center py-5 w-full bg-slate-900/90 rounded-2xl">
          <span className="text-lg font-semibold text-emerald-400 tracking-wide flex items-center gap-2">
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-emerald-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {t("analyzing")}
              </>
            ) : (
              <>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path>
                </svg>
                {t("takePhoto")}
              </>
            )}
          </span>
        </div>
      </button>
    </div>
  );
}

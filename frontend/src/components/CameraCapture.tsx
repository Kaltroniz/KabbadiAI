"use client";
import React, { useRef, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

export default function CameraCapture({
  onCapture,
  isLoading,
}: {
  onCapture: (b64: string, mime: string) => void;
  isLoading?: boolean;
}) {
  const { t, speak } = useLanguage();
  const ref = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1200;
      let { width, height } = img;
      if (Math.max(width, height) > MAX) {
        const r = MAX / Math.max(width, height);
        width *= r;
        height *= r;
      }
      const c = document.createElement("canvas");
      c.width = Math.round(width);
      c.height = Math.round(height);
      const ctx = c.getContext("2d");
      if (!ctx) { setError(t("scanFailed")); return; }
      ctx.drawImage(img, 0, 0, c.width, c.height);
      onCapture(c.toDataURL("image/jpeg", 0.8).split(",")[1], "image/jpeg");
    };
    img.onerror = () => { URL.revokeObjectURL(url); setError(t("scanFailed")); };
    img.src = url;
  };

  return (
    <div className="w-full">
      <input ref={ref} type="file" accept="image/*" capture="environment" onChange={handle} className="hidden" />
      {error && (
        <div className="mb-3 rounded-2xl px-4 py-3 font-semibold text-sm animate-fade-up"
          style={{ background: "rgba(127,0,0,0.3)", border: "1px solid rgba(220,38,38,0.4)", color: "#fca5a5" }}>
          ⚠ {error}
        </div>
      )}
      <button
        id="camera-capture-btn"
        onClick={() => { speak(t("takePhoto")); ref.current?.click(); }}
        disabled={isLoading}
        className={`camera-btn ${isLoading ? "" : "scanline-effect"}`}
      >
        {/* Corner brackets */}
        <span className="camera-corner tl" />
        <span className="camera-corner tr" />
        <span className="camera-corner bl" />
        <span className="camera-corner br" />

        {isLoading ? (
          <>
            {/* Orbit loader */}
            <div style={{ position: "relative", width: 48, height: 48 }}>
              <div style={{
                width: 48, height: 48, borderRadius: "50%",
                border: "2px solid rgba(0,229,160,0.2)",
                position: "absolute", inset: 0,
              }} />
              <div className="orbit-dot" />
              <div className="orbit-dot" />
              <div className="orbit-dot" />
            </div>
            <span className="text-xl font-bold" style={{ color: "var(--emerald-glow)" }}>
              {t("analyzing")}
            </span>
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>
              AI is processing your image…
            </span>
          </>
        ) : (
          <>
            <span className="camera-icon">📷</span>
            <span className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
              {t("takePhoto")}
            </span>
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>
              Tap to scan e-waste
            </span>
          </>
        )}
      </button>
    </div>
  );
}

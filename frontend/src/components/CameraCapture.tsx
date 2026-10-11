"use client";
import React, { useRef, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

export default function CameraCapture({
  onCapture,
  capturedImage,
  onClearCapture,
  isLoading,
}: {
  onCapture: (b64: string, mime: string) => void;
  capturedImage?: { b64: string; mime: string } | null;
  onClearCapture?: () => void;
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

      {capturedImage && !isLoading ? (
        <div
          className="relative rounded-2xl overflow-hidden animate-scale-pop"
          style={{
            background: "rgba(15, 23, 20, 0.85)",
            border: "1.5px solid rgba(0, 229, 160, 0.4)",
            boxShadow: "0 8px 30px rgba(0, 229, 160, 0.15)",
            padding: "12px",
          }}
        >
          <div
            style={{
              position: "relative",
              width: "100%",
              height: 220,
              borderRadius: 14,
              overflow: "hidden",
              background: "#080c0a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:${capturedImage.mime};base64,${capturedImage.b64}`}
              alt="Captured e-waste lot"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
            {/* Status badge */}
            <div
              style={{
                position: "absolute",
                top: 10,
                left: 10,
                background: "rgba(0, 229, 160, 0.95)",
                color: "#05130b",
                fontSize: "0.75rem",
                fontWeight: 800,
                padding: "3px 10px",
                borderRadius: 20,
                display: "flex",
                alignItems: "center",
                gap: 5,
                boxShadow: "0 2px 10px rgba(0,0,0,0.4)",
              }}
            >
              <span>✓</span>
              <span>{t("photoReady")}</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 12, width: "100%" }}>
            <button
              type="button"
              id="retake-photo-btn"
              onClick={() => { speak(t("takePhoto")); ref.current?.click(); }}
              style={{
                flex: "1 1 0%",
                minWidth: 0,
                height: 44,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                borderRadius: 14,
                background: "rgba(0, 229, 160, 0.1)",
                border: "1px solid rgba(0, 229, 160, 0.3)",
                color: "#00e5a0",
                fontSize: "0.82rem",
                fontWeight: 700,
                cursor: "pointer",
                padding: "0 10px",
                transition: "all 0.18s",
              }}
            >
              <span style={{ fontSize: "1rem" }}>📷</span>
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {t("retakePhoto")}
              </span>
            </button>
            {onClearCapture && (
              <button
                type="button"
                id="clear-photo-btn"
                onClick={onClearCapture}
                style={{
                  flex: "1 1 0%",
                  minWidth: 0,
                  height: 44,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  borderRadius: 14,
                  background: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  color: "#fca5a5",
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  padding: "0 10px",
                  transition: "all 0.18s",
                }}
              >
                <span style={{ fontSize: "1rem" }}>🗑</span>
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {t("deletePhoto")}
                </span>
              </button>
            )}
          </div>
        </div>
      ) : (
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
                {t("aiProcessingLot")}
              </span>
            </>
          ) : (
            <>
              <span className="camera-icon">📷</span>
              <span className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
                {t("takePhoto")}
              </span>
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                {t("tapToScanOrChoose")}
              </span>
            </>
          )}
        </button>
      )}
    </div>
  );
}

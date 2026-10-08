"use client";
import React, { useRef, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

export default function CameraCapture({ onCapture, isLoading }: { onCapture: (b64: string, mime: string) => void; isLoading?: boolean }) {
  const { t, speak } = useLanguage();
  const ref = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets the same photo be chosen again
    if (!file) return;
    setError(null);
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1200;
      let { width, height } = img;
      if (Math.max(width, height) > MAX) { const r = MAX / Math.max(width, height); width *= r; height *= r; }
      const c = document.createElement("canvas");
      c.width = Math.round(width); c.height = Math.round(height);
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
      {error && <div className="mb-3 rounded-xl bg-red-100 text-red-800 px-4 py-3 font-semibold">{error}</div>}
      <button
        onClick={() => { speak(t("takePhoto")); ref.current?.click(); }}
        disabled={isLoading}
        className="btn bg-emerald-700 text-white flex flex-col items-center justify-center gap-2 py-8 disabled:opacity-60"
      >
        <span className="text-6xl" aria-hidden>{isLoading ? "⏳" : "📷"}</span>
        <span className="text-2xl">{isLoading ? t("analyzing") : t("takePhoto")}</span>
      </button>
    </div>
  );
}

"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useState, useEffect } from "react";
import CameraCapture from "@/components/CameraCapture";
import ResultDisplay from "@/components/ResultDisplay";
import { useLanguage } from "@/contexts/LanguageContext";

export default function Home() {
  const { lang, setLang, t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  
  // Geolocation state
  const [coords, setCoords] = useState<{lat: number, lon: number} | null>(null);
  const [dealerOffer, setDealerOffer] = useState<string>("");

  const handleCapture = async (base64: string, mimeType: string) => {
    setLoading(true);
    setResult(null);

    let currentCoords = coords;
    if (!currentCoords && "geolocation" in navigator) {
      try {
        currentCoords = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
            (err) => resolve(null),
            { timeout: 5000, maximumAge: 60000 }
          );
        });
        if (currentCoords) setCoords(currentCoords);
      } catch (err) {
        console.log("Location failed", err);
      }
    }

    const payload: Record<string, unknown> = {
      image_b64: base64,
      media_type: mimeType,
      language: lang,
    };
    if (currentCoords) {
      payload.lat = currentCoords.lat;
      payload.lon = currentCoords.lon;
    }
    const offerNum = parseFloat(dealerOffer);
    if (!isNaN(offerNum) && offerNum > 0) {
      payload.dealer_offer_inr = offerNum;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 28000);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        throw new Error("API returned " + res.status);
      }
      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error(err);
      if (err.name === "AbortError") {
        setResult({ type: "clarify", clarify_message: "Request timed out. Please try again." });
      } else {
        setResult({ type: "clarify", clarify_message: t("scanFailed") });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen px-4 py-8 flex flex-col items-center">
      {/* Header */}
      <header className="w-full flex justify-between items-center mb-8">
        <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400 drop-shadow-sm">
          {t("title")}
        </h1>
        <div className="glass px-1 py-1 rounded-full flex gap-1">
          <button 
            onClick={() => setLang("en")} 
            className={`px-3 py-1 text-sm font-semibold rounded-full transition-colors ${lang === "en" ? "bg-emerald-500 text-slate-900" : "text-slate-400 hover:text-slate-200"}`}
          >
            EN
          </button>
          <button 
            onClick={() => setLang("hi")} 
            className={`px-3 py-1 text-sm font-semibold rounded-full transition-colors ${lang === "hi" ? "bg-emerald-500 text-slate-900" : "text-slate-400 hover:text-slate-200"}`}
          >
            HI
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="w-full flex-1 flex flex-col items-center max-w-sm w-full mx-auto">
        {!result && (
          <div className="flex flex-col items-center w-full animate-fade-in mt-8">
            <div className="w-24 h-24 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(16,185,129,0.15)]">
              <svg className="w-12 h-12 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path>
              </svg>
            </div>
            
            <p className="text-slate-400 text-center text-sm mb-10 px-4 leading-relaxed">
              {t("subtitle")}
            </p>

            <div className="w-full glass-card mb-8">
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                {t("enterOffer")}
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-medium">₹</span>
                <input 
                  type="number" 
                  value={dealerOffer}
                  onChange={(e) => setDealerOffer(e.target.value)}
                  placeholder="0"
                  className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl py-3 pl-8 pr-4 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 transition-colors"
                />
              </div>
            </div>

            <CameraCapture onCapture={handleCapture} isLoading={loading} />
          </div>
        )}

        {result && (
          <ResultDisplay result={result} onRetake={() => setResult(null)} />
        )}
      </div>
    </main>
  );
}

"use client";

import React, { useRef } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

interface ResultDisplayProps {
  result: Record<string, any>;
  onRetake: () => void;
}

export default function ResultDisplay({ result, onRetake }: ResultDisplayProps) {
  const { t } = useLanguage();
  const cardRef = useRef<HTMLDivElement>(null);

  if (result.type === "clarify") {
    return (
      <div className="glass-card flex flex-col items-center text-center gap-4 animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center text-red-400">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <p className="text-slate-300 font-medium">{result.clarify_message || t("errorLowConfidence")}</p>
        <button onClick={onRetake} className="mt-2 px-6 py-2 bg-slate-800 text-slate-200 rounded-full hover:bg-slate-700 transition">
          {t("retake")}
        </button>
      </div>
    );
  }

  const handleShare = async () => {
    if (!navigator.share) {
      alert("Sharing not supported on this browser.");
      return;
    }
    try {
      let text = `KabadiAI Appraisal:\nValue: ₹${result.total_min_inr} - ₹${result.total_max_inr}\nItems: ${(result.line_items as any[]).map(i=>i.component).join(', ')}\n`;
      if ((result.hazard_messages as any[])?.length > 0) text += `Hazards Present!\n`;
      text += `\n${t("disclaimer")}`;

      await navigator.share({
        title: 'KabadiAI E-Waste Report',
        text: text,
      });
    } catch (err) {
      console.error("Error sharing:", err);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full animate-fade-in pb-8">
      {/* Hazard Banner */}
      {result.hazard_messages && result.hazard_messages.length > 0 && (
        <div className="bg-red-950/80 border border-red-500/50 rounded-2xl p-4 shadow-[0_0_15px_rgba(239,68,68,0.2)]">
          <h3 className="text-red-400 font-bold flex items-center gap-2 mb-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            {t("hazardsDetected")}
          </h3>
          <ul className="list-disc list-inside text-red-200 text-sm space-y-1">
            {(result.hazard_messages as any[]).map((hm: any, idx: number) => (
              <li key={idx}>{hm.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Main Value Card */}
      <div ref={cardRef} className="glass-card relative overflow-hidden bg-slate-900/80">
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <svg className="w-24 h-24 text-emerald-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
        </div>
        
        <h2 className="text-slate-400 text-sm font-medium uppercase tracking-wider mb-1">{t("indicativeValue")}</h2>
        <div className="text-4xl font-black text-gradient mb-4">
          ₹{result.total_min_inr} - ₹{result.total_max_inr}
        </div>

        {result.verdict && (
          <div className="inline-block px-3 py-1 bg-slate-800 rounded-lg text-sm font-medium text-emerald-400 mb-6 border border-emerald-500/20">
            {result.verdict === "low" ? t("verdictLow") : result.verdict === "high" ? t("verdictHigh") : t("verdictFair")}
          </div>
        )}

        <div className="border-t border-slate-700/50 pt-4 mt-2">
          <h3 className="text-slate-300 font-semibold mb-3 text-sm uppercase tracking-wide">{t("itemsFound")}</h3>
          <div className="space-y-3">
            {(result.line_items as any[])?.map((item: any, i: number) => (
              <div key={i} className="flex justify-between items-center text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-slate-600"></span>
                  <span className="text-slate-200 capitalize">{item.component.replace(/_/g, ' ')}</span>
                  <span className="text-slate-500">x{item.count}</span>
                </div>
                <div className="text-slate-400 font-mono">
                  ₹{item.min_inr}-{item.max_inr}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button onClick={handleShare} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 px-4 rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all flex justify-center items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
          {t("shareWhatsApp")}
        </button>
        <button onClick={onRetake} className="bg-slate-800 text-slate-300 hover:bg-slate-700 py-3 px-6 rounded-xl font-medium transition-colors">
          {t("retake")}
        </button>
      </div>

      {/* Recyclers List */}
      {result.recyclers && result.recyclers.length > 0 && (
        <div className="mt-4">
          <h3 className="text-slate-300 font-semibold mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            {t("nearestRecyclers")}
          </h3>
          <div className="space-y-3">
            {(result.recyclers as any[]).map((r: any) => (
              <a key={r.id} href={r.directions_url} target="_blank" rel="noopener noreferrer" className="block glass-card !p-4 hover:border-blue-500/30 group">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-slate-200 font-medium group-hover:text-blue-400 transition-colors">{r.name}</h4>
                    <p className="text-slate-500 text-xs mt-1 leading-relaxed">{r.address}</p>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <div className="text-blue-400 font-bold">{r.distance_km}</div>
                    <div className="text-slate-500 text-[10px] uppercase tracking-wider">{t("kmAway")}</div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
      
      <p className="text-xs text-slate-600 text-center mt-4 pb-8 max-w-[280px] mx-auto">
        {t("disclaimer")}
      </p>
    </div>
  );
}

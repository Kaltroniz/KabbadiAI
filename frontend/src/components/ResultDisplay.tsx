"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { useLanguage } from "@/contexts/LanguageContext";

export default function ResultDisplay({ result, onRetake }: { result: any; onRetake: () => void }) {
  const { t, lang } = useLanguage();
  const name = (c: string) => {
    const k = "c_" + c;
    const v = t(k as any);
    return v === k ? c.replace(/_/g, " ") : v;
  };
  const speak = (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === "hi" ? "hi-IN" : "en-IN";
    window.speechSynthesis.speak(u);
  };
  const Listen = ({ text }: { text: string }) => (
    <button onClick={() => speak(text)} className="px-3 py-1 rounded-full bg-slate-800 text-slate-200 text-sm" aria-label={t("listen")}>
      🔊 {t("listen")}
    </button>
  );

  if (result.type === "clarify") {
    return (
      <div className="glass-card flex flex-col items-center text-center gap-4 animate-fade-in">
        <div className="text-5xl">📷</div>
        <p className="text-slate-200 font-medium text-lg">{t("errorLowConfidence")}</p>
        <Listen text={t("errorLowConfidence")} />
        <button onClick={onRetake} className="w-full py-4 bg-emerald-600 text-white rounded-2xl text-lg font-semibold">{t("retake")}</button>
      </div>
    );
  }

  const lo = Math.round(result.total_min_inr || 0), hi = Math.round(result.total_max_inr || 0);
  const hazards: any[] = result.hazard_messages || [];
  const hazardText = [...hazards.map((h) => h.message), hazards.length ? result.general_warning : ""].filter(Boolean).join(" ");
  const summary = `${t("indicativeValue")}: ₹${lo} ${t("to")} ₹${hi}.`;
  const verdictKey = result.verdict === "low" ? "verdictLow" : result.verdict === "high" ? "verdictHigh" : "verdictFair";

  const shareText = [
    `KabadiAI: ${summary}`,
    ...(result.line_items || []).map((i: any) => `${name(i.component)} x${i.count}: ~${i.est_weight_g} g`),
    ...hazards.map((h) => "⚠ " + h.message),
    t("disclaimer"),
  ].join("\n");
  const share = async () => {
    try {
      if (navigator.share) { await navigator.share({ title: "KabadiAI", text: shareText }); return; }
    } catch (e: any) {
      if (e?.name === "AbortError") return;
    }
    window.open("https://wa.me/?text=" + encodeURIComponent(shareText), "_blank");
  };

  return (
    <div className="flex flex-col gap-5 w-full animate-fade-in pb-8">
      {result.mock && (
        <div className="bg-amber-900/80 border border-amber-400/60 text-amber-100 rounded-xl p-3 text-center font-bold">{t("mockBanner")}</div>
      )}

      {hazards.length > 0 && (
        <div className="bg-red-950/90 border border-red-500/60 rounded-2xl p-4">
          <h3 className="text-red-300 font-bold text-lg mb-2">⚠ {t("hazardsDetected")}</h3>
          <ul className="list-disc list-inside text-red-100 space-y-1">
            {hazards.map((h, i) => <li key={i}>{h.message}</li>)}
          </ul>
          <p className="text-red-200 text-sm mt-2">{result.general_warning}</p>
          <div className="mt-3"><Listen text={hazardText} /></div>
        </div>
      )}

      <div className="glass-card bg-slate-900/80">
        <h2 className="text-slate-400 text-sm font-medium uppercase tracking-wider mb-1">{t("indicativeValue")}</h2>
        <div className="text-4xl font-black text-gradient mb-3">₹{lo} - ₹{hi}</div>
        <Listen text={summary} />
        {result.verdict && (
          <div className="mt-4 px-3 py-2 bg-slate-800 rounded-lg text-sm font-medium text-emerald-300 border border-emerald-500/20">{t(verdictKey as any)}</div>
        )}
        <div className="border-t border-slate-700/50 pt-4 mt-4">
          <h3 className="text-slate-300 font-semibold mb-3 text-sm uppercase tracking-wide">{t("itemsFound")}</h3>
          <div className="space-y-3">
            {(result.line_items || []).map((item: any, i: number) => (
              <div key={i} className="flex justify-between items-center">
                <div>
                  <span className="text-slate-100">{name(item.component)}</span>
                  <span className="text-slate-500 text-sm"> x{item.count} · ~{item.est_weight_g} g</span>
                </div>
                <div className="text-slate-300 font-mono text-sm">{item.hazardous ? "—" : `₹${Math.round(item.min_inr)}-${Math.round(item.max_inr)}`}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={share} className="flex-1 bg-emerald-600 text-white font-semibold py-4 rounded-2xl text-lg">{t("shareWhatsApp")}</button>
        <button onClick={onRetake} className="bg-slate-800 text-slate-200 py-4 px-5 rounded-2xl font-medium">{t("retake")}</button>
      </div>

      {result.recyclers?.length > 0 && (
        <div>
          <h3 className="text-slate-300 font-semibold mb-3">📍 {t("nearestRecyclers")}</h3>
          <div className="space-y-3">
            {result.recyclers.map((r: any) => (
              <a key={r.id} href={r.directions_url} target="_blank" rel="noopener noreferrer" className="block glass-card !p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-slate-100 font-medium">{r.name}</h4>
                    <p className="text-slate-500 text-xs mt-1">{r.address}</p>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <div className="text-blue-400 font-bold">{r.distance_km}</div>
                    <div className="text-slate-500 text-[10px] uppercase">{t("kmAway")}</div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
      <p className="text-xs text-slate-500 text-center pb-8 max-w-[300px] mx-auto">{t("disclaimer")}</p>
    </div>
  );
}

"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { useLanguage } from "@/contexts/LanguageContext";

const ICON: Record<string, string> = {
  motherboard: "🧩", ram_stick: "💾", mobile_pcb: "📱", li_ion_battery: "🔋", alkaline_battery: "🪫", copper_wire: "➰",
  charger_adapter: "🔌", hard_drive: "💽", aluminium_heatsink: "🔩", power_supply: "⚡", printer: "🖨️", crt_monitor_or_tv: "📺",
  lcd_led_monitor_or_tv: "🖥️", cfl_or_tube_light: "💡", router_or_modem: "📡", remote: "🎛️", laptop: "💻", desktop_cpu: "🗄️",
  mobile_phone: "📱", lead_acid_battery: "🔋", ups_unit: "🔌", copper_scrap: "🟠", split_ac: "❄️", window_ac: "❄️",
  refrigerator: "🧊", washing_machine: "🧺", microwave: "🍲", other: "📦",
};

export default function ResultDisplay({ result, onRetake }: { result: any; onRetake: () => void }) {
  const { t, speak } = useLanguage();
  const name = (c: string) => { const v = t("c_" + c); return v === "c_" + c ? c.replace(/_/g, " ") : v; };
  const Speak = ({ text }: { text: string }) => (
    <button onClick={() => speak(text)} aria-label={t("listen")} className="h-14 px-5 rounded-full bg-white/90 text-stone-900 text-xl font-bold">🔊 {t("listen")}</button>
  );

  if (result.type === "clarify" || result.type === "error") {
    const msg = t(result.type === "error" ? "scanFailed" : "errorLowConfidence");
    return (
      <div className="card flex flex-col items-center text-center gap-4 animate-fade-in">
        <div className="text-6xl">{result.type === "error" ? "📶" : "📷"}</div>
        <p className="text-xl font-semibold">{msg}</p>
        <Speak text={msg} />
        <button onClick={onRetake} className="btn bg-emerald-700 text-white">{t("retake")}</button>
      </div>
    );
  }

  const lo = Math.round(result.total_min_inr || 0), hi = Math.round(result.total_max_inr || 0);
  const codes: string[] = (result.hazard_messages || []).map((h: any) => h.hazard_code);
  const hazardTexts = (result.hazard_messages || []).map((h: any) => { const v = t("h_" + h.hazard_code); return v === "h_" + h.hazard_code ? h.message : v; });
  const hazardSpeech = [...hazardTexts, codes.length ? t("g_general") : ""].filter(Boolean).join(" ");
  const summary = `${t("indicativeValue")}: ₹${lo} ${t("to")} ₹${hi}.`;
  const V: Record<string, [string, string, string]> = {
    low: ["verdictLow", "bg-red-700", "😟"], fair: ["verdictFair", "bg-emerald-700", "🙂"], high: ["verdictHigh", "bg-sky-700", "🤔"] };

  const shareText = [`KabadiAI: ${summary}`,
    ...(result.line_items || []).map((i: any) => `${name(i.component)} x${i.count}: ~${i.est_weight_g} g`),
    ...hazardTexts.map((h: string) => "⚠ " + h), t("disclaimer")].join("\n");
  const share = async () => {
    try { if (navigator.share) { await navigator.share({ title: "KabadiAI", text: shareText }); return; } }
    catch (e: any) { if (e?.name === "AbortError") return; }
    window.open("https://wa.me/?text=" + encodeURIComponent(shareText), "_blank");
  };

  return (
    <div className="flex flex-col gap-5 pb-8 animate-fade-in">
      {result.mock && <div className="rounded-xl bg-amber-300 text-stone-900 p-3 text-center font-extrabold">{t("mockBanner")}</div>}

      {codes.length > 0 && (
        <div className="rounded-2xl bg-red-700 text-white p-5">
          <h3 className="text-2xl font-extrabold mb-2">⚠ {t("hazardsDetected")}</h3>
          <ul className="space-y-2 text-xl">{hazardTexts.map((h: string, i: number) => <li key={i}>• {h}</li>)}</ul>
          <p className="mt-3 text-lg opacity-95">{t("g_general")}</p>
          <div className="mt-4"><Speak text={hazardSpeech} /></div>
        </div>
      )}

      <div className="card">
        <div className="text-stone-500 font-semibold">{t("indicativeValue")}</div>
        <div className="text-5xl font-black text-emerald-800 my-2">₹{lo}–{hi}</div>
        <button onClick={() => speak(summary)} aria-label={t("listen")} className="h-14 px-5 rounded-full bg-stone-200 text-xl font-bold">🔊 {t("listen")}</button>
        <p className="text-xs text-stone-500 mt-3">{t("priceNote")}</p>
      </div>

      {result.verdict && V[result.verdict] && (
        <div className={`rounded-2xl text-white p-5 flex items-center gap-4 ${V[result.verdict][1]}`}>
          <span className="text-5xl">{V[result.verdict][2]}</span>
          <p className="text-xl font-bold flex-1">{t(V[result.verdict][0])}</p>
          <button onClick={() => speak(t(V[result.verdict][0]))} aria-label={t("listen")} className="w-14 h-14 rounded-full bg-white/90 text-2xl">🔊</button>
        </div>
      )}

      <div className="card">
        <h3 className="font-bold text-lg mb-3">{t("itemsFound")}</h3>
        <div className="space-y-3">
          {(result.line_items || []).map((it: any, i: number) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-4xl w-12 text-center">{ICON[it.component] || "📦"}</span>
              <div className="flex-1">
                <div className="text-lg font-semibold">{name(it.component)} <span className="text-stone-500 font-normal">x{it.count}</span></div>
                <div className="text-stone-500 text-sm">~{it.est_weight_g} g</div>
              </div>
              <div className="text-lg font-bold">{it.hazardous ? "⚠" : it.priced === false ? t("priceUnknown") : `₹${Math.round(it.min_inr)}–${Math.round(it.max_inr)}`}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={share} className="btn bg-green-600 text-white flex-1">💬 {t("shareWhatsApp")}</button>
        <button onClick={onRetake} className="btn bg-stone-800 text-white !w-auto px-6">📷</button>
      </div>

      {result.recyclers?.length > 0 && (
        <div>
          <h3 className="font-bold text-lg mb-3">📍 {t("nearestRecyclers")}</h3>
          <div className="space-y-3">
            {result.recyclers.map((r: any) => (
              <a key={r.id} href={r.directions_url} target="_blank" rel="noopener noreferrer" className="card !p-4 flex items-center gap-3 block">
                <div className="flex-1"><div className="font-bold text-lg">{r.name}</div><div className="text-stone-500 text-sm">{r.address}</div></div>
                <div className="text-right"><div className="text-2xl font-black text-sky-700">{r.distance_km}</div><div className="text-xs text-stone-500">{t("kmAway")}</div></div>
              </a>
            ))}
          </div>
        </div>
      )}
      <p className="text-xs text-stone-500 text-center">{t("disclaimer")}</p>
    </div>
  );
}

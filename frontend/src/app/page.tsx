"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState } from "react";
import CameraCapture from "@/components/CameraCapture";
import ResultDisplay from "@/components/ResultDisplay";
import { useLanguage, LANGS } from "@/contexts/LanguageContext";

export default function Home() {
  const { lang, setLang, t, speak } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [offer, setOffer] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (p) => setCoords({ lat: p.coords.latitude, lon: p.coords.longitude }), () => {}, { timeout: 10000, maximumAge: 60000 });
  }, []);

  const onCapture = async (b64: string, mime: string) => {
    setLoading(true); setResult(null);
    const payload: any = { image_b64: b64, media_type: mime, language: lang };
    if (coords) { payload.lat = coords.lat; payload.lon = coords.lon; }
    const n = parseFloat(offer);
    if (n > 0) payload.dealer_offer_inr = n;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 40000);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/agent`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: ctrl.signal });
      if (!res.ok) throw new Error(String(res.status));
      setResult(await res.json());
    } catch { setResult({ type: "error" }); }
    finally { clearTimeout(timer); setLoading(false); }
  };

  return (
    <main className="px-4 pt-4 pb-10 animate-fade-in">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-3xl font-extrabold text-emerald-800">♻ {t("title")}</h1>
        <button onClick={() => speak(t("help"))} aria-label="Help" className="w-14 h-14 rounded-full bg-amber-400 text-3xl font-black">?</button>
      </header>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-5" role="radiogroup">
        {LANGS.map((l) => (
          <button key={l.code} role="radio" aria-checked={lang === l.code} onClick={() => setLang(l.code)}
            className={`shrink-0 px-5 rounded-full text-xl font-bold border-2 ${lang === l.code ? "bg-emerald-700 text-white border-emerald-700" : "bg-white text-stone-800 border-stone-300"}`}>
            {l.label}
          </button>
        ))}
      </div>

      {!result ? (
        <>
          <div className="flex items-start gap-3 mb-5">
            <p className="text-xl leading-snug font-medium flex-1">{t("subtitle")}</p>
            <button onClick={() => speak(t("subtitle"))} aria-label={t("listen")} className="w-14 h-14 rounded-full bg-stone-200 text-2xl shrink-0">🔊</button>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center mb-6">
            {[["📷", "step1"], ["🔍", "step2"], ["₹", "step3"]].map(([icon, k]) => (
              <div key={k} className="card !p-3"><div className="text-4xl">{icon}</div><div className="font-bold mt-1">{t(k)}</div></div>
            ))}
          </div>
          <CameraCapture onCapture={onCapture} isLoading={loading} />
          <label className="block mt-7 mb-2 text-lg font-semibold" htmlFor="offer">{t("enterOffer")}</label>
          <div className="flex items-center gap-2 card !p-3">
            <span className="text-3xl font-bold">₹</span>
            <input id="offer" inputMode="numeric" pattern="[0-9]*" value={offer} placeholder="0"
              onChange={(e) => setOffer(e.target.value.replace(/[^0-9]/g, ""))}
              className="w-full text-3xl font-bold bg-transparent outline-none" />
          </div>
        </>
      ) : (
        <ResultDisplay result={result} onRetake={() => setResult(null)} />
      )}
    </main>
  );
}

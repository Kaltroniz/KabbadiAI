"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

const ICON: Record<string, string> = {
  motherboard: "🧩", ram_stick: "💾", mobile_pcb: "📱", li_ion_battery: "🔋", alkaline_battery: "🪫",
  copper_wire: "➰", charger_adapter: "🔌", hard_drive: "💽", aluminium_heatsink: "🔩",
  power_supply: "⚡", printer: "🖨️", crt_monitor_or_tv: "📺", lcd_led_monitor_or_tv: "🖥️",
  cfl_or_tube_light: "💡", router_or_modem: "📡", remote: "🎛️", laptop: "💻", desktop_cpu: "🗄️",
  mobile_phone: "📱", lead_acid_battery: "🔋", ups_unit: "🔌", copper_scrap: "🟠",
  split_ac: "❄️", window_ac: "❄️", refrigerator: "🧊", washing_machine: "🧺",
  microwave: "🍲", other: "📦",
};

function AnimatedPrice({ lo, hi }: { lo: number; hi: number }) {
  const [display, setDisplay] = useState({ lo: 0, hi: 0 });
  useEffect(() => {
    const duration = 800;
    const steps = 40;
    const interval = duration / steps;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      const progress = step / steps;
      const ease = 1 - Math.pow(1 - progress, 3);
      setDisplay({ lo: Math.round(lo * ease), hi: Math.round(hi * ease) });
      if (step >= steps) clearInterval(timer);
    }, interval);
    return () => clearInterval(timer);
  }, [lo, hi]);
  return (
    <div className="price-badge price-reveal">
      ₹{display.lo.toLocaleString("en-IN")}–{display.hi.toLocaleString("en-IN")}
    </div>
  );
}

function AnimatedBar({ percent }: { percent: number }) {
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      if (barRef.current) barRef.current.style.width = `${percent}%`;
    }, 100);
    return () => clearTimeout(t);
  }, [percent]);
  return (
    <div className="result-bar-track">
      <div ref={barRef} className="result-bar-fill" style={{ width: "0%", transition: "width 1.1s cubic-bezier(.22,1,.36,1)" }} />
    </div>
  );
}

export default function ResultDisplay({ result, onRetake }: { result: any; onRetake: () => void }) {
  const { t, speak } = useLanguage();
  const name = (c: string) => { const v = t("c_" + c); return v === "c_" + c ? c.replace(/_/g, " ") : v; };

  const SpeakBtn = ({ text, id }: { text: string; id: string }) => (
    <button
      id={id}
      onClick={() => speak(text)}
      aria-label={t("listen")}
      className="btn btn-ghost !min-h-0 !rounded-full px-4 !h-11 text-base !w-auto flex items-center gap-2"
    >
      🔊 <span>{t("listen")}</span>
    </button>
  );

  /* ── OFFLINE ── */
  if (result.type === "offline") {
    return (
      <div className="card flex flex-col items-center text-center gap-5 animate-scale-pop" style={{ border: "1px solid rgba(251,191,36,0.35)" }}>
        <div style={{ fontSize: "4rem", animation: "float 3s ease-in-out infinite" }}>📡</div>
        <div>
          <h2 className="text-2xl font-black" style={{ color: "#fbbf24" }}>Saved to queue</h2>
          <p className="text-sm mt-2 leading-relaxed" style={{ color: "var(--text-muted)" }}>
            You are currently <strong style={{ color: "#fbbf24" }}>offline</strong>. Your photo has been saved to the on-device queue.
          </p>
        </div>
        {/* Auto-sync info pill */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)",
          borderRadius: 14, padding: "0.65rem 1rem", width: "100%",
        }}>
          <span style={{ fontSize: "1.3rem" }}>⟳</span>
          <p style={{ color: "rgba(251,191,36,0.85)", fontSize: "0.78rem", margin: 0, textAlign: "left" }}>
            <strong>Auto-sync is enabled.</strong> As soon as your connection returns, KabadiAI will automatically analyse and display the result.
          </p>
        </div>
        <button id="offline-retake-btn" onClick={onRetake} className="btn btn-ghost w-full" style={{ borderRadius: 18 }}>
          📷 Scan another item
        </button>
      </div>
    );
  }

  /* ── ERROR / CLARIFY ── */
  if (result.type === "clarify" || result.type === "error") {
    const msg = t(result.type === "error" ? "scanFailed" : "errorLowConfidence");
    return (
      <div className="card flex flex-col items-center text-center gap-5 animate-scale-pop">
        <div className="text-6xl animate-float">{result.type === "error" ? "📶" : "📷"}</div>
        <p className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>{msg}</p>
        <SpeakBtn text={msg} id="error-listen-btn" />
        <button id="error-retake-btn" onClick={onRetake} className="btn btn-primary w-full">
          {t("retake")}
        </button>
      </div>
    );
  }

  /* ── MAIN RESULT ── */
  const lo = Math.round(result.total_min_inr || 0);
  const hi = Math.round(result.total_max_inr || 0);
  const codes: string[] = (result.hazard_messages || []).map((h: any) => h.hazard_code);
  const hazardTexts = (result.hazard_messages || []).map((h: any) => {
    const v = t("h_" + h.hazard_code);
    return v === "h_" + h.hazard_code ? h.message : v;
  });
  const hazardSpeech = [...hazardTexts, codes.length ? t("g_general") : ""].filter(Boolean).join(" ");
  const summary = `${t("indicativeValue")}: ₹${lo} ${t("to")} ₹${hi}.`;

  const VERDICT: Record<string, [string, string, string]> = {
    low:  ["verdictLow",  "rgba(127,0,0,0.5)",   "😟"],
    fair: ["verdictFair", "rgba(4,100,60,0.5)",   "🙂"],
    high: ["verdictHigh", "rgba(3,60,110,0.5)",   "🤔"],
  };
  const VERDICT_GLOW: Record<string, string> = {
    low:  "rgba(220,38,38,0.3)",
    fair: "rgba(0,229,160,0.25)",
    high: "rgba(56,189,248,0.25)",
  };

  const shareText = [
    `KabadiAI: ${summary}`,
    ...(result.line_items || []).map((i: any) => `${name(i.component)} x${i.count}: ~${i.est_weight_g} g`),
    ...hazardTexts.map((h: string) => "⚠ " + h),
    t("disclaimer"),
  ].join("\n");

  const share = async () => {
    try {
      if (navigator.share) { await navigator.share({ title: "KabadiAI", text: shareText }); return; }
    } catch (e: any) { if (e?.name === "AbortError") return; }
    window.open("https://wa.me/?text=" + encodeURIComponent(shareText), "_blank");
  };

  return (
    <div className="flex flex-col gap-4 pb-8 stagger-children">

      {/* Mock banner */}
      {result.mock && (
        <div className="rounded-2xl px-4 py-3 text-center font-extrabold text-sm"
          style={{ background: "rgba(120,80,0,0.4)", border: "1px solid rgba(245,158,11,0.4)", color: "#fcd34d" }}>
          ⚠ {t("mockBanner")}
        </div>
      )}

      {/* Hazard banner */}
      {codes.length > 0 && (
        <div className="hazard-banner">
          <h3 className="text-xl font-extrabold mb-2" style={{ color: "#fca5a5" }}>⚠ {t("hazardsDetected")}</h3>
          <ul className="space-y-2 text-base">
            {hazardTexts.map((h: string, i: number) => (
              <li key={i} className="flex items-start gap-2" style={{ color: "#fecaca" }}>
                <span>•</span><span>{h}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm" style={{ color: "rgba(254,202,202,0.8)" }}>{t("g_general")}</p>
          <div className="mt-4">
            <SpeakBtn text={hazardSpeech} id="hazard-listen-btn" />
          </div>
        </div>
      )}

      {/* Price card */}
      <div className="card animate-scale-pop">
        <div className="text-sm font-semibold mb-1" style={{ color: "var(--text-muted)" }}>
          {t("indicativeValue")}
        </div>
        <AnimatedPrice lo={lo} hi={hi} />
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <SpeakBtn text={summary} id="price-listen-btn" />
          <span className="pill">AI Estimate</span>
        </div>
        <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>{t("priceNote")}</p>
      </div>

      {/* Verdict card */}
      {result.verdict && VERDICT[result.verdict] && (
        <div className="card"
          style={{
            background: VERDICT[result.verdict][1],
            boxShadow: `0 0 40px ${VERDICT_GLOW[result.verdict]}, 0 8px 32px rgba(0,0,0,0.4)`,
          }}
        >
          <div className="flex items-center gap-4">
            <span className="text-5xl animate-float">{VERDICT[result.verdict][2]}</span>
            <p className="text-lg font-bold flex-1" style={{ color: "var(--text-primary)" }}>
              {t(VERDICT[result.verdict][0])}
            </p>
            <button
              id="verdict-listen-btn"
              onClick={() => speak(t(VERDICT[result.verdict][0]))}
              aria-label={t("listen")}
              className="btn btn-ghost !min-h-0 !w-12 !h-12 !rounded-full !p-0 flex items-center justify-center text-xl"
            >
              🔊
            </button>
          </div>
        </div>
      )}

      {/* Line items */}
      <div className="card">
        <h3 className="font-bold text-base mb-4" style={{ color: "var(--text-muted)" }}>
          {t("itemsFound")}
        </h3>
        <div className="space-y-4">
          {(result.line_items || []).map((it: any, i: number) => {
            const total = result.total_max_inr || 1;
            const pct = Math.min(100, ((it.max_inr || 0) / total) * 100);
            return (
              <div key={i} className="animate-fade-up" style={{ animationDelay: `${i * 0.07}s` }}>
                <div className="flex items-center gap-3">
                  <span className="text-3xl w-10 text-center">{ICON[it.component] || "📦"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                      {name(it.component)}{" "}
                      <span className="text-sm font-normal" style={{ color: "var(--text-muted)" }}>×{it.count}</span>
                    </div>
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>~{it.est_weight_g} g</div>
                    {!it.hazardous && it.priced !== false && (
                      <AnimatedBar percent={pct} />
                    )}
                  </div>
                  <div className="text-base font-bold shrink-0" style={{ color: it.hazardous ? "#fca5a5" : "var(--emerald-glow)" }}>
                    {it.hazardous ? "⚠" : it.priced === false ? t("priceUnknown") : `₹${Math.round(it.min_inr)}–${Math.round(it.max_inr)}`}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button id="share-whatsapp-btn" onClick={share} className="btn btn-primary flex-1 flex items-center justify-center gap-2">
          💬 {t("shareWhatsApp")}
        </button>
        <button id="retake-btn" onClick={onRetake} className="btn btn-ghost !w-auto px-5 flex items-center justify-center">
          📷
        </button>
      </div>

      {/* Nearby recyclers */}
      {result.recyclers?.length > 0 && (
        <div>
          <h3 className="font-bold text-base mb-3" style={{ color: "var(--text-muted)" }}>
            📍 {t("nearestRecyclers")}
          </h3>
          <div className="space-y-3 stagger-children">
            {result.recyclers.map((r: any) => (
              <a
                key={r.id}
                href={r.directions_url}
                target="_blank"
                rel="noopener noreferrer"
                className="card !p-4 flex items-center gap-3 no-underline block"
                style={{ textDecoration: "none" }}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-base" style={{ color: "var(--text-primary)" }}>{r.name}</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{r.address}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-2xl font-black" style={{ color: "#38bdf8" }}>{r.distance_km}</div>
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>{t("kmAway")}</div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>{t("disclaimer")}</p>
    </div>
  );
}

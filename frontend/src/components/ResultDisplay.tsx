"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { useGamification } from "@/contexts/GamificationContext";
import { useAuth } from "@/contexts/AuthContext";

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

export default function ResultDisplay({
  result,
  onRetake,
  onSync,
  remainingQueueCount = 0,
}: {
  result: any;
  onRetake: () => void;
  onSync?: () => void;
  remainingQueueCount?: number;
}) {
  const { t, speak } = useLanguage();
  const { level } = useGamification();
  const { user } = useAuth();
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
    const lot = result.queuedLot;
    const count = result.queuedCount ?? 1;
    return (
      <div className="card flex flex-col items-center text-center gap-5 animate-scale-pop" style={{ border: "1px solid rgba(251,191,36,0.35)" }}>
        <div style={{ fontSize: "3.5rem", animation: "float 3s ease-in-out infinite" }}>📡</div>
        <div>
          <h2 className="text-2xl font-black" style={{ color: "#fbbf24" }}>Saved to Device Queue</h2>
          <p className="text-sm mt-1.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>
            You are currently <strong style={{ color: "#fbbf24" }}>offline</strong>. Your lot was safely stored in local memory.
          </p>
        </div>

        {/* Thumbnail & lot metadata preview if available */}
        {lot?.b64 && (
          <div style={{
            position: "relative",
            width: "100%",
            maxWidth: 240,
            borderRadius: 16,
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.12)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)"
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:${lot.mime || "image/jpeg"};base64,${lot.b64}`}
              alt="Queued lot preview"
              style={{ width: "100%", height: 140, objectFit: "cover" }}
            />
            {lot.weightKg && (
              <div style={{
                position: "absolute",
                bottom: 8,
                left: 8,
                background: "rgba(0,0,0,0.78)",
                backdropFilter: "blur(4px)",
                padding: "2px 8px",
                borderRadius: 8,
                fontSize: "0.75rem",
                fontWeight: 700,
                color: "#fbbf24",
                border: "1px solid rgba(251,191,36,0.3)"
              }}>
                ⚖️ {lot.weightKg} kg
              </div>
            )}
          </div>
        )}

        {/* Queue status badge */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12, padding: "0.6rem 1rem", width: "100%", fontSize: "0.82rem"
        }}>
          <span style={{ color: "var(--text-muted)" }}>Total lots waiting in queue</span>
          <span style={{ fontWeight: 800, color: "#fbbf24", fontSize: "0.95rem" }}>{count}</span>
        </div>

        {/* Auto-sync info pill */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)",
          borderRadius: 14, padding: "0.75rem 1rem", width: "100%",
        }}>
          <span style={{ fontSize: "1.4rem" }}>⟳</span>
          <p style={{ color: "rgba(251,191,36,0.9)", fontSize: "0.8rem", margin: 0, textAlign: "left", lineHeight: 1.4 }}>
            <strong>Auto-sync active:</strong> Once your internet connection is restored, KabadiAI will automatically analyse and value your lot.
          </p>
        </div>

        <div className="flex flex-col gap-2 w-full mt-1">
          {onSync && (
            <button
              id="offline-sync-btn"
              onClick={onSync}
              className="btn btn-gold w-full !rounded-2xl py-3 font-bold flex items-center justify-center gap-2"
            >
              <span>⟳</span> Try Sync Now
            </button>
          )}
          <button id="offline-retake-btn" onClick={onRetake} className="btn btn-ghost w-full !rounded-2xl">
            📷 Scan another lot
          </button>
        </div>
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

  const shareText = [
    `♻️ KabadiAI Verified Appraisal Card`,
    `👤 Assessed by: ${level.name} (Level ${level.level} ${level.badge})`,
    `💰 ${summary}`,
    ...(result.line_items || []).map((i: any) => `• ${name(i.component)} x${i.count}: ~${i.est_weight_g} g`),
    ...(result.environmental_impact ? [`🌱 Green Impact: ${result.environmental_impact.trees_equivalent} trees eq. saved | ${result.environmental_impact.co2_offset_kg} kg CO₂ prevented`] : []),
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

      {/* Remaining offline queue banner */}
      {remainingQueueCount > 0 && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.35)",
          borderRadius: 16, padding: "0.75rem 1rem",
        }}>
          <div className="flex items-center gap-2">
            <span style={{ fontSize: "1.2rem" }}>📦</span>
            <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#fcd34d" }}>
              {remainingQueueCount} more {remainingQueueCount === 1 ? "lot" : "lots"} in offline queue
            </span>
          </div>
          {onSync && (
            <button
              onClick={onSync}
              className="btn btn-gold !min-h-0 !rounded-xl px-3 py-1.5 text-xs font-bold !w-auto"
            >
              ⟳ Sync Next Lot
            </button>
          )}
        </div>
      )}

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
          <span
            className="pill"
            style={{
              background: result.user_weight_provided ? "rgba(0,229,160,0.18)" : "rgba(0,229,160,0.12)",
              borderColor: result.user_weight_provided ? "rgba(0,229,160,0.5)" : "rgba(0,229,160,0.25)",
              color: result.user_weight_provided ? "#00e5a0" : "var(--emerald-glow)",
              fontWeight: 700,
            }}
          >
            {result.user_weight_provided ? "⚖️ Scaled by Your Weight" : "AI Estimated Weight"}
          </span>
        </div>
        {result.unpriced_items > 0 && <p className="text-sm text-amber-700 mt-3">⚠ {t("excludesUnpriced")} {result.unpriced_items}</p>}
        <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>{t("priceNote")}</p>
      </div>

      {/* Guest Sign-In Encouragement */}
      {!user && (
        <div
          className="rounded-2xl p-3.5 flex items-center justify-between gap-3 animate-fade-up"
          style={{
            background: "linear-gradient(135deg, rgba(0,229,160,0.12), rgba(16,185,129,0.06))",
            border: "1.5px solid rgba(0,229,160,0.35)",
            boxShadow: "0 4px 20px rgba(0,229,160,0.08)",
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-2xl shrink-0">🌱</span>
            <div className="min-w-0">
              <h4 className="text-xs font-black text-white font-outfit">Want to Level Up & Save Your XP?</h4>
              <p className="text-[11px] text-muted truncate">Sign in or sign up to save your recycling score and rank up!</p>
            </div>
          </div>
          <Link
            href="/auth/"
            className="btn btn-primary !min-h-0 !h-8 px-3 text-xs font-black rounded-xl no-underline shrink-0"
          >
            Sign In
          </Link>
        </div>
      )}

      {/* Environmental Impact of This Lot */}
      {result.environmental_impact && (
        <div
          className="card animate-fade-up"
          style={{
            background: "linear-gradient(145deg, rgba(16,185,129,0.12), rgba(6,30,20,0.85))",
            border: "1.5px solid rgba(0,229,160,0.4)",
            boxShadow: "0 0 25px rgba(0,229,160,0.15)",
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">🌿</span>
              <h3 className="font-black text-sm text-white font-outfit">
                Lot Green Impact & CO₂ Saved
              </h3>
            </div>
            <span className="text-[11px] font-bold text-emerald-300 bg-emerald-950/60 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
              Circular Economy
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex flex-col items-center">
              <span className="text-lg mb-0.5">🌳</span>
              <span className="text-sm font-black text-white font-outfit">
                {result.environmental_impact.trees_equivalent}
              </span>
              <span className="text-[10px] text-muted font-medium">Trees Eq./Yr</span>
            </div>
            <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex flex-col items-center">
              <span className="text-lg mb-0.5">☁️</span>
              <span className="text-sm font-black text-white font-outfit">
                {result.environmental_impact.co2_offset_kg} <span className="text-[10px] text-sky-400">kg</span>
              </span>
              <span className="text-[10px] text-muted font-medium">CO₂ Prevented</span>
            </div>
            <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex flex-col items-center">
              <span className="text-lg mb-0.5">⚡</span>
              <span className="text-sm font-black text-white font-outfit">
                {result.environmental_impact.energy_saved_kwh} <span className="text-[10px] text-amber-400">kWh</span>
              </span>
              <span className="text-[10px] text-muted font-medium">Energy Saved</span>
            </div>
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
            const isPerPiece = it.basis === "per_piece";
            const isPerKg = it.basis === "per_kg";
            return (
              <div key={i} className="animate-fade-up" style={{ animationDelay: `${i * 0.07}s` }}>
                <div className="flex items-center gap-3">
                  <span className="text-3xl w-10 text-center">{ICON[it.component] || "📦"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                      {name(it.component)}{" "}
                      <span className="text-sm font-normal" style={{ color: "var(--text-muted)" }}>×{it.count}</span>
                    </div>
                    <div className="text-xs flex items-center gap-1.5 flex-wrap" style={{ color: "var(--text-muted)", marginTop: 2 }}>
                      <span>~{it.est_weight_g} g</span>
                      {isPerPiece && (
                        <span style={{ color: "#38bdf8", fontWeight: 600, background: "rgba(56,189,248,0.12)", padding: "1px 6px", borderRadius: 6, fontSize: "0.68rem" }}>
                          Per Piece (Fixed unit rate)
                        </span>
                      )}
                      {isPerKg && (
                        <span style={{ color: "#34d399", fontWeight: 600, background: "rgba(52,211,153,0.12)", padding: "1px 6px", borderRadius: 6, fontSize: "0.68rem" }}>
                          Per Kg (Scales with weight)
                        </span>
                      )}
                      {it.hazardous && (
                        <span style={{ color: "#f87171", fontWeight: 600, background: "rgba(248,113,113,0.12)", padding: "1px 6px", borderRadius: 6, fontSize: "0.68rem" }}>
                          Hazardous (₹0)
                        </span>
                      )}
                    </div>
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

      {/* Nearby authorized recyclers */}
      {result.recyclers?.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-base" style={{ color: "var(--text-muted)" }}>
              🏢 {t("authorizedRecyclers")}
            </h3>
            <span className="pill" style={{ borderColor: "rgba(56,189,248,0.4)", color: "#38bdf8" }}>
              CPCB / SPCB
            </span>
          </div>
          <div className="space-y-3 stagger-children">
            {result.recyclers.map((r: any) => (
              <a
                key={r.id}
                href={r.directions_url}
                target="_blank"
                rel="noopener noreferrer"
                className="card !p-4 flex items-center gap-3 no-underline block hover:border-sky-500/50 transition-colors"
                style={{ textDecoration: "none" }}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-base flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                    <span className="truncate">{r.name}</span>
                  </div>
                  <div className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--text-muted)" }}>{r.address}</div>
                  {r.capacity_mta && (
                    <div className="text-[11px] mt-1 font-medium" style={{ color: "#38bdf8" }}>
                      ⚙ {r.capacity_mta} {t("capacityMta")}
                    </div>
                  )}
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

      {/* Drop-off collection points (Ask First) */}
      {result.collection_points?.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-base" style={{ color: "#fbbf24" }}>
              📍 {t("dropOffPoints")}
            </h3>
            <span className="pill" style={{ borderColor: "rgba(251,191,36,0.4)", color: "#fbbf24" }}>
              EPR Drop-off
            </span>
          </div>
          <div className="rounded-xl p-3 text-xs leading-relaxed" style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)", color: "#fde68a" }}>
            ℹ {t("dropOffNotice")}
          </div>
          <div className="space-y-3 stagger-children">
            {result.collection_points.map((cp: any) => (
              <a
                key={cp.id}
                href={cp.directions_url}
                target="_blank"
                rel="noopener noreferrer"
                className="card !p-4 flex items-center gap-3 no-underline block hover:border-amber-400/50 transition-colors"
                style={{ textDecoration: "none", border: "1px solid rgba(251,191,36,0.2)" }}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-base" style={{ color: "var(--text-primary)" }}>{cp.name}</div>
                  <div className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--text-muted)" }}>{cp.address}</div>
                  {cp.toll_free && (
                    <div className="text-xs mt-1 font-semibold flex items-center gap-1" style={{ color: "#34d399" }}>
                      📞 {t("tollFree")}: {cp.toll_free}
                    </div>
                  )}
                  {cp.notes && (
                    <div className="text-[11px] mt-1 italic" style={{ color: "var(--text-muted)" }}>
                      {cp.notes}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-2xl font-black" style={{ color: "#fbbf24" }}>{cp.distance_km}</div>
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>{t("kmAway")}</div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
      <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>{t("disclaimer")}</p>
      {result.provider && <p className="text-[10px] text-stone-400 text-center">AI: {result.provider}</p>}
    </div>
  );
}

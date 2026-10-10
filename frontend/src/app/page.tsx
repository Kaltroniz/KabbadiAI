"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState, useRef } from "react";
import CameraCapture from "@/components/CameraCapture";
import ResultDisplay from "@/components/ResultDisplay";
import { useLanguage, LANGS } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import AuthGuard from "@/components/AuthGuard";
import { get, set } from "idb-keyval";

function Home() {
  const { lang, setLang, t, speak } = useLanguage();
  const { user, logout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [offer, setOffer] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [queueCount, setQueueCount] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [showPickupModal, setShowPickupModal] = useState(false);
  const [pickupDesc, setPickupDesc] = useState("");
  const [pickupSending, setPickupSending] = useState(false);
  const [pickupSent, setPickupSent] = useState(false);
  const [pickupError, setPickupError] = useState(false);
  const offerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
    navigator.geolocation?.getCurrentPosition(
      (p) => setCoords({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => {},
      { timeout: 10000, maximumAge: 60000 }
    );
    get("offlineQueue").then((q) => setQueueCount((q || []).length));

    // Feature 3 – auto-sync when network returns
    const handleOnline = async () => {
      const q = (await get("offlineQueue")) || [];
      if (!q.length) return;
      const item = q.shift();
      await set("offlineQueue", q);
      setQueueCount(q.length);
      await onCapture(item.b64, item.mime);
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncQueue = async () => {
    if (!navigator.onLine) return;
    const q = (await get("offlineQueue")) || [];
    if (!q.length) return;
    const item = q.shift();
    await set("offlineQueue", q);
    setQueueCount(q.length);
    await onCapture(item.b64, item.mime);
  };

  // Feature 2 – submit pickup request
  const submitPickup = async () => {
    if (!coords) return;
    setPickupSending(true);
    setPickupError(false);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/pickup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: coords.lat, lon: coords.lon, description: pickupDesc || "Bulk pickup requested" }),
      });
      if (!res.ok) throw new Error();
      setPickupSent(true);
      setTimeout(() => { setShowPickupModal(false); setPickupSent(false); setPickupDesc(""); }, 2500);
    } catch {
      setPickupError(true);
    } finally {
      setPickupSending(false);
    }
  };

  const onCapture = async (b64: string, mime: string) => {
    setLoading(true);
    setResult(null);
    const payload: any = { image_b64: b64, media_type: mime, language: lang };
    if (coords) { payload.lat = coords.lat; payload.lon = coords.lon; }
    const n = parseFloat(offer);
    if (n > 0) payload.dealer_offer_inr = n;

    if (!navigator.onLine) {
      const q = (await get("offlineQueue")) || [];
      q.push({ b64, mime });
      await set("offlineQueue", q);
      setQueueCount(q.length);
      setResult({ type: "offline" });
      setLoading(false);
      return;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 40000);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(String(res.status));
      setResult(await res.json());
    } catch {
      setResult({ type: "error" });
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  };

  if (!mounted) return null;

  return (
    <>
      {/* Floating particles */}
      <div className="particles" aria-hidden="true">
        {Array.from({ length: 10 }).map((_, i) => <div key={i} className="particle" />)}
      </div>

      <div className="page-wrapper animate-fade-in">
        {/* ── HEADER ── */}
        <header className="app-header">
          <div className="app-logo">
            <div className="logo-icon">♻</div>
            <div>
              <h1 className="text-xl font-black gradient-text leading-none">{t("title")}</h1>
              <p className="text-xs text-muted leading-none mt-0.5">e-Waste Intelligence</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {queueCount > 0 && (
              <button
                onClick={syncQueue}
                id="sync-queue-btn"
                className="btn btn-gold !min-h-0 !rounded-2xl px-4 py-2 text-sm !w-auto"
              >
                ⟳ Sync ({queueCount})
              </button>
            )}
            <a
              href="/map"
              id="map-link"
              className="btn btn-ghost !min-h-0 !rounded-xl px-3 py-2 text-sm !w-auto flex items-center gap-1 no-underline"
              title="Hotspot Map"
            >
              🗺
            </a>
            <a
              href="/insights"
              id="insights-link"
              className="btn btn-ghost !min-h-0 !rounded-xl px-4 py-2 text-sm !w-auto flex items-center gap-1 no-underline"
            >
              📊 <span>Insights</span>
            </a>
            <button
              onClick={() => speak(t("help"))}
              aria-label="Help"
              id="help-btn"
              className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-black !min-h-0"
              style={{
                background: "linear-gradient(135deg,#fcd34d,#f59e0b)",
                boxShadow: "0 0 20px rgba(245,158,11,0.35)",
              }}
            >
              ?
            </button>
            {/* User avatar + logout */}
            <button
              id="logout-btn"
              onClick={logout}
              title={`Signed in as ${user?.name ?? user?.email}\nClick to sign out`}
              style={{
                background: "rgba(255,255,255,0.07)",
                border: "1.5px solid rgba(255,255,255,0.12)",
                borderRadius: "50%",
                width: 44, height: 44,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer",
                overflow: "hidden",
                padding: 0,
                minHeight: "unset",
                flexShrink: 0,
                transition: "border-color 0.2s",
              }}
            >
              {user?.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatar} alt={user.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--emerald-glow)", fontFamily: "Outfit,sans-serif" }}>
                  {(user?.name ?? user?.email ?? "?")[0].toUpperCase()}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* ── LANGUAGE CHIPS ── */}
        <div className="flex gap-2 overflow-x-auto pb-1 mb-5 scrollbar-hide stagger-children" role="radiogroup">
          {LANGS.map((l) => (
            <button
              key={l.code}
              role="radio"
              id={`lang-${l.code}`}
              aria-checked={lang === l.code}
              onClick={() => setLang(l.code)}
              className={`lang-chip ${lang === l.code ? "lang-chip-active" : "lang-chip-inactive"}`}
            >
              {l.label}
            </button>
          ))}
        </div>

        {!result ? (
          <>
            {/* ── SUBTITLE ── */}
            <div className="flex items-start gap-3 mb-5 animate-fade-up" style={{ animationDelay: "0.1s" }}>
              <p className="text-lg leading-snug font-medium flex-1" style={{ color: "var(--text-muted)" }}>
                {t("subtitle")}
              </p>
              <button
                onClick={() => speak(t("subtitle"))}
                aria-label={t("listen")}
                id="listen-subtitle-btn"
                className="btn btn-ghost !min-h-0 !w-12 !h-12 !rounded-full !p-0 flex items-center justify-center text-xl shrink-0"
              >
                🔊
              </button>
            </div>

            {/* ── STEP CARDS ── */}
            <div className="grid grid-cols-3 gap-3 mb-6 stagger-children">
              {[["📷", "step1"], ["🔍", "step2"], ["₹", "step3"]].map(([icon, k]) => (
                <div key={k} className="step-card">
                  <span className="step-icon">{icon}</span>
                  <div className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{t(k)}</div>
                </div>
              ))}
            </div>

            {/* ── CAMERA CAPTURE ── */}
            <div className="animate-fade-up" style={{ animationDelay: "0.2s" }}>
              <CameraCapture onCapture={onCapture} isLoading={loading} />
            </div>

            {/* ── BULK PICKUP BUTTON ── */}
            <div className="animate-fade-up" style={{ animationDelay: "0.28s", marginTop: "1rem" }}>
              <button
                id="request-pickup-btn"
                onClick={() => setShowPickupModal(true)}
                className="btn btn-ghost w-full"
                style={{ borderRadius: 20, minHeight: 52, fontSize: "0.95rem", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              >
                <span>🔔</span>
                <span>Request Bulk Pickup</span>
              </button>
            </div>

            {/* ── OFFER INPUT ── */}
            <div className="animate-fade-up" style={{ animationDelay: "0.3s" }}>
              <label
                className="block mt-7 mb-2 text-base font-semibold"
                style={{ color: "var(--text-muted)" }}
                htmlFor="offer"
              >
                {t("enterOffer")}
              </label>
              <div className="card !p-4 flex items-center gap-3">
                <span className="text-3xl font-black gold-text">₹</span>
                <input
                  ref={offerRef}
                  id="offer"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={offer}
                  placeholder="0"
                  onChange={(e) => setOffer(e.target.value.replace(/[^0-9]/g, ""))}
                  className="glass-input !border-0 !bg-transparent !p-0 text-3xl font-black"
                  style={{ color: "var(--text-primary)" }}
                />
              </div>
            </div>
          </>
        ) : (
          <ResultDisplay result={result} onRetake={() => setResult(null)} />
        )}
      </div>

      {/* ── PICKUP MODAL ── */}
      {showPickupModal && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(8px)",
            display: "flex", alignItems: "flex-end", justifyContent: "center",
          }}
          onClick={(e) => e.target === e.currentTarget && setShowPickupModal(false)}
        >
          <div
            style={{
              background: "rgba(10,20,15,0.95)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "24px 24px 0 0",
              padding: "2rem 1.5rem 2.5rem",
              width: "100%",
              maxWidth: 480,
              boxShadow: "0 -8px 60px rgba(0,229,160,0.15)",
              animation: "fadeUp 0.35s cubic-bezier(.22,1,.36,1) forwards",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
              <h2 style={{ fontFamily: "Outfit,sans-serif", fontWeight: 800, fontSize: "1.2rem", color: "var(--text-primary)", margin: 0 }}>
                🔔 Request Bulk Pickup
              </h2>
              <button
                onClick={() => setShowPickupModal(false)}
                style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: "1.5rem", cursor: "pointer", minHeight: "unset", padding: 4 }}
              >
                ×
              </button>
            </div>

            {pickupSent ? (
              <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
                <div style={{ fontSize: "3rem", marginBottom: 8 }}>✅</div>
                <p style={{ color: "#00e5a0", fontWeight: 700, fontSize: "1rem" }}>Pickup request sent!</p>
                <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginTop: 4 }}>A kabadiwala will be notified nearby.</p>
              </div>
            ) : (
              <>
                {!coords ? (
                  <div style={{ padding: "0.75rem 1rem", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 14, marginBottom: "1rem", color: "#fcd34d", fontSize: "0.82rem" }}>
                    ⚠ Location not available. Please allow location access and retry.
                  </div>
                ) : (
                  <div style={{ padding: "0.75rem 1rem", background: "rgba(0,229,160,0.07)", border: "1px solid rgba(0,229,160,0.2)", borderRadius: 14, marginBottom: "1rem", color: "var(--text-muted)", fontSize: "0.8rem" }}>
                    📍 Your location: {coords.lat.toFixed(4)}°N, {coords.lon.toFixed(4)}°E
                  </div>
                )}

                <label style={{ color: "var(--text-muted)", fontSize: "0.82rem", fontWeight: 600, display: "block", marginBottom: 8 }}>
                  Describe what you need picked up
                </label>
                <textarea
                  id="pickup-desc"
                  value={pickupDesc}
                  onChange={(e) => setPickupDesc(e.target.value.slice(0, 200))}
                  placeholder="e.g. Old CRT monitor, 2 laptops, printer..."
                  rows={3}
                  style={{
                    width: "100%", borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.06)", color: "var(--text-primary)",
                    padding: "0.75rem 1rem", fontSize: "0.9rem", fontFamily: "Inter,sans-serif",
                    resize: "none", outline: "none", boxSizing: "border-box",
                    marginBottom: "1rem",
                  }}
                />

                {pickupError && (
                  <p style={{ color: "#f87171", fontSize: "0.8rem", marginBottom: "0.75rem" }}>
                    Failed to send request. Please check your connection and try again.
                  </p>
                )}

                <button
                  id="submit-pickup-btn"
                  onClick={submitPickup}
                  disabled={pickupSending || !coords}
                  className="btn btn-primary w-full"
                  style={{ borderRadius: 18, minHeight: 56, fontSize: "1rem", fontWeight: 700, fontFamily: "Outfit,sans-serif" }}
                >
                  {pickupSending ? "Sending…" : "Send Pickup Request"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/* Wrap with AuthGuard — unauthenticated users are redirected to /auth */
const ProtectedHome = () => <AuthGuard><Home /></AuthGuard>;
export { ProtectedHome as default };

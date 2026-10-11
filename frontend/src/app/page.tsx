"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState } from "react";
import CameraCapture from "@/components/CameraCapture";
import ResultDisplay from "@/components/ResultDisplay";
import AppNavbar from "@/components/AppNavbar";
import DesktopPlayerSidebar from "@/components/DesktopPlayerSidebar";
import { useLanguage, LANGS } from "@/contexts/LanguageContext";
import { useGamification } from "@/contexts/GamificationContext";
import FloatingXPNotification from "@/components/gamification/FloatingXPNotification";
import BadgeUnlockModal from "@/components/gamification/BadgeUnlockModal";
import CardUnlockModal from "@/components/gamification/CardUnlockModal";
import LevelUpModal from "@/components/gamification/LevelUpModal";
import LuckySpinModal from "@/components/gamification/LuckySpinModal";
import DailyChallengesWidget from "@/components/gamification/DailyChallengesWidget";
import { get, set } from "idb-keyval";
import {
  executeScan,
  pollScanJob,
  getPersistedActiveJob,
  clearPersistedActiveJob,
} from "@/utils/apiClient";

export interface QueuedScan {
  id: string;
  b64: string;
  mime: string;
  user_weight_g?: number;
  weightKg?: string;
  lat?: number;
  lon?: number;
  language: string;
  timestamp: number;
}

function Home() {
  const { lang, setLang, t, speak } = useLanguage();
  const { recordScanReward } = useGamification();
  const [loading, setLoading] = useState(false);
  const [scanProgressStage, setScanProgressStage] = useState<"uploading" | "queued" | "processing" | "completed" | null>(null);
  const [scanProgressDetail, setScanProgressDetail] = useState<string | null>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<{ b64: string; mime: string } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [weightKg, setWeightKg] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [queueCount, setQueueCount] = useState(0);
  const [queueItems, setQueueItems] = useState<QueuedScan[]>([]);
  const [showQueueModal, setShowQueueModal] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [mounted, setMounted] = useState(false);

  const refreshQueue = async () => {
    try {
      const q: QueuedScan[] = (await get("offlineQueue")) || [];
      setQueueItems(q);
      setQueueCount(q.length);
    } catch (e) {
      console.error("Error reading offlineQueue:", e);
    }
  };

  useEffect(() => {
    setMounted(true);
    setIsOnline(typeof navigator !== "undefined" ? navigator.onLine : true);

    navigator.geolocation?.getCurrentPosition(
      (p) => setCoords({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => {},
      { timeout: 10000, maximumAge: 60000 }
    );
    refreshQueue();

    // Recover in-flight scan job after page refresh
    const activeJobId = getPersistedActiveJob();
    if (activeJobId && (typeof navigator === "undefined" || navigator.onLine)) {
      setLoading(true);
      setScanProgressStage("processing");
      setScanProgressDetail("Resuming e-waste analysis from active session…");
      pollScanJob(activeJobId, undefined, (stage, detail) => {
        setScanProgressStage(stage);
        if (detail) setScanProgressDetail(detail);
      })
        .then((scanData) => {
          setResult(scanData);
          if (scanData?.type === "result") {
            recordScanReward(scanData, {
              hasCoords: false,
              userWeightProvided: false,
              isOfflineSync: false,
            });
          }
        })
        .catch((err) => {
          console.warn("Could not resume active scan job:", err);
          clearPersistedActiveJob();
        })
        .finally(() => {
          setLoading(false);
          setScanProgressStage(null);
          setScanProgressDetail(null);
        });
    }

    // Feature F3 – auto-sync when network returns
    const handleOnline = async () => {
      setIsOnline(true);
      const q: QueuedScan[] = (await get("offlineQueue")) || [];
      if (q.length > 0) {
        syncNextQueueItem();
      }
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPhotoCaptured = (b64: string, mime: string) => {
    setCapturedPhoto({ b64, mime });
    setSubmitError(null);
  };

  const submitToAi = async () => {
    if (!capturedPhoto) {
      setSubmitError(t("takePhotoFirst"));
      return;
    }

    setSubmitError(null);
    setLoading(true);
    setResult(null);

    const { b64, mime } = capturedPhoto;
    const w = parseFloat(weightKg);
    const user_weight_g = w > 0 ? Math.round(w * 1000) : undefined;

    const lotToQueue: QueuedScan = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      b64,
      mime,
      user_weight_g,
      weightKg: weightKg || undefined,
      lat: coords?.lat,
      lon: coords?.lon,
      language: lang,
      timestamp: Date.now(),
    };

    if (!navigator.onLine) {
      const q: QueuedScan[] = (await get("offlineQueue")) || [];
      const updated = [...q, lotToQueue];
      await set("offlineQueue", updated);
      setQueueItems(updated);
      setQueueCount(updated.length);
      setResult({ type: "offline", queuedLot: lotToQueue, queuedCount: updated.length });
      setLoading(false);
      return;
    }

    const payload: any = { image_b64: b64, media_type: mime, language: lang };
    if (coords) { payload.lat = coords.lat; payload.lon = coords.lon; }
    if (user_weight_g) payload.user_weight_g = user_weight_g;

    const ctrl = new AbortController();
    abortControllerRef.current = ctrl;

    try {
      const scanData = await executeScan({
        b64,
        mime,
        lang,
        coords: coords || undefined,
        user_weight_g,
        abortSignal: ctrl.signal,
        onProgress: (stage, detail) => {
          setScanProgressStage(stage);
          if (detail) setScanProgressDetail(detail);
        },
      });

      setResult(scanData);
      if (scanData?.type === "result") {
        recordScanReward(scanData, {
          hasCoords: Boolean(coords),
          userWeightProvided: Boolean(weightKg),
          isOfflineSync: false,
        });
      }
    } catch (err: any) {
      if (
        !navigator.onLine ||
        err?.name === "AbortError" ||
        (err instanceof TypeError && err.message?.toLowerCase().includes("fetch"))
      ) {
        if (!ctrl.signal.aborted) {
          const q: QueuedScan[] = (await get("offlineQueue")) || [];
          const updated = [...q, lotToQueue];
          await set("offlineQueue", updated);
          setQueueItems(updated);
          setQueueCount(updated.length);
          setResult({ type: "offline", queuedLot: lotToQueue, queuedCount: updated.length });
        }
      } else {
        setResult({ type: "error" });
      }
    } finally {
      abortControllerRef.current = null;
      setLoading(false);
      setScanProgressStage(null);
      setScanProgressDetail(null);
    }
  };

  const cancelScan = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    clearPersistedActiveJob();
    setLoading(false);
    setScanProgressStage(null);
    setScanProgressDetail(null);
  };

  const syncNextQueueItem = async () => {
    if (!navigator.onLine) {
      alert("You are currently offline. Please reconnect to sync.");
      return;
    }
    const q: QueuedScan[] = (await get("offlineQueue")) || [];
    if (!q.length) return;

    setSyncing(true);
    setSyncMessage(`Syncing lot 1 of ${q.length}…`);
    const item = q[0];

    try {
      const data = await executeScan({
        b64: item.b64,
        mime: item.mime,
        lang: item.language || lang,
        coords: item.lat !== undefined && item.lon !== undefined ? { lat: item.lat, lon: item.lon } : undefined,
        user_weight_g: item.user_weight_g,
      });

      const remaining = q.slice(1);
      await set("offlineQueue", remaining);
      setQueueItems(remaining);
      setQueueCount(remaining.length);

      setResult(data);
      if (data?.type === "result") {
        recordScanReward(data, {
          hasCoords: item.lat !== undefined,
          userWeightProvided: Boolean(item.user_weight_g),
          isOfflineSync: true,
        });
      }
      setShowQueueModal(false);
    } catch (err) {
      console.error("Failed to sync lot:", err);
      alert("Sync failed. Check connection and try again.");
    } finally {
      setSyncing(false);
      setSyncMessage(null);
    }
  };

  const syncAllQueueItems = async () => {
    if (!navigator.onLine) {
      alert("You are currently offline. Please reconnect to sync.");
      return;
    }
    const q: QueuedScan[] = (await get("offlineQueue")) || [];
    if (!q.length) return;

    setSyncing(true);
    let lastResult = null;
    let remaining = [...q];

    try {
      for (let i = 0; i < q.length; i++) {
        const item = q[i];
        setSyncMessage(`Syncing lot ${i + 1} of ${q.length}…`);

        const data = await executeScan({
          b64: item.b64,
          mime: item.mime,
          lang: item.language || lang,
          coords: item.lat !== undefined && item.lon !== undefined ? { lat: item.lat, lon: item.lon } : undefined,
          user_weight_g: item.user_weight_g,
        });

        lastResult = data;
        remaining = remaining.slice(1);
        await set("offlineQueue", remaining);
        setQueueItems(remaining);
        setQueueCount(remaining.length);
      }

      if (lastResult) {
        setResult(lastResult);
        setShowQueueModal(false);
      }
    } catch (err) {
      console.error("Batch sync interrupted:", err);
      alert("Batch sync interrupted. Remaining items kept in queue.");
    } finally {
      setSyncing(false);
      setSyncMessage(null);
    }
  };

  const removeQueueItem = async (id: string) => {
    const q: QueuedScan[] = (await get("offlineQueue")) || [];
    const updated = q.filter((item) => item.id !== id);
    await set("offlineQueue", updated);
    setQueueItems(updated);
    setQueueCount(updated.length);
  };

  const clearQueue = async () => {
    if (confirm("Are you sure you want to clear all queued lots?")) {
      await set("offlineQueue", []);
      setQueueItems([]);
      setQueueCount(0);
      setShowQueueModal(false);
    }
  };

  if (!mounted) return null;

  return (
    <>
      {/* Floating particles */}
      <div className="particles" aria-hidden="true">
        {Array.from({ length: 10 }).map((_, i) => <div key={i} className="particle" />)}
      </div>

      {/* Syncing floating notification */}
      {syncing && (
        <div style={{
          position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 1100,
          background: "rgba(10,20,15,0.94)", border: "1px solid var(--emerald-glow)",
          boxShadow: "0 0 30px rgba(0,229,160,0.35)", borderRadius: 30,
          padding: "8px 22px", display: "flex", alignItems: "center", gap: 10,
          backdropFilter: "blur(16px)", color: "var(--emerald-glow)", fontWeight: 700, fontSize: "0.85rem"
        }}>
          <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>⟳</span>
          <span>{syncMessage || "Processing queued lot…"}</span>
        </div>
      )}

      <div className="page-wrapper animate-fade-in">
        {/* ── APP TOP NAVBAR (RESPONSIVE DESKTOP & MOBILE) ── */}
        <AppNavbar
          isOnline={isOnline}
          queueCount={queueCount}
          onOpenQueue={() => {
            refreshQueue();
            setShowQueueModal(true);
          }}
        />

        {/* ── RESPONSIVE MAIN WORKSPACE (2-COLUMN ON DESKTOP, 1-COLUMN ON MOBILE) ── */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          {/* Main Column: Scanner, Inputs & Results */}
          <div className="md:col-span-7 lg:col-span-8 flex flex-col">
            {/* ── LANGUAGE CHIPS (QUICK SELECTOR) ── */}
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
                <div className="flex items-start gap-2.5 mb-4 animate-fade-up" style={{ animationDelay: "0.1s" }}>
                  <p className="text-sm sm:text-base leading-snug font-medium flex-1" style={{ color: "var(--text-muted)" }}>
                    {t("subtitle")}
                  </p>
                  <button
                    onClick={() => speak(t("subtitle"))}
                    aria-label={t("listen")}
                    id="listen-subtitle-btn"
                    className="btn btn-ghost !min-h-0 !w-9 !h-9 !rounded-full !p-0 flex items-center justify-center text-sm shrink-0"
                  >
                    🔊
                  </button>
                </div>

                {/* ── MOBILE STEP JOURNEY STRIP ── */}
                <div className="md:hidden flex items-center justify-between p-1.5 mb-4 rounded-2xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-xl">
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-emerald-500/12 border border-emerald-400/25 flex-1 min-w-0">
                    <span className="text-xs">📷</span>
                    <span className="text-[11px] font-bold text-emerald-300 truncate font-outfit">1. {t("step1")}</span>
                  </div>
                  <span className="text-muted/40 text-[10px] px-1 shrink-0">➔</span>
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-white/5 border border-white/5 flex-1 min-w-0">
                    <span className="text-xs">⚖️</span>
                    <span className="text-[11px] font-bold text-white/80 truncate font-outfit">2. {t("stepWeight")}</span>
                  </div>
                  <span className="text-muted/40 text-[10px] px-1 shrink-0">➔</span>
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-white/5 border border-white/5 flex-1 min-w-0">
                    <span className="text-xs">✨</span>
                    <span className="text-[11px] font-bold text-white/80 truncate font-outfit">3. {t("step3")}</span>
                  </div>
                </div>

                {/* ── DESKTOP STEP CARDS ── */}
                <div className="hidden md:grid md:grid-cols-3 gap-3 mb-6 stagger-children">
                  {[["📷", "step1"], ["⚖️", "stepWeight"], ["✨", "step3"]].map(([icon, k]) => (
                    <div key={k} className="step-card">
                      <span className="step-icon">{icon}</span>
                      <div className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{t(k) || k}</div>
                    </div>
                  ))}
                </div>

                {/* ── CAMERA CAPTURE ── */}
                <div className="animate-fade-up" style={{ animationDelay: "0.2s" }}>
                  <CameraCapture
                    onCapture={onPhotoCaptured}
                    capturedImage={capturedPhoto}
                    onClearCapture={() => setCapturedPhoto(null)}
                    isLoading={loading}
                  />
                </div>

                {/* ── WEIGHT INPUT ── */}
                <div className="animate-fade-up" style={{ animationDelay: "0.25s" }}>
                  <label
                    className="block mt-4 sm:mt-6 mb-1.5 text-sm sm:text-base font-semibold"
                    style={{ color: "var(--text-muted)" }}
                    htmlFor="weight"
                  >
                    ⚖️ {t("enterOffer")}
                  </label>
                  <div className="card !p-3 sm:!p-4 flex items-center gap-3">
                    <span className="text-2xl sm:text-3xl font-black" style={{ color: "var(--emerald-glow)" }}>⚖️</span>
                    <input
                      id="weight"
                      inputMode="decimal"
                      pattern="[0-9.]*"
                      value={weightKg}
                      placeholder="0.0"
                      onChange={(e) => setWeightKg(e.target.value.replace(/[^0-9.]/g, ""))}
                      className="glass-input !border-0 !bg-transparent !p-0 text-2xl sm:text-3xl font-black"
                      style={{ color: "var(--text-primary)" }}
                    />
                    <span className="text-base sm:text-lg font-bold" style={{ color: "var(--text-muted)" }}>kg</span>
                  </div>
                  <p className="text-[11px] sm:text-xs mt-1.5" style={{ color: "var(--text-muted)" }}>
                    {t("weightHint")}
                  </p>
                </div>

                {/* ── SUBMIT TO AI BUTTON ── */}
                <div className="animate-fade-up mt-6" style={{ animationDelay: "0.3s" }}>
                  {submitError && (
                    <div
                      className="mb-3 rounded-2xl px-4 py-2.5 font-semibold text-sm animate-fade-up flex items-center gap-2"
                      style={{ background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.4)", color: "#fca5a5" }}
                    >
                      <span>⚠️</span>
                      <span>{submitError}</span>
                    </div>
                  )}

                  <button
                    id="submit-ai-btn"
                    type="button"
                    onClick={submitToAi}
                    disabled={loading || !capturedPhoto}
                    className={`btn btn-primary w-full !py-4 !rounded-2xl text-base font-black flex items-center justify-center gap-2 transition-all ${
                      loading
                        ? "opacity-80 cursor-wait"
                        : !capturedPhoto
                        ? "opacity-45 !bg-white/5 !text-white/40 !border !border-white/10 cursor-not-allowed"
                        : "hover:scale-[1.02]"
                    }`}
                    style={{
                      minHeight: 56,
                      boxShadow: capturedPhoto && !loading ? "0 0 35px rgba(0,229,160,0.4), 0 4px 16px rgba(0,0,0,0.4)" : "none",
                    }}
                  >
                    {loading ? (
                      <div className="flex flex-col items-center justify-center py-0.5">
                        <div className="flex items-center gap-2">
                          <div style={{ position: "relative", width: 20, height: 20 }}>
                            <div className="orbit-dot !w-2 !h-2" />
                            <div className="orbit-dot !w-2 !h-2" />
                          </div>
                          <span>
                            {scanProgressStage === "uploading"
                              ? "📤 Uploading Photo…"
                              : scanProgressStage === "queued"
                              ? "⏳ Queued for Processing…"
                              : "✨ AI Analyzing e-Waste…"}
                          </span>
                        </div>
                        {scanProgressDetail && (
                          <span className="text-[0.72rem] text-emerald-300 font-normal mt-0.5">
                            {scanProgressDetail}
                          </span>
                        )}
                      </div>
                    ) : (
                      <>
                        <span style={{ fontSize: "1.25rem" }}>✨</span>
                        <span style={{ fontFamily: "Outfit, sans-serif", fontSize: "1.05rem" }}>
                          {!capturedPhoto ? t("takePhotoFirst") : t("submitToAi")}
                        </span>
                        <span style={{ fontSize: "1.1rem" }}>🚀</span>
                      </>
                    )}
                  </button>

                  {loading && (
                    <button
                      type="button"
                      onClick={cancelScan}
                      className="text-xs text-rose-400 hover:text-rose-300 underline mt-2.5 text-center w-full transition-colors flex items-center justify-center gap-1"
                    >
                      <span>✖</span> <span>Cancel Scan</span>
                    </button>
                  )}

                  {!capturedPhoto && !loading && (
                    <p className="text-center text-xs mt-2.5" style={{ color: "var(--text-muted)" }}>
                      {t("takePhotoHint")}
                    </p>
                  )}
                </div>

                {/* ── MOBILE-ONLY DAILY CHALLENGES (Desktop shows in sticky sidebar) ── */}
                <div className="mt-6 md:hidden animate-fade-up" style={{ animationDelay: "0.35s" }}>
                  <DailyChallengesWidget />
                </div>
              </>
            ) : (
              <ResultDisplay
                result={result}
                onRetake={() => {
                  setResult(null);
                  setCapturedPhoto(null);
                  setWeightKg("");
                  setSubmitError(null);
                  refreshQueue();
                }}
                onSync={syncNextQueueItem}
                remainingQueueCount={queueCount}
              />
            )}
          </div>

          {/* Right Column: Desktop Player Sidebar (Hidden on mobile, sticky on desktop) */}
          <div className="hidden md:block md:col-span-5 lg:col-span-4 sticky top-6">
            <DesktopPlayerSidebar />
          </div>
        </div>
      </div>

      {/* ── GAMIFICATION CELEBRATION MODALS ── */}
      <FloatingXPNotification />
      <BadgeUnlockModal />
      <CardUnlockModal />
      <LevelUpModal />
      <LuckySpinModal />

      {/* ── OFFLINE QUEUE MODAL ── */}
      {showQueueModal && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(0,0,0,0.72)",
            backdropFilter: "blur(10px)",
            display: "flex", alignItems: "flex-end", justifyContent: "center",
          }}
          onClick={(e) => e.target === e.currentTarget && setShowQueueModal(false)}
        >
          <div
            style={{
              background: "rgba(10,20,15,0.97)",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: "24px 24px 0 0",
              padding: "1.75rem 1.25rem 2.25rem",
              width: "100%",
              maxWidth: 480,
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 -8px 60px rgba(0,229,160,0.15)",
              animation: "fadeUp 0.3s cubic-bezier(.22,1,.36,1) forwards",
            }}
          >
            {/* Modal Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
              <div>
                <h2 style={{ fontFamily: "Outfit,sans-serif", fontWeight: 800, fontSize: "1.25rem", color: "var(--text-primary)", margin: 0 }}>
                  📦 Offline Queue ({queueItems.length})
                </h2>
                <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", margin: "4px 0 0 0" }}>
                  {isOnline ? "🟢 Connected — ready to sync" : "🟡 Offline — will auto-sync on connection"}
                </p>
              </div>
              <button
                onClick={() => setShowQueueModal(false)}
                style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: "1.5rem", cursor: "pointer", minHeight: "unset", padding: 4 }}
              >
                ✕
              </button>
            </div>

            {/* Items List */}
            <div style={{ overflowY: "auto", flex: 1, paddingRight: 4, marginBottom: "1.25rem", display: "flex", flexDirection: "column", gap: 10 }}>
              {queueItems.length === 0 ? (
                <div style={{ textAlign: "center", padding: "2rem 0", color: "var(--text-muted)", fontSize: "0.9rem" }}>
                  No lots currently in queue.
                </div>
              ) : (
                queueItems.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 14, padding: "0.6rem 0.8rem"
                    }}
                  >
                    {/* Thumbnail */}
                    <div style={{ width: 56, height: 56, borderRadius: 10, overflow: "hidden", background: "#000", flexShrink: 0 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`data:${item.mime || "image/jpeg"};base64,${item.b64}`}
                        alt="Lot thumbnail"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--text-primary)" }}>
                          Lot #{idx + 1}
                        </span>
                        {item.weightKg && (
                          <span style={{ fontSize: "0.75rem", background: "rgba(0,229,160,0.12)", color: "var(--emerald-glow)", padding: "1px 6px", borderRadius: 6, fontWeight: 700 }}>
                            ⚖️ {item.weightKg} kg
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: "0.74rem", color: "var(--text-muted)", margin: "3px 0 0 0" }}>
                        {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {item.lat ? " • 📍 GPS saved" : ""}
                      </p>
                    </div>
                    <button
                      onClick={() => removeQueueItem(item.id)}
                      title="Remove lot from queue"
                      style={{
                        background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)",
                        borderRadius: 10, width: 34, height: 34, minHeight: "unset",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "#fca5a5", fontSize: "0.85rem", cursor: "pointer", padding: 0
                      }}
                    >
                      🗑
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Actions */}
            {queueItems.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button
                  onClick={syncAllQueueItems}
                  disabled={syncing || !isOnline}
                  className="btn btn-primary w-full"
                  style={{ minHeight: 52, borderRadius: 16, fontSize: "0.95rem" }}
                >
                  {syncing ? (syncMessage || "Syncing…") : `⟳ Sync All (${queueItems.length})`}
                </button>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={syncNextQueueItem}
                    disabled={syncing || !isOnline}
                    className="btn btn-gold flex-1"
                    style={{ minHeight: 46, borderRadius: 14, fontSize: "0.85rem" }}
                  >
                    Sync Next Only
                  </button>
                  <button
                    onClick={clearQueue}
                    disabled={syncing}
                    className="btn btn-ghost"
                    style={{ minHeight: 46, borderRadius: 14, fontSize: "0.85rem", padding: "0 1rem", width: "auto" }}
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default Home;

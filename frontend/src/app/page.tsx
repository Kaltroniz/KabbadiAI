"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useRef, useState } from "react";
import CameraCapture from "@/components/CameraCapture";
import ResultDisplay from "@/components/ResultDisplay";
import { useLanguage, LANGS } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { get, set } from "idb-keyval";

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
  const { user, logout } = useAuth();
  const [loading, setLoading] = useState(false);
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
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    }
    if (showUserMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [showUserMenu]);

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
    } catch (err: any) {
      if (
        !navigator.onLine ||
        err?.name === "AbortError" ||
        (err instanceof TypeError && err.message?.toLowerCase().includes("fetch"))
      ) {
        const q: QueuedScan[] = (await get("offlineQueue")) || [];
        const updated = [...q, lotToQueue];
        await set("offlineQueue", updated);
        setQueueItems(updated);
        setQueueCount(updated.length);
        setResult({ type: "offline", queuedLot: lotToQueue, queuedCount: updated.length });
      } else {
        setResult({ type: "error" });
      }
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
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

    const payload: any = {
      image_b64: item.b64,
      media_type: item.mime,
      language: item.language || lang,
    };
    if (item.lat !== undefined && item.lon !== undefined) {
      payload.lat = item.lat;
      payload.lon = item.lon;
    }
    if (item.user_weight_g) {
      payload.user_weight_g = item.user_weight_g;
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
      if (!res.ok) throw new Error("Sync returned status " + res.status);
      const data = await res.json();

      const remaining = q.slice(1);
      await set("offlineQueue", remaining);
      setQueueItems(remaining);
      setQueueCount(remaining.length);

      setResult(data);
      setShowQueueModal(false);
    } catch (err) {
      console.error("Failed to sync lot:", err);
      alert("Sync failed. Check connection and try again.");
    } finally {
      clearTimeout(timer);
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

        const payload: any = {
          image_b64: item.b64,
          media_type: item.mime,
          language: item.language || lang,
        };
        if (item.lat !== undefined && item.lon !== undefined) {
          payload.lat = item.lat;
          payload.lon = item.lon;
        }
        if (item.user_weight_g) {
          payload.user_weight_g = item.user_weight_g;
        }

        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/agent`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) throw new Error("Sync failed on item " + (i + 1));
        lastResult = await res.json();

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
        {/* ── HEADER ── */}
        <header className="app-header relative z-50">
          <div className="app-logo shrink-0" style={{ gap: 8 }}>
            <div className="logo-icon overflow-hidden p-1 flex items-center justify-center" style={{ width: 38, height: 38 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icon-192.png" alt="KabadiAI" className="w-full h-full object-contain rounded-lg" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-lg font-black gradient-text leading-none">{t("title")}</h1>
                {!isOnline && (
                  <span className="pill !text-[10px] !px-1.5 !py-0.5" style={{ background: "rgba(251,191,36,0.15)", borderColor: "rgba(251,191,36,0.35)", color: "#fbbf24" }}>
                    Offline
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted leading-none mt-0.5">e-Waste Intelligence</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {queueCount > 0 && (
              <button
                onClick={() => { refreshQueue(); setShowQueueModal(true); }}
                id="sync-queue-btn"
                className="btn btn-gold !min-h-0 !rounded-xl px-2.5 py-1 text-xs font-bold !w-auto flex items-center gap-1"
                title="View offline queue"
              >
                <span>📦</span>
                <span>({queueCount})</span>
              </button>
            )}
            <a
              href="/map/"
              id="map-link"
              className="btn btn-ghost !min-h-0 !rounded-xl text-sm no-underline flex items-center justify-center"
              style={{ width: 34, height: 34, padding: 0 }}
              title="Hotspot Map"
            >
              🗺
            </a>
            <a
              href="/insights/"
              id="insights-link"
              className="btn btn-ghost !min-h-0 !rounded-xl px-2.5 text-xs !w-auto flex items-center gap-1 no-underline"
              style={{ height: 34 }}
              title="Insights"
            >
              📊 <span>Insights</span>
            </a>
            <button
              onClick={() => speak(t("help"))}
              aria-label="Help"
              id="help-btn"
              className="rounded-full flex items-center justify-center text-sm font-black !min-h-0"
              style={{
                width: 34,
                height: 34,
                background: "linear-gradient(135deg,#fcd34d,#f59e0b)",
                boxShadow: "0 0 16px rgba(245,158,11,0.35)",
                border: "none",
                cursor: "pointer",
                color: "#1a0f00",
              }}
            >
              ?
            </button>
            {/* User Profile & Account Menu */}
            {user ? (
              <div className="relative z-50" ref={userMenuRef}>
                <button
                  id="user-menu-btn"
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  aria-expanded={showUserMenu}
                  aria-label="Account details and sign out"
                  title={`Signed in as ${user.name || user.email}`}
                  className="transition-all duration-200"
                  style={{
                    background: showUserMenu ? "rgba(0,229,160,0.14)" : "rgba(255,255,255,0.06)",
                    border: `1.5px solid ${showUserMenu ? "rgba(0,229,160,0.55)" : "rgba(255,255,255,0.12)"}`,
                    borderRadius: "50%",
                    width: 36,
                    height: 36,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    position: "relative",
                    padding: 0,
                    boxShadow: showUserMenu ? "0 0 16px rgba(0,229,160,0.22)" : "none",
                  }}
                >
                  <div style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(255,255,255,0.05)",
                  }}>
                    {user?.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={user.avatar} alt={user.name || "User"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <span style={{ fontSize: "0.95rem", fontWeight: 800, color: "var(--emerald-glow)", fontFamily: "Outfit,sans-serif" }}>
                        {(user?.name ?? user?.email ?? "?")[0].toUpperCase()}
                      </span>
                    )}
                  </div>
                  {/* Active indicator dot */}
                  <span style={{
                    position: "absolute",
                    bottom: 0,
                    right: 0,
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    background: "#00e5a0",
                    border: "1.5px solid #0f1717",
                    boxShadow: "0 0 5px #00e5a0",
                  }} />
                </button>

                {/* Profile Dropdown Popover */}
                {showUserMenu && (
                  <>
                    {/* Backdrop overlay catching outside taps and establishing clear depth */}
                    <div
                      style={{
                        position: "fixed",
                        inset: 0,
                        zIndex: 999,
                        background: "rgba(0, 0, 0, 0.35)",
                        backdropFilter: "blur(2px)",
                        WebkitBackdropFilter: "blur(2px)",
                      }}
                      onClick={() => setShowUserMenu(false)}
                      aria-hidden="true"
                    />
                    <div
                      className="animate-scale-pop"
                      style={{
                        position: "absolute",
                        top: "calc(100% + 10px)",
                        right: 0,
                        width: 290,
                        maxWidth: "calc(100vw - 32px)",
                        background: "rgba(14, 21, 23, 0.98)",
                        backdropFilter: "blur(24px)",
                        WebkitBackdropFilter: "blur(24px)",
                        border: "1.5px solid rgba(0, 229, 160, 0.35)",
                        borderRadius: 22,
                        padding: "16px",
                        boxShadow: "0 24px 60px rgba(0, 0, 0, 0.9), 0 0 40px rgba(0, 229, 160, 0.18)",
                        zIndex: 1000,
                        transformOrigin: "top right",
                      }}
                    >
                    {/* Profile Header */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 12 }}>
                      <div style={{
                        width: 46,
                        height: 46,
                        borderRadius: "50%",
                        overflow: "hidden",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "rgba(255,255,255,0.06)",
                        border: "1.5px solid rgba(0,229,160,0.4)",
                        boxShadow: "0 0 12px rgba(0,229,160,0.2)",
                        flexShrink: 0,
                      }}>
                        {user?.avatar ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={user.avatar} alt={user.name || "User"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <span style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--emerald-glow)", fontFamily: "Outfit,sans-serif" }}>
                            {(user?.name ?? user?.email ?? "?")[0].toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {user?.name || "KabadiAI User"}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {user?.email || "Google Account"}
                        </div>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 4, fontSize: "0.68rem", fontWeight: 600, color: "#34d399", background: "rgba(16,185,129,0.12)", padding: "2px 8px", borderRadius: 10, border: "1px solid rgba(16,185,129,0.25)" }}>
                          <span style={{ fontSize: "8px" }}>●</span>
                          <span>Account Active</span>
                        </div>
                      </div>
                    </div>

                    {/* Divider */}
                    <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "0 -4px 10px" }} />

                    {/* Quick links */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
                      <a
                        href="/insights/"
                        onClick={() => setShowUserMenu(false)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "8px 12px",
                          borderRadius: 12,
                          fontSize: "0.85rem",
                          fontWeight: 600,
                          color: "var(--text-primary)",
                          textDecoration: "none",
                          transition: "background 0.15s",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <span>📊</span>
                        <span>Insights & Intelligence</span>
                      </a>
                      <a
                        href="/map/"
                        onClick={() => setShowUserMenu(false)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "8px 12px",
                          borderRadius: 12,
                          fontSize: "0.85rem",
                          fontWeight: 600,
                          color: "var(--text-primary)",
                          textDecoration: "none",
                          transition: "background 0.15s",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <span>🗺️</span>
                        <span>Hotspot Map</span>
                      </a>
                      {queueCount > 0 && (
                        <button
                          onClick={() => { setShowUserMenu(false); refreshQueue(); setShowQueueModal(true); }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            width: "100%",
                            textAlign: "left",
                            gap: 10,
                            padding: "8px 12px",
                            borderRadius: 12,
                            fontSize: "0.85rem",
                            fontWeight: 600,
                            color: "#fbbf24",
                            background: "rgba(251,191,36,0.08)",
                            border: "1px solid rgba(251,191,36,0.2)",
                            cursor: "pointer",
                          }}
                        >
                          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span>📦</span>
                            <span>Offline Queue</span>
                          </span>
                          <span style={{ fontSize: "0.75rem", background: "rgba(251,191,36,0.2)", padding: "1px 6px", borderRadius: 8 }}>
                            {queueCount}
                          </span>
                        </button>
                      )}
                    </div>

                    {/* Divider */}
                    <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "0 -4px 12px" }} />

                    {/* Explicit Sign Out Action Button */}
                    <button
                      id="logout-btn"
                      onClick={() => {
                        setShowUserMenu(false);
                        logout();
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        width: "100%",
                        padding: "10px 16px",
                        borderRadius: 14,
                        background: "rgba(239, 68, 68, 0.12)",
                        border: "1.5px solid rgba(239, 68, 68, 0.35)",
                        color: "#fca5a5",
                        fontWeight: 700,
                        fontSize: "0.88rem",
                        cursor: "pointer",
                        transition: "all 0.2s cubic-bezier(0.22, 1, 0.36, 1)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(239, 68, 68, 0.22)";
                        e.currentTarget.style.borderColor = "rgba(239, 68, 68, 0.55)";
                        e.currentTarget.style.color = "#ffffff";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "rgba(239, 68, 68, 0.12)";
                        e.currentTarget.style.borderColor = "rgba(239, 68, 68, 0.35)";
                        e.currentTarget.style.color = "#fca5a5";
                      }}
                    >
                      <span>🚪</span>
                      <span>Sign Out</span>
                    </button>
                  </div>
                  </>
                )}
              </div>
            ) : (
              <a
                href="/auth/"
                id="sign-in-btn"
                className="btn btn-ghost !min-h-0 !rounded-xl px-2.5 text-xs font-semibold !w-auto flex items-center gap-1.5 no-underline"
                style={{
                  height: 34,
                  border: "1.5px solid rgba(0,229,160,0.35)",
                  color: "#00e5a0",
                  background: "rgba(0,229,160,0.08)",
                }}
                title="Sign in or register"
              >
                <span>👤</span>
                <span>Sign In</span>
              </a>
            )}
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
                className="block mt-6 mb-2 text-base font-semibold"
                style={{ color: "var(--text-muted)" }}
                htmlFor="weight"
              >
                ⚖️ {t("enterOffer")}
              </label>
              <div className="card !p-4 flex items-center gap-3">
                <span className="text-3xl font-black" style={{ color: "var(--emerald-glow)" }}>⚖️</span>
                <input
                  id="weight"
                  inputMode="decimal"
                  pattern="[0-9.]*"
                  value={weightKg}
                  placeholder="0.0"
                  onChange={(e) => setWeightKg(e.target.value.replace(/[^0-9.]/g, ""))}
                  className="glass-input !border-0 !bg-transparent !p-0 text-3xl font-black"
                  style={{ color: "var(--text-primary)" }}
                />
                <span className="text-lg font-bold" style={{ color: "var(--text-muted)" }}>kg</span>
              </div>
              <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
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
                  <>
                    <div style={{ position: "relative", width: 22, height: 22 }}>
                      <div className="orbit-dot !w-2 !h-2" />
                      <div className="orbit-dot !w-2 !h-2" />
                    </div>
                    <span>{t("analyzing")}</span>
                  </>
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

              {!capturedPhoto && (
                <p className="text-center text-xs mt-2.5" style={{ color: "var(--text-muted)" }}>
                  {t("takePhotoHint")}
                </p>
              )}
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

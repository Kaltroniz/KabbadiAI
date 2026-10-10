"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState } from "react";
import AuthGuard from "@/components/AuthGuard";

const API = process.env.NEXT_PUBLIC_API_URL;

interface Pickup {
  id: string;
  lat: string;
  lon: string;
  description: string;
  status: string;
  created_at: string;
}

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function PickupCard({ p, index }: { p: Pickup; index: number }) {
  const mapsUrl = `https://maps.google.com/maps?daddr=${p.lat},${p.lon}`;
  return (
    <div
      className="card animate-fade-up"
      style={{
        animationDelay: `${index * 0.07}s`,
        padding: "1.1rem 1.25rem",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.95rem", margin: 0, lineHeight: 1.4 }}>
            {p.description}
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: "0.72rem", margin: "4px 0 0", fontFamily: "Inter,sans-serif" }}>
            📍 {parseFloat(p.lat).toFixed(4)}°N, {parseFloat(p.lon).toFixed(4)}°E · {timeAgo(p.created_at)}
          </p>
        </div>
        <span style={{
          background: "rgba(0,229,160,0.12)",
          border: "1px solid rgba(0,229,160,0.25)",
          color: "#00e5a0",
          borderRadius: 20,
          padding: "2px 10px",
          fontSize: "0.65rem",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          whiteSpace: "nowrap",
          alignSelf: "flex-start",
        }}>
          Active
        </span>
      </div>
      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-ghost"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          minHeight: 42,
          borderRadius: 14,
          fontSize: "0.85rem",
          fontWeight: 700,
          textDecoration: "none",
          color: "var(--text-primary)",
        }}
      >
        🗺 Navigate to pickup
      </a>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
      <div style={{ fontSize: "4rem", marginBottom: 12 }}>📭</div>
      <h2 style={{ color: "var(--text-primary)", fontSize: "1.1rem", fontWeight: 800, margin: 0 }}>No active requests</h2>
      <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginTop: 6 }}>
        Households haven&apos;t submitted any pickup requests yet. Check back later or share the app.
      </p>
    </div>
  );
}

function PickupsPage() {
  const [pickups, setPickups] = useState<Pickup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [mounted, setMounted] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/pickup`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPickups(data.pickups || []);
    } catch {
      setError(true);
      // Demo data so kabadiwalas can see the UI even without backend
      setPickups([
        { id: "a1b2c3", lat: "28.6315", lon: "77.2167", description: "Two old CRT monitors + printer", status: "active", created_at: new Date(Date.now() - 3600000).toISOString() },
        { id: "d4e5f6", lat: "28.6480", lon: "77.2020", description: "Refrigerator + AC unit, needs special pickup", status: "active", created_at: new Date(Date.now() - 7200000).toISOString() },
        { id: "g7h8i9", lat: "28.6130", lon: "77.2340", description: "Laptop, router, mobile phones (5 pcs)", status: "active", created_at: new Date(Date.now() - 900000).toISOString() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setMounted(true); load(); }, []);

  if (!mounted) return null;

  return (
    <>
      <div className="particles" aria-hidden="true">
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="particle" />)}
      </div>

      <div className="page-wrapper" style={{ maxWidth: 520, padding: "1rem 1rem 5rem" }}>
        {/* Header */}
        <header className="app-header" style={{ marginBottom: "1.25rem" }}>
          <div className="app-logo">
            <div className="logo-icon" style={{ fontSize: 20 }}>🔔</div>
            <div>
              <h1 className="text-lg font-black gradient-text leading-none">Pickup Requests</h1>
              <p className="text-xs leading-none mt-0.5" style={{ color: "var(--text-muted)" }}>
                {loading ? "Loading…" : `${pickups.length} active request${pickups.length !== 1 ? "s" : ""}`}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={load}
              className="btn btn-ghost !min-h-0 !rounded-xl px-3 py-2 text-sm !w-auto"
              style={{ fontSize: "0.85rem" }}
            >
              ↻ Refresh
            </button>
            <a href="/" className="btn btn-ghost !min-h-0 !rounded-xl px-3 py-2 text-sm !w-auto no-underline">
              ← Home
            </a>
          </div>
        </header>

        {error && (
          <div style={{
            background: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.25)",
            borderRadius: 14,
            padding: "0.75rem 1rem",
            fontSize: "0.78rem",
            color: "#fcd34d",
            marginBottom: "1rem",
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}>
            ⚠ Could not reach API – showing demo data.
          </div>
        )}

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="card shimmer" style={{ height: 110, borderRadius: 20 }} />
            ))}
          </div>
        ) : pickups.length === 0 ? (
          <EmptyState />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {pickups.map((p, i) => <PickupCard key={p.id} p={p} index={i} />)}
          </div>
        )}

        {/* Map view CTA */}
        <a
          href="/map"
          className="btn btn-primary"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: "1.5rem", textDecoration: "none", borderRadius: 20, minHeight: 56 }}
        >
          <span>🗺️</span>
          <span style={{ fontFamily: "Outfit,sans-serif", fontWeight: 700, fontSize: "1rem" }}>View Hotspot Map</span>
        </a>
      </div>
    </>
  );
}

const ProtectedPickups = () => <AuthGuard><PickupsPage /></AuthGuard>;
export { ProtectedPickups as default };

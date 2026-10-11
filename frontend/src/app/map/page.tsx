"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";

const API = process.env.NEXT_PUBLIC_API_URL;

// Leaflet must be loaded client-side only (no SSR) with default-exported component
const HotspotMap = dynamic(() => import("@/components/HotspotMap"), {
  ssr: false,
  loading: () => (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(15,25,20,0.9)" }}>
      <div style={{ position: "relative", width: 48, height: 48 }}>
        <div className="orbit-dot" />
        <div className="orbit-dot" />
        <div className="orbit-dot" />
      </div>
      <p style={{ color: "var(--text-muted)", marginTop: 16, fontSize: "0.9rem" }}>Loading map data…</p>
    </div>
  ),
});

interface Hotspot {
  lat: number;
  lon: number;
  lot_count: number;
  item_count: number;
  hazard_count: number;
  has_hazard: boolean;
}

function StatPill({ label, value, color = "#00e5a0" }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.06)",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 14,
      padding: "0.6rem 1rem",
      textAlign: "center",
      flex: 1,
    }}>
      <div style={{ color, fontSize: "1.5rem", fontWeight: 900, fontFamily: "Outfit,sans-serif" }}>{value}</div>
      <div style={{ color: "rgba(200,235,220,0.6)", fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function MapPage() {
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [totalLots, setTotalLots] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showCenters, setShowCenters] = useState(true);
  const [showHotspots, setShowHotspots] = useState(true);
  useEffect(() => {
    setMounted(true);

    const fetchHotspots = async () => {
      try {
        const res = await fetch(`${API}/hotspots`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        setHotspots(data.hotspots || []);
        setTotalLots(data.total_lots || 0);
      } catch {
        setError(true);
        // Use mock data so the map is always visible during dev / demo
        setHotspots([
          { lat: 28.63, lon: 77.22, lot_count: 14, item_count: 38, hazard_count: 3, has_hazard: true },
          { lat: 28.65, lon: 77.20, lot_count: 7,  item_count: 19, hazard_count: 0, has_hazard: false },
          { lat: 28.61, lon: 77.25, lot_count: 21, item_count: 55, hazard_count: 6, has_hazard: true },
          { lat: 28.70, lon: 77.15, lot_count: 5,  item_count: 11, hazard_count: 0, has_hazard: false },
          { lat: 28.58, lon: 77.30, lot_count: 3,  item_count: 8,  hazard_count: 1, has_hazard: true },
        ]);
        setTotalLots(50);
      } finally {
        setLoading(false);
      }
    };

    fetchHotspots();
  }, []);

  const maxLots = Math.max(...hotspots.map(h => h.lot_count), 1);
  const totalHazardZones = hotspots.filter(h => h.has_hazard).length;

  const markerRadius = useCallback(
    (lot_count: number) => Math.max(8, Math.min(32, 8 + (lot_count / maxLots) * 24)),
    [maxLots]
  );

  if (!mounted) return null;

  return (
    <>
      {/* Particles */}
      <div className="particles" aria-hidden="true">
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="particle" />)}
      </div>

      <div className="page-wrapper" style={{ maxWidth: 520, padding: "1rem 1rem 4rem" }}>
        {/* Header */}
        <header className="app-header" style={{ marginBottom: "1.25rem" }}>
          <div className="app-logo">
            <div className="logo-icon" style={{ fontSize: 20 }}>🗺️</div>
            <div>
              <h1 className="text-lg font-black gradient-text leading-none">E-Waste Map & Centers</h1>
              <p className="text-xs leading-none mt-0.5" style={{ color: "var(--text-muted)" }}>Hotspots & 262 Listed Centers (Approx. Locations)</p>
            </div>
          </div>
          <a
            href="/"
            className="btn btn-ghost !min-h-0 !rounded-xl px-3 py-2 text-sm !w-auto no-underline"
          >
            ← Home
          </a>
        </header>

        {/* Stat pills */}
        <div style={{ display: "flex", gap: 8, marginBottom: "1rem" }}>
          <StatPill label="Lots Scanned" value={totalLots} color="#00e5a0" />
          <StatPill label="Hazard Zones" value={totalHazardZones} color="#f87171" />
          <StatPill label="Centers Listed" value={262} color="#fbbf24" />
        </div>

        {/* Layer Filters */}
        <div style={{ display: "flex", gap: 8, marginBottom: "0.85rem" }}>
          <button
            onClick={() => setShowCenters(!showCenters)}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "7px 10px",
              borderRadius: 12,
              fontSize: "0.78rem",
              fontWeight: 700,
              cursor: "pointer",
              transition: "all 0.2s",
              background: showCenters ? "rgba(245,158,11,0.18)" : "rgba(255,255,255,0.04)",
              border: `1.5px solid ${showCenters ? "rgba(245,158,11,0.45)" : "rgba(255,255,255,0.08)"}`,
              color: showCenters ? "#fbbf24" : "var(--text-muted)",
            }}
          >
            <span>📍</span>
            <span>Listed Centers (262)</span>
            <span style={{ fontSize: "10px", opacity: 0.8 }}>{showCenters ? "✓" : ""}</span>
          </button>
          <button
            onClick={() => setShowHotspots(!showHotspots)}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "7px 10px",
              borderRadius: 12,
              fontSize: "0.78rem",
              fontWeight: 700,
              cursor: "pointer",
              transition: "all 0.2s",
              background: showHotspots ? "rgba(0,229,160,0.18)" : "rgba(255,255,255,0.04)",
              border: `1.5px solid ${showHotspots ? "rgba(0,229,160,0.45)" : "rgba(255,255,255,0.08)"}`,
              color: showHotspots ? "#00e5a0" : "var(--text-muted)",
            }}
          >
            <span>🔥</span>
            <span>Hotspots</span>
            <span style={{ fontSize: "10px", opacity: 0.8 }}>{showHotspots ? "✓" : ""}</span>
          </button>
        </div>

        {/* Legend */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: "0.75rem", paddingLeft: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div className="center-marker-badge center-marker-point" style={{ width: 14, height: 14, fontSize: 8 }}>📍</div>
            <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 600 }}>Drop-off Point</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div className="center-marker-badge center-marker-recycler" style={{ width: 14, height: 14, fontSize: 8 }}>🏢</div>
            <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 600 }}>Recycler</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#f87171", boxShadow: "0 0 8px rgba(248,113,113,0.6)" }} />
            <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 600 }}>Hazard Zone</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#00e5a0", boxShadow: "0 0 8px rgba(0,229,160,0.6)" }} />
            <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 600 }}>Safe Zone</span>
          </div>
        </div>

        {/* Map container */}
        <div style={{
          borderRadius: 20,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 0 40px rgba(0,229,160,0.12), 0 8px 32px rgba(0,0,0,0.5)",
          height: 440,
          position: "relative",
        }}>
          {loading ? (
            <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(15,25,20,0.9)" }}>
              <div style={{ position: "relative", width: 48, height: 48 }}>
                <div className="orbit-dot" />
                <div className="orbit-dot" />
                <div className="orbit-dot" />
              </div>
              <p style={{ color: "var(--text-muted)", marginTop: 16, fontSize: "0.9rem" }}>Loading map data…</p>
            </div>
          ) : (
            <HotspotMap
              hotspots={hotspots}
              markerRadius={markerRadius}
              showCenters={showCenters}
              showHotspots={showHotspots}
            />
          )}
        </div>

        {error && (
          <p style={{ color: "rgba(248,113,113,0.8)", fontSize: "0.75rem", marginTop: 8, textAlign: "center" }}>
            ⚠ Could not reach API — showing demo data.
          </p>
        )}

        {/* Route planning hint */}
        <div className="card" style={{ marginTop: "1.25rem", padding: "1rem 1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "1.6rem" }}>🚛</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-primary)" }}>Route Planning Tip</div>
              <p style={{ color: "var(--text-muted)", fontSize: "0.78rem", margin: "2px 0 0" }}>
                Prioritize <span style={{ color: "#f87171" }}>red zones</span> — they have hazardous materials needing specialized handling. Pins use approximate city coordinates; tap <b>Get Directions</b> for exact street address routing.
              </p>
            </div>
          </div>
        </div>

        {/* Back to Scanner */}
        <a
          href="/"
          className="btn btn-primary"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: "1rem", textDecoration: "none", borderRadius: 20, minHeight: 52 }}
        >
          <span>📷</span>
          <span style={{ fontFamily: "Outfit,sans-serif", fontWeight: 700, fontSize: "1rem" }}>Back to Scanner</span>
        </a>
      </div>
    </>
  );
}

export default MapPage;

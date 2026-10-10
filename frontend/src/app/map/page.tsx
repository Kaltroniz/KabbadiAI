"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";
import AuthGuard from "@/components/AuthGuard";

const API = process.env.NEXT_PUBLIC_API_URL;

// Leaflet must be loaded client-side only (no SSR)
const MapContainer   = dynamic(() => import("react-leaflet").then(m => m.MapContainer),   { ssr: false });
const TileLayer      = dynamic(() => import("react-leaflet").then(m => m.TileLayer),      { ssr: false });
const CircleMarker   = dynamic(() => import("react-leaflet").then(m => m.CircleMarker),   { ssr: false });
const Popup          = dynamic(() => import("react-leaflet").then(m => m.Popup),          { ssr: false });

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
  const leafletFixed = useRef(false);

  useEffect(() => {
    setMounted(true);

    // Fix Leaflet default icon path in Next.js
    if (!leafletFixed.current && typeof window !== "undefined") {
      leafletFixed.current = true;
      import("leaflet").then((L) => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        delete (L.Icon.Default.prototype as any)._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
          iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
          shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
        });
      });
    }

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
  const totalItems = hotspots.reduce((s, h) => s + h.item_count, 0);

  const markerRadius = (lot_count: number) => Math.max(8, Math.min(32, 8 + (lot_count / maxLots) * 24));

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
              <h1 className="text-lg font-black gradient-text leading-none">E-Waste Hotspot Map</h1>
              <p className="text-xs leading-none mt-0.5" style={{ color: "var(--text-muted)" }}>Real-time density from scanned lots</p>
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
        <div style={{ display: "flex", gap: 10, marginBottom: "1.25rem" }}>
          <StatPill label="Lots Scanned" value={totalLots} color="#00e5a0" />
          <StatPill label="Items Tracked" value={totalItems} color="#6ee7b7" />
          <StatPill label="Hazard Zones" value={totalHazardZones} color="#f87171" />
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 16, marginBottom: "0.75rem", paddingLeft: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#f87171", boxShadow: "0 0 8px rgba(248,113,113,0.6)" }} />
            <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 600 }}>Hazardous zone</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#00e5a0", boxShadow: "0 0 8px rgba(0,229,160,0.6)" }} />
            <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 600 }}>Safe zone</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 20, height: 8, borderRadius: 4, background: "linear-gradient(90deg,#6ee7b7,#00e5a0,#00e5a0,#f87171)" }} />
            <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 600 }}>Size = lot volume</span>
          </div>
        </div>

        {/* Map container */}
        <div style={{
          borderRadius: 20,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 0 40px rgba(0,229,160,0.12), 0 8px 32px rgba(0,0,0,0.5)",
          height: 420,
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
            <MapContainer
              center={hotspots.length ? [hotspots[0].lat, hotspots[0].lon] : [28.6, 77.2]}
              zoom={11}
              style={{ width: "100%", height: "100%" }}
              scrollWheelZoom={true}
            >
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://carto.com/">CARTO</a>'
              />
              {hotspots.map((h, i) => (
                <CircleMarker
                  key={i}
                  center={[h.lat, h.lon]}
                  radius={markerRadius(h.lot_count)}
                  pathOptions={{
                    fillColor: h.has_hazard ? "#f87171" : "#00e5a0",
                    fillOpacity: 0.82,
                    color: h.has_hazard ? "#dc2626" : "#047857",
                    weight: 2,
                  }}
                >
                  <Popup>
                    <div style={{ fontFamily: "Inter,sans-serif", minWidth: 160 }}>
                      <strong style={{ fontSize: "0.95rem", display: "block", marginBottom: 6 }}>
                        {h.has_hazard ? "⚠️ Hazardous Zone" : "✅ Clean Zone"}
                      </strong>
                      <div style={{ color: "#555", fontSize: "0.82rem", lineHeight: 1.7 }}>
                        <div>📦 <b>{h.lot_count}</b> lots scanned</div>
                        <div>🔩 <b>{h.item_count}</b> items identified</div>
                        {h.has_hazard && <div style={{ color: "#dc2626" }}>☣️ <b>{h.hazard_count}</b> hazard flags</div>}
                        <div style={{ marginTop: 6, color: "#888", fontSize: "0.75rem" }}>{h.lat.toFixed(2)}°N, {h.lon.toFixed(2)}°E</div>
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
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
                Prioritize <span style={{ color: "#f87171" }}>red zones</span> — they have hazardous materials needing specialized handling. Larger circles = higher pickup volume.
              </p>
            </div>
          </div>
        </div>

        {/* Nav to pickups */}
        <a
          href="/pickups"
          className="btn btn-primary"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: "1rem", textDecoration: "none", borderRadius: 20, minHeight: 56 }}
        >
          <span>🔔</span>
          <span style={{ fontFamily: "Outfit,sans-serif", fontWeight: 700, fontSize: "1rem" }}>View Pickup Requests</span>
        </a>
      </div>
    </>
  );
}

const ProtectedMap = () => <AuthGuard><MapPage /></AuthGuard>;
export { ProtectedMap as default };

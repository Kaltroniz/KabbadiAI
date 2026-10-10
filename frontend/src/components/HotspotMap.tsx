"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface Hotspot {
  lat: number;
  lon: number;
  lot_count: number;
  item_count: number;
  hazard_count: number;
  has_hazard: boolean;
}

interface HotspotMapProps {
  hotspots: Hotspot[];
  markerRadius: (lot_count: number) => number;
}

export default function HotspotMap({ hotspots, markerRadius }: HotspotMapProps) {
  useEffect(() => {
    // Fix Leaflet's default marker icon paths in client-side bundle
    if (typeof window !== "undefined") {
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
        iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      });
    }
  }, []);

  const center: [number, number] = hotspots.length > 0
    ? [hotspots[0].lat, hotspots[0].lon]
    : [28.61, 77.23];

  return (
    <MapContainer
      center={center}
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
          key={`${h.lat}-${h.lon}-${i}`}
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
              <div style={{ color: "#333", fontSize: "0.82rem", lineHeight: 1.7 }}>
                <div>📦 <b>{h.lot_count}</b> lots scanned</div>
                <div>🔩 <b>{h.item_count}</b> items identified</div>
                {h.has_hazard && <div style={{ color: "#dc2626" }}>☣️ <b>{h.hazard_count}</b> hazard flags</div>}
                <div style={{ marginTop: 6, color: "#888", fontSize: "0.75rem" }}>
                  {h.lat.toFixed(2)}°N, {h.lon.toFixed(2)}°E
                </div>
              </div>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}

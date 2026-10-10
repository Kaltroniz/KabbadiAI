"use client";
import React, { useEffect, useRef } from "react";
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
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Clean up existing map instance if already initialized
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const center: [number, number] = hotspots.length > 0
      ? [hotspots[0].lat, hotspots[0].lon]
      : [28.61, 77.23];

    const map = L.map(mapContainerRef.current, {
      center,
      zoom: 11,
      scrollWheelZoom: true,
    });
    mapInstanceRef.current = map;

    // 100% free OpenStreetMap tiles with sleek dark mode filter — zero API key required
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
      className: "dark-map-tiles",
    }).addTo(map);

    // Plot each hotspot circle marker with clean popups
    hotspots.forEach((h) => {
      const radius = markerRadius(h.lot_count);
      const circle = L.circleMarker([h.lat, h.lon], {
        radius,
        fillColor: h.has_hazard ? "#f87171" : "#00e5a0",
        fillOpacity: 0.85,
        color: h.has_hazard ? "#dc2626" : "#047857",
        weight: 2,
      });

      const popupContent = `
        <div style="font-family: Inter, sans-serif; min-width: 160px; color: #f3f4f6;">
          <strong style="font-size: 0.95rem; display: block; margin-bottom: 6px; color: ${h.has_hazard ? '#fca5a5' : '#6ee7b7'};">
            ${h.has_hazard ? "⚠️ Hazardous Zone" : "✅ Clean Zone"}
          </strong>
          <div style="color: #d1d5db; font-size: 0.82rem; line-height: 1.7;">
            <div>📦 <b style="color: #fff;">${h.lot_count}</b> lots scanned</div>
            <div>🔩 <b style="color: #fff;">${h.item_count}</b> items identified</div>
            ${h.has_hazard ? `<div style="color: #f87171; font-weight: bold;">☣️ <b>${h.hazard_count}</b> hazard flags</div>` : ""}
            <div style="margin-top: 6px; color: #9ca3af; font-size: 0.75rem;">
              ${h.lat.toFixed(2)}°N, ${h.lon.toFixed(2)}°E
            </div>
          </div>
        </div>
      `;

      circle.bindPopup(popupContent);
      circle.addTo(map);
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [hotspots, markerRadius]);

  return (
    <div
      ref={mapContainerRef}
      style={{ width: "100%", height: "100%", minHeight: 420 }}
    />
  );
}

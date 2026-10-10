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

    // Dark theme cartodb tiles
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);

    // Plot each hotspot circle marker with clean popups
    hotspots.forEach((h) => {
      const radius = markerRadius(h.lot_count);
      const circle = L.circleMarker([h.lat, h.lon], {
        radius,
        fillColor: h.has_hazard ? "#f87171" : "#00e5a0",
        fillOpacity: 0.82,
        color: h.has_hazard ? "#dc2626" : "#047857",
        weight: 2,
      });

      const popupContent = `
        <div style="font-family: Inter, sans-serif; min-width: 160px; color: #111;">
          <strong style="font-size: 0.95rem; display: block; margin-bottom: 6px;">
            ${h.has_hazard ? "⚠️ Hazardous Zone" : "✅ Clean Zone"}
          </strong>
          <div style="color: #444; font-size: 0.82rem; line-height: 1.7;">
            <div>📦 <b>${h.lot_count}</b> lots scanned</div>
            <div>🔩 <b>${h.item_count}</b> items identified</div>
            ${h.has_hazard ? `<div style="color: #dc2626; font-weight: bold;">☣️ <b>${h.hazard_count}</b> hazard flags</div>` : ""}
            <div style="margin-top: 6px; color: #777; font-size: 0.75rem;">
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

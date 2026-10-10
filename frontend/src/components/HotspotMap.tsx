"use client";
import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import collectionCentersData from "@/data/collection_centers.json";

export interface Hotspot {
  lat: number;
  lon: number;
  lot_count: number;
  item_count: number;
  hazard_count: number;
  has_hazard: boolean;
}

export interface CollectionCenter {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  lat: number;
  lon: number;
  kind: "collection_point" | "recycler";
  toll_free?: string | null;
  capacity_mta?: number | null;
  notes?: string | null;
}

interface HotspotMapProps {
  hotspots: Hotspot[];
  markerRadius: (lot_count: number) => number;
  showCenters?: boolean;
  showHotspots?: boolean;
}

export default function HotspotMap({
  hotspots,
  markerRadius,
  showCenters = true,
  showHotspots = true,
}: HotspotMapProps) {
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

    // 1. Plot Scanned Lot Hotspots (if enabled)
    if (showHotspots) {
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
          <div style="font-family: Inter, sans-serif; min-width: 170px; color: #f3f4f6;">
            <strong style="font-size: 0.95rem; display: block; margin-bottom: 6px; color: ${h.has_hazard ? '#fca5a5' : '#6ee7b7'};">
              ${h.has_hazard ? "⚠️ Hazardous Lot Zone" : "✅ Clean Lot Zone"}
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
    }

    // 2. Plot Collection Centers & Recyclers with small icons (if enabled)
    if (showCenters) {
      const pointIcon = L.divIcon({
        className: "custom-leaflet-marker",
        html: `<div class="center-marker-badge center-marker-point" title="Drop-off Collection Point"><span>📍</span></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        popupAnchor: [0, -10],
      });

      const recyclerIcon = L.divIcon({
        className: "custom-leaflet-marker",
        html: `<div class="center-marker-badge center-marker-recycler" title="Authorized Recycler"><span>🏢</span></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        popupAnchor: [0, -10],
      });

      const centers = collectionCentersData as CollectionCenter[];

      centers.forEach((center) => {
        const isRecycler = center.kind === "recycler";
        const marker = L.marker([center.lat, center.lon], {
          icon: isRecycler ? recyclerIcon : pointIcon,
        });

        const popupContent = `
          <div style="font-family: Inter, sans-serif; min-width: 210px; color: #f3f4f6;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px;">
              <span style="font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 2px 7px; border-radius: 6px; background: ${isRecycler ? 'rgba(14,165,233,0.18)' : 'rgba(245,158,11,0.18)'}; color: ${isRecycler ? '#38bdf8' : '#fbbf24'}; border: 1px solid ${isRecycler ? 'rgba(14,165,233,0.35)' : 'rgba(245,158,11,0.35)'};">
                ${isRecycler ? '🏢 Authorized Recycler' : '📍 Drop-off Center'}
              </span>
              <span style="font-size: 0.72rem; color: #9ca3af; font-weight: 500;">${center.city || ''}</span>
            </div>
            <strong style="font-size: 0.95rem; display: block; color: #ffffff; line-height: 1.3; margin-bottom: 4px;">
              ${center.name}
            </strong>
            <div style="font-size: 0.78rem; color: #9ca3af; line-height: 1.4; margin-bottom: 8px;">
              ${center.address}
            </div>
            ${center.toll_free ? `
              <div style="display: flex; align-items: center; gap: 5px; font-size: 0.8rem; font-weight: 600; color: #34d399; margin-bottom: 6px;">
                <span>📞</span> <span>Toll-Free: ${center.toll_free}</span>
              </div>
            ` : ''}
            ${center.capacity_mta ? `
              <div style="font-size: 0.78rem; font-weight: 600; color: #38bdf8; margin-bottom: 6px;">
                ⚙️ Capacity: ${center.capacity_mta} MTA
              </div>
            ` : ''}
            ${center.notes ? `
              <div style="font-size: 0.72rem; color: #d1d5db; font-style: italic; background: rgba(255,255,255,0.06); padding: 5px 8px; border-radius: 6px; margin-bottom: 8px; line-height: 1.35;">
                ${center.notes}
              </div>
            ` : ''}
            <a
              href="https://www.google.com/maps/dir/?api=1&destination=${center.lat},${center.lon}"
              target="_blank"
              rel="noopener noreferrer"
              style="display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; padding: 7px 10px; border-radius: 8px; background: rgba(0,229,160,0.15); border: 1px solid rgba(0,229,160,0.35); color: #00e5a0; text-decoration: none; font-size: 0.8rem; font-weight: 700; margin-top: 4px;"
            >
              <span>🧭</span> <span>Get Directions</span>
            </a>
          </div>
        `;

        marker.bindPopup(popupContent);
        marker.addTo(map);
      });
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [hotspots, markerRadius, showCenters, showHotspots]);

  return (
    <div
      ref={mapContainerRef}
      style={{ width: "100%", height: "100%", minHeight: 440 }}
    />
  );
}

"use client";
import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_ATTRIBUTION = process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

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

// Jitter function: prevents facilities sharing exact city/area center coordinates
// (e.g., 30 in Jaipur, 10 in Faridabad) from stacking completely on top of each other.
function getJitteredCenters(centers: CollectionCenter[]): (CollectionCenter & { displayLat: number; displayLon: number })[] {
  const groups: Record<string, number> = {};
  centers.forEach((c) => {
    const key = `${c.lat.toFixed(4)},${c.lon.toFixed(4)}`;
    groups[key] = (groups[key] || 0) + 1;
  });

  const groupIndex: Record<string, number> = {};

  return centers.map((c) => {
    const key = `${c.lat.toFixed(4)},${c.lon.toFixed(4)}`;
    const totalInGroup = groups[key];
    const idx = groupIndex[key] || 0;
    groupIndex[key] = idx + 1;

    if (totalInGroup <= 1) {
      return { ...c, displayLat: c.lat, displayLon: c.lon };
    }

    // Deterministic golden-angle spiral distribution (~300m - 1.2km)
    const angle = idx * 2.399963;
    const radius = 0.0035 + 0.0022 * Math.sqrt(idx);
    const latRad = (c.lat * Math.PI) / 180;
    const cosLat = Math.cos(latRad) || 1;

    const displayLat = c.lat + radius * Math.cos(angle);
    const displayLon = c.lon + (radius * Math.sin(angle)) / cosLat;

    return { ...c, displayLat, displayLon };
  });
}

export default function HotspotMap({
  hotspots,
  markerRadius,
  showCenters = true,
  showHotspots = true,
}: HotspotMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const hotspotLayerRef = useRef<L.LayerGroup | null>(null);
  const centerLayerRef = useRef<L.LayerGroup | null>(null);
  const userLayerRef = useRef<L.LayerGroup | null>(null);
  const hasCenteredOnUserRef = useRef(false);
  const [centers, setCenters] = useState<CollectionCenter[]>([]);

  // Lazy load collection centers on demand
  useEffect(() => {
    if (showCenters && centers.length === 0) {
      import("@/data/collection_centers.json").then((mod) => {
        setCenters(mod.default as CollectionCenter[]);
      }).catch((err) => {
        console.warn("Could not lazy-load collection centers:", err);
      });
    }
  }, [showCenters, centers.length]);

  // 1. Initialize Map and Tile Layer ONCE
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Default center (Delhi-NCR or first hotspot if present)
    const initialCenter: [number, number] = hotspots.length > 0
      ? [hotspots[0].lat, hotspots[0].lon]
      : [28.6139, 77.2090];

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: 11,
      scrollWheelZoom: true,
    });
    mapInstanceRef.current = map;

    // Configurable production tiles (defaults to CartoCDN dark tiles with fallback)
    L.tileLayer(TILE_URL, {
      attribution: TILE_ATTRIBUTION,
      subdomains: "abcd",
      maxZoom: 19,
      className: "dark-map-tiles",
    }).addTo(map);

    // Create persistent LayerGroups
    const hotspotLayer = L.layerGroup().addTo(map);
    const centerLayer = L.layerGroup().addTo(map);
    const userLayer = L.layerGroup().addTo(map);

    hotspotLayerRef.current = hotspotLayer;
    centerLayerRef.current = centerLayer;
    userLayerRef.current = userLayer;

    // Center map on user location if browser geolocation is permitted
    if (typeof window !== "undefined" && navigator.geolocation && !hasCenteredOnUserRef.current) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!mapInstanceRef.current) return;
          const { latitude, longitude } = pos.coords;
          hasCenteredOnUserRef.current = true;
          mapInstanceRef.current.setView([latitude, longitude], 12);

          const userIcon = L.divIcon({
            className: "custom-user-marker",
            html: `<div style="width: 16px; height: 16px; border-radius: 50%; background: #38bdf8; border: 2.5px solid #ffffff; box-shadow: 0 0 14px #38bdf8; animation: pulse 2s infinite;"></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8],
          });
          L.marker([latitude, longitude], { icon: userIcon })
            .bindPopup("<div style='font-family: Inter, sans-serif; font-weight: 700; color: #38bdf8;'>📍 Your Current Location</div>")
            .addTo(userLayer);
        },
        () => {
          // Geolocation unavailable or denied; remain at initial center
        },
        { timeout: 6000, maximumAge: 60000 }
      );
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        hotspotLayerRef.current = null;
        centerLayerRef.current = null;
        userLayerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  // 2. Update Hotspot Markers without recreating the map
  useEffect(() => {
    const layer = hotspotLayerRef.current;
    if (!layer) return;

    layer.clearLayers();

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
        circle.addTo(layer);
      });
    }
  }, [hotspots, markerRadius, showHotspots]);

  // 3. Update Collection Center Markers with Jitter & Street-Address Directions
  useEffect(() => {
    const layer = centerLayerRef.current;
    if (!layer) return;

    layer.clearLayers();

    if (showCenters && centers.length > 0) {
      const pointIcon = L.divIcon({
        className: "custom-leaflet-marker",
        html: `<div class="center-marker-badge center-marker-point" title="Drop-off Collection Point (Approximate Area)"><span>📍</span></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        popupAnchor: [0, -10],
      });

      const recyclerIcon = L.divIcon({
        className: "custom-leaflet-marker",
        html: `<div class="center-marker-badge center-marker-recycler" title="Authorized Recycler (CPCB/SPCB Listed)"><span>🏢</span></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        popupAnchor: [0, -10],
      });

      const jittered = getJitteredCenters(centers);

      jittered.forEach((center) => {
        const isRecycler = center.kind === "recycler";
        const marker = L.marker([center.displayLat, center.displayLon], {
          icon: isRecycler ? recyclerIcon : pointIcon,
        });

        // Use facility name + street address in directions URL to avoid routing to rough city centers
        const destParts = [center.name, center.address, center.city, center.state].filter(Boolean);
        const destQuery = destParts.length > 0
          ? encodeURIComponent(destParts.join(", "))
          : `${center.lat},${center.lon}`;
        const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${destQuery}`;

        const popupContent = `
          <div style="font-family: Inter, sans-serif; min-width: 210px; color: #f3f4f6;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px;">
              <span style="font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 2px 7px; border-radius: 6px; background: ${isRecycler ? 'rgba(14,165,233,0.18)' : 'rgba(245,158,11,0.18)'}; color: ${isRecycler ? '#38bdf8' : '#fbbf24'}; border: 1px solid ${isRecycler ? 'rgba(14,165,233,0.35)' : 'rgba(245,158,11,0.35)'};">
                ${isRecycler ? '🏢 CPCB Authorized Recycler' : '📍 Listed Drop-off Center'}
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
              href="${directionsUrl}"
              target="_blank"
              rel="noopener noreferrer"
              style="display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; padding: 7px 10px; border-radius: 8px; background: rgba(0,229,160,0.15); border: 1px solid rgba(0,229,160,0.35); color: #00e5a0; text-decoration: none; font-size: 0.8rem; font-weight: 700; margin-top: 4px;"
            >
              <span>🧭</span> <span>Get Directions</span>
            </a>
          </div>
        `;

        marker.bindPopup(popupContent);
        marker.addTo(layer);
      });
    }
  }, [showCenters, centers]);

  return (
    <div
      ref={mapContainerRef}
      style={{ width: "100%", height: "100%", minHeight: 440 }}
    />
  );
}

"use client";
import React from "react";
import { useGamification } from "@/contexts/GamificationContext";

export default function ImpactDashboard({ showShare = true }: { showShare?: boolean }) {
  const { impact, level, streak } = useGamification();

  const shareImpact = () => {
    const text = `🌿 *My E-Waste Green Impact Report (KabadiAI)*\n` +
      `👤 Level: ${level.name} (Lvl ${level.level})\n` +
      `🔥 Active Streak: ${streak} Days\n` +
      `⚖️ Toxic E-Waste Diverted: ${impact.total_weight_kg} kg\n` +
      `☁️ CO₂ Emissions Offset: ${impact.co2_offset_kg} kg CO₂\n` +
      `⚡ Energy Saved: ${impact.energy_saved_kwh} kWh\n` +
      `🌳 Equivalent Trees Saved: ${impact.trees_equivalent} trees/yr\n` +
      `Track your e-waste & earn rewards: https://main.d33iyw8b7i40jw.amplifyapp.com`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
  };

  return (
    <div className="card w-full flex flex-col gap-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🌍</span>
          <div>
            <h3 className="text-base font-black text-white font-outfit leading-tight">
              Personal Green Footprint
            </h3>
            <p className="text-[11px] text-muted leading-tight">
              Your real environmental savings powered by circular recycling
            </p>
          </div>
        </div>
        <span className="text-xs font-bold text-emerald-400 bg-emerald-950/60 px-2.5 py-1 rounded-xl border border-emerald-500/30">
          Verified Impact
        </span>
      </div>

      {/* 4 Stat Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Tree equivalents */}
        <div
          className="p-3.5 rounded-2xl flex flex-col items-center text-center justify-center transition-all hover:scale-102"
          style={{ background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.25)" }}
        >
          <span className="text-2xl mb-1">🌳</span>
          <span className="text-xl font-black text-white font-outfit leading-tight">
            {impact.trees_equivalent}
          </span>
          <span className="text-[11px] text-muted font-medium mt-0.5">
            Trees Eq./Yr
          </span>
        </div>

        {/* CO2 offset */}
        <div
          className="p-3.5 rounded-2xl flex flex-col items-center text-center justify-center transition-all hover:scale-102"
          style={{ background: "rgba(56, 189, 248, 0.08)", border: "1px solid rgba(56, 189, 248, 0.25)" }}
        >
          <span className="text-2xl mb-1">☁️</span>
          <span className="text-xl font-black text-white font-outfit leading-tight">
            {impact.co2_offset_kg} <span className="text-xs text-sky-400">kg</span>
          </span>
          <span className="text-[11px] text-muted font-medium mt-0.5">
            CO₂ Offset
          </span>
        </div>

        {/* Energy conserved */}
        <div
          className="p-3.5 rounded-2xl flex flex-col items-center text-center justify-center transition-all hover:scale-102"
          style={{ background: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.25)" }}
        >
          <span className="text-2xl mb-1">⚡</span>
          <span className="text-xl font-black text-white font-outfit leading-tight">
            {impact.energy_saved_kwh} <span className="text-xs text-amber-400">kWh</span>
          </span>
          <span className="text-[11px] text-muted font-medium mt-0.5">
            Energy Saved
          </span>
        </div>

        {/* Total weight diverted */}
        <div
          className="p-3.5 rounded-2xl flex flex-col items-center text-center justify-center transition-all hover:scale-102"
          style={{ background: "rgba(168, 85, 247, 0.08)", border: "1px solid rgba(168, 85, 247, 0.25)" }}
        >
          <span className="text-2xl mb-1">⚖️</span>
          <span className="text-xl font-black text-white font-outfit leading-tight">
            {impact.total_weight_kg} <span className="text-xs text-purple-400">kg</span>
          </span>
          <span className="text-[11px] text-muted font-medium mt-0.5">
            Scrap Diverted
          </span>
        </div>
      </div>

      {/* Environmental Context / Motivation message */}
      <div
        className="p-3 rounded-2xl text-xs flex items-center gap-3"
        style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(255, 255, 255, 0.07)" }}
      >
        <span className="text-xl shrink-0">🌱</span>
        <p className="text-muted leading-relaxed">
          By avoiding backyard burning and routing obsolete electronics to authorized recyclers, you prevent toxic lead and mercury from seeping into Indian groundwater!
        </p>
      </div>

      {showShare && (
        <button
          onClick={shareImpact}
          className="btn btn-gold !min-h-0 !h-11 w-full rounded-2xl font-black text-xs flex items-center justify-center gap-2"
        >
          <span>💬</span>
          <span>Share My Impact Card on WhatsApp</span>
        </button>
      )}
    </div>
  );
}

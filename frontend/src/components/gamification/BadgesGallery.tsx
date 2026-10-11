"use client";
import React, { useState } from "react";
import { useGamification } from "@/contexts/GamificationContext";
import { ALL_BADGES, Badge, BadgeRarity } from "@/data/gamificationData";

const RARITY_THEMES: Record<BadgeRarity, { border: string; glow: string; text: string }> = {
  common: { border: "rgba(16, 185, 129, 0.4)", glow: "rgba(16, 185, 129, 0.2)", text: "#10b981" },
  uncommon: { border: "rgba(6, 182, 212, 0.5)", glow: "rgba(6, 182, 212, 0.25)", text: "#22d3ee" },
  rare: { border: "rgba(99, 102, 241, 0.6)", glow: "rgba(99, 102, 241, 0.3)", text: "#818cf8" },
  epic: { border: "rgba(217, 70, 239, 0.7)", glow: "rgba(217, 70, 239, 0.35)", text: "#e879f9" },
  legendary: { border: "rgba(245, 158, 11, 0.8)", glow: "rgba(245, 158, 11, 0.4)", text: "#fbbf24" },
};

export default function BadgesGallery() {
  const { unlockedBadges } = useGamification();
  const [category, setCategory] = useState<string>("all");
  const [selectedBadge, setSelectedBadge] = useState<Badge | null>(null);

  const filteredBadges = ALL_BADGES.filter((badge) => {
    if (category === "all") return true;
    if (category === "unlocked") return unlockedBadges.includes(badge.id);
    return badge.category === category;
  });

  const unlockedCount = ALL_BADGES.filter((b) => unlockedBadges.includes(b.id)).length;

  return (
    <div className="card w-full flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🎖️</span>
          <div>
            <h2 className="text-lg font-black text-white font-outfit leading-tight">
              30 Eco Achievements & Badges
            </h2>
            <p className="text-[11px] text-muted leading-tight">
              Unlock badges across safety, environmental diversion, and leadership
            </p>
          </div>
        </div>

        <span className="text-xs font-black text-emerald-300 bg-emerald-950/60 px-3 py-1 rounded-xl border border-emerald-500/30">
          {unlockedCount} / {ALL_BADGES.length} Unlocked
        </span>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white/5 border border-white/10 text-xs overflow-x-auto">
        {["all", "unlocked", "environmental", "safety", "community", "exploration", "streak", "special"].map((tab) => (
          <button
            key={tab}
            onClick={() => setCategory(tab)}
            className={`!min-h-0 px-2.5 py-1 rounded-lg font-bold capitalize transition-all whitespace-nowrap ${
              category === tab
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "text-muted hover:text-white"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Badges Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {filteredBadges.map((badge) => {
          const isUnlocked = unlockedBadges.includes(badge.id);
          const theme = RARITY_THEMES[badge.rarity] || RARITY_THEMES.common;

          return (
            <div
              key={badge.id}
              onClick={() => setSelectedBadge(badge)}
              className={`p-3 rounded-2xl flex flex-col items-center text-center transition-all cursor-pointer ${
                isUnlocked
                  ? "hover:scale-104 active:scale-95"
                  : "opacity-45 grayscale hover:opacity-60"
              }`}
              style={{
                background: isUnlocked
                  ? "linear-gradient(145deg, rgba(255,255,255,0.06), rgba(0,0,0,0.5))"
                  : "rgba(255,255,255,0.02)",
                border: `1.5px solid ${isUnlocked ? theme.border : "rgba(255,255,255,0.08)"}`,
                boxShadow: isUnlocked ? `0 0 20px ${theme.glow}` : "none",
              }}
            >
              <div className="text-3xl select-none mb-1.5">{badge.icon}</div>
              <span className="text-xs font-black text-white truncate max-w-full font-outfit">
                {badge.name}
              </span>
              <span className="text-[10px] text-muted truncate max-w-full mt-0.5">
                {badge.hindiName}
              </span>
              <span
                className="text-[9px] font-black uppercase mt-1.5 px-2 py-0.5 rounded-full"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  color: theme.text,
                  border: `1px solid ${theme.border}`,
                }}
              >
                {badge.rarity}
              </span>
            </div>
          );
        })}
      </div>

      {/* Inspect Badge Modal */}
      {selectedBadge && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in"
          onClick={() => setSelectedBadge(null)}
        >
          <div
            className="relative w-full max-w-sm rounded-3xl p-6 text-center animate-scale-pop"
            style={{
              background: "linear-gradient(160deg, #071710 0%, #030a07 100%)",
              border: `2px solid ${RARITY_THEMES[selectedBadge.rarity]?.border || "#00e5a0"}`,
              boxShadow: `0 0 40px ${RARITY_THEMES[selectedBadge.rarity]?.glow || "rgba(0,229,160,0.3)"}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-6xl mb-2 select-none">{selectedBadge.icon}</div>
            <h3 className="text-2xl font-black text-white font-outfit mb-0.5">
              {selectedBadge.name}
            </h3>
            <p className="text-xs text-emerald-400 font-bold mb-3">
              {selectedBadge.hindiName} · {selectedBadge.rarity.toUpperCase()}
            </p>

            <p className="text-sm text-muted leading-relaxed mb-4">
              {selectedBadge.description}
            </p>

            <div className="py-2 px-3 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-amber-300 mb-5">
              Reward: +{selectedBadge.xp} XP
            </div>

            <button
              onClick={() => setSelectedBadge(null)}
              className="btn btn-primary !min-h-0 !h-11 w-full rounded-2xl font-black text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

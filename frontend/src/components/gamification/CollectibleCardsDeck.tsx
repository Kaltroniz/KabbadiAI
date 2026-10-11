"use client";
import React, { useState } from "react";
import { useGamification } from "@/contexts/GamificationContext";
import { COLLECTIBLE_CARDS, CollectibleCard, BadgeRarity } from "@/data/gamificationData";

const RARITY_COLORS: Record<BadgeRarity, { border: string; glow: string; label: string }> = {
  common: { border: "#64748b", glow: "rgba(100, 116, 139, 0.3)", label: "Common" },
  uncommon: { border: "#10b981", glow: "rgba(16, 185, 129, 0.35)", label: "Uncommon" },
  rare: { border: "#3b82f6", glow: "rgba(59, 130, 246, 0.45)", label: "Rare" },
  epic: { border: "#a855f7", glow: "rgba(168, 85, 247, 0.55)", label: "Epic" },
  legendary: { border: "#f59e0b", glow: "rgba(245, 158, 11, 0.7)", label: "Legendary" },
};

export default function CollectibleCardsDeck() {
  const { unlockedCards } = useGamification();
  const [filter, setFilter] = useState<string>("all");
  const [selectedCard, setSelectedCard] = useState<CollectibleCard | null>(null);

  const filteredCards = COLLECTIBLE_CARDS.filter((card) => {
    if (filter === "all") return true;
    if (filter === "unlocked") return unlockedCards.includes(card.id);
    return card.rarity === filter;
  });

  const unlockedCount = COLLECTIBLE_CARDS.filter((c) => unlockedCards.includes(c.id)).length;
  const progressPercent = Math.floor((unlockedCount / COLLECTIBLE_CARDS.length) * 100);

  return (
    <div className="card w-full flex flex-col gap-5">
      {/* Deck Header & Collection Progress */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🃏</span>
            <div>
              <h2 className="text-lg font-black text-white font-outfit leading-tight">
                28 E-Waste Collectible Cards
              </h2>
              <p className="text-[11px] text-muted leading-tight">
                Scan different electronics to complete your circular economy album
              </p>
            </div>
          </div>

          <span className="text-xs font-black text-emerald-300 bg-emerald-950/60 px-3 py-1 rounded-xl border border-emerald-500/30">
            {unlockedCount} / {COLLECTIBLE_CARDS.length} Discovered ({progressPercent}%)
          </span>
        </div>

        {/* Collection progress bar */}
        <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${progressPercent}%`,
              background: "linear-gradient(90deg, #00e5a0, #38bdf8, #a855f7, #f59e0b)",
            }}
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white/5 border border-white/10 text-xs overflow-x-auto">
        {["all", "unlocked", "common", "uncommon", "rare", "epic", "legendary"].map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`!min-h-0 px-2.5 py-1 rounded-lg font-bold capitalize transition-all whitespace-nowrap ${
              filter === tab
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "text-muted hover:text-white"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
        {filteredCards.map((card) => {
          const isUnlocked = unlockedCards.includes(card.id);
          const style = RARITY_COLORS[card.rarity] || RARITY_COLORS.common;

          return (
            <div
              key={card.id}
              onClick={() => isUnlocked && setSelectedCard(card)}
              className={`relative rounded-2xl p-3 flex flex-col items-center text-center transition-all ${
                isUnlocked
                  ? "cursor-pointer hover:scale-105 active:scale-95"
                  : "opacity-45 grayscale cursor-not-allowed"
              }`}
              style={{
                background: isUnlocked
                  ? "linear-gradient(145deg, rgba(255,255,255,0.06), rgba(0,0,0,0.5))"
                  : "rgba(255,255,255,0.02)",
                border: `1.5px solid ${isUnlocked ? style.border : "rgba(255,255,255,0.1)"}`,
                boxShadow: isUnlocked ? `0 0 20px ${style.glow}` : "none",
              }}
            >
              {/* Rarity Dot */}
              <div
                className="w-2 h-2 rounded-full mb-1"
                style={{ background: isUnlocked ? style.border : "#64748b" }}
                title={style.label}
              />

              <div className="text-3xl select-none mb-1.5">
                {isUnlocked ? card.icon : "❓"}
              </div>

              <span className="text-[11px] font-black text-white truncate max-w-full font-outfit leading-tight">
                {isUnlocked ? card.name : "Locked Item"}
              </span>

              <span className="text-[9px] text-muted truncate max-w-full leading-tight mt-0.5">
                {isUnlocked ? card.value_range : "Scan to discover"}
              </span>
            </div>
          );
        })}
      </div>

      {/* Inspect Card Modal */}
      {selectedCard && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in"
          onClick={() => setSelectedCard(null)}
        >
          <div
            className="relative w-full max-w-sm rounded-3xl p-6 text-center animate-scale-pop"
            style={{
              background: "linear-gradient(160deg, #071710 0%, #030a07 100%)",
              border: `2px solid ${RARITY_COLORS[selectedCard.rarity]?.border || "#10b981"}`,
              boxShadow: `0 0 50px ${RARITY_COLORS[selectedCard.rarity]?.glow || "rgba(0,229,160,0.4)"}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-6xl mb-2 select-none">{selectedCard.icon}</div>
            <h3 className="text-2xl font-black text-white font-outfit mb-0.5">
              {selectedCard.name}
            </h3>
            <p className="text-xs text-emerald-400 font-bold mb-3">
              {selectedCard.hindiName} · {selectedCard.category}
            </p>

            <span className="inline-block text-xs font-black text-amber-300 px-3 py-1 rounded-xl bg-black/50 border border-amber-500/30 mb-4">
              Scrap Valuation: {selectedCard.value_range}
            </span>

            <div className="p-3.5 rounded-2xl text-left bg-white/5 border border-white/10 mb-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300 mb-1">
                <span>💡</span>
                <span>Did You Know?</span>
              </div>
              <p className="text-xs text-muted leading-relaxed">
                {selectedCard.fact}
              </p>
            </div>

            <p className="text-xs text-emerald-300/80 italic mb-5">
              🌿 {selectedCard.ecoTip}
            </p>

            <button
              onClick={() => setSelectedCard(null)}
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

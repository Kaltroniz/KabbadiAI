"use client";
import React from "react";
import { useGamification } from "@/contexts/GamificationContext";
import { BadgeRarity } from "@/data/gamificationData";

const CARD_RARITY_STYLE: Record<BadgeRarity, { border: string; glow: string; badgeBg: string }> = {
  common: { border: "#64748b", glow: "rgba(100, 116, 139, 0.35)", badgeBg: "#334155" },
  uncommon: { border: "#10b981", glow: "rgba(16, 185, 129, 0.45)", badgeBg: "#065f46" },
  rare: { border: "#3b82f6", glow: "rgba(59, 130, 246, 0.55)", badgeBg: "#1e40af" },
  epic: { border: "#a855f7", glow: "rgba(168, 85, 247, 0.65)", badgeBg: "#6b21a8" },
  legendary: { border: "#f59e0b", glow: "rgba(245, 158, 11, 0.8)", badgeBg: "#92400e" },
};

export default function CardUnlockModal() {
  const { celebrationCard, dismissCardModal } = useGamification();

  if (!celebrationCard) return null;

  const style = CARD_RARITY_STYLE[celebrationCard.rarity] || CARD_RARITY_STYLE.common;

  const shareCard = () => {
    const text = `🃏 I discovered a new E-Waste Card: *${celebrationCard.name}* (${celebrationCard.rarity.toUpperCase()}) on KabadiAI!\n` +
      `💡 Fact: ${celebrationCard.fact}\n` +
      `💰 Value Benchmark: ${celebrationCard.value_range}\n` +
      `Explore India's AI e-waste guide: https://main.d33iyw8b7i40jw.amplifyapp.com/cards`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in"
      onClick={dismissCardModal}
    >
      <div
        className="relative w-full max-w-sm rounded-3xl p-6 text-center animate-scale-pop overflow-hidden"
        style={{
          background: "linear-gradient(160deg, #071710 0%, #030a07 100%)",
          border: `2px solid ${style.border}`,
          boxShadow: `0 0 50px ${style.glow}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Holographic animated ribbon header */}
        <div className="flex items-center justify-between mb-4">
          <span
            className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full text-white"
            style={{ background: style.badgeBg, border: `1px solid ${style.border}` }}
          >
            {celebrationCard.rarity} Card
          </span>
          <span className="text-xs text-emerald-400 font-bold">
            New Item Unlocked! 🃏
          </span>
        </div>

        {/* Card Artwork / Icon Box */}
        <div
          className="relative w-full h-44 rounded-2xl flex flex-col items-center justify-center mb-4 overflow-hidden"
          style={{
            background: "linear-gradient(135deg, rgba(255,255,255,0.06), rgba(0,0,0,0.4))",
            border: `1.5px solid ${style.border}`,
            boxShadow: `inset 0 0 30px ${style.glow}`,
          }}
        >
          {/* Holographic beam animation */}
          <div
            className="absolute inset-0 pointer-events-none opacity-40 animate-pulse"
            style={{
              background: "linear-gradient(45deg, transparent 20%, rgba(255,255,255,0.2) 50%, transparent 80%)",
            }}
          />
          <div className="text-6xl select-none mb-2">{celebrationCard.icon}</div>
          <span className="text-xs font-black text-amber-300 px-2.5 py-1 rounded-lg bg-black/60 border border-amber-500/30">
            {celebrationCard.value_range}
          </span>
        </div>

        <h3 className="text-xl font-black text-white font-outfit mb-0.5">
          {celebrationCard.name}
        </h3>
        <p className="text-xs text-emerald-400 font-semibold mb-3">
          {celebrationCard.hindiName} · {celebrationCard.category}
        </p>

        {/* Circular Economy Fact Box */}
        <div
          className="p-3 rounded-xl text-left mb-3"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300 mb-1">
            <span>💡</span>
            <span>Circular Economy Trivia:</span>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            {celebrationCard.fact}
          </p>
        </div>

        {/* Eco Tip */}
        <p className="text-[11px] text-emerald-300/80 italic mb-5">
          🌿 Tip: {celebrationCard.ecoTip}
        </p>

        <div className="flex flex-col gap-2">
          <button
            onClick={shareCard}
            className="btn btn-gold !min-h-0 !h-11 w-full rounded-2xl font-black text-sm flex items-center justify-center gap-2"
          >
            <span>💬</span>
            <span>Share Card on WhatsApp</span>
          </button>
          <button
            onClick={dismissCardModal}
            className="btn btn-ghost !min-h-0 !h-9 w-full rounded-2xl text-xs text-muted"
          >
            Add to Album
          </button>
        </div>
      </div>
    </div>
  );
}

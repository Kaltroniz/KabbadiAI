"use client";
import React from "react";
import { useGamification } from "@/contexts/GamificationContext";
import { BadgeRarity } from "@/data/gamificationData";

const RARITY_THEMES: Record<BadgeRarity, { border: string; glow: string; text: string; bg: string }> = {
  common: {
    border: "rgba(16, 185, 129, 0.5)",
    glow: "rgba(16, 185, 129, 0.3)",
    text: "#10b981",
    bg: "rgba(6, 40, 25, 0.95)",
  },
  uncommon: {
    border: "rgba(6, 182, 212, 0.6)",
    glow: "rgba(6, 182, 212, 0.35)",
    text: "#22d3ee",
    bg: "rgba(8, 35, 45, 0.95)",
  },
  rare: {
    border: "rgba(99, 102, 241, 0.7)",
    glow: "rgba(99, 102, 241, 0.4)",
    text: "#818cf8",
    bg: "rgba(18, 16, 48, 0.95)",
  },
  epic: {
    border: "rgba(217, 70, 239, 0.8)",
    glow: "rgba(217, 70, 239, 0.5)",
    text: "#e879f9",
    bg: "rgba(42, 10, 48, 0.95)",
  },
  legendary: {
    border: "rgba(245, 158, 11, 0.9)",
    glow: "rgba(245, 158, 11, 0.6)",
    text: "#fbbf24",
    bg: "rgba(45, 26, 4, 0.95)",
  },
};

export default function BadgeUnlockModal() {
  const { celebrationBadge, dismissBadgeModal } = useGamification();

  if (!celebrationBadge) return null;

  const theme = RARITY_THEMES[celebrationBadge.rarity] || RARITY_THEMES.common;

  const shareOnWhatsApp = () => {
    const text = `🎖️ I just unlocked the *${celebrationBadge.name}* badge on KabadiAI!\n` +
      `Description: ${celebrationBadge.description}\n` +
      `Join me in recycling e-waste safely across India: https://main.d33iyw8b7i40jw.amplifyapp.com`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in"
      onClick={dismissBadgeModal}
    >
      <div
        className="relative w-full max-w-sm rounded-3xl p-6 text-center animate-scale-pop overflow-hidden"
        style={{
          background: theme.bg,
          border: `2px solid ${theme.border}`,
          boxShadow: `0 0 50px ${theme.glow}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Subtle decorative glow circle */}
        <div
          className="absolute -top-20 -left-20 w-44 h-44 rounded-full pointer-events-none"
          style={{ background: theme.glow, filter: "blur(50px)" }}
        />

        <div className="relative z-10 flex flex-col items-center">
          <span
            className="text-[11px] font-black uppercase tracking-widest px-3 py-1 rounded-full mb-3"
            style={{
              background: "rgba(255, 255, 255, 0.08)",
              border: `1px solid ${theme.border}`,
              color: theme.text,
            }}
          >
            {celebrationBadge.rarity} Badge Unlocked!
          </span>

          <div
            className="w-24 h-24 rounded-3xl flex items-center justify-center text-5xl mb-4 select-none animate-bounce"
            style={{
              background: "rgba(255, 255, 255, 0.06)",
              border: `1.5px solid ${theme.border}`,
              boxShadow: `0 0 30px ${theme.glow}`,
            }}
          >
            {celebrationBadge.icon}
          </div>

          <h3 className="text-2xl font-black text-white font-outfit mb-1">
            {celebrationBadge.name}
          </h3>
          <p className="text-xs text-emerald-400 font-semibold mb-2">
            {celebrationBadge.hindiName}
          </p>

          <p className="text-sm text-muted mb-4 leading-relaxed">
            {celebrationBadge.description}
          </p>

          <div
            className="w-full py-2 px-3 rounded-xl mb-5 flex items-center justify-center gap-2 font-black text-sm"
            style={{ background: "rgba(0, 229, 160, 0.12)", color: "#00e5a0" }}
          >
            <span>✨</span>
            <span>+{celebrationBadge.xp} Bonus XP Earned</span>
          </div>

          <div className="w-full flex flex-col gap-2.5">
            <button
              onClick={shareOnWhatsApp}
              className="btn btn-gold !min-h-0 !h-12 w-full rounded-2xl font-black text-sm flex items-center justify-center gap-2"
            >
              <span>💬</span>
              <span>Share Badge on WhatsApp</span>
            </button>
            <button
              onClick={dismissBadgeModal}
              className="btn btn-ghost !min-h-0 !h-10 w-full rounded-2xl text-xs text-muted"
            >
              Continue Scanning
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";
import React from "react";
import Link from "next/link";
import { useGamification } from "@/contexts/GamificationContext";
import { useAuth } from "@/contexts/AuthContext";
import DailyChallengesWidget from "@/components/gamification/DailyChallengesWidget";

export default function DesktopPlayerSidebar() {
  const { user } = useAuth();
  const {
    level,
    xp,
    nextLevel,
    levelProgress,
    streak,
    multiplier,
    freezeTokens,
    impact,
    unlockedCards,
  } = useGamification();

  return (
    <aside className="hidden md:flex flex-col gap-5 w-full">
      {/* 1. Player Level & Streak Hero Card */}
      {user ? (
        <div
          className="card !p-5 rounded-3xl flex flex-col gap-4 relative overflow-hidden"
          style={{
            background: "linear-gradient(145deg, rgba(0, 229, 160, 0.09) 0%, rgba(10, 25, 18, 0.9) 100%)",
            border: "1.5px solid rgba(0, 229, 160, 0.3)",
            boxShadow: "0 0 30px rgba(0, 229, 160, 0.12)",
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className="w-13 h-13 rounded-2xl flex items-center justify-center text-3xl select-none"
                style={{
                  width: 52,
                  height: 52,
                  background: "rgba(0, 229, 160, 0.14)",
                  border: "1.5px solid rgba(0, 229, 160, 0.4)",
                  boxShadow: "0 0 16px rgba(0, 229, 160, 0.25)",
                }}
              >
                {level.badge}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-emerald-300 font-outfit uppercase tracking-wider">
                    Level {level.level}
                  </span>
                  <span className="text-[10px] font-bold text-amber-300 bg-amber-950/70 px-2 py-0.5 rounded-full border border-amber-500/30">
                    🔥 {streak}d ({multiplier}x)
                  </span>
                </div>
                <h3 className="text-base font-black text-white font-outfit leading-snug">
                  {level.name}
                </h3>
                <p className="text-[11px] text-muted leading-tight">
                  {level.hindiName}
                </p>
              </div>
            </div>

            <Link
              href="/profile"
              className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 no-underline bg-emerald-950/40 px-2.5 py-1 rounded-xl border border-emerald-500/30 hover:border-emerald-400 transition-all shrink-0"
            >
              Profile →
            </Link>
          </div>

          {/* XP Progress */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs font-bold font-mono">
              <span className="text-emerald-300">{xp.toLocaleString()} XP</span>
              <span className="text-muted text-[11px]">
                {nextLevel ? `Next: ${nextLevel.min_xp.toLocaleString()} XP` : "Max Tier"}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${levelProgress}%`,
                  background: "linear-gradient(90deg, #00e5a0, #10b981)",
                  boxShadow: "0 0 12px rgba(0, 229, 160, 0.6)",
                }}
              />
            </div>
          </div>

          {/* Freeze Token + Active Perk */}
          <div className="flex items-center justify-between text-xs pt-2 border-t border-white/10 text-muted">
            <span className="flex items-center gap-1">
              <span>🧊</span>
              <span>{freezeTokens} Freeze Token{freezeTokens !== 1 ? "s" : ""}</span>
            </span>
            <span className="truncate max-w-[170px] text-[11px] text-emerald-400/90 font-medium" title={level.perk}>
              🎁 {level.perk}
            </span>
          </div>
        </div>
      ) : (
        <div
          className="card !p-5 rounded-3xl flex flex-col gap-3 relative overflow-hidden"
          style={{
            background: "linear-gradient(145deg, rgba(0, 229, 160, 0.08) 0%, rgba(10, 25, 18, 0.85) 100%)",
            border: "1.5px solid rgba(0, 229, 160, 0.28)",
            boxShadow: "0 0 25px rgba(0, 229, 160, 0.08)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl select-none shrink-0"
              style={{
                background: "rgba(0, 229, 160, 0.12)",
                border: "1.5px solid rgba(0, 229, 160, 0.35)",
              }}
            >
              🌱
            </div>
            <div>
              <span className="text-[10.5px] font-black text-emerald-300 font-outfit uppercase tracking-wider">
                Recycler Progression
              </span>
              <h3 className="text-sm font-black text-white font-outfit">
                Sign in to Level Up
              </h3>
            </div>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            Create an account or sign in to start accumulating XP, earn streak bonuses, unlock cards, and climb the city leaderboard!
          </p>
          <Link
            href="/auth/"
            className="btn btn-primary !min-h-0 !h-10 text-xs font-black flex items-center justify-center gap-2 rounded-xl no-underline"
          >
            <span>👤</span>
            <span>Sign In / Sign Up</span>
          </Link>
        </div>
      )}

      {/* 2. Today's Challenges Widget */}
      <DailyChallengesWidget />

      {/* 3. Personal Green Impact Snapshot */}
      {user && (
        <div
          className="card !p-4 rounded-3xl flex flex-col gap-3"
          style={{
            background: "rgba(10, 25, 18, 0.75)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">🌿</span>
              <h4 className="text-xs font-black text-white font-outfit uppercase tracking-wider">
                Your Environmental Impact
              </h4>
            </div>
            <Link href="/profile" className="text-[11px] text-emerald-400 hover:underline">
              Full Stats
            </Link>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded-xl bg-white/5 border border-white/5">
              <span className="text-base mb-0.5 block">🌳</span>
              <span className="text-xs font-black text-white font-outfit">
                {impact.trees_equivalent}
              </span>
              <span className="text-[10px] text-muted block leading-tight">Trees Eq.</span>
            </div>

            <div className="p-2 rounded-xl bg-white/5 border border-white/5">
              <span className="text-base mb-0.5 block">☁️</span>
              <span className="text-xs font-black text-white font-outfit">
                {impact.co2_offset_kg} <span className="text-[9px] text-sky-400">kg</span>
              </span>
              <span className="text-[10px] text-muted block leading-tight">CO₂ Saved</span>
            </div>

            <div className="p-2 rounded-xl bg-white/5 border border-white/5">
              <span className="text-base mb-0.5 block">⚖️</span>
              <span className="text-xs font-black text-white font-outfit">
                {impact.total_weight_kg} <span className="text-[9px] text-amber-400">kg</span>
              </span>
              <span className="text-[10px] text-muted block leading-tight">Diverted</span>
            </div>
          </div>
        </div>
      )}

      {/* 4. Quick Nav Cards */}
      <div className="grid grid-cols-2 gap-2.5">
        <Link
          href="/map"
          className="p-3 rounded-2xl bg-white/5 hover:bg-emerald-500/10 border border-white/10 hover:border-emerald-500/30 transition-all flex items-center gap-2.5 no-underline group"
        >
          <span className="text-2xl group-hover:scale-110 transition-transform">🗺️</span>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-black text-white font-outfit group-hover:text-emerald-300">
              Hotspot Map
            </span>
            <span className="text-[10px] text-muted truncate">262 Listed Centers</span>
          </div>
        </Link>

        <Link
          href="/insights"
          className="p-3 rounded-2xl bg-white/5 hover:bg-emerald-500/10 border border-white/10 hover:border-emerald-500/30 transition-all flex items-center gap-2.5 no-underline group"
        >
          <span className="text-2xl group-hover:scale-110 transition-transform">📊</span>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-black text-white font-outfit group-hover:text-emerald-300">
              Waste Insights
            </span>
            <span className="text-[10px] text-muted truncate">Analytics Ledger</span>
          </div>
        </Link>

        <Link
          href="/leaderboard"
          className="p-3 rounded-2xl bg-white/5 hover:bg-emerald-500/10 border border-white/10 hover:border-emerald-500/30 transition-all flex items-center gap-2.5 no-underline group"
        >
          <span className="text-2xl group-hover:scale-110 transition-transform">🏆</span>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-black text-white font-outfit group-hover:text-emerald-300">
              Leaderboard
            </span>
            <span className="text-[10px] text-muted truncate">City & India Ranks</span>
          </div>
        </Link>

        <Link
          href="/cards"
          className="p-3 rounded-2xl bg-white/5 hover:bg-emerald-500/10 border border-white/10 hover:border-emerald-500/30 transition-all flex items-center gap-2.5 no-underline group"
        >
          <span className="text-2xl group-hover:scale-110 transition-transform">🃏</span>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-black text-white font-outfit group-hover:text-emerald-300">
              Cards Album
            </span>
            <span className="text-[10px] text-muted truncate">
              {unlockedCards.length} / 28 Unlocked
            </span>
          </div>
        </Link>
      </div>
    </aside>
  );
}

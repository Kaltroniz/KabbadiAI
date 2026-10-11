"use client";
import React from "react";
import Link from "next/link";
import { useGamification } from "@/contexts/GamificationContext";

export default function GamificationHubBar() {
  const {
    level,
    xp,
    nextLevel,
    levelProgress,
    streak,
    multiplier,
    freezeTokens,
    unlockedCards,
    isLuckySpinAvailable,
    openLuckySpin,
  } = useGamification();

  return (
    <div
      className="card !p-3 mb-5 flex flex-col md:flex-row items-center justify-between gap-3 animate-fade-up"
      style={{
        background: "linear-gradient(135deg, rgba(0,229,160,0.08), rgba(15,25,20,0.85))",
        border: "1px solid rgba(0,229,160,0.25)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.3), 0 0 25px rgba(0,229,160,0.08)",
      }}
    >
      {/* Left: Level Status & XP Progress */}
      <Link
        href="/profile"
        className="flex items-center gap-3 w-full md:w-auto no-underline text-inherit group"
        title="View full profile, level progression & badges"
      >
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl shrink-0 group-hover:scale-105 transition-transform"
          style={{
            background: "rgba(0,229,160,0.12)",
            border: "1.5px solid rgba(0,229,160,0.35)",
            boxShadow: "0 0 14px rgba(0,229,160,0.18)",
          }}
        >
          {level.badge}
        </div>

        <div className="flex flex-col min-w-0 flex-1 md:w-48">
          <div className="flex items-center justify-between gap-2 leading-tight">
            <span className="text-xs font-black text-white font-outfit group-hover:text-emerald-300 transition-colors truncate">
              Lvl {level.level} · {level.name}
            </span>
            <span className="text-[10px] font-mono text-emerald-400 shrink-0">
              {xp} {nextLevel ? `/ ${nextLevel.min_xp}` : ""} XP
            </span>
          </div>

          {/* XP Progress Bar */}
          <div className="w-full h-1.5 rounded-full bg-white/10 mt-1.5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${levelProgress}%`,
                background: "linear-gradient(90deg, #00e5a0, #10b981)",
                boxShadow: "0 0 10px rgba(0,229,160,0.5)",
              }}
            />
          </div>
        </div>
      </Link>

      {/* Center: Streak Indicator & Lucky Spin */}
      <div className="flex items-center gap-2 shrink-0">
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl select-none text-xs font-bold"
          style={{
            background: "rgba(245,158,11,0.12)",
            border: "1px solid rgba(245,158,11,0.3)",
          }}
          title={`${streak} Day Streak (${multiplier}x XP) · ${freezeTokens} Freeze Token(s)`}
        >
          <span className="text-sm animate-pulse">🔥</span>
          <span className="text-amber-300 font-outfit font-black">{streak}d</span>
          {multiplier > 1.0 && (
            <span className="text-[10px] text-amber-400 bg-amber-950/70 px-1 py-0.5 rounded border border-amber-500/30 font-mono">
              {multiplier}x
            </span>
          )}
          {freezeTokens > 0 && <span title="Streak Freeze Token Active">🧊</span>}
        </div>

        {isLuckySpinAvailable && (
          <button
            onClick={openLuckySpin}
            className="!min-h-0 !h-8 px-3 rounded-xl font-black text-xs flex items-center gap-1 animate-bounce"
            style={{
              background: "linear-gradient(135deg, #ec4899, #8b5cf6)",
              border: "1px solid rgba(236,72,153,0.5)",
              boxShadow: "0 0 18px rgba(236,72,153,0.4)",
              color: "#fff",
            }}
            title="Lucky Spin ready! Win up to 500 bonus XP!"
          >
            <span>🎰</span>
            <span>Spin!</span>
          </button>
        )}
      </div>

      {/* Right: Quick Action Nav Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-0.5 scrollbar-hide">
        <Link
          href="/leaderboard"
          className="btn btn-ghost !min-h-0 !h-8 px-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 no-underline whitespace-nowrap text-white hover:text-emerald-300 hover:border-emerald-500/40"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <span>🏆</span>
          <span>Ranks</span>
        </Link>
        <Link
          href="/quests"
          className="btn btn-ghost !min-h-0 !h-8 px-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 no-underline whitespace-nowrap text-white hover:text-emerald-300 hover:border-emerald-500/40"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <span>📜</span>
          <span>Quests</span>
        </Link>
        <Link
          href="/cards"
          className="btn btn-ghost !min-h-0 !h-8 px-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 no-underline whitespace-nowrap text-white hover:text-emerald-300 hover:border-emerald-500/40"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <span>🃏</span>
          <span>Cards ({unlockedCards.length})</span>
        </Link>
        <Link
          href="/profile"
          className="btn btn-ghost !min-h-0 !h-8 px-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 no-underline whitespace-nowrap text-emerald-300 hover:text-emerald-200"
          style={{ background: "rgba(0,229,160,0.08)", border: "1px solid rgba(0,229,160,0.25)" }}
        >
          <span>🎖️</span>
          <span>Impact</span>
        </Link>
      </div>
    </div>
  );
}

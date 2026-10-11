"use client";
import React from "react";
import Link from "next/link";
import { useGamification } from "@/contexts/GamificationContext";

export default function XPNavBar() {
  const {
    level,
    streak,
    isLuckySpinAvailable,
    openLuckySpin,
  } = useGamification();

  return (
    <div className="flex items-center gap-1.5 shrink-0 flex-nowrap">
      {/* Compact Player Level & Streak Pill */}
      <Link
        href="/profile"
        className="phone-compact-pill flex items-center gap-1.5 max-[400px]:gap-1 px-2.5 py-1 max-[400px]:px-2 max-[400px]:py-0.5 rounded-xl transition-all duration-200 no-underline shrink-0 whitespace-nowrap hover:scale-102 max-[330px]:hidden"
        style={{
          background: "linear-gradient(135deg, rgba(0,229,160,0.14), rgba(16,185,129,0.06))",
          border: "1px solid rgba(0,229,160,0.35)",
          boxShadow: "0 0 14px rgba(0,229,160,0.15)",
        }}
        title={`Level ${level.level}: ${level.name} · ${streak} Day Streak · Click to view profile`}
      >
        <span className="text-sm select-none shrink-0" role="img" aria-label="Level badge">
          {level.badge}
        </span>
        <span className="phone-lvl-text phone-hide-lvl max-[360px]:hidden text-xs font-black text-emerald-300 font-outfit shrink-0">
          L{level.level}
        </span>
        <span className="phone-hide-streak max-[400px]:hidden text-xs font-bold text-amber-300 flex items-center gap-0.5 font-outfit shrink-0">
          <span>🔥</span>
          <span>{streak}d</span>
        </span>
      </Link>

      {/* Mini Lucky Spin Button if ready */}
      {isLuckySpinAvailable && (
        <button
          onClick={openLuckySpin}
          className="!min-h-0 !h-7 px-2 rounded-lg font-black text-[11px] flex items-center gap-1 animate-bounce shrink-0"
          style={{
            background: "linear-gradient(135deg, #ec4899, #8b5cf6)",
            border: "1px solid rgba(236,72,153,0.5)",
            boxShadow: "0 0 12px rgba(236,72,153,0.4)",
            color: "#fff",
          }}
          title="Free Lucky Spin ready! Win up to 500 bonus XP!"
        >
          <span>🎰</span>
          <span className="hidden xs:inline">Spin</span>
        </button>
      )}
    </div>
  );
}

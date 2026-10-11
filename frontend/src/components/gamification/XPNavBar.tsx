"use client";
import React from "react";
import Link from "next/link";
import { useGamification } from "@/contexts/GamificationContext";
import { useAuth } from "@/contexts/AuthContext";

export default function XPNavBar() {
  const { user } = useAuth();
  const { level, streak } = useGamification();

  if (!user) {
    return (
      <Link
        href="/auth/"
        className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold text-emerald-300 no-underline transition-all hover:scale-102 shrink-0 whitespace-nowrap"
        style={{
          background: "linear-gradient(135deg, rgba(0,229,160,0.12), rgba(16,185,129,0.06))",
          border: "1px solid rgba(0,229,160,0.3)",
        }}
        title="Sign in to activate level and rank"
      >
        <span>👤</span>
        <span>Sign In</span>
      </Link>
    );
  }

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
    </div>
  );
}

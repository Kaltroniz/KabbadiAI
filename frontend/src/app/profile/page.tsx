"use client";
import React from "react";
import Link from "next/link";
import { useGamification } from "@/contexts/GamificationContext";
import { useAuth } from "@/contexts/AuthContext";
import ImpactDashboard from "@/components/gamification/ImpactDashboard";
import BadgesGallery from "@/components/gamification/BadgesGallery";
import XPNavBar from "@/components/gamification/XPNavBar";
import FloatingXPNotification from "@/components/gamification/FloatingXPNotification";
import BadgeUnlockModal from "@/components/gamification/BadgeUnlockModal";
import LevelUpModal from "@/components/gamification/LevelUpModal";

export default function ProfilePage() {
  const {
    level,
    xp,
    nextLevel,
    levelProgress,
    streak,
    multiplier,
    freezeTokens,
    unlockedCards,
    resetProgress,
  } = useGamification();
  const { user, logout } = useAuth();

  return (
    <>
      <FloatingXPNotification />
      <BadgeUnlockModal />
      <LevelUpModal />

      <div className="page-wrapper animate-fade-in max-w-4xl mx-auto px-4 py-5 flex flex-col gap-6">
        {/* Header */}
        <header className="flex items-center justify-between flex-wrap gap-3 pb-2 border-b border-white/10">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="btn btn-ghost !min-h-0 !w-10 !h-10 p-0 rounded-2xl flex items-center justify-center text-lg no-underline"
              title="Back to Camera"
            >
              ←
            </Link>
            <div>
              <h1 className="text-xl font-black gradient-text leading-none font-outfit">
                Recycler Profile
              </h1>
              <p className="text-xs text-muted leading-none mt-1">
                Your circular badges, stats, and green impact
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <XPNavBar />
            {user ? (
              <button
                id="profile-logout-btn"
                onClick={logout}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-red-300 hover:text-white bg-red-950/50 hover:bg-red-900/60 border border-red-500/40 hover:border-red-500/70 transition-all flex items-center gap-1.5 !min-h-0 cursor-pointer shadow-sm"
                title="Sign out of your account"
              >
                <span>🚪</span>
                <span>Sign Out</span>
              </button>
            ) : (
              <Link
                href="/auth/"
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-300 bg-emerald-950/40 border border-emerald-500/30 hover:border-emerald-400 no-underline"
              >
                Sign In
              </Link>
            )}
          </div>
        </header>

        {/* Guest prompt banner if not logged in */}
        {!user && (
          <div
            className="card p-4 rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left animate-fade-up"
            style={{
              background: "linear-gradient(135deg, rgba(0,229,160,0.12), rgba(16,185,129,0.04))",
              border: "1.5px solid rgba(0,229,160,0.35)",
            }}
          >
            <div className="flex items-center gap-3">
              <span className="text-3xl">👤</span>
              <div>
                <h3 className="text-sm font-black text-white font-outfit">Sign in to save your level progression & stats</h3>
                <p className="text-xs text-muted">Level up and circular badges are tied to your personal account.</p>
              </div>
            </div>
            <Link
              href="/auth/"
              className="btn btn-primary !min-h-0 !h-9 px-4 text-xs font-black rounded-xl no-underline shrink-0"
            >
              Sign In / Sign Up
            </Link>
          </div>
        )}

        {/* User Status Card */}
        <div
          className="card p-6 rounded-3xl flex flex-col sm:flex-row items-center sm:items-start gap-5"
          style={{
            background: "linear-gradient(135deg, rgba(0,229,160,0.12), rgba(16,185,129,0.04))",
            border: "1.5px solid rgba(0,229,160,0.35)",
            boxShadow: "0 0 30px rgba(0,229,160,0.15)",
          }}
        >
          {/* Avatar / Level Badge */}
          <div className="relative shrink-0">
            <div className="w-20 h-20 rounded-3xl bg-black/40 border-2 border-emerald-400 flex items-center justify-center text-4xl shadow-[0_0_20px_rgba(0,229,160,0.3)]">
              {level.badge}
            </div>
            <span className="absolute -bottom-2 -right-2 text-[10px] font-black uppercase bg-emerald-500 text-black px-2 py-0.5 rounded-full border border-black">
              Lvl {level.level}
            </span>
          </div>

          {/* Details */}
          <div className="flex flex-col flex-1 text-center sm:text-left min-w-0 w-full">
            <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
              <h2 className="text-xl font-black text-white font-outfit">
                {user?.name || "Green Pioneer"}
              </h2>
              <span className="text-xs font-bold text-emerald-400 bg-emerald-950/60 px-2.5 py-0.5 rounded-xl border border-emerald-500/30">
                {level.name}
              </span>
              {user && (
                <button
                  onClick={logout}
                  className="text-[11px] font-bold text-red-300 hover:text-red-100 bg-red-950/50 hover:bg-red-900/60 px-2.5 py-0.5 rounded-lg border border-red-500/30 hover:border-red-500/60 transition-all flex items-center gap-1 !min-h-0 cursor-pointer"
                  title="Sign out of your account"
                >
                  <span>🚪</span> Sign Out
                </button>
              )}
            </div>
            <p className="text-xs text-muted mt-0.5 mb-3">
              {user?.email || "Guest Eco Warrior"} · {level.hindiName}
            </p>

            {/* XP Bar */}
            <div className="flex flex-col gap-1 w-full max-w-md">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-emerald-300 font-mono">
                  {xp.toLocaleString()} XP
                </span>
                <span className="text-muted text-[11px]">
                  Next: {nextLevel ? `${nextLevel.min_xp.toLocaleString()} XP (${nextLevel.name})` : "Max Rank"}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${levelProgress}%`,
                    background: "linear-gradient(90deg, #00e5a0, #10b981)",
                    boxShadow: "0 0 10px rgba(0,229,160,0.5)",
                  }}
                />
              </div>
            </div>

            {/* Current Tier Perk */}
            <p className="text-xs text-amber-300 mt-3 font-medium">
              🎁 <strong>Active Perk:</strong> {level.perk}
            </p>
          </div>

          {/* Streak & Freeze Status Box */}
          <div className="flex flex-row sm:flex-col gap-2 shrink-0">
            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-center min-w-[100px]">
              <span className="text-base animate-pulse">🔥</span>
              <div className="text-base font-black text-amber-300 font-outfit">
                {streak} Days
              </div>
              <span className="text-[10px] text-muted">
                {multiplier}x XP Active
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-center min-w-[100px]">
              <span className="text-base">🧊</span>
              <div className="text-base font-black text-cyan-300 font-outfit">
                {freezeTokens} Token{freezeTokens !== 1 ? "s" : ""}
              </div>
              <span className="text-[10px] text-muted">Streak Freeze</span>
            </div>
          </div>
        </div>

        {/* Environmental Impact Dashboard */}
        <ImpactDashboard />

        {/* 30 Badges Gallery */}
        <BadgesGallery />

        {/* Quick Links Footer */}
        <div className="flex items-center justify-between flex-wrap gap-3 pt-2 text-xs text-muted border-t border-white/10">
          <div className="flex items-center gap-4">
            <Link href="/cards" className="text-emerald-400 hover:underline">
              🃏 View 28 Collectible Cards ({unlockedCards.length} Unlocked)
            </Link>
            <Link href="/quests" className="text-emerald-400 hover:underline">
              📜 View Story Quests
            </Link>
            <Link href="/leaderboard" className="text-emerald-400 hover:underline">
              🏆 View Leaderboard
            </Link>
          </div>
          <button
            onClick={() => {
              if (confirm("Reset local gamification stats to default demo state?")) {
                resetProgress();
              }
            }}
            className="text-[11px] text-red-400 hover:underline bg-transparent border-none cursor-pointer !min-h-0 p-0"
          >
            Reset Demo Progress
          </button>
        </div>
      </div>
    </>
  );
}

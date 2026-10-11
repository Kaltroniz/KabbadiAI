"use client";
import React from "react";
import Link from "next/link";
import LeaderboardView from "@/components/gamification/LeaderboardView";
import XPNavBar from "@/components/gamification/XPNavBar";
import FloatingXPNotification from "@/components/gamification/FloatingXPNotification";
import BadgeUnlockModal from "@/components/gamification/BadgeUnlockModal";
import CardUnlockModal from "@/components/gamification/CardUnlockModal";
import LevelUpModal from "@/components/gamification/LevelUpModal";
import LuckySpinModal from "@/components/gamification/LuckySpinModal";

export default function LeaderboardPage() {
  return (
    <>
      <FloatingXPNotification />
      <BadgeUnlockModal />
      <CardUnlockModal />
      <LevelUpModal />
      <LuckySpinModal />

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
                Green Leaderboard
              </h1>
              <p className="text-xs text-muted leading-none mt-1">
                Bharat&apos;s Responsible E-Waste Pioneers
              </p>
            </div>
          </div>

          <XPNavBar />
        </header>

        {/* Main Content */}
        <LeaderboardView />

        {/* Challenge Friends Banner */}
        <div
          className="card p-5 sm:p-6 rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-5 text-center sm:text-left overflow-hidden"
          style={{
            background: "linear-gradient(135deg, rgba(245,158,11,0.12), rgba(0,229,160,0.08))",
            border: "1px solid rgba(245,158,11,0.3)",
          }}
        >
          <div className="flex-1 min-w-0">
            <h3 className="text-base sm:text-lg font-black text-white font-outfit leading-snug">
              Challenge Your Friends or Housing Society! 🏆
            </h3>
            <p className="text-xs sm:text-sm text-muted mt-1 leading-relaxed">
              Form apartment collection drives or compete with friends to see who diverts the most toxic e-waste.
            </p>
          </div>
          <button
            onClick={() => {
              const text = `🏆 I'm competing on the KabadiAI Green Leaderboard! Can you beat my e-waste recycling rank?\nCheck your electronics and earn rewards: https://main.d33iyw8b7i40jw.amplifyapp.com/leaderboard`;
              window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
            }}
            className="btn btn-gold !min-h-0 !h-11 !w-auto w-full sm:w-auto px-6 rounded-2xl font-black text-xs sm:text-sm shrink-0 whitespace-nowrap flex items-center justify-center gap-2"
          >
            <span>💬</span>
            <span>Challenge on WhatsApp</span>
          </button>
        </div>
      </div>
    </>
  );
}

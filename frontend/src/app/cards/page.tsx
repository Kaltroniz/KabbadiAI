"use client";
import React from "react";
import Link from "next/link";
import CollectibleCardsDeck from "@/components/gamification/CollectibleCardsDeck";
import XPNavBar from "@/components/gamification/XPNavBar";
import FloatingXPNotification from "@/components/gamification/FloatingXPNotification";
import BadgeUnlockModal from "@/components/gamification/BadgeUnlockModal";
import LevelUpModal from "@/components/gamification/LevelUpModal";

export default function CardsPage() {
  return (
    <>
      <FloatingXPNotification />
      <BadgeUnlockModal />
      <LevelUpModal />

      <div className="page-wrapper animate-fade-in max-w-5xl mx-auto px-4 py-5 flex flex-col gap-6">
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
                E-Waste Card Album
              </h1>
              <p className="text-xs text-muted leading-none mt-1">
                Collect all 28 circular electronics cards by scanning items
              </p>
            </div>
          </div>

          <XPNavBar />
        </header>

        {/* 28 Cards Deck Grid */}
        <CollectibleCardsDeck />
      </div>
    </>
  );
}

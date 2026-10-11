"use client";
import React from "react";
import { useGamification } from "@/contexts/GamificationContext";

export default function LevelUpModal() {
  const { celebrationLevel, dismissLevelModal } = useGamification();

  if (!celebrationLevel) return null;

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in"
      onClick={dismissLevelModal}
    >
      <div
        className="relative w-full max-w-sm rounded-3xl p-6 text-center animate-scale-pop overflow-hidden"
        style={{
          background: "linear-gradient(145deg, #052e16 0%, #021a0d 100%)",
          border: "2px solid #00e5a0",
          boxShadow: "0 0 60px rgba(0, 229, 160, 0.4)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-6xl mb-3 animate-bounce select-none">
          {celebrationLevel.badge}
        </div>

        <span className="text-[11px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 mb-2 inline-block">
          LEVEL UP ACHIEVED! 🎉
        </span>

        <h2 className="text-3xl font-black text-white font-outfit mt-1 mb-0.5">
          Level {celebrationLevel.level}
        </h2>
        <h3 className="text-xl font-bold text-emerald-400 mb-1">
          {celebrationLevel.name}
        </h3>
        <p className="text-xs text-muted mb-4 font-medium">
          {celebrationLevel.hindiName}
        </p>

        {/* Unlocked Perk */}
        <div
          className="p-3.5 rounded-2xl mb-6 text-left"
          style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(0,229,160,0.3)" }}
        >
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300 mb-1">
            <span>🎁</span>
            <span>New Perk Unlocked:</span>
          </div>
          <p className="text-xs text-white leading-relaxed font-semibold">
            {celebrationLevel.perk}
          </p>
        </div>

        <button
          onClick={dismissLevelModal}
          className="btn btn-primary !min-h-0 !h-12 w-full rounded-2xl font-black text-sm"
        >
          Awesome! Continue
        </button>
      </div>
    </div>
  );
}

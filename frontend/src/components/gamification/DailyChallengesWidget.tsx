"use client";
import React, { useState } from "react";
import { useGamification } from "@/contexts/GamificationContext";

export default function DailyChallengesWidget() {
  const { challenges, claimChallenge } = useGamification();
  const [activeTab, setActiveTab] = useState<"daily" | "weekly">("daily");

  const filtered = challenges.filter((c) => c.type === activeTab);

  return (
    <div className="card w-full flex flex-col gap-4">
      {/* Widget Header with Tabs */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">🎯</span>
          <div>
            <h3 className="text-base font-black text-white font-outfit leading-tight">
              Challenges & Quests
            </h3>
            <p className="text-[11px] text-muted leading-tight">
              Earn bonus XP while saving the environment
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/10 text-xs">
          <button
            onClick={() => setActiveTab("daily")}
            className={`!min-h-0 px-2.5 py-1 rounded-lg font-bold transition-all ${
              activeTab === "daily"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "text-muted"
            }`}
          >
            Daily
          </button>
          <button
            onClick={() => setActiveTab("weekly")}
            className={`!min-h-0 px-2.5 py-1 rounded-lg font-bold transition-all ${
              activeTab === "weekly"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "text-muted"
            }`}
          >
            Weekly
          </button>
        </div>
      </div>

      {/* Challenge Cards List */}
      <div className="flex flex-col gap-2.5">
        {filtered.map((item) => {
          const progressPercent = Math.min(100, Math.floor((item.current / item.target) * 100));
          return (
            <div
              key={item.id}
              className="p-3 rounded-2xl flex items-center justify-between gap-3 transition-all"
              style={{
                background: item.claimed
                  ? "rgba(16, 185, 129, 0.05)"
                  : item.completed
                  ? "rgba(0, 229, 160, 0.12)"
                  : "rgba(255, 255, 255, 0.03)",
                border: item.claimed
                  ? "1px solid rgba(16, 185, 129, 0.2)"
                  : item.completed
                  ? "1.5px solid rgba(0, 229, 160, 0.45)"
                  : "1px solid rgba(255, 255, 255, 0.07)",
              }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-2xl shrink-0 select-none">{item.icon}</span>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-white truncate font-outfit">
                      {item.title}
                    </span>
                    <span className="text-[10px] font-black text-amber-300">
                      +{item.xp} XP
                    </span>
                  </div>
                  <p className="text-[11px] text-muted truncate">{item.text}</p>

                  {/* Progress bar */}
                  <div className="w-28 sm:w-40 h-1.5 rounded-full bg-white/10 mt-1.5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${progressPercent}%`,
                        background: item.completed
                          ? "linear-gradient(90deg, #00e5a0, #10b981)"
                          : "linear-gradient(90deg, #38bdf8, #818cf8)",
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Action / State */}
              <div className="shrink-0 flex items-center">
                {item.claimed ? (
                  <span className="text-xs font-bold text-emerald-400 bg-emerald-950/50 px-2 py-1 rounded-xl border border-emerald-500/30">
                    Claimed ✓
                  </span>
                ) : item.completed ? (
                  <button
                    onClick={() => claimChallenge(item.id)}
                    className="btn btn-primary !min-h-0 !h-8 px-3 rounded-xl text-xs font-black animate-pulse"
                  >
                    Claim!
                  </button>
                ) : (
                  <span className="text-xs text-muted font-mono font-medium">
                    {item.current}/{item.target}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

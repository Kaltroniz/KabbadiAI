"use client";
import React from "react";
import { useGamification } from "@/contexts/GamificationContext";

export default function QuestsView() {
  const { quests, completeQuestStep } = useGamification();

  return (
    <div className="card w-full flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <span className="text-2xl">📜</span>
        <div>
          <h2 className="text-lg font-black text-white font-outfit leading-tight">
            Story-Driven Quests
          </h2>
          <p className="text-[11px] text-muted leading-tight">
            Multi-step green missions guiding you across the circular recycling journey
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {quests.map((quest) => {
          const completedCount = quest.steps.filter((s) => s.completed).length;
          const totalCount = quest.steps.length;
          const isAllCompleted = completedCount === totalCount;
          const progressPercent = Math.floor((completedCount / totalCount) * 100);

          return (
            <div
              key={quest.id}
              className="p-4 rounded-3xl flex flex-col gap-4 transition-all"
              style={{
                background: isAllCompleted
                  ? "rgba(16, 185, 129, 0.08)"
                  : "rgba(255, 255, 255, 0.03)",
                border: isAllCompleted
                  ? "1.5px solid rgba(16, 185, 129, 0.4)"
                  : "1px solid rgba(255, 255, 255, 0.08)",
              }}
            >
              {/* Quest Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl select-none"
                    style={{
                      background: "rgba(255, 255, 255, 0.06)",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                    }}
                  >
                    {quest.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-black text-white font-outfit">
                        {quest.title}
                      </h3>
                      {isAllCompleted && (
                        <span className="text-[10px] font-black text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-500/30">
                          Completed ✓
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted leading-relaxed mt-0.5">
                      {quest.description}
                    </p>
                  </div>
                </div>

                <span className="text-xs font-black text-amber-300 bg-amber-950/50 px-2.5 py-1 rounded-xl border border-amber-500/30 shrink-0">
                  +{quest.total_xp} XP
                </span>
              </div>

              {/* Quest Progress Bar */}
              <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${progressPercent}%`,
                    background: isAllCompleted
                      ? "linear-gradient(90deg, #00e5a0, #10b981)"
                      : "linear-gradient(90deg, #38bdf8, #818cf8)",
                  }}
                />
              </div>

              {/* Steps List */}
              <div className="flex flex-col gap-2">
                {quest.steps.map((step, idx) => (
                  <div
                    key={step.id}
                    className="p-2.5 rounded-2xl flex items-center justify-between gap-3 text-xs"
                    style={{
                      background: step.completed
                        ? "rgba(16, 185, 129, 0.06)"
                        : "rgba(255, 255, 255, 0.02)",
                      border: step.completed
                        ? "1px solid rgba(16, 185, 129, 0.25)"
                        : "1px solid rgba(255, 255, 255, 0.05)",
                    }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                          step.completed
                            ? "bg-emerald-500 text-black"
                            : "bg-white/10 text-muted"
                        }`}
                      >
                        {step.completed ? "✓" : idx + 1}
                      </span>
                      <span
                        className={`truncate ${
                          step.completed ? "text-emerald-300 line-through" : "text-white"
                        }`}
                      >
                        {step.text}
                      </span>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <span className="text-[11px] font-bold text-amber-300">
                        +{step.reward_xp} XP
                      </span>
                      {!step.completed && (
                        <button
                          onClick={() => completeQuestStep(quest.id, step.id)}
                          className="btn btn-ghost !min-h-0 !h-7 px-2.5 rounded-lg text-[11px] font-bold text-emerald-300 border border-emerald-500/30"
                        >
                          Check
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

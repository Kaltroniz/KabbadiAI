"use client";
import React from "react";
import { useGamification } from "@/contexts/GamificationContext";

export default function FloatingXPNotification() {
  const { recentXPPopups } = useGamification();

  if (recentXPPopups.length === 0) return null;

  return (
    <div
      className="fixed bottom-24 right-5 z-[9999] flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
    >
      {recentXPPopups.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-2.5 px-4 py-2 rounded-2xl animate-scale-pop"
          style={{
            background: "rgba(10, 24, 18, 0.95)",
            border: "1.5px solid #00e5a0",
            boxShadow: "0 0 30px rgba(0, 229, 160, 0.45)",
            backdropFilter: "blur(14px)",
            animation: "floatUp 2.8s cubic-bezier(0.16, 1, 0.3, 1) forwards",
          }}
        >
          <span className="text-xl">✨</span>
          <div className="flex flex-col">
            <span className="text-base font-black text-emerald-300 font-outfit leading-tight">
              +{item.amount} XP
            </span>
            <span className="text-[11px] text-muted leading-tight">
              {item.label}
            </span>
          </div>
        </div>
      ))}
      <style jsx>{`
        @keyframes floatUp {
          0% {
            opacity: 0;
            transform: translateY(20px) scale(0.85);
          }
          15% {
            opacity: 1;
            transform: translateY(0) scale(1.05);
          }
          30% {
            transform: translateY(0) scale(1);
          }
          80% {
            opacity: 1;
            transform: translateY(-8px);
          }
          100% {
            opacity: 0;
            transform: translateY(-28px) scale(0.95);
          }
        }
      `}</style>
    </div>
  );
}

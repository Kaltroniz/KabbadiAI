"use client";
import React, { useState } from "react";
import { useGamification, fireSuperConfetti } from "@/contexts/GamificationContext";

const PRIZES = [50, 100, 150, 200, 300, 500];

export default function LuckySpinModal() {
  const { showLuckySpinModal, closeLuckySpin, claimLuckySpinReward } = useGamification();
  const [spinning, setSpinning] = useState(false);
  const [wonPrize, setWonPrize] = useState<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  if (!showLuckySpinModal) return null;

  const handleSpin = () => {
    if (spinning || wonPrize !== null) return;
    setSpinning(true);

    const speed = 60;
    let current = 0;
    const totalSteps = 24 + Math.floor(Math.random() * 6);

    const spinInterval = setInterval(() => {
      current++;
      setActiveIndex((prev) => (prev + 1) % PRIZES.length);

      if (current >= totalSteps) {
        clearInterval(spinInterval);
        const finalPrize = PRIZES[current % PRIZES.length];
        setWonPrize(finalPrize);
        setSpinning(false);
        fireSuperConfetti();
      }
    }, speed);
  };

  const handleCollect = () => {
    if (wonPrize !== null) {
      claimLuckySpinReward(wonPrize);
      setWonPrize(null);
    } else {
      closeLuckySpin();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in"
      onClick={spinning ? undefined : closeLuckySpin}
    >
      <div
        className="relative w-full max-w-sm rounded-3xl p-6 text-center animate-scale-pop overflow-hidden"
        style={{
          background: "linear-gradient(160deg, #1e112a 0%, #0d0614 100%)",
          border: "2px solid #ec4899",
          boxShadow: "0 0 60px rgba(236,72,153,0.35)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-[11px] font-black uppercase tracking-wider px-3 py-1 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/40 mb-3 inline-block">
          🎰 E-WASTE LUCKY SPIN
        </span>

        <h3 className="text-2xl font-black text-white font-outfit mb-1">
          Spin for Bonus XP!
        </h3>
        <p className="text-xs text-muted mb-5">
          The green recycling gods are smiling upon your eco actions!
        </p>

        {/* Prize Grid / Reel */}
        <div className="grid grid-cols-3 gap-2.5 mb-6">
          {PRIZES.map((prize, idx) => {
            const isHighlighted = activeIndex === idx;
            const isWinner = wonPrize === prize && isHighlighted;
            return (
              <div
                key={prize}
                className={`py-3 px-2 rounded-2xl flex flex-col items-center justify-center transition-all duration-150 ${
                  isHighlighted
                    ? "scale-105 bg-pink-600/40 border-pink-400 shadow-[0_0_20px_rgba(236,72,153,0.6)]"
                    : "bg-white/5 border-white/10"
                } border`}
              >
                <span className="text-xl mb-0.5">
                  {prize >= 300 ? "💎" : prize >= 150 ? "⚡" : "🌱"}
                </span>
                <span
                  className={`text-sm font-black font-outfit ${
                    isWinner ? "text-amber-300" : isHighlighted ? "text-white" : "text-gray-300"
                  }`}
                >
                  +{prize} XP
                </span>
              </div>
            );
          })}
        </div>

        {wonPrize !== null ? (
          <div className="flex flex-col gap-3 animate-scale-pop">
            <div className="p-3 rounded-2xl bg-pink-500/20 border border-pink-500/40">
              <span className="text-sm font-bold text-pink-200">
                🎉 Congratulations! You won{" "}
                <strong className="text-amber-300 font-black text-base">
                  +{wonPrize} XP!
                </strong>
              </span>
            </div>
            <button
              onClick={handleCollect}
              className="btn btn-gold !min-h-0 !h-12 w-full rounded-2xl font-black text-sm"
            >
              Collect My Reward!
            </button>
          </div>
        ) : (
          <button
            onClick={handleSpin}
            disabled={spinning}
            className="btn !min-h-0 !h-12 w-full rounded-2xl font-black text-sm text-white"
            style={{
              background: spinning
                ? "rgba(255,255,255,0.1)"
                : "linear-gradient(135deg, #ec4899, #8b5cf6)",
              boxShadow: spinning ? "none" : "0 0 25px rgba(236,72,153,0.5)",
            }}
          >
            {spinning ? "Spinning Reel..." : "SPIN NOW! 🎯"}
          </button>
        )}
      </div>
    </div>
  );
}

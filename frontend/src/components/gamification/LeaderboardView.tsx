"use client";
import React, { useEffect, useState } from "react";
import { useGamification } from "@/contexts/GamificationContext";
import { useAuth } from "@/contexts/AuthContext";

interface LeaderboardUser {
  rank: number;
  user_id: string;
  name: string;
  xp: number;
  kg_diverted: number;
  avatar: string;
  is_current_user: boolean;
  level: string;
}

const CITIES = [
  { id: "delhi", name: "Delhi-NCR" },
  { id: "mumbai", name: "Mumbai" },
  { id: "bangalore", name: "Bengaluru" },
  { id: "national", name: "All-India 🇮🇳" },
];

export default function LeaderboardView() {
  const { xp, impact } = useGamification();
  const { user } = useAuth();
  const [city, setCity] = useState("delhi");
  const [loading, setLoading] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);

  useEffect(() => {
    setLoading(true);
    const userName = user?.name || "You";
    const userKg = impact.total_weight_kg;

    fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/gamification/leaderboard?city=${city}&xp=${xp}&name=${encodeURIComponent(userName)}&kg=${userKg}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.leaderboard) {
          setLeaderboard(data.leaderboard);
        }
      })
      .catch(() => {
        // Fallback mock board if offline
        const fallback: LeaderboardUser[] = [
          { rank: 1, user_id: "u1", name: "Aarav Sharma", xp: 14500, kg_diverted: 185, avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Aarav", is_current_user: false, level: "E-Waste Expert" },
          { rank: 2, user_id: "u2", name: "Sunita Verma", xp: 11200, kg_diverted: 142, avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Sunita", is_current_user: false, level: "E-Waste Expert" },
          { rank: 3, user_id: "u3", name: "Vikram Chauhan", xp: 8900, kg_diverted: 110, avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Vikram", is_current_user: false, level: "Eco Warrior" },
          { rank: 4, user_id: "me", name: `${userName} (You)`, xp, kg_diverted: userKg, avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=" + userName, is_current_user: true, level: "Green Guardian" },
          { rank: 5, user_id: "u4", name: "Priya Nair", xp: 6700, kg_diverted: 84, avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Priya", is_current_user: false, level: "Eco Warrior" },
          { rank: 6, user_id: "u5", name: "Rajesh Kabadiwala", xp: 5400, kg_diverted: 72, avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Rajesh", is_current_user: false, level: "Eco Warrior" },
        ];
        setLeaderboard(fallback);
      })
      .finally(() => setLoading(false));
  }, [city, xp, impact.total_weight_kg, user?.name]);

  const top3 = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);

  return (
    <div className="card w-full flex flex-col gap-5">
      {/* City Switcher */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🏆</span>
          <div>
            <h2 className="text-lg font-black text-white font-outfit leading-tight">
              Green Recycler Leaderboard
            </h2>
            <p className="text-[11px] text-muted leading-tight">
              Top citizens diverting toxic e-waste from open dumps
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/10 text-xs overflow-x-auto">
          {CITIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCity(c.id)}
              className={`!min-h-0 px-2.5 py-1 rounded-lg font-bold transition-all whitespace-nowrap ${
                city === c.id
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : "text-muted hover:text-white"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-muted text-sm">
          Loading rankings...
        </div>
      ) : (
        <>
          {/* Top 3 Podium */}
          {top3.length >= 3 && (
            <div className="grid grid-cols-3 gap-2.5 pt-4 pb-2 items-end">
              {/* Rank 2 (Silver) */}
              <div
                className="p-3 rounded-2xl flex flex-col items-center text-center transition-all"
                style={{
                  background: "linear-gradient(180deg, rgba(226,232,240,0.12), rgba(15,25,20,0.8))",
                  border: "1.5px solid rgba(226,232,240,0.35)",
                }}
              >
                <span className="text-xl -mt-6 mb-1">🥈</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={top3[1].avatar} alt="" className="w-12 h-12 rounded-full mb-1.5 border-2 border-slate-300" />
                <span className="text-xs font-bold text-white truncate max-w-full font-outfit">
                  {top3[1].name}
                </span>
                <span className="text-[11px] font-black text-emerald-400 mt-0.5">
                  {top3[1].xp.toLocaleString()} XP
                </span>
                <span className="text-[10px] text-muted">{top3[1].kg_diverted} kg</span>
              </div>

              {/* Rank 1 (Gold - Taller) */}
              <div
                className="p-3.5 rounded-2xl flex flex-col items-center text-center pb-5 transition-all -translate-y-2"
                style={{
                  background: "linear-gradient(180deg, rgba(245,158,11,0.2), rgba(15,25,20,0.8))",
                  border: "2px solid rgba(245,158,11,0.55)",
                  boxShadow: "0 0 30px rgba(245,158,11,0.25)",
                }}
              >
                <span className="text-2xl -mt-7 mb-1 animate-bounce">👑</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={top3[0].avatar} alt="" className="w-14 h-14 rounded-full mb-1.5 border-2 border-amber-400" />
                <span className="text-xs font-black text-amber-200 truncate max-w-full font-outfit">
                  {top3[0].name}
                </span>
                <span className="text-xs font-black text-amber-400 mt-0.5">
                  {top3[0].xp.toLocaleString()} XP
                </span>
                <span className="text-[10px] text-muted">{top3[0].kg_diverted} kg</span>
              </div>

              {/* Rank 3 (Bronze) */}
              <div
                className="p-3 rounded-2xl flex flex-col items-center text-center transition-all"
                style={{
                  background: "linear-gradient(180deg, rgba(217,119,6,0.12), rgba(15,25,20,0.8))",
                  border: "1.5px solid rgba(217,119,6,0.35)",
                }}
              >
                <span className="text-xl -mt-6 mb-1">🥉</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={top3[2].avatar} alt="" className="w-12 h-12 rounded-full mb-1.5 border-2 border-amber-600" />
                <span className="text-xs font-bold text-white truncate max-w-full font-outfit">
                  {top3[2].name}
                </span>
                <span className="text-[11px] font-black text-emerald-400 mt-0.5">
                  {top3[2].xp.toLocaleString()} XP
                </span>
                <span className="text-[10px] text-muted">{top3[2].kg_diverted} kg</span>
              </div>
            </div>
          )}

          {/* Leaderboard Table List */}
          <div className="flex flex-col gap-2">
            {rest.map((item) => (
              <div
                key={item.user_id + item.rank}
                className={`p-3 rounded-2xl flex items-center justify-between gap-3 transition-all ${
                  item.is_current_user
                    ? "bg-emerald-500/15 border-2 border-emerald-400 shadow-[0_0_20px_rgba(0,229,160,0.2)]"
                    : "bg-white/5 border border-white/10"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`w-6 text-center font-black font-outfit text-sm ${item.is_current_user ? "text-emerald-300" : "text-muted"}`}>
                    #{item.rank}
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.avatar} alt="" className="w-9 h-9 rounded-full shrink-0 border border-white/20" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold text-white truncate font-outfit">
                      {item.name}
                    </span>
                    <span className="text-[10px] text-muted truncate">
                      {item.level} · {item.kg_diverted} kg diverted
                    </span>
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <span className="text-xs font-black text-emerald-300 font-outfit">
                    {item.xp.toLocaleString()} XP
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

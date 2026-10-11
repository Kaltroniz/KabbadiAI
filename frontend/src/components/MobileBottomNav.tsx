"use client";
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useGamification } from "@/contexts/GamificationContext";

export default function MobileBottomNav() {
  const pathname = usePathname();
  const { unlockedCards, streak } = useGamification();

  if (pathname && (pathname.startsWith("/auth") || pathname.startsWith("/login"))) {
    return null;
  }

  const navItems = [
    {
      href: "/",
      label: "Scan",
      icon: "📷",
      isPrimary: true,
      badge: null,
    },
    {
      href: "/leaderboard",
      label: "Ranks",
      icon: "🏆",
      isPrimary: false,
      badge: null,
    },
    {
      href: "/quests",
      label: "Quests",
      icon: "📜",
      isPrimary: false,
      badge: null,
    },
    {
      href: "/cards",
      label: "Cards",
      icon: "🃏",
      isPrimary: false,
      badge: `${unlockedCards.length}`,
    },
    {
      href: "/profile",
      label: "Profile",
      icon: "👤",
      isPrimary: false,
      badge: streak > 1 ? `🔥${streak}d` : null,
    },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-2 py-2 border-t"
      style={{
        background: "rgba(5, 14, 10, 0.94)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderColor: "rgba(0, 229, 160, 0.2)",
        boxShadow: "0 -8px 30px rgba(0, 0, 0, 0.6), 0 -1px 0 rgba(255, 255, 255, 0.05)",
      }}
      aria-label="Mobile Navigation"
    >
      {navItems.map((item) => {
        const isActive = pathname === item.href;

        if (item.isPrimary) {
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center justify-center -mt-5 relative no-underline group"
              title="Camera Scanner"
            >
              <div
                className="w-13 h-13 rounded-full flex items-center justify-center text-2xl transition-all duration-300 group-hover:scale-105 active:scale-95"
                style={{
                  width: 52,
                  height: 52,
                  background: "linear-gradient(135deg, #00e5a0, #047857)",
                  boxShadow: isActive
                    ? "0 0 25px rgba(0, 229, 160, 0.6), 0 4px 14px rgba(0, 0, 0, 0.5)"
                    : "0 0 16px rgba(0, 229, 160, 0.35), 0 4px 10px rgba(0, 0, 0, 0.4)",
                  border: "2.5px solid #050e0a",
                }}
              >
                <span>📷</span>
              </div>
              <span
                className={`text-[10px] font-black tracking-wide mt-1 font-outfit ${
                  isActive ? "text-emerald-300" : "text-muted"
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all duration-200 no-underline relative ${
              isActive
                ? "text-emerald-300"
                : "text-muted hover:text-white"
            }`}
          >
            <div className="relative">
              <span className="text-xl select-none leading-none">{item.icon}</span>
              {item.badge && (
                <span
                  className="absolute -top-1.5 -right-2.5 text-[9px] font-black px-1 py-0.2 rounded-full leading-tight font-mono"
                  style={{
                    background: "rgba(0, 229, 160, 0.25)",
                    border: "1px solid rgba(0, 229, 160, 0.5)",
                    color: "#00e5a0",
                  }}
                >
                  {item.badge}
                </span>
              )}
            </div>
            <span
              className={`text-[10px] font-bold tracking-tight mt-1 font-outfit ${
                isActive ? "text-emerald-300" : "text-muted"
              }`}
            >
              {item.label}
            </span>
            {isActive && (
              <span
                className="w-1 h-1 rounded-full bg-emerald-400 absolute bottom-0 shadow-[0_0_6px_#00e5a0]"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

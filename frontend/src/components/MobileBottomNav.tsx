"use client";
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useGamification } from "@/contexts/GamificationContext";
import { useAuth } from "@/contexts/AuthContext";

export default function MobileBottomNav() {
  const pathname = usePathname();
  const { streak } = useGamification();
  const { user } = useAuth();

  if (pathname && (pathname.startsWith("/auth") || pathname.startsWith("/login"))) {
    return null;
  }

  const navItems = [
    {
      href: "/map",
      label: "Map",
      icon: "🗺️",
      isPrimary: false,
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
      href: "/",
      label: "Scan",
      icon: "📷",
      isPrimary: true,
      badge: null,
    },
    {
      href: "/insights",
      label: "Insights",
      icon: "📊",
      isPrimary: false,
      badge: null,
    },
    {
      href: "/profile",
      label: "Profile",
      icon: "👤",
      isPrimary: false,
      badge: user && streak > 1 ? `🔥${streak}d` : null,
    },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-3 pt-2 rounded-t-3xl border-t"
      style={{
        background: "rgba(6, 16, 12, 0.95)",
        backdropFilter: "blur(28px)",
        WebkitBackdropFilter: "blur(28px)",
        borderColor: "rgba(0, 229, 160, 0.22)",
        boxShadow: "0 -10px 35px rgba(0, 0, 0, 0.65), 0 -1px 0 rgba(0, 229, 160, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
        paddingBottom: "max(10px, env(safe-area-inset-bottom, 10px))",
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
              className="flex flex-col items-center justify-center -mt-6 relative no-underline group"
              title="Camera Scanner"
            >
              <div
                className="w-13 h-13 rounded-full flex items-center justify-center text-2xl transition-all duration-300 group-hover:scale-105 active:scale-95"
                style={{
                  width: 52,
                  height: 52,
                  background: "linear-gradient(135deg, #00e5a0 0%, #10b981 50%, #047857 100%)",
                  boxShadow: isActive
                    ? "0 0 28px rgba(0, 229, 160, 0.7), 0 4px 16px rgba(0, 0, 0, 0.6)"
                    : "0 0 16px rgba(0, 229, 160, 0.4), 0 4px 12px rgba(0, 0, 0, 0.5)",
                  border: "2.5px solid #06100c",
                }}
              >
                <span>📷</span>
              </div>
              <span
                className={`text-[10.5px] font-black tracking-wide mt-1 font-outfit ${
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
                ? "text-emerald-300 bg-emerald-500/12 border border-emerald-400/25 shadow-[0_0_12px_rgba(0,229,160,0.18)]"
                : "text-muted hover:text-white border border-transparent"
            }`}
          >
            <div className="relative flex items-center justify-center">
              <span className="text-xl select-none leading-none">{item.icon}</span>
              {item.badge && (
                <span
                  className="absolute -top-1.5 -right-3 text-[8.5px] font-black px-1 py-0.2 rounded-full leading-tight font-mono whitespace-nowrap"
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
              className={`text-[10px] font-bold tracking-tight mt-0.5 font-outfit ${
                isActive ? "text-emerald-300 font-black" : "text-muted"
              }`}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

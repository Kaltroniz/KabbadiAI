"use client";
import React, { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useGamification } from "@/contexts/GamificationContext";

export default function AppNavbar({
  isOnline = true,
  queueCount = 0,
  onOpenQueue,
}: {
  isOnline?: boolean;
  queueCount?: number;
  onOpenQueue?: () => void;
}) {
  const pathname = usePathname();
  const { t, speak } = useLanguage();
  const { user, logout } = useAuth();
  const { level, streak } = useGamification();

  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    }
    if (showUserMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [showUserMenu]);

  const desktopNavLinks = [
    { href: "/", label: "Scanner", icon: "📸" },
    { href: "/leaderboard", label: "Ranks", icon: "🏆" },
    { href: "/quests", label: "Quests", icon: "📜" },
    { href: "/cards", label: "Cards", icon: "🃏" },
    { href: "/map", label: "Map", icon: "🗺️" },
    { href: "/insights", label: "Insights", icon: "📊" },
    { href: "/pickups", label: "Pickups", icon: "🚛" },
  ];

  return (
    <header
      className="relative z-50 mb-6 px-3 sm:px-4 py-2.5 sm:py-3 rounded-3xl w-full max-w-full box-border"
      style={{
        background: "rgba(10, 24, 18, 0.8)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        border: "1px solid rgba(0, 229, 160, 0.18)",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4), 0 0 25px rgba(0, 229, 160, 0.08)",
      }}
    >
      {/* ─── DESKTOP NAVBAR (md and up) ─── */}
      <div className="hidden md:flex items-center justify-between gap-2 lg:gap-3 w-full min-w-0">
        {/* Brand Logo */}
        <Link href="/" className="app-logo shrink-0 no-underline text-inherit flex items-center gap-2">
          <div
            className="logo-icon overflow-hidden p-1 flex items-center justify-center shrink-0"
            style={{ width: 36, height: 36, borderRadius: 10 }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-192.png" alt="KabadiAI" className="w-full h-full object-contain rounded-lg" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-base lg:text-lg font-black gradient-text leading-none font-outfit">
                {t("title")}
              </span>
              {!isOnline && (
                <span className="pill !text-[10px] !px-1.5 !py-0.2 bg-amber-500/15 border-amber-500/35 text-amber-300">
                  Offline
                </span>
              )}
            </div>
            <p className="text-[10px] lg:text-[11px] text-muted leading-none mt-0.5">e-Waste Intelligence</p>
          </div>
        </Link>

        {/* Center Nav Links */}
        <nav className="flex items-center gap-1 px-1.5 py-1 rounded-2xl bg-white/5 border border-white/10 shrink-0" aria-label="Desktop Navigation">
          {desktopNavLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                title={link.label}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all no-underline ${
                  isActive
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/35 shadow-[0_0_12px_rgba(0,229,160,0.25)]"
                    : "text-muted hover:text-white hover:bg-white/5 border border-transparent"
                }`}
              >
                <span>{link.icon}</span>
                <span className="hidden xl:inline">{link.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Right Section: Player Pill, Voice Help, User Menu */}
        <div className="flex items-center gap-1.5 lg:gap-2 shrink-0">
          {/* Offline Queue Badge Button */}
          {queueCount > 0 && onOpenQueue && (
            <button
              onClick={onOpenQueue}
              id="sync-queue-btn"
              className="btn btn-gold !min-h-0 !h-8 !w-auto px-2.5 text-xs font-bold flex items-center gap-1 rounded-xl"
              title="View offline queue"
            >
              <span>📦</span>
              <span>({queueCount})</span>
            </button>
          )}

          {/* Compact Player Pill */}
          <Link
            href="/profile"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl transition-all duration-200 no-underline text-inherit hover:scale-102 shrink-0 whitespace-nowrap"
            style={{
              background: "linear-gradient(135deg, rgba(0,229,160,0.12), rgba(16,185,129,0.06))",
              border: "1px solid rgba(0,229,160,0.3)",
              boxShadow: "0 0 14px rgba(0,229,160,0.12)",
            }}
            title={`Level ${level.level}: ${level.name} · ${streak}d streak · Click to view profile`}
          >
            <span className="text-sm select-none">{level.badge}</span>
            <span className="text-xs font-black text-emerald-300 font-outfit">
              Lvl {level.level}
            </span>
            <span className="text-xs font-bold text-amber-300 flex items-center gap-0.5 font-outfit">
              <span>🔥</span>
              <span>{streak}d</span>
            </span>
          </Link>

          {/* Modern Voice Guide Button */}
          <button
            onClick={() => speak(t("help"))}
            aria-label="Listen to voice guide"
            id="help-btn"
            className="w-8 h-8 rounded-xl flex items-center justify-center text-sm transition-all text-emerald-300 hover:text-white hover:border-emerald-400 !min-h-0 shrink-0"
            style={{
              background: "rgba(0, 229, 160, 0.08)",
              border: "1.5px solid rgba(0, 229, 160, 0.28)",
            }}
            title="Listen to bilingual audio guide"
          >
            🔊
          </button>

          {/* User Profile / Modern Sign In Button */}
          {user ? (
            <div className="relative z-50" ref={userMenuRef}>
              <button
                id="user-menu-btn"
                onClick={() => setShowUserMenu(!showUserMenu)}
                aria-expanded={showUserMenu}
                aria-label="Account details and sign out"
                className="flex items-center gap-2 p-1 pl-2 pr-3 rounded-2xl transition-all !min-h-0"
                style={{
                  background: showUserMenu ? "rgba(0,229,160,0.18)" : "rgba(255,255,255,0.06)",
                  border: `1.5px solid ${showUserMenu ? "rgba(0,229,160,0.5)" : "rgba(255,255,255,0.12)"}`,
                }}
              >
                <div
                  className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center bg-emerald-950/60 text-emerald-300 font-black text-xs border border-emerald-500/40"
                >
                  {user.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatar} alt={user.name || "User"} className="w-full h-full object-cover" />
                  ) : (
                    (user.name || user.email || "?")[0].toUpperCase()
                  )}
                </div>
                <span className="text-xs font-bold text-white max-w-[100px] truncate font-outfit">
                  {user.name?.split(" ")[0] || "Account"}
                </span>
                <span className="text-[10px] text-muted">▾</span>
              </button>

              {/* Account Dropdown Menu */}
              {showUserMenu && (
                <div
                  className="absolute right-0 top-full mt-2 w-56 rounded-2xl p-3 animate-scale-pop shadow-2xl z-50"
                  style={{
                    background: "rgba(10, 22, 16, 0.98)",
                    border: "1.5px solid rgba(0,229,160,0.35)",
                    backdropFilter: "blur(24px)",
                  }}
                >
                  <div className="pb-2.5 mb-2.5 border-b border-white/10">
                    <p className="text-xs font-black text-white truncate font-outfit">{user.name}</p>
                    <p className="text-[11px] text-muted truncate">{user.email}</p>
                  </div>
                  <div className="flex flex-col gap-1 text-xs font-bold">
                    <Link
                      href="/profile"
                      onClick={() => setShowUserMenu(false)}
                      className="px-3 py-2 rounded-xl text-white hover:bg-white/5 no-underline flex items-center gap-2"
                    >
                      <span>👤</span> View Profile
                    </Link>
                    <Link
                      href="/leaderboard"
                      onClick={() => setShowUserMenu(false)}
                      className="px-3 py-2 rounded-xl text-white hover:bg-white/5 no-underline flex items-center gap-2"
                    >
                      <span>🏆</span> Leaderboard
                    </Link>
                    <Link
                      href="/quests"
                      onClick={() => setShowUserMenu(false)}
                      className="px-3 py-2 rounded-xl text-white hover:bg-white/5 no-underline flex items-center gap-2"
                    >
                      <span>📜</span> Quests & Tasks
                    </Link>
                  </div>
                  <div className="pt-2 mt-2 border-t border-white/10">
                    <button
                      id="logout-btn"
                      onClick={() => { setShowUserMenu(false); logout(); }}
                      className="w-full py-2 px-3 text-left rounded-xl text-xs font-bold text-red-300 hover:bg-red-500/10 transition-colors flex items-center gap-2 !min-h-0"
                    >
                      <span>🚪</span> Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/auth/"
              id="sign-in-btn"
              className="flex items-center gap-1.5 px-4 py-2 rounded-2xl text-xs font-black text-emerald-300 no-underline transition-all hover:scale-103 !min-h-0"
              style={{
                background: "linear-gradient(135deg, rgba(0, 229, 160, 0.16), rgba(16, 185, 129, 0.08))",
                border: "1.5px solid rgba(0, 229, 160, 0.4)",
                boxShadow: "0 0 15px rgba(0, 229, 160, 0.15)",
              }}
            >
              <span>👤</span>
              <span>Sign In</span>
            </Link>
          )}
        </div>
      </div>

      {/* ─── MOBILE NAVBAR (< md) ─── */}
      <div className="flex md:hidden items-center justify-between w-full gap-2">
        {/* Brand Logo */}
        <Link href="/" className="app-logo shrink-0 no-underline text-inherit flex items-center gap-2">
          <div
            className="logo-icon overflow-hidden p-1 flex items-center justify-center shrink-0"
            style={{ width: 34, height: 34, borderRadius: 10 }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-192.png" alt="KabadiAI" className="w-full h-full object-contain rounded-lg" />
          </div>
          <div>
            <div className="flex items-center gap-1">
              <span className="text-base font-black gradient-text leading-none font-outfit">
                {t("title")}
              </span>
              {!isOnline && (
                <span className="pill !text-[9px] !px-1 !py-0.2 bg-amber-500/15 border-amber-500/35 text-amber-300">
                  Offline
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted leading-none mt-0.5">e-Waste Intelligence</p>
          </div>
        </Link>

        {/* Right Actions: Compact Player Pill, Audio button, User icon */}
        <div className="flex items-center gap-1.5 max-[400px]:gap-1 shrink-0">
          {/* Offline Queue Badge Button */}
          {queueCount > 0 && onOpenQueue && (
            <button
              onClick={onOpenQueue}
              className="btn btn-gold !min-h-0 !h-8 px-2 text-[11px] font-bold flex items-center gap-1 rounded-xl"
              title="View offline queue"
            >
              <span>📦</span>
              <span>({queueCount})</span>
            </button>
          )}

          {/* Compact Player Pill: shortened / hidden on small phone screens */}
          <Link
            href="/profile"
            className="phone-compact-pill flex items-center gap-1.5 max-[400px]:gap-1 px-2.5 py-1.5 max-[400px]:px-2 max-[400px]:py-1 rounded-xl no-underline text-inherit shrink-0 transition-all max-[330px]:hidden"
            style={{
              background: "rgba(0, 229, 160, 0.12)",
              border: "1px solid rgba(0, 229, 160, 0.3)",
            }}
            title={`Level ${level.level}: ${level.name} · ${streak}d streak · Click to view profile`}
          >
            <span className="text-xs shrink-0 select-none">{level.badge}</span>
            <span className="phone-lvl-text phone-hide-lvl max-[360px]:hidden text-[11px] font-black text-emerald-300 font-outfit shrink-0">L{level.level}</span>
            <span className="phone-hide-streak max-[400px]:hidden text-[11px] font-bold text-amber-300 font-outfit shrink-0">🔥{streak}d</span>
          </Link>

          {/* Voice Help button (Clean icon style) */}
          <button
            onClick={() => speak(t("help"))}
            aria-label="Listen to voice guide"
            id="mobile-help-btn"
            className="w-8 h-8 max-[400px]:w-7 max-[400px]:h-7 rounded-xl flex items-center justify-center text-sm max-[400px]:text-xs transition-all shrink-0"
            style={{
              background: "rgba(0, 229, 160, 0.08)",
              border: "1.5px solid rgba(0, 229, 160, 0.28)",
              color: "#00e5a0",
            }}
            title="Listen to voice instructions"
          >
            🔊
          </button>

          {/* User Sign In / Profile */}
          {user ? (
            <Link
              href="/profile"
              id="mobile-user-profile-btn"
              className="w-8 h-8 max-[400px]:w-7 max-[400px]:h-7 rounded-xl overflow-hidden flex items-center justify-center bg-emerald-950/60 border border-emerald-400/40 text-emerald-300 text-xs font-black no-underline shrink-0"
            >
              {user.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatar} alt="User" className="w-full h-full object-cover" />
              ) : (
                (user.name || user.email || "?")[0].toUpperCase()
              )}
            </Link>
          ) : (
            <Link
              href="/auth/"
              id="mobile-sign-in-btn"
              className="px-2.5 py-1.5 max-[400px]:px-2 max-[400px]:py-1 rounded-xl text-xs max-[400px]:text-[11px] font-bold text-emerald-300 no-underline whitespace-nowrap shrink-0"
              style={{
                background: "rgba(0, 229, 160, 0.12)",
                border: "1px solid rgba(0, 229, 160, 0.3)",
              }}
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

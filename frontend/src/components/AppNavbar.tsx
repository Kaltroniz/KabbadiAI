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
  const desktopMenuRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      const clickedDesktop = desktopMenuRef.current && desktopMenuRef.current.contains(target);
      const clickedMobile = mobileMenuRef.current && mobileMenuRef.current.contains(target);
      if (!clickedDesktop && !clickedMobile) {
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
    { href: "/map", label: "Map", icon: "🗺️" },
    { href: "/insights", label: "Insights", icon: "📊" },
    { href: "/leaderboard", label: "Ranks", icon: "🏆" },
    { href: "/quests", label: "Quests", icon: "📜" },
    { href: "/cards", label: "Cards", icon: "🃏" },
  ];

  // Shared dropdown menu content
  const renderAccountDropdown = (alignClass: string = "right-0") => (
    <div
      className={`absolute ${alignClass} top-full mt-2 w-72 max-w-[calc(100vw-24px)] rounded-2xl p-3.5 animate-scale-pop shadow-2xl z-[100]`}
      style={{
        background: "rgba(8, 20, 14, 0.98)",
        border: "1.5px solid rgba(0,229,160,0.38)",
        backdropFilter: "blur(28px)",
        WebkitBackdropFilter: "blur(28px)",
        boxShadow: "0 14px 44px rgba(0, 0, 0, 0.8), 0 0 30px rgba(0, 229, 160, 0.15)",
      }}
    >
      {/* User Header */}
      <div className="pb-3 mb-2.5 border-b border-white/10 flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center bg-emerald-950/80 text-emerald-300 font-black text-sm border border-emerald-400/50 shrink-0">
          {user?.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatar} alt={user.name || "User"} className="w-full h-full object-cover" />
          ) : (
            (user?.name || user?.email || "?")[0].toUpperCase()
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-black text-white truncate font-outfit">{user?.name || "Eco Warrior"}</p>
            <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950 px-1.5 py-0.2 rounded border border-emerald-500/30 shrink-0">
              Lvl {level.level}
            </span>
          </div>
          <p className="text-[11px] text-muted truncate">{user?.email}</p>
        </div>
      </div>

      {/* Core Navigation Links */}
      <div className="flex flex-col gap-1 text-xs font-bold">
        <Link
          href="/map"
          onClick={() => setShowUserMenu(false)}
          className="px-3 py-2 rounded-xl text-white hover:bg-white/10 no-underline flex items-center gap-2.5 transition-colors"
        >
          <span className="text-sm">🗺️</span> Hotspot Map & 262 Centers
        </Link>
        <Link
          href="/insights"
          onClick={() => setShowUserMenu(false)}
          className="px-3 py-2 rounded-xl text-white hover:bg-white/10 no-underline flex items-center gap-2.5 transition-colors"
        >
          <span className="text-sm">📊</span> Waste Ledger Insights
        </Link>

        <div className="my-1 border-t border-white/10" />

        <Link
          href="/profile"
          onClick={() => setShowUserMenu(false)}
          className="px-3 py-2 rounded-xl text-white hover:bg-white/10 no-underline flex items-center gap-2.5 transition-colors"
        >
          <span className="text-sm">👤</span> Profile & Impact
        </Link>
        <Link
          href="/leaderboard"
          onClick={() => setShowUserMenu(false)}
          className="px-3 py-2 rounded-xl text-white hover:bg-white/10 no-underline flex items-center gap-2.5 transition-colors"
        >
          <span className="text-sm">🏆</span> City Leaderboard
        </Link>
        <Link
          href="/quests"
          onClick={() => setShowUserMenu(false)}
          className="px-3 py-2 rounded-xl text-white hover:bg-white/10 no-underline flex items-center gap-2.5 transition-colors"
        >
          <span className="text-sm">📜</span> Daily Quests
        </Link>
        <Link
          href="/cards"
          onClick={() => setShowUserMenu(false)}
          className="px-3 py-2 rounded-xl text-white hover:bg-white/10 no-underline flex items-center gap-2.5 transition-colors"
        >
          <span className="text-sm">🃏</span> Cards Album
        </Link>
      </div>

      {/* Offline Queue if available */}
      {queueCount > 0 && onOpenQueue && (
        <div className="pt-2 mt-2 border-t border-white/10">
          <button
            onClick={() => {
              setShowUserMenu(false);
              onOpenQueue();
            }}
            className="w-full py-2 px-3 text-left rounded-xl text-xs font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 flex items-center justify-between !min-h-0"
          >
            <span className="flex items-center gap-2">
              <span>📦</span>
              <span>Offline Queue</span>
            </span>
            <span className="bg-amber-400 text-black px-1.5 py-0.2 rounded font-black text-[10px]">
              {queueCount}
            </span>
          </button>
        </div>
      )}

      {/* Sign Out Button */}
      <div className="pt-2.5 mt-2.5 border-t border-white/10">
        <button
          id="logout-btn"
          onClick={() => {
            setShowUserMenu(false);
            logout();
          }}
          className="w-full py-2.5 px-3 rounded-xl text-xs font-bold text-red-300 hover:text-red-100 bg-red-950/50 hover:bg-red-900/60 border border-red-500/40 hover:border-red-500/70 transition-all flex items-center justify-center gap-2 !min-h-0 cursor-pointer shadow-md"
        >
          <span>🚪</span>
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <header
      className="relative z-50 mb-6 px-3 sm:px-4 py-2.5 sm:py-3 rounded-3xl w-full max-w-full box-border"
      style={{
        background: "rgba(10, 24, 18, 0.82)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        border: "1px solid rgba(0, 229, 160, 0.22)",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.45), 0 0 25px rgba(0, 229, 160, 0.08)",
      }}
    >
      {/* ─── DESKTOP NAVBAR (md and up) ─── */}
      <div className="hidden md:flex items-center justify-between gap-3 w-full min-w-0">
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

        {/* Integrated Navigation & Player Profile Capsule */}
        <nav
          className="flex items-center gap-1 lg:gap-1.5 p-1 rounded-2xl bg-white/5 border border-white/10 shrink-0"
          aria-label="Desktop Navigation"
        >
          {/* Main Navigation Links */}
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

          {/* Clean Vertical Divider */}
          <div className="h-5 w-[1px] bg-white/15 mx-0.5 shrink-0" />

          {/* Offline Queue Badge Button */}
          {queueCount > 0 && onOpenQueue && (
            <button
              onClick={onOpenQueue}
              id="sync-queue-btn"
              className="btn btn-gold !min-h-0 !h-8 !w-auto px-2.5 text-xs font-bold flex items-center gap-1 rounded-xl shrink-0"
              title="View offline queue"
            >
              <span>📦</span>
              <span>({queueCount})</span>
            </button>
          )}

          {/* Compact Player Pill - strictly for authenticated users */}
          {user && (
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
          )}

          {/* Voice Guide Audio Button */}
          <button
            onClick={() => speak(t("help"))}
            aria-label="Listen to voice guide"
            id="help-btn"
            className="w-8 h-8 rounded-xl flex items-center justify-center text-sm transition-all text-emerald-300 hover:text-white hover:border-emerald-400 !min-h-0 shrink-0 cursor-pointer"
            style={{
              background: "rgba(0, 229, 160, 0.08)",
              border: "1.5px solid rgba(0, 229, 160, 0.28)",
            }}
            title="Listen to bilingual audio guide"
          >
            🔊
          </button>

          {/* User Profile Button with Anchored Dropdown Menu */}
          {user ? (
            <div className="relative z-50 shrink-0" ref={desktopMenuRef}>
              <button
                id="user-menu-btn"
                onClick={() => setShowUserMenu(!showUserMenu)}
                aria-expanded={showUserMenu}
                aria-label="Account details and sign out"
                className="flex items-center gap-1.5 p-1 pl-1.5 pr-2.5 rounded-xl transition-all !min-h-0 cursor-pointer"
                style={{
                  background: showUserMenu ? "rgba(0,229,160,0.22)" : "rgba(255,255,255,0.08)",
                  border: `1.5px solid ${showUserMenu ? "rgba(0,229,160,0.5)" : "rgba(255,255,255,0.14)"}`,
                }}
              >
                <div
                  className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center bg-emerald-950/80 text-emerald-300 font-black text-xs border border-emerald-500/40 shrink-0"
                >
                  {user.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatar} alt={user.name || "User"} className="w-full h-full object-cover" />
                  ) : (
                    (user.name || user.email || "?")[0].toUpperCase()
                  )}
                </div>
                <span className="text-xs font-bold text-white max-w-[90px] truncate font-outfit">
                  {user.name?.split(" ")[0] || "Account"}
                </span>
                <span className="text-[10px] text-muted">▾</span>
              </button>

              {/* Desktop Account Dropdown Menu */}
              {showUserMenu && renderAccountDropdown("right-0")}
            </div>
          ) : (
            <Link
              href="/auth/"
              id="sign-in-btn"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black text-emerald-300 no-underline transition-all hover:scale-103 !min-h-0 shrink-0"
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
        </nav>
      </div>

      {/* ─── MOBILE NAVBAR (< md) ─── */}
      <div className="flex md:hidden flex-col w-full">
        {/* Top Row: Logo, Player Pill, Voice Guide, User Menu */}
        <div className="flex items-center justify-between w-full gap-2">
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
              <div className="flex items-center gap-1.5">
                <span className="text-base font-black gradient-text leading-none font-outfit">
                  {t("title")}
                </span>
                {!isOnline && (
                  <span className="pill !text-[9px] !px-1.5 !py-0.2 bg-amber-500/15 border-amber-500/35 text-amber-300">
                    Offline
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted leading-none mt-0.5">e-Waste Intelligence</p>
            </div>
          </Link>

          {/* Right Actions: Compact Player Pill, Audio button, User icon */}
          <div className="flex items-center gap-1.5 max-[380px]:gap-1 shrink-0">
            {/* Offline Queue Badge Button */}
            {queueCount > 0 && onOpenQueue && (
              <button
                onClick={onOpenQueue}
                className="btn btn-gold !min-h-0 !h-7.5 px-2 text-[10.5px] font-bold flex items-center gap-1 rounded-xl shrink-0"
                title="View offline queue"
              >
                <span>📦</span>
                <span>({queueCount})</span>
              </button>
            )}

            {/* Compact Player Pill - strictly for authenticated users */}
            {user && (
              <Link
                href="/profile"
                className="phone-compact-pill flex items-center gap-1 px-2 py-1 rounded-xl no-underline text-inherit shrink-0 transition-all"
                style={{
                  background: "linear-gradient(135deg, rgba(0,229,160,0.14), rgba(16,185,129,0.06))",
                  border: "1px solid rgba(0, 229, 160, 0.3)",
                }}
                title={`Level ${level.level}: ${level.name} · ${streak}d streak · Click to view profile`}
              >
                <span className="text-xs shrink-0 select-none">{level.badge}</span>
                <span className="text-[10.5px] font-black text-emerald-300 font-outfit shrink-0">L{level.level}</span>
                <span className="max-[400px]:hidden text-[10.5px] font-bold text-amber-300 font-outfit shrink-0">🔥{streak}d</span>
              </Link>
            )}

            {/* Voice Help button */}
            <button
              onClick={() => speak(t("help"))}
              aria-label="Listen to voice guide"
              id="mobile-help-btn"
              className="w-7.5 h-7.5 rounded-xl flex items-center justify-center text-xs transition-all shrink-0 cursor-pointer"
              style={{
                background: "rgba(0, 229, 160, 0.08)",
                border: "1.2px solid rgba(0, 229, 160, 0.28)",
                color: "#00e5a0",
              }}
              title="Listen to voice instructions"
            >
              🔊
            </button>

            {/* Mobile User Dropdown Anchor */}
            {user ? (
              <div className="relative z-50 shrink-0" ref={mobileMenuRef}>
                <button
                  type="button"
                  id="mobile-user-profile-btn"
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  aria-expanded={showUserMenu}
                  aria-label="Open Account Menu"
                  className="w-7.5 h-7.5 rounded-xl overflow-hidden flex items-center justify-center bg-emerald-950/80 border border-emerald-400/50 text-emerald-300 text-xs font-black shrink-0 cursor-pointer p-0"
                >
                  {user.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatar} alt="User" className="w-full h-full object-cover" />
                  ) : (
                    (user.name || user.email || "?")[0].toUpperCase()
                  )}
                </button>

                {/* Mobile Dropdown Menu */}
                {showUserMenu && renderAccountDropdown("right-0")}
              </div>
            ) : (
              <Link
                href="/auth/"
                id="mobile-sign-in-btn"
                className="px-2.5 py-1 rounded-xl text-[11px] font-bold text-emerald-300 no-underline whitespace-nowrap shrink-0"
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

        {/* ─── MOBILE QUICK NAV TRACK (Pill Segmented Controller) ─── */}
        <nav
          className="flex items-center gap-1 overflow-x-auto p-1 mt-2.5 rounded-2xl bg-white/[0.04] border border-white/[0.08] scrollbar-hide w-full"
          aria-label="Mobile Quick Navigation"
        >
          <Link
            href="/quests"
            className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold no-underline shrink-0 transition-all ${
              pathname === "/quests"
                ? "bg-emerald-500/25 text-emerald-300 border border-emerald-400/40 shadow-[0_0_10px_rgba(0,229,160,0.3)]"
                : "text-muted hover:text-white"
            }`}
          >
            <span>📜</span>
            <span>Quests</span>
          </Link>
          <Link
            href="/cards"
            className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold no-underline shrink-0 transition-all ${
              pathname === "/cards"
                ? "bg-emerald-500/25 text-emerald-300 border border-emerald-400/40 shadow-[0_0_10px_rgba(0,229,160,0.3)]"
                : "text-muted hover:text-white"
            }`}
          >
            <span>🃏</span>
            <span>Cards</span>
          </Link>
          <Link
            href="/map"
            className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold no-underline shrink-0 transition-all ${
              pathname === "/map"
                ? "bg-emerald-500/25 text-emerald-300 border border-emerald-400/40 shadow-[0_0_10px_rgba(0,229,160,0.3)]"
                : "text-muted hover:text-white"
            }`}
          >
            <span>🗺️</span>
            <span>Map</span>
          </Link>
          <Link
            href="/insights"
            className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold no-underline shrink-0 transition-all ${
              pathname === "/insights"
                ? "bg-emerald-500/25 text-emerald-300 border border-emerald-400/40 shadow-[0_0_10px_rgba(0,229,160,0.3)]"
                : "text-muted hover:text-white"
            }`}
          >
            <span>📊</span>
            <span>Insights</span>
          </Link>
          <Link
            href="/leaderboard"
            className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold no-underline shrink-0 transition-all ${
              pathname === "/leaderboard"
                ? "bg-emerald-500/25 text-emerald-300 border border-emerald-400/40 shadow-[0_0_10px_rgba(0,229,160,0.3)]"
                : "text-muted hover:text-white"
            }`}
          >
            <span>🏆</span>
            <span>Ranks</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}

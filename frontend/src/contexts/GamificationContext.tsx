"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import {
  LEVEL_TIERS,
  ALL_BADGES,
  COLLECTIBLE_CARDS,
  STORY_QUESTS,
  INITIAL_CHALLENGES,
  Badge,
  CollectibleCard,
  LevelTier,
  StoryQuest,
  Challenge,
} from "@/data/gamificationData";

const STORAGE_KEY = "kabadiai_gamification_v2";
const API = process.env.NEXT_PUBLIC_API_URL ?? "";

export interface EnvironmentalImpact {
  co2_offset_kg: number;
  energy_saved_kwh: number;
  trees_equivalent: number;
  total_weight_kg: number;
  items_recycled: number;
}

export interface XPPopupItem {
  id: string;
  amount: number;
  label: string;
}

interface GamificationCtx {
  xp: number;
  level: LevelTier;
  nextLevel: LevelTier | null;
  levelProgress: number;
  streak: number;
  lastScanDate: string | null;
  multiplier: number;
  freezeTokens: number;
  impact: EnvironmentalImpact;
  unlockedBadges: string[];
  unlockedCards: string[];
  challenges: Challenge[];
  quests: StoryQuest[];
  recentXPPopups: XPPopupItem[];
  celebrationBadge: Badge | null;
  celebrationCard: CollectibleCard | null;
  celebrationLevel: LevelTier | null;
  isLuckySpinAvailable: boolean;
  showLuckySpinModal: boolean;

  recordScanReward: (scanResult: any, options?: { hasCoords?: boolean; userWeightProvided?: boolean; isOfflineSync?: boolean }) => Promise<void>;
  addXP: (amount: number, reason: string) => void;
  claimChallenge: (challengeId: string) => void;
  completeQuestStep: (questId: string, stepId: string) => void;
  openLuckySpin: () => void;
  closeLuckySpin: () => void;
  claimLuckySpinReward: (xpWon: number) => void;
  dismissBadgeModal: () => void;
  dismissCardModal: () => void;
  dismissLevelModal: () => void;
  resetProgress: () => void;
}

const GamificationContext = createContext<GamificationCtx | undefined>(undefined);

export async function fireConfettiBurst() {
  if (typeof window === "undefined") return;
  try {
    const confetti = (await import("canvas-confetti")).default;
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ["#00e5a0", "#fcd34d", "#10b981", "#38bdf8", "#ec4899"],
    });
  } catch {}
}

export async function fireSuperConfetti() {
  if (typeof window === "undefined") return;
  try {
    const confetti = (await import("canvas-confetti")).default;
    const end = Date.now() + 1200;
    const interval: any = setInterval(() => {
      if (Date.now() > end) return clearInterval(interval);
      confetti({
        startVelocity: 30,
        spread: 360,
        ticks: 60,
        origin: { x: Math.random(), y: Math.random() - 0.2 },
        colors: ["#00e5a0", "#f59e0b", "#60a5fa", "#a855f7"],
      });
    }, 200);
  } catch {}
}

export function GamificationProvider({ children }: { children: ReactNode }) {
  const [xp, setXp] = useState<number>(150);
  const [streak, setStreak] = useState<number>(1);
  const [lastScanDate, setLastScanDate] = useState<string | null>(null);
  const [multiplier, setMultiplier] = useState<number>(1.0);
  const [freezeTokens, setFreezeTokens] = useState<number>(1);

  const [impact, setImpact] = useState<EnvironmentalImpact>({
    co2_offset_kg: 4.8,
    energy_saved_kwh: 7.2,
    trees_equivalent: 0.24,
    total_weight_kg: 1.5,
    items_recycled: 2,
  });

  const [unlockedBadges, setUnlockedBadges] = useState<string[]>(["first_scan"]);
  const [unlockedCards, setUnlockedCards] = useState<string[]>(["motherboard"]);
  const [challenges, setChallenges] = useState<Challenge[]>(INITIAL_CHALLENGES);
  const [quests, setQuests] = useState<StoryQuest[]>(STORY_QUESTS);

  const [recentXPPopups, setRecentXPPopups] = useState<XPPopupItem[]>([]);
  const [celebrationBadge, setCelebrationBadge] = useState<Badge | null>(null);
  const [celebrationCard, setCelebrationCard] = useState<CollectibleCard | null>(null);
  const [celebrationLevel, setCelebrationLevel] = useState<LevelTier | null>(null);
  const [isLuckySpinAvailable, setIsLuckySpinAvailable] = useState<boolean>(false);
  const [showLuckySpinModal, setShowLuckySpinModal] = useState<boolean>(false);

  // Compute Level
  const getLevelInfo = useCallback((currentXp: number) => {
    let current = LEVEL_TIERS[0];
    let next: LevelTier | null = LEVEL_TIERS[1];
    for (let i = 0; i < LEVEL_TIERS.length; i++) {
      if (currentXp >= LEVEL_TIERS[i].min_xp) {
        current = LEVEL_TIERS[i];
        next = i + 1 < LEVEL_TIERS.length ? LEVEL_TIERS[i + 1] : null;
      } else {
        break;
      }
    }
    const currentMin = current.min_xp;
    const nextMin = next ? next.min_xp : currentMin + 50000;
    const span = Math.max(1, nextMin - currentMin);
    const progress = Math.min(100, Math.floor(((currentXp - currentMin) / span) * 100));
    return { level: current, nextLevel: next, progress };
  }, []);

  const { level, nextLevel, progress: levelProgress } = getLevelInfo(xp);

  // Rehydrate state on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (typeof parsed.xp === "number") setXp(parsed.xp);
        if (typeof parsed.streak === "number") setStreak(parsed.streak);
        if (parsed.lastScanDate) setLastScanDate(parsed.lastScanDate);
        if (typeof parsed.multiplier === "number") setMultiplier(parsed.multiplier);
        if (typeof parsed.freezeTokens === "number") setFreezeTokens(parsed.freezeTokens);
        if (parsed.impact) setImpact(parsed.impact);
        if (Array.isArray(parsed.unlockedBadges)) setUnlockedBadges(parsed.unlockedBadges);
        if (Array.isArray(parsed.unlockedCards)) setUnlockedCards(parsed.unlockedCards);
        if (Array.isArray(parsed.challenges)) setChallenges(parsed.challenges);
        if (Array.isArray(parsed.quests)) setQuests(parsed.quests);
      }
    } catch (e) {
      console.error("Error rehydrating gamification state:", e);
    }
  }, []);

  // Persist state changes
  useEffect(() => {
    try {
      const state = {
        xp,
        streak,
        lastScanDate,
        multiplier,
        freezeTokens,
        impact,
        unlockedBadges,
        unlockedCards,
        challenges,
        quests,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }, [xp, streak, lastScanDate, multiplier, freezeTokens, impact, unlockedBadges, unlockedCards, challenges, quests]);

  // Push Floating XP Popup helper
  const triggerXPPopup = useCallback((amount: number, label: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setRecentXPPopups((prev) => [...prev, { id, amount, label }]);
    setTimeout(() => {
      setRecentXPPopups((prev) => prev.filter((p) => p.id !== id));
    }, 2800);
  }, []);

  // Direct XP add with level-up detection
  const addXP = useCallback((amount: number, reason: string) => {
    setXp((prev) => {
      const newXp = prev + amount;
      const oldLvl = getLevelInfo(prev).level;
      const newLvl = getLevelInfo(newXp).level;
      if (newLvl.level > oldLvl.level) {
        setCelebrationLevel(newLvl);
        fireSuperConfetti();
      }
      return newXp;
    });
    triggerXPPopup(amount, reason);
  }, [getLevelInfo, triggerXPPopup]);

  // Main action: record scan reward
  const recordScanReward = useCallback(async (
    scanResult: any,
    options?: { hasCoords?: boolean; userWeightProvided?: boolean; isOfflineSync?: boolean }
  ) => {
    if (!scanResult || scanResult.type !== "result") return;

    const items = scanResult.line_items || [];
    const hazards = (scanResult.hazard_messages || []).map((h: any) => h.hazard_code);
    const todayStr = new Date().toISOString().split("T")[0];

    // Try backend call for server-validated calculation, with rock-solid offline fallback
    let serverReward: any = null;
    try {
      const res = await fetch(`${API}/gamification/scan-reward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          hazards,
          has_coords: Boolean(options?.hasCoords),
          user_weight_provided: Boolean(options?.userWeightProvided),
          is_offline_sync: Boolean(options?.isOfflineSync),
          last_scan_date: lastScanDate,
          current_streak: streak,
          freeze_tokens: freezeTokens,
          known_cards: unlockedCards,
        }),
      });
      if (res.ok) {
        serverReward = await res.json();
      }
    } catch {}

    // 1. Calculate XP gained
    let gainedXp = 50;
    if (serverReward?.total_xp) {
      gainedXp = serverReward.total_xp;
    } else {
      // Offline fallback math
      if (hazards.length > 0) gainedXp += 30 * hazards.length;
      if (options?.hasCoords) gainedXp += 15;
      if (options?.userWeightProvided) gainedXp += 20;
      if (options?.isOfflineSync) gainedXp += 35;
      gainedXp = Math.round(gainedXp * multiplier);
    }

    addXP(gainedXp, "E-Waste Scan Reward");

    // 2. Update Streak
    let nextStreak = streak;
    let nextMultiplier = multiplier;
    let nextFreeze = freezeTokens;
    if (serverReward?.streak) {
      nextStreak = serverReward.streak.streak;
      nextMultiplier = serverReward.streak.multiplier;
      nextFreeze = serverReward.streak.freeze_tokens;
    } else if (lastScanDate !== todayStr) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
      if (lastScanDate === yesterday) {
        nextStreak = streak + 1;
      } else {
        nextStreak = 1;
      }
      nextMultiplier = nextStreak >= 30 ? 2.0 : nextStreak >= 14 ? 1.5 : nextStreak >= 7 ? 1.25 : nextStreak >= 3 ? 1.1 : 1.0;
    }
    setStreak(nextStreak);
    setMultiplier(nextMultiplier);
    setFreezeTokens(nextFreeze);
    setLastScanDate(todayStr);

    // 3. Update Environmental Impact
    const scanImpact = scanResult.environmental_impact || {
      co2_offset_kg: 1.2,
      energy_saved_kwh: 1.8,
      trees_equivalent: 0.06,
      total_weight_kg: 0.5,
    };
    const itemCount = items.reduce((acc: number, it: any) => acc + (it.count || 1), 0) || 1;

    setImpact((prev) => ({
      co2_offset_kg: Number((prev.co2_offset_kg + (scanImpact.co2_offset_kg || 0)).toFixed(2)),
      energy_saved_kwh: Number((prev.energy_saved_kwh + (scanImpact.energy_saved_kwh || 0)).toFixed(2)),
      trees_equivalent: Number((prev.trees_equivalent + (scanImpact.trees_equivalent || 0)).toFixed(2)),
      total_weight_kg: Number((prev.total_weight_kg + (scanImpact.total_weight_kg || 0)).toFixed(2)),
      items_recycled: prev.items_recycled + itemCount,
    }));

    // 4. Discover new Collectible Cards
    const newCardsToUnlock: string[] = [];
    items.forEach((it: any) => {
      const comp = it.component;
      if (comp && !unlockedCards.includes(comp) && !newCardsToUnlock.includes(comp)) {
        newCardsToUnlock.push(comp);
      }
    });

    if (newCardsToUnlock.length > 0) {
      setUnlockedCards((prev) => [...prev, ...newCardsToUnlock]);
      const cardObj = COLLECTIBLE_CARDS.find((c) => c.id === newCardsToUnlock[0]);
      if (cardObj) {
        setCelebrationCard(cardObj);
        fireConfettiBurst();
      }
    }

    // 5. Update Challenges Progress
    setChallenges((prev) =>
      prev.map((ch) => {
        if (ch.completed) return ch;
        let inc = 0;
        if (ch.id.includes("scan")) inc = 1;
        if (ch.id.includes("hazard") && hazards.length > 0) inc = 1;
        if (ch.id.includes("location") && options?.hasCoords) inc = 1;
        const newCur = Math.min(ch.target, ch.current + inc);
        const done = newCur >= ch.target;
        return { ...ch, current: newCur, completed: done };
      })
    );

    // 6. Check for Badge Unlocks
    const newlyEarnedBadges: string[] = [];
    const checkBadge = (id: string, condition: boolean) => {
      if (condition && !unlockedBadges.includes(id) && !newlyEarnedBadges.includes(id)) {
        newlyEarnedBadges.push(id);
      }
    };

    checkBadge("first_scan", true);
    checkBadge("streak_3", nextStreak >= 3);
    checkBadge("streak_7", nextStreak >= 7);
    checkBadge("streak_30", nextStreak >= 30);
    checkBadge("battery_buster", hazards.includes("swollen_battery") || hazards.includes("leaking_battery"));
    checkBadge("mercury_guard", hazards.includes("mercury_lamp"));
    checkBadge("hazard_sentinel", hazards.length >= 2);
    checkBadge("copper_king", items.some((i: any) => i.component === "copper_wire" || i.component === "copper_scrap"));
    checkBadge("detective_10", unlockedCards.length >= 10);
    checkBadge("offline_hero", Boolean(options?.isOfflineSync));
    checkBadge("century_scans", impact.items_recycled + itemCount >= 100);

    if (newlyEarnedBadges.length > 0) {
      setUnlockedBadges((prev) => [...prev, ...newlyEarnedBadges]);
      const badgeObj = ALL_BADGES.find((b) => b.id === newlyEarnedBadges[0]);
      if (badgeObj) {
        setCelebrationBadge(badgeObj);
        fireSuperConfetti();
      }
    }

    // 7. Check Lucky Spin trigger (25% chance or if multiple items)
    if (serverReward?.lucky_spin_eligible || Math.random() < 0.25 || items.length >= 2) {
      setIsLuckySpinAvailable(true);
    }
  }, [
    lastScanDate,
    streak,
    freezeTokens,
    multiplier,
    unlockedCards,
    unlockedBadges,
    impact,
    addXP,
  ]);

  // Claim completed challenge
  const claimChallenge = useCallback((challengeId: string) => {
    setChallenges((prev) =>
      prev.map((ch) => {
        if (ch.id === challengeId && ch.completed && !ch.claimed) {
          addXP(ch.xp, `Completed: ${ch.title}`);
          fireConfettiBurst();
          return { ...ch, claimed: true };
        }
        return ch;
      })
    );
  }, [addXP]);

  // Advance Quest Step
  const completeQuestStep = useCallback((questId: string, stepId: string) => {
    setQuests((prev) =>
      prev.map((q) => {
        if (q.id === questId) {
          const updatedSteps = q.steps.map((st) => {
            if (st.id === stepId && !st.completed) {
              addXP(st.reward_xp, `Quest Step: ${st.text}`);
              fireConfettiBurst();
              return { ...st, completed: true };
            }
            return st;
          });
          return { ...q, steps: updatedSteps };
        }
        return q;
      })
    );
  }, [addXP]);

  // Lucky Spin handlers
  const openLuckySpin = useCallback(() => setShowLuckySpinModal(true), []);
  const closeLuckySpin = useCallback(() => setShowLuckySpinModal(false), []);
  const claimLuckySpinReward = useCallback((xpWon: number) => {
    addXP(xpWon, "Lucky Spin Bonus!");
    setIsLuckySpinAvailable(false);
    setShowLuckySpinModal(false);
  }, [addXP]);

  const dismissBadgeModal = useCallback(() => setCelebrationBadge(null), []);
  const dismissCardModal = useCallback(() => setCelebrationCard(null), []);
  const dismissLevelModal = useCallback(() => setCelebrationLevel(null), []);

  const resetProgress = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setXp(150);
    setStreak(1);
    setMultiplier(1.0);
    setImpact({ co2_offset_kg: 0, energy_saved_kwh: 0, trees_equivalent: 0, total_weight_kg: 0, items_recycled: 0 });
    setUnlockedBadges(["first_scan"]);
    setUnlockedCards(["motherboard"]);
    setChallenges(INITIAL_CHALLENGES);
    setQuests(STORY_QUESTS);
  }, []);

  return (
    <GamificationContext.Provider
      value={{
        xp,
        level,
        nextLevel,
        levelProgress,
        streak,
        lastScanDate,
        multiplier,
        freezeTokens,
        impact,
        unlockedBadges,
        unlockedCards,
        challenges,
        quests,
        recentXPPopups,
        celebrationBadge,
        celebrationCard,
        celebrationLevel,
        isLuckySpinAvailable,
        showLuckySpinModal,
        recordScanReward,
        addXP,
        claimChallenge,
        completeQuestStep,
        openLuckySpin,
        closeLuckySpin,
        claimLuckySpinReward,
        dismissBadgeModal,
        dismissCardModal,
        dismissLevelModal,
        resetProgress,
      }}
    >
      {children}
    </GamificationContext.Provider>
  );
}

export function useGamification() {
  const ctx = useContext(GamificationContext);
  if (!ctx) throw new Error("useGamification must be used within GamificationProvider");
  return ctx;
}

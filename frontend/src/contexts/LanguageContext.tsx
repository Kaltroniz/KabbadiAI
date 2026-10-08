"use client";
import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import en from "@/locales/en.json";
import hi from "@/locales/hi.json";

type Dict = Record<string, string>;
// To add a language: put its REVIEWED file in /locales, import it here, add it to DICTS and LANGS.
const DICTS: Record<string, Dict> = { en, hi };
export const LANGS = [
  { code: "hi", label: "हिन्दी", tts: "hi-IN" },
  { code: "en", label: "English", tts: "en-IN" },
];

interface Ctx { lang: string; setLang: (l: string) => void; t: (k: string) => string; speak: (text: string) => void }
const LanguageContext = createContext<Ctx | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState("hi");
  useEffect(() => {
    try { const s = localStorage.getItem("lang"); if (s && DICTS[s]) setLangState(s); } catch {}
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const setLang = (l: string) => { setLangState(l); try { localStorage.setItem("lang", l); } catch {} };
  const t = (k: string) => DICTS[lang]?.[k] ?? DICTS.hi[k] ?? DICTS.en[k] ?? k;
  const speak = (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || !text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = LANGS.find((x) => x.code === lang)?.tts ?? "hi-IN";
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  };
  return <LanguageContext.Provider value={{ lang, setLang, t, speak }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const c = useContext(LanguageContext);
  if (!c) throw new Error("useLanguage must be used within a LanguageProvider");
  return c;
}

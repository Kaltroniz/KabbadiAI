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

/** Wait for speechSynthesis voices to load (Chrome loads them asynchronously). */
function getVoicesAsync(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) { resolve(voices); return; }
    window.speechSynthesis.onvoiceschanged = () => {
      resolve(window.speechSynthesis.getVoices());
    };
    // Safety fallback – resolve with whatever is available after 2s
    setTimeout(() => resolve(window.speechSynthesis.getVoices()), 2000);
  });
}

/**
 * Pick the best voice for a BCP-47 lang tag (e.g. "hi-IN").
 * Preference: local exact match > remote exact match > local prefix > any prefix.
 */
function pickVoice(voices: SpeechSynthesisVoice[], langTag: string): SpeechSynthesisVoice | undefined {
  const prefix = langTag.split("-")[0];
  const exactLocal  = voices.find((v) => v.lang === langTag && v.localService);
  const exactRemote = voices.find((v) => v.lang === langTag);
  const prefixLocal = voices.find((v) => v.lang.startsWith(prefix) && v.localService);
  const prefixAny   = voices.find((v) => v.lang.startsWith(prefix));
  return exactLocal ?? exactRemote ?? prefixLocal ?? prefixAny;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState("hi");

  useEffect(() => {
    try { const s = localStorage.getItem("lang"); if (s && DICTS[s]) setLangState(s); } catch {}
  }, []);

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const setLang = (l: string) => {
    setLangState(l);
    try { localStorage.setItem("lang", l); } catch {}
  };

  const t = (k: string) => DICTS[lang]?.[k] ?? DICTS.hi[k] ?? DICTS.en[k] ?? k;

  const speak = (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || !text) return;
    window.speechSynthesis.cancel();

    const langTag = LANGS.find((x) => x.code === lang)?.tts ?? "hi-IN";

    getVoicesAsync().then((voices) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = langTag;
      u.rate = 0.85;
      u.pitch = 1.0;

      const voice = pickVoice(voices, langTag);
      if (voice) u.voice = voice;

      // Chrome bug workaround: long utterances silently pause after ~15s.
      // Calling pause()+resume() every 10s keeps synthesis alive.
      const keepalive = setInterval(() => {
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      }, 10000);

      u.onend   = () => clearInterval(keepalive);
      u.onerror = () => clearInterval(keepalive);

      window.speechSynthesis.speak(u);
    });
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, speak }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const c = useContext(LanguageContext);
  if (!c) throw new Error("useLanguage must be used within a LanguageProvider");
  return c;
}

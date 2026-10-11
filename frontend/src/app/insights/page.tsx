"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useRef, useState } from "react";
import AuthGuard from "@/components/AuthGuard";

const API = process.env.NEXT_PUBLIC_API_URL;
const ASKS = [
  "Where should a truck go for circuit boards?",
  "Which areas have the most hazardous lots?",
  "How much of each material do we have?",
];

function AnimatedCount({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let start = 0;
    const steps = 35;
    const step = value / steps;
    const timer = setInterval(() => {
      start += step;
      if (start >= value) { setDisplay(value); clearInterval(timer); }
      else setDisplay(Math.round(start));
    }, 30);
    return () => clearInterval(timer);
  }, [value]);
  return <>{display}</>;
}

function AnimatedInsightsBar({ percent, delay = 0 }: { percent: number; delay?: number }) {
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      if (barRef.current) barRef.current.style.width = `${percent}%`;
    }, 300 + delay);
    return () => clearTimeout(t);
  }, [percent, delay]);
  return (
    <div style={{ height: 10, background: "rgba(255,255,255,0.07)", borderRadius: 8, overflow: "hidden", marginTop: 6 }}>
      <div
        ref={barRef}
        style={{
          height: "100%",
          width: "0%",
          background: "linear-gradient(90deg, #00e5a0, #10b981, #059669)",
          borderRadius: 8,
          boxShadow: "0 0 10px rgba(0,229,160,0.4)",
          transition: "width 1.2s cubic-bezier(.22,1,.36,1)",
        }}
      />
    </div>
  );
}

function Insights() {
  const [s, setS] = useState<any>(null);
  const [err, setErr] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [ans, setAns] = useState<any>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetch(`${API}/stats`)
      .then((r) => r.json())
      .then(setS)
      .catch(() => setErr(true));
  }, []);

  const ask = async (text: string) => {
    setQ(text); setBusy(true); setAns(null);
    try {
      const r = await fetch(`${API}/analyst`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, language: "en" }),
      });
      setAns(await r.json());
    } catch {
      setAns({ answer: "Could not reach the analyst. Try again." });
    }
    setBusy(false);
  };

  if (!mounted) return null;

  if (err) return (
    <>
      <div className="particles" aria-hidden="true">
        {Array.from({ length: 10 }).map((_, i) => <div key={i} className="particle" />)}
      </div>
      <div className="page-wrapper animate-fade-in">
        <div className="card text-center py-10">
          <div className="text-5xl mb-4">📡</div>
          <p style={{ color: "var(--text-muted)" }}>Could not load stats. Check your connection.</p>
          <a href="/" className="btn btn-ghost !w-auto px-6 mt-4 inline-flex items-center no-underline" style={{ textDecoration: "none" }}>← Back</a>
        </div>
      </div>
    </>
  );

  if (!s) return (
    <>
      <div className="particles" aria-hidden="true">
        {Array.from({ length: 10 }).map((_, i) => <div key={i} className="particle" />)}
      </div>
      <div className="page-wrapper animate-fade-in">
        <div className="flex flex-col gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card shimmer" style={{ height: 80 }} />
          ))}
        </div>
      </div>
    </>
  );

  const mats = Object.entries(s.weight_kg_by_component || {}).sort((a: any, b: any) => b[1] - a[1]);
  const top = mats.length ? (mats[0][1] as number) : 1;
  const totalHazards = Object.values(s.hazard_counts || {}).reduce((a: any, b: any) => a + b, 0) as number;

  return (
    <>
      <div className="particles" aria-hidden="true">
        {Array.from({ length: 10 }).map((_, i) => <div key={i} className="particle" />)}
      </div>

      <div className="page-wrapper animate-fade-in">
        {/* Header */}
        <div className="app-header mb-5">
          <div className="app-logo">
            <div className="logo-icon">📊</div>
            <div>
              <h1 className="text-xl font-black gradient-text leading-none">KabadiAI Insights</h1>
              <p className="text-xs leading-none mt-0.5" style={{ color: "var(--text-muted)" }}>Live e-waste analytics</p>
            </div>
          </div>
          <a
            href="/"
            id="back-home-btn"
            className="btn btn-ghost !min-h-0 !rounded-xl px-4 py-2 text-sm !w-auto flex items-center gap-1 no-underline"
            style={{ textDecoration: "none" }}
          >
            ← Home
          </a>
        </div>

        <p className="text-xs mb-5" style={{ color: "var(--text-muted)" }}>
          Real scans only, anonymous aggregated ledger. Weights are estimated from photos.
        </p>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 mb-4 stagger-children">
          <div className="card text-center">
            <div className="text-4xl font-black gradient-text">
              <AnimatedCount value={s.lots || 0} />
            </div>
            <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>lots scanned</div>
          </div>
          <div className="card text-center">
            <div className="text-4xl font-black" style={{ color: "#fca5a5" }}>
              <AnimatedCount value={totalHazards} />
            </div>
            <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>hazard flags</div>
          </div>
        </div>

        {/* Materials bar chart */}
        {mats.length > 0 && (
          <div className="card mb-4">
            <h2 className="font-bold text-base mb-4" style={{ color: "var(--text-primary)" }}>
              ⚖️ Material found (kg, estimated)
            </h2>
            <div className="space-y-3">
              {mats.map(([k, v]: any, i: number) => (
                <div key={k} className="animate-fade-up" style={{ animationDelay: `${i * 0.05}s` }}>
                  <div className="flex justify-between text-sm mb-1">
                    <span style={{ color: "var(--text-primary)" }}>{k.replace(/_/g, " ")}</span>
                    <span className="font-bold" style={{ color: "var(--emerald-glow)" }}>{v} kg</span>
                  </div>
                  <AnimatedInsightsBar percent={(v / top) * 100} delay={i * 80} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Analyst chat */}
        <div className="card">
          <h2 className="font-bold text-base mb-3" style={{ color: "var(--text-primary)" }}>
            🤖 Ask the analyst
          </h2>
          <div className="flex flex-wrap gap-2 mb-4">
            {ASKS.map((a) => (
              <button
                key={a}
                id={`ask-btn-${a.slice(0, 20).replace(/\s/g, "-")}`}
                onClick={() => ask(a)}
                className="btn btn-ghost !min-h-0 !rounded-full px-3 !h-auto py-2 text-xs !w-auto text-left"
              >
                {a}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              id="analyst-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && q && ask(q)}
              placeholder="Ask about the ledger…"
              className="glass-input text-sm"
            />
            <button
              id="analyst-ask-btn"
              onClick={() => q && ask(q)}
              disabled={busy}
              className="btn btn-primary !w-auto px-5 !min-h-0 !rounded-xl text-base"
            >
              {busy ? (
                <span className="animate-spin inline-block">⟳</span>
              ) : "Ask"}
            </button>
          </div>
          {ans && (
            <div className="mt-4 card animate-fade-up" style={{ background: "rgba(0,229,160,0.06)", border: "1px solid rgba(0,229,160,0.2)" }}>
              <p className="text-base" style={{ color: "var(--text-primary)" }}>{ans.answer}</p>
              {ans.tools_used?.length > 0 && (
                <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
                  Tools: {ans.tools_used.map((t: any) => t.tool).join(" → ")}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

const ProtectedInsights = () => <AuthGuard><Insights /></AuthGuard>;
export { ProtectedInsights as default };

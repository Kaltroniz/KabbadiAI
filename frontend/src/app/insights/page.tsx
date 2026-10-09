"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL;
const ASKS = ["Where should a truck go for circuit boards?", "Which areas have the most hazardous lots?", "How much of each material do we have?"];

export default function Insights() {
  const [s, setS] = useState<any>(null);
  const [err, setErr] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [ans, setAns] = useState<any>(null);

  useEffect(() => { fetch(`${API}/stats`).then((r) => r.json()).then(setS).catch(() => setErr(true)); }, []);

  const ask = async (text: string) => {
    setQ(text); setBusy(true); setAns(null);
    try {
      const r = await fetch(`${API}/analyst`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text, language: "en" }) });
      setAns(await r.json());
    } catch { setAns({ answer: "Could not reach the analyst. Try again." }); }
    setBusy(false);
  };

  if (err) return <main className="p-4">Could not load stats.</main>;
  if (!s) return <main className="p-4">Loading…</main>;
  const cells: any[] = s.cells || [];
  const lats = cells.map((c) => c.lat), lons = cells.map((c) => c.lon);
  const pos = (v: number, arr: number[], size: number) => (Math.max(...arr) === Math.min(...arr) ? size / 2 : 20 + ((v - Math.min(...arr)) / (Math.max(...arr) - Math.min(...arr))) * (size - 40));
  const mats = Object.entries(s.weight_kg_by_component || {}).sort((a: any, b: any) => b[1] - a[1]);
  const top = mats.length ? (mats[0][1] as number) : 1;

  return (
    <main className="px-4 pt-4 pb-10 space-y-5">
      <h1 className="text-2xl font-extrabold text-emerald-800">♻ KabadiAI Insights</h1>
      <p className="text-sm text-stone-500">Real scans only, anonymous, about 1 km cells. Weights are estimated from photos. This is a small early sample.</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="card !p-3"><div className="text-3xl font-black">{s.lots}</div><div className="text-sm text-stone-500">lots scanned</div></div>
        <div className="card !p-3"><div className="text-3xl font-black text-red-700">{Object.values(s.hazard_counts || {}).reduce((a: any, b: any) => a + b, 0) as number}</div><div className="text-sm text-stone-500">hazard flags</div></div>
      </div>
      <div className="card">
        <h2 className="font-bold mb-2">Where lots are found</h2>
        {cells.length === 0 ? <p className="text-stone-500">No located lots yet.</p> : (
          <svg viewBox="0 0 300 300" className="w-full bg-stone-100 rounded-xl">
            {cells.map((c, i) => <circle key={i} cx={pos(c.lon, lons, 300)} cy={300 - pos(c.lat, lats, 300)} r={8 + 4 * c.lots} fill={c.hazard_lots > 0 ? "#b91c1c" : "#047857"} fillOpacity={0.6} />)}
          </svg>
        )}
        <p className="text-xs text-stone-500 mt-2">Red = cells with hazardous lots. Schematic positions, not a street map.</p>
      </div>
      <div className="card">
        <h2 className="font-bold mb-3">Material found (kg, estimated)</h2>
        {mats.map(([k, v]: any) => (
          <div key={k} className="mb-2"><div className="flex justify-between text-sm"><span>{k.replace(/_/g, " ")}</span><span>{v}</span></div>
            <div className="h-3 bg-stone-200 rounded"><div className="h-3 bg-emerald-700 rounded" style={{ width: `${(v / top) * 100}%` }} /></div></div>
        ))}
      </div>
      <div className="card">
        <h2 className="font-bold mb-2">Ask the analyst</h2>
        <div className="flex flex-wrap gap-2 mb-3">{ASKS.map((a) => <button key={a} onClick={() => ask(a)} className="px-3 text-sm rounded-full bg-stone-200">{a}</button>)}</div>
        <div className="flex gap-2"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about the ledger" className="flex-1 border rounded-xl px-3" />
          <button onClick={() => q && ask(q)} disabled={busy} className="px-4 rounded-xl bg-emerald-700 text-white font-bold">{busy ? "…" : "Ask"}</button></div>
        {ans && (<div className="mt-3"><p className="text-lg">{ans.answer}</p>
          {ans.tools_used?.length > 0 && <p className="text-xs text-stone-500 mt-2">Tools used: {ans.tools_used.map((t: any) => t.tool).join(" → ")}</p>}</div>)}
      </div>
    </main>
  );
}

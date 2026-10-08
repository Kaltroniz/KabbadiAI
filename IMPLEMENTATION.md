# KabadiAI - Implementation Overview & Hackathon Guide

This document captures all the core ideas, architectural decisions, and code implemented for the **KabadiAI** project during the Bharat Builds Tour (Environmental Hacks) hackathon.

## 1. Core Idea
KabadiAI is a multilingual mobile web app (PWA) designed to combat e-waste. Users take a photo of old electronics, and the app uses AI (orchestrated via Strands Agents) to:
1. Identify the items and their condition.
2. Flag any hazardous materials (e.g., Lead, Lithium) using strict, predefined safety text.
3. Calculate an indicative fair-price value (Min/Max INR).
4. Locate the nearest authorized e-waste recyclers.
5. Generate a shareable "Appraisal Card" that can be sent to local scrap dealers (kabadiwalas) via WhatsApp.

---

## 2. Architecture Stack
* **Frontend:** Next.js 14, TailwindCSS v3.4, React Context (for multilingual strings), and PWA Manifest.
* **Backend:** AWS Serverless Application Model (SAM).
* **Database:** Amazon DynamoDB (Tables: `PricesTable`, `RecyclersTable`, `DisposalProtocolsTable`).
* **AI Orchestration:** Strands Agents (AWS Bedrock / Gemini 3.1 Pro High).

---

## 3. Backend Implementation (AWS SAM)

The backend is built around discrete Lambda functions defined in `template.yaml`. 

### template.yaml
`yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: KabadiAI backend (Day 1 - scan pipeline)

Parameters:
  BedrockModelId:
    Type: String
    Default: us.amazon.nova-2-lite-v1:0
  MockAnalysis:
    Type: String
    Default: "0"
    AllowedValues: ["0", "1"]
    Description: Set to "1" to return fixed mock data without calling Bedrock. Remove before final demo.

Globals:
  Function:
    Runtime: python3.13
    Timeout: 60
    MemorySize: 512

Resources:
  # ── API ──────────────────────────────────────────────────────────────────
  Api:
    Type: AWS::Serverless::HttpApi
    Properties:
      CorsConfiguration:
        AllowOrigins: ['*']
        AllowMethods: [POST, GET, OPTIONS]
        AllowHeaders: [content-type]
      DefaultRouteSettings:
        ThrottlingBurstLimit: 10
        ThrottlingRateLimit: 5

  # ── DynamoDB tables ───────────────────────────────────────────────────────
  PricesTable:
    Type: AWS::DynamoDB::Table
    Properties:
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: component
          AttributeType: S
      KeySchema:
        - AttributeName: component
          KeyType: HASH

  RecyclersTable:
    Type: AWS::DynamoDB::Table
    Properties:
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: id
          AttributeType: S
      KeySchema:
        - AttributeName: id
          KeyType: HASH

  # ── Lambda functions ───────────────────────────────────────────────────────
  ScanFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: src/scan/
      Handler: app.handler
      Environment:
        Variables:
          BEDROCK_MODEL_ID: !Ref BedrockModelId
          MOCK_ANALYSIS: !Ref MockAnalysis
          PRICES_TABLE: !Ref PricesTable
          RECYCLERS_TABLE: !Ref RecyclersTable
      Policies:
        - Statement:
            - Effect: Allow
              Action: [bedrock:InvokeModel]
              Resource: '*'
            - Effect: Allow
              Action:
                - dynamodb:GetItem
                - dynamodb:Query
                - dynamodb:Scan
              Resource:
                - !GetAtt PricesTable.Arn
                - !GetAtt RecyclersTable.Arn
      Events:
        Scan:
          Type: HttpApi
          Properties:
            ApiId: !Ref Api
            Path: /scan
            Method: POST

  PriceFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: src/price/
      Handler: app.handler
      Environment:
        Variables:
          PRICES_TABLE: !Ref PricesTable
      Policies:
        - Statement:
            - Effect: Allow
              Action:
                - dynamodb:GetItem
              Resource: !GetAtt PricesTable.Arn
      Events:
        Price:
          Type: HttpApi
          Properties:
            ApiId: !Ref Api
            Path: /price
            Method: POST

  RecyclersFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: src/recyclers/
      Handler: app.handler
      Environment:
        Variables:
          RECYCLERS_TABLE: !Ref RecyclersTable
      Policies:
        - Statement:
            - Effect: Allow
              Action:
                - dynamodb:Scan
              Resource: !GetAtt RecyclersTable.Arn
      Events:
        Recyclers:
          Type: HttpApi
          Properties:
            ApiId: !Ref Api
            Path: /recyclers
            Method: GET

  AgentFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: src/agent/
      Handler: app.handler
      Timeout: 29
      MemorySize: 1024
      Environment:
        Variables:
          BEDROCK_MODEL_ID: !Ref BedrockModelId
          MOCK_ANALYSIS: !Ref MockAnalysis
          AGENT_MODE: "0"
          PRICES_TABLE: !Ref PricesTable
          RECYCLERS_TABLE: !Ref RecyclersTable
      Policies:
        - Statement:
            - Effect: Allow
              Action: [bedrock:InvokeModel]
              Resource: '*'
            - Effect: Allow
              Action:
                - dynamodb:GetItem
                - dynamodb:Scan
              Resource:
                - !GetAtt PricesTable.Arn
                - !GetAtt RecyclersTable.Arn
      Events:
        Agent:
          Type: HttpApi
          Properties:
            ApiId: !Ref Api
            Path: /agent
            Method: POST

Outputs:
  ApiUrl:
    Value: !Sub https://${Api}.execute-api.${AWS::Region}.amazonaws.com
  PricesTableName:
    Value: !Ref PricesTable
  RecyclersTableName:
    Value: !Ref RecyclersTable
`

### src/agent/app.py
`python
"""KabadiAI POST /agent.
Facts (prices, hazard text, recyclers) come from tables and fixed text, never from the model.
The model only reads the photo. Tools take no data arguments, so the agent cannot corrupt numbers.
AGENT_MODE=1 lets a Strands agent choose the order of steps; default (0) runs the same steps
deterministically. API Gateway HTTP APIs cut requests at 30 s, so measure agent latency first."""
import base64, json, math, os, re
import boto3

MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "us.amazon.nova-2-lite-v1:0")
MOCK = os.environ.get("MOCK_ANALYSIS", "0") == "1"
AGENT_MODE = os.environ.get("AGENT_MODE", "0") == "1"
PRICES_TABLE = os.environ.get("PRICES_TABLE", "")
RECYCLERS_TABLE = os.environ.get("RECYCLERS_TABLE", "")
MIN_CONF, MAX_BYTES = 70, 4_000_000
MEDIA = {"image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp"}
COMPONENTS = {"motherboard", "ram_stick", "mobile_pcb", "li_ion_battery", "alkaline_battery", "copper_wire",
              "charger_adapter", "hard_drive", "aluminium_heatsink", "screen", "cfl_or_tube_light",
              "router_or_modem", "remote", "other"}
CONDITIONS = {"intact", "corroded", "swollen", "leaking", "broken", "unknown"}
HAZARDS = {"swollen_battery", "leaking_battery", "mercury_lamp", "crt_or_lead_glass"}
NO_VALUE = {"li_ion_battery", "alkaline_battery", "cfl_or_tube_light"}
DISCLAIMER = "Indicative only, not an official valuation. Recycler data covers Delhi-NCR only (DPCC/CPCB list, 2023)."

# Fixed safety text. Hindi is a DRAFT: a native speaker must review before the demo.
HAZARD_MESSAGES = {
    "swollen_battery": {"en": "DANGER: swollen lithium battery. Do not burn, puncture or crush.",
                        "hi": "खतरा: फूली हुई लिथियम बैटरी। इसे जलाएं नहीं, छेदें नहीं, दबाएं नहीं।"},
    "leaking_battery": {"en": "Leaking battery. Do not touch with bare hands. Keep it separate.",
                        "hi": "बैटरी से तरल निकल रहा है। नंगे हाथ से न छुएं। इसे अलग रखें।"},
    "mercury_lamp": {"en": "Contains mercury. Do not break the tube or bulb.",
                     "hi": "इसमें पारा (मरकरी) है। ट्यूब या बल्ब न तोड़ें।"},
    "crt_or_lead_glass": {"en": "Hazardous: lead glass. Do not break open.",
                          "hi": "खतरनाक: इसमें सीसे का कांच है। इसे न तोड़ें।"},
}
GENERAL = {"en": "Never burn circuit boards or use acid to extract metal.",
           "hi": "सर्किट बोर्ड कभी न जलाएं और धातु निकालने के लिए तेज़ाब का इस्तेमाल न करें।"}

PROMPT = f"""You assess photographed discarded electronics in India. Return ONLY one JSON object:
{{"items":[{{"component":<one of {sorted(COMPONENTS)}>,"condition":<one of {sorted(CONDITIONS)}>,"count":<int>,"est_weight_g":<int, TOTAL weight of all units in this line>}}],
 "hazards":[<subset of {sorted(HAZARDS)}>],"confidence":<0-100>,"notes":"<short>"}}
List only what is visible. Lower confidence if blurry, dark or hidden. Flag swollen_battery only if a battery visibly bulges."""

MOCK_SCAN = {"items": [{"component": "motherboard", "condition": "corroded", "count": 1, "est_weight_g": 320},
                       {"component": "copper_wire", "condition": "intact", "count": 3, "est_weight_g": 270},
                       {"component": "li_ion_battery", "condition": "swollen", "count": 1, "est_weight_g": 150}],
             "hazards": [], "confidence": 85, "notes": "MOCK DATA, Bedrock not called."}

_ddb = None
def _table(name):
    global _ddb
    _ddb = _ddb or boto3.resource("dynamodb")
    return _ddb.Table(name)

def _price_row(comp):
    t = _table(PRICES_TABLE)
    return t.get_item(Key={"component": comp}).get("Item") or t.get_item(Key={"component": "other"}).get("Item") or {}

def _all_recyclers():
    return _table(RECYCLERS_TABLE).scan().get("Items", [])

def _km(a, b, c, d):
    p = math.pi / 180
    x = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(x))

def _clean(raw):
    items = []
    for it in raw.get("items", [])[:20]:
        items.append({"component": it.get("component") if it.get("component") in COMPONENTS else "other",
                      "condition": it.get("condition") if it.get("condition") in CONDITIONS else "unknown",
                      "count": max(1, int(it.get("count", 1) or 1)),
                      "est_weight_g": max(0, int(it.get("est_weight_g", 0) or 0))})
    return {"items": items, "hazards": [h for h in raw.get("hazards", []) if h in HAZARDS],
            "confidence": max(0, min(100, int(raw.get("confidence", 0) or 0))), "notes": str(raw.get("notes", ""))[:300]}

def _bedrock_scan(img, fmt):
    client = boto3.client("bedrock-runtime")
    for _ in range(2):
        try:
            r = client.converse(modelId=MODEL_ID, messages=[{"role": "user", "content": [
                {"image": {"format": fmt, "source": {"bytes": img}}}, {"text": PROMPT}]}],
                inferenceConfig={"maxTokens": 1000})
            m = re.search(r"\{.*\}", r["output"]["message"]["content"][0]["text"], re.S)
            return _clean(json.loads(m.group(0)))
        except (AttributeError, ValueError, KeyError, TypeError):
            continue
    raise RuntimeError("model returned invalid output")

def _hazards(scan):  # model flags plus rules, so a swollen battery is never missed
    h = set(scan["hazards"])
    for it in scan["items"]:
        c, k = it["component"], it["condition"]
        if c == "li_ion_battery" and k == "swollen": h.add("swollen_battery")
        if k == "leaking" and c in ("li_ion_battery", "alkaline_battery"): h.add("leaking_battery")
        if c == "cfl_or_tube_light": h.add("mercury_lamp")
    return sorted(h & HAZARDS)

CTX = {}

def _analyze():
    scan = json.loads(json.dumps(MOCK_SCAN)) if MOCK else _bedrock_scan(CTX["image"], CTX["fmt"])
    scan["low_confidence"] = scan["confidence"] < MIN_CONF
    CTX["scan"] = scan
    return {"confidence": scan["confidence"], "low_confidence": scan["low_confidence"], "items": len(scan["items"])}

def _clarify():
    CTX["result"] = {"type": "clarify", "scan": {"confidence": CTX["scan"]["confidence"]},
                     "clarify_message": "The photo is too blurry or dark. Please take a closer, well-lit photo."}
    return "Asked the user for a better photo. Stop."

def _price():
    rows, lo_t, hi_t = [], 0.0, 0.0
    for it in CTX["scan"]["items"]:
        row, kg = _price_row(it["component"]), it["est_weight_g"] / 1000
        zero = it["component"] in NO_VALUE
        lo = 0.0 if zero else round(float(row.get("min_inr_per_kg", 0)) * kg, 2)
        hi = 0.0 if zero else round(float(row.get("max_inr_per_kg", 0)) * kg, 2)
        lo_t, hi_t = lo_t + lo, hi_t + hi
        rows.append({"component": it["component"], "condition": it["condition"], "count": it["count"],
                     "est_weight_g": it["est_weight_g"], "min_inr": lo, "max_inr": hi, "hazardous": zero,
                     "source": str(row.get("source", "")), "checked_date": str(row.get("checked_date", ""))})
    CTX["line_items"], CTX["totals"] = rows, (round(lo_t, 2), round(hi_t, 2))
    return {"total_min_inr": CTX["totals"][0], "total_max_inr": CTX["totals"][1]}

def _safety():
    lang = CTX["lang"]
    CTX["hazards"] = [{"hazard_code": c, "message": HAZARD_MESSAGES[c].get(lang, HAZARD_MESSAGES[c]["en"])}
                      for c in _hazards(CTX["scan"])]
    return {"hazards_found": len(CTX["hazards"])}

def _recyclers():
    lat, lon = CTX.get("lat"), CTX.get("lon")
    out = []
    if lat is not None and lon is not None:
        for r in _all_recyclers():
            d = _km(lat, lon, float(r["lat"]), float(r["lon"]))
            out.append({"id": r["id"], "name": r["name"], "address": r["address"], "city": r["city"],
                        "distance_km": round(d, 2),
                        "directions_url": f"https://maps.google.com/maps?daddr={r['lat']},{r['lon']}&saddr={lat},{lon}"})
        out.sort(key=lambda x: x["distance_km"])
    CTX["recyclers"] = out[:5]
    return {"recyclers_found": len(CTX["recyclers"])}

def _finish():
    lo, hi = CTX["totals"]
    res = {"type": "result", "scan": CTX["scan"], "line_items": CTX["line_items"], "total_min_inr": lo,
           "total_max_inr": hi, "hazard_messages": CTX["hazards"], "recyclers": CTX["recyclers"],
           "general_warning": GENERAL.get(CTX["lang"], GENERAL["en"]), "disclaimer": DISCLAIMER}
    offer = CTX.get("offer")
    if offer is not None and hi > 0:
        res["verdict"] = "low" if offer < lo else "high" if offer > hi else "fair"
    CTX["result"] = res
    return "Result assembled."

def _complete():  # fills any step the agent skipped; never re-scans the photo
    if "scan" not in CTX: _analyze()
    if CTX["scan"]["low_confidence"]:
        if "result" not in CTX: _clarify()
        return
    if "line_items" not in CTX: _price()
    if "hazards" not in CTX: _safety()
    if "recyclers" not in CTX: _recyclers()
    if CTX.get("result", {}).get("type") != "result": _finish()

try:
    from strands import Agent, tool
except ImportError:
    Agent = None
    def tool(fn): return fn

@tool
def analyze_image() -> dict:
    """Analyse the user's photo. Returns confidence and whether it is low."""
    return _analyze()

@tool
def request_clarification() -> str:
    """Ask for a better photo. Call only if analyze_image reported low_confidence."""
    return _clarify()

@tool
def price_items() -> dict:
    """Look up indicative values for the identified items from the price table."""
    return _price()

@tool
def get_safety_messages() -> dict:
    """Load the fixed, reviewed safety messages for any hazards found."""
    return _safety()

@tool
def find_recyclers() -> dict:
    """Find nearest authorized recyclers if the user's location is known."""
    return _recyclers()

@tool
def finish() -> str:
    """Assemble the final result once pricing, safety and recyclers are done."""
    return _finish()

SYSTEM = """You coordinate a pipeline for KabadiAI. Call analyze_image first. If it reports low_confidence,
call request_clarification and stop. Otherwise call price_items, get_safety_messages and find_recyclers,
then finish. Never state prices, hazards or places yourself."""

def _json(status, body):
    return {"statusCode": status, "headers": {"content-type": "application/json"}, "body": json.dumps(body)}

def handler(event, context):
    global CTX
    try:
        raw = event.get("body") or "{}"
        if event.get("isBase64Encoded"): raw = base64.b64decode(raw).decode()
        b = json.loads(raw)
        fmt, img = "jpeg", b""
        if not MOCK:
            fmt = MEDIA.get(b.get("media_type", "image/jpeg"))
            if not fmt: return _json(400, {"error": "unsupported image type"})
            img = base64.b64decode(b["image_b64"])
            if len(img) > MAX_BYTES: return _json(400, {"error": "image too large; resize before upload"})
        lat = float(b["lat"]) if b.get("lat") is not None else None
        lon = float(b["lon"]) if b.get("lon") is not None else None
        if lat is not None and not (-90 <= lat <= 90 and -180 <= (lon if lon is not None else 0) <= 180):
            return _json(400, {"error": "bad coordinates"})
        offer = float(b["dealer_offer_inr"]) if b.get("dealer_offer_inr") is not None else None
        if offer is not None and offer < 0: return _json(400, {"error": "bad offer"})
        CTX = {"image": img, "fmt": fmt, "lat": lat, "lon": lon, "offer": offer, "lang": str(b.get("language", "hi"))[:5]}
    except Exception:
        return _json(400, {"error": "bad request"})
    try:
        if AGENT_MODE and Agent and not MOCK:
            agent = Agent(model=MODEL_ID, system_prompt=SYSTEM, callback_handler=None,
                          tools=[analyze_image, request_clarification, price_items, get_safety_messages, find_recyclers, finish])
            agent("Assess the e-waste photo.")
        _complete()
        res = CTX["result"]
        if MOCK: res["mock"] = True
        return _json(200, res)
    except Exception as e:
        print("agent error:", repr(e))
        return _json(502, {"error": "analysis failed"})
`

### scripts/seed_db.py
`python
"""Seed DynamoDB tables with initial prices and recycler data.

Usage (PowerShell):
    python scripts/seed_db.py --stack kabadiai --region us-east-1

The table names are read from the CloudFormation stack outputs, so the stack
must already be deployed before running this script.  Pass --dry-run to print
what would be written without touching DynamoDB.
"""
import argparse, json, pathlib, sys
import boto3
from decimal import Decimal

ROOT = pathlib.Path(__file__).parent.parent


def get_table_names(stack_name, region):
    cf = boto3.client("cloudformation", region_name=region)
    resp = cf.describe_stacks(StackName=stack_name)
    outputs = {o["OutputKey"]: o["OutputValue"] for o in resp["Stacks"][0].get("Outputs", [])}
    prices_table    = outputs.get("PricesTableName")
    recyclers_table = outputs.get("RecyclersTableName")
    if not prices_table or not recyclers_table:
        sys.exit(
            f"ERROR: Could not find PricesTableName or RecyclersTableName in stack "
            f"'{stack_name}' outputs.\nOutputs found: {list(outputs.keys())}"
        )
    return prices_table, recyclers_table


def to_dynamodb(obj):
    """Convert floats to Decimal (DynamoDB requirement)."""
    if isinstance(obj, float):
        return Decimal(str(obj))
    if isinstance(obj, dict):
        return {k: to_dynamodb(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [to_dynamodb(v) for v in obj]
    return obj


def seed_table(table, items, key_attr, dry_run):
    print(f"\nSeeding table: {table.name}  ({len(items)} items)")
    with table.batch_writer() as batch:
        for item in items:
            dynamo_item = to_dynamodb(item)
            if dry_run:
                print("  DRY-RUN would write:", json.dumps(item))
            else:
                batch.put_item(Item=dynamo_item)
                print(f"  ✓ {item[key_attr]}")


def main():
    parser = argparse.ArgumentParser(description="Seed KabadiAI DynamoDB tables")
    parser.add_argument("--stack",   default="kabadiai",  help="CloudFormation stack name")
    parser.add_argument("--region",  default="us-east-1", help="AWS region")
    parser.add_argument("--dry-run", action="store_true", help="Print items without writing")
    args = parser.parse_args()

    prices_data    = json.loads((ROOT / "data" / "prices.json").read_text())
    recyclers_data = json.loads((ROOT / "data" / "recyclers.json").read_text())

    if args.dry_run:
        print("=== DRY RUN – no data will be written ===")
        for item in prices_data:
            print("  PRICE:", json.dumps(item))
        for item in recyclers_data:
            print("  RECYCLER:", json.dumps(item))
        return

    prices_table_name, recyclers_table_name = get_table_names(args.stack, args.region)

    ddb = boto3.resource("dynamodb", region_name=args.region)
    seed_table(ddb.Table(prices_table_name),    prices_data,    "component", args.dry_run)
    seed_table(ddb.Table(recyclers_table_name), recyclers_data, "id",        args.dry_run)

    print("\nSeed complete.")


if __name__ == "__main__":
    main()
`

### frontend/src/app/layout.tsx
`tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LanguageProvider } from "@/contexts/LanguageContext";

export const metadata: Metadata = {
  title: "KabadiAI",
  description: "For kabadiwalas: know what your e-waste lot is, what it is worth, and where to deliver it safely.",
  manifest: "/manifest.json",
  icons: { apple: "/icon.png" },
};
export const viewport: Viewport = { themeColor: "#047857", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="hi">
      <body>
        <LanguageProvider>
          <div className="min-h-screen max-w-md mx-auto">{children}</div>
        </LanguageProvider>
      </body>
    </html>
  );
}
`

### frontend/src/app/page.tsx
`tsx
"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState } from "react";
import CameraCapture from "@/components/CameraCapture";
import ResultDisplay from "@/components/ResultDisplay";
import { useLanguage, LANGS } from "@/contexts/LanguageContext";

export default function Home() {
  const { lang, setLang, t, speak } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [offer, setOffer] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (p) => setCoords({ lat: p.coords.latitude, lon: p.coords.longitude }), () => {}, { timeout: 10000, maximumAge: 60000 });
  }, []);

  const onCapture = async (b64: string, mime: string) => {
    setLoading(true); setResult(null);
    const payload: any = { image_b64: b64, media_type: mime, language: lang };
    if (coords) { payload.lat = coords.lat; payload.lon = coords.lon; }
    const n = parseFloat(offer);
    if (n > 0) payload.dealer_offer_inr = n;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 40000);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/agent`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: ctrl.signal });
      if (!res.ok) throw new Error(String(res.status));
      setResult(await res.json());
    } catch { setResult({ type: "error" }); }
    finally { clearTimeout(timer); setLoading(false); }
  };

  return (
    <main className="px-4 pt-4 pb-10 animate-fade-in">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-3xl font-extrabold text-emerald-800">♻ {t("title")}</h1>
        <button onClick={() => speak(t("help"))} aria-label="Help" className="w-14 h-14 rounded-full bg-amber-400 text-3xl font-black">?</button>
      </header>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-5" role="radiogroup">
        {LANGS.map((l) => (
          <button key={l.code} role="radio" aria-checked={lang === l.code} onClick={() => setLang(l.code)}
            className={`shrink-0 px-5 rounded-full text-xl font-bold border-2 ${lang === l.code ? "bg-emerald-700 text-white border-emerald-700" : "bg-white text-stone-800 border-stone-300"}`}>
            {l.label}
          </button>
        ))}
      </div>

      {!result ? (
        <>
          <div className="flex items-start gap-3 mb-5">
            <p className="text-xl leading-snug font-medium flex-1">{t("subtitle")}</p>
            <button onClick={() => speak(t("subtitle"))} aria-label={t("listen")} className="w-14 h-14 rounded-full bg-stone-200 text-2xl shrink-0">🔊</button>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center mb-6">
            {[["📷", "step1"], ["🔍", "step2"], ["₹", "step3"]].map(([icon, k]) => (
              <div key={k} className="card !p-3"><div className="text-4xl">{icon}</div><div className="font-bold mt-1">{t(k)}</div></div>
            ))}
          </div>
          <CameraCapture onCapture={onCapture} isLoading={loading} />
          <label className="block mt-7 mb-2 text-lg font-semibold" htmlFor="offer">{t("enterOffer")}</label>
          <div className="flex items-center gap-2 card !p-3">
            <span className="text-3xl font-bold">₹</span>
            <input id="offer" inputMode="numeric" pattern="[0-9]*" value={offer} placeholder="0"
              onChange={(e) => setOffer(e.target.value.replace(/[^0-9]/g, ""))}
              className="w-full text-3xl font-bold bg-transparent outline-none" />
          </div>
        </>
      ) : (
        <ResultDisplay result={result} onRetake={() => setResult(null)} />
      )}
    </main>
  );
}
`

### frontend/src/app/globals.css
`css
@tailwind base;
@tailwind components;
@tailwind utilities;

body { font-size: 18px; background: #fafaf9; color: #1c1917; -webkit-tap-highlight-color: transparent; }
button { min-height: 56px; }

@layer components {
  .card { @apply bg-white rounded-2xl border border-stone-200 shadow-sm p-5; }
  .btn { @apply w-full rounded-2xl font-bold text-xl min-h-[64px] transition active:scale-[0.98]; }
}

@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.animate-fade-in { animation: fadeIn 0.35s ease-out forwards; }
`

### frontend/src/components/CameraCapture.tsx
`tsx
"use client";
import React, { useRef, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

export default function CameraCapture({ onCapture, isLoading }: { onCapture: (b64: string, mime: string) => void; isLoading?: boolean }) {
  const { t, speak } = useLanguage();
  const ref = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets the same photo be chosen again
    if (!file) return;
    setError(null);
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1200;
      let { width, height } = img;
      if (Math.max(width, height) > MAX) { const r = MAX / Math.max(width, height); width *= r; height *= r; }
      const c = document.createElement("canvas");
      c.width = Math.round(width); c.height = Math.round(height);
      const ctx = c.getContext("2d");
      if (!ctx) { setError(t("scanFailed")); return; }
      ctx.drawImage(img, 0, 0, c.width, c.height);
      onCapture(c.toDataURL("image/jpeg", 0.8).split(",")[1], "image/jpeg");
    };
    img.onerror = () => { URL.revokeObjectURL(url); setError(t("scanFailed")); };
    img.src = url;
  };

  return (
    <div className="w-full">
      <input ref={ref} type="file" accept="image/*" capture="environment" onChange={handle} className="hidden" />
      {error && <div className="mb-3 rounded-xl bg-red-100 text-red-800 px-4 py-3 font-semibold">{error}</div>}
      <button
        onClick={() => { speak(t("takePhoto")); ref.current?.click(); }}
        disabled={isLoading}
        className="btn bg-emerald-700 text-white flex flex-col items-center justify-center gap-2 py-8 disabled:opacity-60"
      >
        <span className="text-6xl" aria-hidden>{isLoading ? "⏳" : "📷"}</span>
        <span className="text-2xl">{isLoading ? t("analyzing") : t("takePhoto")}</span>
      </button>
    </div>
  );
}
`

### frontend/src/components/ResultDisplay.tsx
`tsx
"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { useLanguage } from "@/contexts/LanguageContext";

const ICON: Record<string, string> = {
  motherboard: "🧩", ram_stick: "💾", mobile_pcb: "📱", li_ion_battery: "🔋", alkaline_battery: "🪫", copper_wire: "➰",
  charger_adapter: "🔌", hard_drive: "💽", aluminium_heatsink: "🔩", screen: "🖥️", cfl_or_tube_light: "💡",
  router_or_modem: "📡", remote: "📺", other: "📦",
};

export default function ResultDisplay({ result, onRetake }: { result: any; onRetake: () => void }) {
  const { t, speak } = useLanguage();
  const name = (c: string) => { const v = t("c_" + c); return v === "c_" + c ? c.replace(/_/g, " ") : v; };
  const Speak = ({ text }: { text: string }) => (
    <button onClick={() => speak(text)} aria-label={t("listen")} className="h-14 px-5 rounded-full bg-white/90 text-stone-900 text-xl font-bold">🔊 {t("listen")}</button>
  );

  if (result.type === "clarify" || result.type === "error") {
    const msg = t(result.type === "error" ? "scanFailed" : "errorLowConfidence");
    return (
      <div className="card flex flex-col items-center text-center gap-4 animate-fade-in">
        <div className="text-6xl">{result.type === "error" ? "📶" : "📷"}</div>
        <p className="text-xl font-semibold">{msg}</p>
        <Speak text={msg} />
        <button onClick={onRetake} className="btn bg-emerald-700 text-white">{t("retake")}</button>
      </div>
    );
  }

  const lo = Math.round(result.total_min_inr || 0), hi = Math.round(result.total_max_inr || 0);
  const codes: string[] = (result.hazard_messages || []).map((h: any) => h.hazard_code);
  const hazardTexts = (result.hazard_messages || []).map((h: any) => { const v = t("h_" + h.hazard_code); return v === "h_" + h.hazard_code ? h.message : v; });
  const hazardSpeech = [...hazardTexts, codes.length ? t("g_general") : ""].filter(Boolean).join(" ");
  const summary = `${t("indicativeValue")}: ₹${lo} ${t("to")} ₹${hi}.`;
  const V: Record<string, [string, string, string]> = {
    low: ["verdictLow", "bg-red-700", "😟"], fair: ["verdictFair", "bg-emerald-700", "🙂"], high: ["verdictHigh", "bg-sky-700", "🤔"] };

  const shareText = [`KabadiAI: ${summary}`,
    ...(result.line_items || []).map((i: any) => `${name(i.component)} x${i.count}: ~${i.est_weight_g} g`),
    ...hazardTexts.map((h: string) => "⚠ " + h), t("disclaimer")].join("\n");
  const share = async () => {
    try { if (navigator.share) { await navigator.share({ title: "KabadiAI", text: shareText }); return; } }
    catch (e: any) { if (e?.name === "AbortError") return; }
    window.open("https://wa.me/?text=" + encodeURIComponent(shareText), "_blank");
  };

  return (
    <div className="flex flex-col gap-5 pb-8 animate-fade-in">
      {result.mock && <div className="rounded-xl bg-amber-300 text-stone-900 p-3 text-center font-extrabold">{t("mockBanner")}</div>}

      {codes.length > 0 && (
        <div className="rounded-2xl bg-red-700 text-white p-5">
          <h3 className="text-2xl font-extrabold mb-2">⚠ {t("hazardsDetected")}</h3>
          <ul className="space-y-2 text-xl">{hazardTexts.map((h: string, i: number) => <li key={i}>• {h}</li>)}</ul>
          <p className="mt-3 text-lg opacity-95">{t("g_general")}</p>
          <div className="mt-4"><Speak text={hazardSpeech} /></div>
        </div>
      )}

      <div className="card">
        <div className="text-stone-500 font-semibold">{t("indicativeValue")}</div>
        <div className="text-5xl font-black text-emerald-800 my-2">₹{lo}–{hi}</div>
        <button onClick={() => speak(summary)} aria-label={t("listen")} className="h-14 px-5 rounded-full bg-stone-200 text-xl font-bold">🔊 {t("listen")}</button>
      </div>

      {result.verdict && V[result.verdict] && (
        <div className={`rounded-2xl text-white p-5 flex items-center gap-4 ${V[result.verdict][1]}`}>
          <span className="text-5xl">{V[result.verdict][2]}</span>
          <p className="text-xl font-bold flex-1">{t(V[result.verdict][0])}</p>
          <button onClick={() => speak(t(V[result.verdict][0]))} aria-label={t("listen")} className="w-14 h-14 rounded-full bg-white/90 text-2xl">🔊</button>
        </div>
      )}

      <div className="card">
        <h3 className="font-bold text-lg mb-3">{t("itemsFound")}</h3>
        <div className="space-y-3">
          {(result.line_items || []).map((it: any, i: number) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-4xl w-12 text-center">{ICON[it.component] || "📦"}</span>
              <div className="flex-1">
                <div className="text-lg font-semibold">{name(it.component)} <span className="text-stone-500 font-normal">x{it.count}</span></div>
                <div className="text-stone-500 text-sm">~{it.est_weight_g} g</div>
              </div>
              <div className="text-lg font-bold">{it.hazardous ? "⚠" : `₹${Math.round(it.min_inr)}–${Math.round(it.max_inr)}`}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={share} className="btn bg-green-600 text-white flex-1">💬 {t("shareWhatsApp")}</button>
        <button onClick={onRetake} className="btn bg-stone-800 text-white !w-auto px-6">📷</button>
      </div>

      {result.recyclers?.length > 0 && (
        <div>
          <h3 className="font-bold text-lg mb-3">📍 {t("nearestRecyclers")}</h3>
          <div className="space-y-3">
            {result.recyclers.map((r: any) => (
              <a key={r.id} href={r.directions_url} target="_blank" rel="noopener noreferrer" className="card !p-4 flex items-center gap-3 block">
                <div className="flex-1"><div className="font-bold text-lg">{r.name}</div><div className="text-stone-500 text-sm">{r.address}</div></div>
                <div className="text-right"><div className="text-2xl font-black text-sky-700">{r.distance_km}</div><div className="text-xs text-stone-500">{t("kmAway")}</div></div>
              </a>
            ))}
          </div>
        </div>
      )}
      <p className="text-xs text-stone-500 text-center">{t("disclaimer")}</p>
    </div>
  );
}
`

### frontend/src/contexts/LanguageContext.tsx
`tsx
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
`

### frontend/src/locales/en.json
`json
{
  "title": "KabadiAI",
  "subtitle": "Take a photo of your lot. See the price, any danger, and where to deliver it.",
  "step1": "Photo", "step2": "Check", "step3": "Price",
  "help": "Tap the big green button and take a photo of your lot. Then you will see the price, any danger, and where to deliver. Tap the speaker to listen.",
  "takePhoto": "Take photo of lot",
  "analyzing": "Checking your lot...",
  "retake": "New photo",
  "enterOffer": "Buyer's offer for this lot (₹)",
  "verdictLow": "Offer is below the expected range. Ask for more.",
  "verdictFair": "Offer is within the expected range.",
  "verdictHigh": "Offer is above the expected range. Double-check the weight.",
  "indicativeValue": "Indicative scrap value",
  "itemsFound": "Items found",
  "hazardsDetected": "Danger! Keep these separate",
  "g_general": "Never burn circuit boards or use acid to extract metal.",
  "h_swollen_battery": "DANGER: swollen lithium battery. Do not burn, puncture or crush.",
  "h_leaking_battery": "Leaking battery. Do not touch with bare hands. Keep it separate.",
  "h_mercury_lamp": "Contains mercury. Do not break the tube or bulb.",
  "h_crt_or_lead_glass": "Hazardous: lead glass. Do not break open.",
  "nearestRecyclers": "Deliver to an authorized recycler",
  "shareWhatsApp": "Send on WhatsApp",
  "listen": "Listen",
  "to": "to",
  "rupees": "rupees",
  "mockBanner": "TEST DATA: this is not a real analysis",
  "disclaimer": "Indicative only, not an official valuation. Weights are estimated from the photo. Recycler data covers Delhi-NCR only (DPCC/CPCB list, 2023).",
  "errorLowConfidence": "The photo is too blurry or dark. Take a closer, clearer photo.",
  "scanFailed": "Check failed. Please try again.",
  "kmAway": "km",
  "c_motherboard": "Motherboard", "c_ram_stick": "RAM stick", "c_mobile_pcb": "Mobile board",
  "c_li_ion_battery": "Lithium battery", "c_alkaline_battery": "AA/AAA cells", "c_copper_wire": "Copper wire",
  "c_charger_adapter": "Charger/adapter", "c_hard_drive": "Hard drive", "c_aluminium_heatsink": "Aluminium heatsink",
  "c_screen": "Screen", "c_cfl_or_tube_light": "CFL/tube light", "c_router_or_modem": "Router/modem",
  "c_remote": "Remote", "c_other": "Other"
}
`

### frontend/src/locales/hi.json
`json
{
  "title": "कबाड़ी AI",
  "subtitle": "अपने माल की फोटो लें। दाम, खतरा और माल कहाँ पहुँचाना है, सब देखें।",
  "step1": "फोटो", "step2": "जाँच", "step3": "दाम",
  "help": "बड़े हरे बटन को दबाकर अपने माल की फोटो लें। फिर आपको दाम, खतरा और माल कहाँ पहुँचाना है, यह दिखेगा। सुनने के लिए स्पीकर दबाएं।",
  "takePhoto": "माल की फोटो लें",
  "analyzing": "आपका माल जाँचा जा रहा है...",
  "retake": "नई फोटो",
  "enterOffer": "खरीदार ने इस माल का कितना दाम बताया (₹)",
  "verdictLow": "ऑफर अनुमानित दाम से कम है। ज़्यादा माँगें।",
  "verdictFair": "ऑफर अनुमानित दाम के अंदर है।",
  "verdictHigh": "ऑफर अनुमानित दाम से ऊपर है। वज़न दोबारा जाँच लें।",
  "indicativeValue": "अनुमानित कबाड़ कीमत",
  "itemsFound": "मिला हुआ सामान",
  "hazardsDetected": "खतरा! इन्हें अलग रखें",
  "g_general": "सर्किट बोर्ड कभी न जलाएं और धातु निकालने के लिए तेज़ाब का इस्तेमाल न करें।",
  "h_swollen_battery": "खतरा: फूली हुई लिथियम बैटरी। इसे जलाएं नहीं, छेदें नहीं, दबाएं नहीं।",
  "h_leaking_battery": "बैटरी से तरल निकल रहा है। नंगे हाथ से न छुएं। इसे अलग रखें।",
  "h_mercury_lamp": "इसमें पारा (मरकरी) है। ट्यूब या बल्ब न तोड़ें।",
  "h_crt_or_lead_glass": "खतरनाक: इसमें सीसे का कांच है। इसे न तोड़ें।",
  "nearestRecyclers": "अधिकृत रीसायकलर तक पहुँचाएँ",
  "shareWhatsApp": "WhatsApp पर भेजें",
  "listen": "सुनें",
  "to": "से",
  "rupees": "रुपये",
  "mockBanner": "टेस्ट डेटा: यह असली जाँच नहीं है",
  "disclaimer": "केवल अनुमान, सरकारी मूल्यांकन नहीं। वज़न फोटो से अंदाज़े से लगाया गया है। रीसायकलर की जानकारी सिर्फ़ दिल्ली-NCR की है (DPCC/CPCB सूची, 2023)।",
  "errorLowConfidence": "फोटो बहुत धुंधली या अंधेरी है। पास से साफ़ फोटो लें।",
  "scanFailed": "जाँच नहीं हो पाई। कृपया दोबारा कोशिश करें।",
  "kmAway": "किमी",
  "c_motherboard": "मदरबोर्ड", "c_ram_stick": "रैम", "c_mobile_pcb": "मोबाइल बोर्ड",
  "c_li_ion_battery": "लिथियम बैटरी", "c_alkaline_battery": "AA/AAA सेल", "c_copper_wire": "तांबे का तार",
  "c_charger_adapter": "चार्जर/अडैप्टर", "c_hard_drive": "हार्ड ड्राइव", "c_aluminium_heatsink": "एल्युमिनियम हीटसिंक",
  "c_screen": "स्क्रीन", "c_cfl_or_tube_light": "CFL/ट्यूब लाइट", "c_router_or_modem": "राउटर/मॉडेम",
  "c_remote": "रिमोट", "c_other": "अन्य"
}
`

### frontend/tailwind.config.ts
`typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
    },
  },
  plugins: [],
};
export default config;
`

### scripts/translate_locales.py
`python
"""Draft UI translations of en.json with Amazon Translate -> locales/<code>.draft.json
Safety text (h_*, g_*) is never machine-translated: write it with a native speaker.
Usage: python scripts/translate_locales.py pa bn ta te mr"""
import json, pathlib, sys
import boto3

ROOT = pathlib.Path(__file__).parent.parent / "frontend" / "src" / "locales"
en = json.loads((ROOT / "en.json").read_text(encoding="utf-8"))
tr = boto3.client("translate", region_name="us-east-1")
for code in sys.argv[1:]:
    out = {k: tr.translate_text(Text=v, SourceLanguageCode="en", TargetLanguageCode=code)["TranslatedText"]
           for k, v in en.items() if not k.startswith(("h_", "g_"))}
    out["_status"] = "DRAFT machine translation. Native speaker must review. Add h_* and g_* safety text by hand."
    (ROOT / f"{code}.draft.json").write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print("wrote", code)
`

### src/price/app.py
`python
"""POST /price

Request body:
    {
        "items": [
            {"component": "<enum>", "count": <int>, "est_weight_g": <int>},
            ...
        ],
        "dealer_offer_inr": <optional float>
    }

Response 200:
    {
        "line_items": [
            {
                "component": "<enum>",
                "count": <int>,
                "est_weight_g": <int>,
                "min_inr": <float>,
                "max_inr": <float>,
                "hazardous": <bool>
            },
            ...
        ],
        "total_min_inr": <float>,
        "total_max_inr": <float>,
        "source_note": "<string>",
        "checked_date": "<YYYY-MM-DD>",
        "disclaimer": "Indicative only. Verify with a local scrap dealer before accepting any offer.",
        "verdict": "low" | "fair" | "high"   # only when dealer_offer_inr supplied
    }

Errors: 400 (bad request), 502 (DynamoDB unavailable).

Verdict logic (compared against midpoint = (total_min + total_max) / 2):
    low  – dealer_offer_inr < total_min
    high – dealer_offer_inr > total_max
    fair – otherwise (dealer_offer within the indicative range)
"""
import json, os
import boto3
from boto3.dynamodb.conditions import Key
from decimal import Decimal

PRICES_TABLE = os.environ.get("PRICES_TABLE", "")
COMPONENTS = {
    "motherboard", "ram_stick", "mobile_pcb", "li_ion_battery", "alkaline_battery",
    "copper_wire", "charger_adapter", "hard_drive", "aluminium_heatsink",
    "screen", "cfl_or_tube_light", "router_or_modem", "remote", "other",
}
# Components with indicative 0/0 price that we treat as hazardous (no cash value)
HAZARDOUS = {"li_ion_battery", "alkaline_battery", "cfl_or_tube_light"}

DISCLAIMER = (
    "Indicative only. Prices vary by condition, market, and date. "
    "Verify with a local scrap dealer before accepting any offer."
)

_ddb = None


def _table():
    global _ddb
    if _ddb is None:
        _ddb = boto3.resource("dynamodb").Table(PRICES_TABLE)
    return _ddb


def _get_price(component):
    """Fetch one price row from DynamoDB.  Returns a dict or raises."""
    resp = _table().get_item(Key={"component": component})
    item = resp.get("Item")
    if not item:
        # Fall back to 'other' if component missing from table
        resp = _table().get_item(Key={"component": "other"})
        item = resp.get("Item", {"component": "other", "min_inr_per_kg": 0,
                                  "max_inr_per_kg": 10, "source": "fallback",
                                  "checked_date": "unknown"})
    return item


def _json(status, body):
    return {"statusCode": status, "headers": {"content-type": "application/json"},
            "body": json.dumps(body)}


def calculate_price(items, price_fetcher):
    """Pure calculation – separated from AWS I/O for unit-testability.

    price_fetcher(component) -> {"min_inr_per_kg": N, "max_inr_per_kg": N,
                                  "source": "...", "checked_date": "..."}
    Returns (line_items, total_min, total_max, source_note, checked_date).
    """
    line_items = []
    total_min = 0.0
    total_max = 0.0
    source_note = ""
    checked_date = ""

    for it in items:
        component = it.get("component", "other")
        if component not in COMPONENTS:
            component = "other"
        count = max(1, int(it.get("count", 1) or 1))
        weight_g = max(0, int(it.get("est_weight_g", 0) or 0))
        weight_kg = weight_g / 1000.0

        row = price_fetcher(component)
        min_per_kg = float(row.get("min_inr_per_kg", 0))
        max_per_kg = float(row.get("max_inr_per_kg", 0))
        source_note = str(row.get("source", ""))
        checked_date = str(row.get("checked_date", ""))

        item_min = 0.0 if component in HAZARDOUS else round(min_per_kg * weight_kg, 2)
        item_max = 0.0 if component in HAZARDOUS else round(max_per_kg * weight_kg, 2)

        total_min += item_min
        total_max += item_max

        line_items.append({
            "component":  component,
            "count":      count,
            "est_weight_g": weight_g,
            "min_inr":    item_min,
            "max_inr":    item_max,
            "hazardous":  component in HAZARDOUS,
        })

    return line_items, round(total_min, 2), round(total_max, 2), source_note, checked_date


def verdict(dealer_offer_inr, total_min, total_max):
    """Return 'low', 'fair', or 'high' compared to the indicative range."""
    if dealer_offer_inr < total_min:
        return "low"
    if dealer_offer_inr > total_max:
        return "high"
    return "fair"


def handler(event, context):
    try:
        raw_body = event.get("body") or "{}"
        body = json.loads(raw_body)
        items = body.get("items")
        if not isinstance(items, list) or len(items) == 0:
            return _json(400, {"error": "items must be a non-empty list"})
        dealer_offer = body.get("dealer_offer_inr")
        if dealer_offer is not None:
            dealer_offer = float(dealer_offer)
    except Exception:
        return _json(400, {"error": "bad request"})

    try:
        line_items, total_min, total_max, source_note, checked_date = calculate_price(
            items, _get_price
        )
    except Exception as e:
        print("price error:", repr(e))
        return _json(502, {"error": "price lookup failed"})

    result = {
        "line_items":    line_items,
        "total_min_inr": total_min,
        "total_max_inr": total_max,
        "source_note":   source_note,
        "checked_date":  checked_date,
        "disclaimer":    DISCLAIMER,
    }
    if dealer_offer is not None:
        result["verdict"] = verdict(dealer_offer, total_min, total_max)

    return _json(200, result)
`

### src/recyclers/app.py
`python
"""GET /recyclers?lat=<float>&lon=<float>

Returns up to 5 nearest authorized e-waste recyclers for the given coordinates,
sorted by straight-line (haversine) distance, ascending.

Response 200:
    {
        "recyclers": [
            {
                "id": "R1",
                "name": "...",
                "address": "...",
                "city": "Delhi",
                "lat": 28.53,
                "lon": 77.27,
                "distance_km": 2.1,
                "directions_url": "https://maps.google.com/..."
            },
            ...
        ],
        "coverage_note": "Authorized recyclers in Delhi-NCR only. Source: DPCC/CPCB 2023. Re-verify authorization before use."
    }

Errors: 400 (missing or invalid lat/lon), 502 (DynamoDB error).
"""
import json, math, os
import boto3

RECYCLERS_TABLE = os.environ.get("RECYCLERS_TABLE", "")
MAX_RESULTS = 5
COVERAGE_NOTE = (
    "Authorized recyclers in Delhi-NCR only. "
    "Source: DPCC/CPCB approved list 2023. "
    "Re-verify authorization before visiting."
)

_table = None


def _get_table():
    global _table
    if _table is None:
        _table = boto3.resource("dynamodb").Table(RECYCLERS_TABLE)
    return _table


def haversine_km(lat1, lon1, lat2, lon2):
    """Straight-line distance between two WGS-84 points in kilometres."""
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def nearest(lat, lon, recyclers, max_results=MAX_RESULTS):
    """Return up to max_results recyclers sorted by haversine distance."""
    enriched = []
    for r in recyclers:
        dist = haversine_km(lat, lon, float(r["lat"]), float(r["lon"]))
        directions = (
            f"https://maps.google.com/maps?daddr={r['lat']},{r['lon']}"
            f"&saddr={lat},{lon}"
        )
        enriched.append({
            "id":             r["id"],
            "name":           r["name"],
            "address":        r["address"],
            "city":           r["city"],
            "lat":            float(r["lat"]),
            "lon":            float(r["lon"]),
            "distance_km":    round(dist, 2),
            "directions_url": directions,
        })
    enriched.sort(key=lambda x: x["distance_km"])
    return enriched[:max_results]


def _json(status, body):
    return {"statusCode": status, "headers": {"content-type": "application/json"},
            "body": json.dumps(body)}


def handler(event, context):
    params = event.get("queryStringParameters") or {}
    try:
        lat = float(params["lat"])
        lon = float(params["lon"])
    except (KeyError, ValueError, TypeError):
        return _json(400, {"error": "lat and lon query parameters are required (decimal degrees)"})

    if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
        return _json(400, {"error": "lat or lon out of range"})

    try:
        resp = _get_table().scan()
        all_recyclers = resp.get("Items", [])
    except Exception as e:
        print("recyclers error:", repr(e))
        return _json(502, {"error": "recycler lookup failed"})

    result = nearest(lat, lon, all_recyclers)
    return _json(200, {"recyclers": result, "coverage_note": COVERAGE_NOTE})
`

### data/prices.json
`json
[
  {"component": "motherboard",       "min_inr_per_kg": 200, "max_inr_per_kg": 450, "source": "web listings vary widely, some mixed boards far lower", "checked_date": "2026-10-08"},
  {"component": "ram_stick",         "min_inr_per_kg": 400, "max_inr_per_kg": 800, "source": "web listing", "checked_date": "2026-10-08"},
  {"component": "mobile_pcb",        "min_inr_per_kg": 250, "max_inr_per_kg": 550, "source": "web listings", "checked_date": "2026-10-08"},
  {"component": "copper_wire",       "min_inr_per_kg": 380, "max_inr_per_kg": 600, "source": "mixed to clean insulated range", "checked_date": "2026-10-08"},
  {"component": "aluminium_heatsink","min_inr_per_kg":  80, "max_inr_per_kg": 130, "source": "web listing", "checked_date": "2026-10-08"},
  {"component": "charger_adapter",   "min_inr_per_kg":  60, "max_inr_per_kg": 120, "source": "cables and wiring range", "checked_date": "2026-10-08"},
  {"component": "hard_drive",        "min_inr_per_kg":  40, "max_inr_per_kg":  90, "source": "unverified placeholder", "checked_date": "2026-10-08"},
  {"component": "li_ion_battery",    "min_inr_per_kg":   0, "max_inr_per_kg":   0, "source": "hazardous – no value shown, route to recycler", "checked_date": "2026-10-08"},
  {"component": "alkaline_battery",  "min_inr_per_kg":   0, "max_inr_per_kg":   0, "source": "no value shown", "checked_date": "2026-10-08"},
  {"component": "cfl_or_tube_light", "min_inr_per_kg":   0, "max_inr_per_kg":   0, "source": "contains mercury – no value shown", "checked_date": "2026-10-08"},
  {"component": "screen",            "min_inr_per_kg":   0, "max_inr_per_kg":  15, "source": "low value", "checked_date": "2026-10-08"},
  {"component": "router_or_modem",   "min_inr_per_kg":  30, "max_inr_per_kg":  90, "source": "unverified placeholder", "checked_date": "2026-10-08"},
  {"component": "remote",            "min_inr_per_kg":  10, "max_inr_per_kg":  40, "source": "unverified placeholder", "checked_date": "2026-10-08"},
  {"component": "other",             "min_inr_per_kg":   0, "max_inr_per_kg":  10, "source": "fallback", "checked_date": "2026-10-08"}
]
`

### data/recyclers.json
`json
[
  {
    "id": "R1",
    "name": "Muskan Technologies",
    "address": "B-96, Okhla Industrial Area Phase-1, Delhi 110020",
    "city": "Delhi",
    "lat": 28.5355,
    "lon": 77.2750,
    "source": "DPCC/CPCB approved list 2023",
    "checked_date": "2026-10-08"
  },
  {
    "id": "R2",
    "name": "Shivnath Computers",
    "address": "E-47/2, 1st Floor, Okhla Phase-2, Delhi 110019",
    "city": "Delhi",
    "lat": 28.5300,
    "lon": 77.2700,
    "source": "DPCC/CPCB approved list 2023",
    "checked_date": "2026-10-08"
  },
  {
    "id": "R3",
    "name": "Techchef E-Waste Solutions Pvt Ltd",
    "address": "C-61, DDA Shed, Okhla Industrial Area, Delhi 110020",
    "city": "Delhi",
    "lat": 28.5340,
    "lon": 77.2780,
    "source": "DPCC/CPCB approved list 2023",
    "checked_date": "2026-10-08"
  },
  {
    "id": "R4",
    "name": "Greenscape Eco Management Pvt Ltd",
    "address": "348, Patparganj Industrial Area, Delhi 110092",
    "city": "Delhi",
    "lat": 28.6280,
    "lon": 77.3050,
    "source": "DPCC/CPCB approved list 2023",
    "checked_date": "2026-10-08"
  },
  {
    "id": "R5",
    "name": "Fozia Traders",
    "address": "Khasra 13/1, Saboli, Mandoli Industrial Area, Delhi 110093",
    "city": "Delhi",
    "lat": 28.6900,
    "lon": 77.3000,
    "source": "DPCC/CPCB approved list 2023",
    "checked_date": "2026-10-08"
  }
]
`


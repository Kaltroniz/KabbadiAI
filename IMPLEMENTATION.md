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
  GeminiApiKey:
    Type: String
    Default: ""
    Description: API Key for Google Gemini.
  GeminiModel:
    Type: String
    Default: "gemini-2.5-flash"
    Description: The exact model ID for Gemini.

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
          PROVIDER_ORDER: "gemini,bedrock"
          GEMINI_API_KEY: !Ref GeminiApiKey
          GEMINI_MODEL: !Ref GeminiModel
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
import base64, json, math, os, re, urllib.request, uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import boto3

MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "us.amazon.nova-2-lite-v1:0")
MOCK = os.environ.get("MOCK_ANALYSIS", "0") == "1"
AGENT_MODE = os.environ.get("AGENT_MODE", "0") == "1"
PRICES_TABLE = os.environ.get("PRICES_TABLE", "")
RECYCLERS_TABLE = os.environ.get("RECYCLERS_TABLE", "")
LOTS_TABLE = os.environ.get("LOTS_TABLE", "")
PROVIDER_ORDER = [x.strip() for x in os.environ.get("PROVIDER_ORDER", "gemini,bedrock").split(",") if x.strip()]
GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")  # confirm the exact id in Google AI Studio
MIN_CONF, MAX_BYTES = 70, 4_000_000
MEDIA = {"image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp"}
COMPONENTS = {"alkaline_battery", "aluminium_heatsink", "cfl_or_tube_light", "charger_adapter", "copper_scrap", "copper_wire", "crt_monitor_or_tv", "desktop_cpu", "hard_drive", "laptop", "lcd_led_monitor_or_tv", "lead_acid_battery", "li_ion_battery", "microwave", "mobile_pcb", "mobile_phone", "motherboard", "other", "power_supply", "printer", "ram_stick", "refrigerator", "remote", "router_or_modem", "split_ac", "ups_unit", "washing_machine", "window_ac"}
CONDITIONS = {"intact", "corroded", "swollen", "leaking", "broken", "unknown"}
HAZARDS = {"swollen_battery", "leaking_battery", "mercury_lamp", "crt_or_lead_glass", "lead_acid_battery", "refrigerant_gas"}
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
HAZARD_MESSAGES["lead_acid_battery"] = {"en": "Lead-acid battery: contains acid and lead. Keep it upright. Do not open, burn or drain it.",
    "hi": "लेड-एसिड बैटरी: इसमें तेज़ाब और सीसा है। इसे सीधा रखें। खोलें नहीं, जलाएं नहीं, तेज़ाब न निकालें।"}
HAZARD_MESSAGES["refrigerant_gas"] = {"en": "Contains refrigerant gas. Do not cut or break the pipes or compressor.",
    "hi": "इसमें रेफ्रिजरेंट गैस है। पाइप या कंप्रेसर को न काटें और न तोड़ें।"}
GENERAL = {"en": "Never burn circuit boards or use acid to extract metal.",
           "hi": "सर्किट बोर्ड कभी न जलाएं और धातु निकालने के लिए तेज़ाब का इस्तेमाल न करें।"}

PROMPT = f"""You assess photographed discarded electronics in India. Return ONLY one JSON object:
{{"items":[{{"component":<one of {sorted(COMPONENTS)}>,"condition":<one of {sorted(CONDITIONS)}>,"count":<int>,"est_weight_g":<int, TOTAL weight of all units in this line>}}],
 "hazards":[<subset of {sorted(HAZARDS)}>],"confidence":<0-100>,"notes":"<short>"}}
List only what is visible. Lower confidence if blurry, dark or hidden. Flag swollen_battery only if a battery visibly bulges.
For whole devices (laptop, desktop_cpu, mobile_phone, hard_drive, power_supply, crt_monitor_or_tv, lcd_led_monitor_or_tv, ups_unit, split_ac, window_ac, refrigerator, washing_machine, microwave) set count to the number of devices."""

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
    return t.get_item(Key={"component": comp}).get("Item") or t.get_item(Key={"component": "other"}).get("Item") or {"basis": "none"}

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

def _text_bedrock(img, fmt):
    from botocore.config import Config
    client = boto3.client("bedrock-runtime", config=Config(read_timeout=15, connect_timeout=5, retries={"max_attempts": 1}))
    r = client.converse(modelId=MODEL_ID, messages=[{"role": "user", "content": [
        {"image": {"format": fmt, "source": {"bytes": img}}}, {"text": PROMPT}]}], inferenceConfig={"maxTokens": 1000})
    return r["output"]["message"]["content"][0]["text"]

def _text_gemini(img, mime):
    body = {"contents": [{"parts": [{"inline_data": {"mime_type": mime, "data": base64.b64encode(img).decode()}}, {"text": PROMPT}]}],
            "generationConfig": {"responseMimeType": "application/json", "temperature": 0, "maxOutputTokens": 1500}}
    req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent",
                                 json.dumps(body).encode(), {"Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY})
    with urllib.request.urlopen(req, timeout=18) as r:
        return json.load(r)["candidates"][0]["content"]["parts"][0]["text"]

def _scan_with_providers(img, fmt):
    """Tries each provider in PROVIDER_ORDER; the first valid answer wins. Records which one answered."""
    errors = []
    for prov in PROVIDER_ORDER:
        try:
            if prov == "gemini":
                if not GEMINI_KEY: raise RuntimeError("no gemini key set")
                text = _text_gemini(img, "image/" + fmt)
            elif prov == "bedrock":
                text = _text_bedrock(img, fmt)
            else:
                continue
            m = re.search(r"\{.*\}", text, re.S)
            scan = _clean(json.loads(m.group(0)))
            scan["provider"] = prov
            return scan
        except Exception as e:  # access denied, timeout, bad JSON: try the next provider
            errors.append(f"{prov}: {type(e).__name__}")
            print("provider failed:", prov, repr(e)[:300])
    raise RuntimeError("all providers failed: " + "; ".join(errors))

def _hazards(scan):  # model flags plus rules, so a swollen battery is never missed
    h = set(scan["hazards"])
    for it in scan["items"]:
        c, k = it["component"], it["condition"]
        if c == "li_ion_battery" and k == "swollen": h.add("swollen_battery")
        if k == "leaking" and c in ("li_ion_battery", "alkaline_battery"): h.add("leaking_battery")
        if c == "cfl_or_tube_light": h.add("mercury_lamp")
        if c == "crt_monitor_or_tv": h.add("crt_or_lead_glass")
        if c in ("lead_acid_battery", "ups_unit"): h.add("lead_acid_battery")
        if c in ("split_ac", "window_ac", "refrigerator"): h.add("refrigerant_gas")
    return sorted(h & HAZARDS)

CTX = {}

def _analyze():
    scan = json.loads(json.dumps(MOCK_SCAN)) if MOCK else _scan_with_providers(CTX["image"], CTX["fmt"])
    CTX["provider"] = "mock" if MOCK else scan.get("provider")
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
        row = _price_row(it["component"])
        basis = str(row.get("basis", "none"))
        priced = it["component"] not in NO_VALUE and basis in ("per_kg", "per_piece")
        if not priced:
            lo = hi = 0.0
        elif basis == "per_piece":
            lo, hi = float(row["min_inr"]) * it["count"], float(row["max_inr"]) * it["count"]
        else:
            kg = it["est_weight_g"] / 1000
            lo, hi = float(row["min_inr"]) * kg, float(row["max_inr"]) * kg
        lo, hi = round(lo, 2), round(hi, 2)
        lo_t, hi_t = lo_t + lo, hi_t + hi
        rows.append({"component": it["component"], "condition": it["condition"], "count": it["count"],
                     "est_weight_g": it["est_weight_g"], "min_inr": lo, "max_inr": hi, "hazardous": it["component"] in NO_VALUE,
                     "priced": priced, "basis": basis, "confidence": str(row.get("confidence", "")),
                     "source": str(row.get("source", "")), "checked_date": str(row.get("checked_date", "")),
                     "sources": [{"name": str(x.get("name", "")), "value": str(x.get("value", "")), "date": str(x.get("date", ""))} for x in row.get("sources", [])]})
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
           "general_warning": GENERAL.get(CTX["lang"], GENERAL["en"]), "disclaimer": DISCLAIMER, "provider": CTX.get("provider")}
    offer = CTX.get("offer")
    if offer is not None and hi > 0:
        res["verdict"] = "low" if offer < lo else "high" if offer > hi else "fair"
    CTX["result"] = res
    return "Result assembled."

def _save_lot(res):
    """Store an anonymous lot record (no names or numbers; location rounded to ~1 km). Never breaks the response."""
    if not LOTS_TABLE or res.get("type") != "result":
        return None
    lat, lon = CTX.get("lat"), CTX.get("lon")
    lot = {"id": uuid.uuid4().hex[:10], "created_at": datetime.now(timezone.utc).isoformat(), "status": "scanned",
           "mock": bool(MOCK), "provider": CTX.get("provider"), "items": [{k: i[k] for k in ("component", "count", "est_weight_g", "min_inr", "max_inr")} for i in res["line_items"]],
           "hazards": [h["hazard_code"] for h in res["hazard_messages"]], "total_min_inr": res["total_min_inr"], "total_max_inr": res["total_max_inr"],
           "expires_at": int((datetime.now(timezone.utc) + timedelta(days=30)).timestamp())}
    if lat is not None and lon is not None:
        lot["cell_lat"], lot["cell_lon"] = round(lat, 2), round(lon, 2)
    try:
        _table(LOTS_TABLE).put_item(Item=json.loads(json.dumps(lot), parse_float=Decimal))
        return lot["id"]
    except Exception as e:
        print("lot save failed:", repr(e))
        return None

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
        CTX = {"image": img, "fmt": fmt, "lat": lat, "lon": lon, "offer": offer, "lang": str(b.get("language", "en"))[:5]}
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
        lot_id = _save_lot(res)
        if lot_id: res["lot_id"] = lot_id
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
                print(f"  OK {item[key_attr]}")


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
        <div className="flex items-center gap-2">
          <a href="/insights" className="px-4 py-2 bg-stone-200 rounded-xl font-bold">Insights</a>
          <button onClick={() => speak(t("help"))} aria-label="Help" className="w-14 h-14 rounded-full bg-amber-400 text-3xl font-black">?</button>
        </div>
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
  charger_adapter: "🔌", hard_drive: "💽", aluminium_heatsink: "🔩", power_supply: "⚡", printer: "🖨️", crt_monitor_or_tv: "📺",
  lcd_led_monitor_or_tv: "🖥️", cfl_or_tube_light: "💡", router_or_modem: "📡", remote: "🎛️", laptop: "💻", desktop_cpu: "🗄️",
  mobile_phone: "📱", lead_acid_battery: "🔋", ups_unit: "🔌", copper_scrap: "🟠", split_ac: "❄️", window_ac: "❄️",
  refrigerator: "🧊", washing_machine: "🧺", microwave: "🍲", other: "📦",
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
        <p className="text-xs text-stone-500 mt-3">{t("priceNote")}</p>
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
              <div className="text-lg font-bold">{it.hazardous ? "⚠" : it.priced === false ? t("priceUnknown") : `₹${Math.round(it.min_inr)}–${Math.round(it.max_inr)}`}</div>
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
  "step1": "Photo",
  "step2": "Check",
  "step3": "Price",
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
  "c_motherboard": "Motherboard",
  "c_ram_stick": "RAM stick",
  "c_mobile_pcb": "Mobile board",
  "c_li_ion_battery": "Lithium battery",
  "c_alkaline_battery": "AA/AAA cells",
  "c_copper_wire": "Copper wire",
  "c_charger_adapter": "Charger/adapter",
  "c_hard_drive": "Hard drive",
  "c_aluminium_heatsink": "Aluminium heatsink",
  "c_cfl_or_tube_light": "CFL/tube light",
  "c_router_or_modem": "Router/modem",
  "c_remote": "Remote",
  "c_other": "Other",
  "priceUnknown": "price unknown",
  "priceNote": "Price ranges are estimates from public scrap-dealer websites (2026), not our own survey. Real offers vary.",
  "c_laptop": "Laptop",
  "c_mobile_phone": "Mobile phone",
  "c_power_supply": "Power supply (SMPS)",
  "c_printer": "Printer",
  "c_crt_monitor_or_tv": "CRT monitor/TV",
  "c_lcd_led_monitor_or_tv": "LCD/LED monitor/TV",
  "c_desktop_cpu": "Desktop CPU box",
  "c_lead_acid_battery": "Lead-acid battery (inverter/UPS)",
  "c_ups_unit": "UPS unit",
  "c_copper_scrap": "Clean copper (coil/pipe)",
  "c_split_ac": "Split AC",
  "c_window_ac": "Window AC",
  "c_refrigerator": "Refrigerator",
  "c_washing_machine": "Washing machine",
  "c_microwave": "Microwave",
  "h_lead_acid_battery": "Lead-acid battery: contains acid and lead. Keep it upright. Do not open, burn or drain it.",
  "h_refrigerant_gas": "Contains refrigerant gas. Do not cut or break the pipes or compressor."
}
`

### frontend/src/locales/hi.json
`json
{
  "title": "कबाड़ी AI",
  "subtitle": "अपने माल की फोटो लें। दाम, खतरा और माल कहाँ पहुँचाना है, सब देखें।",
  "step1": "फोटो",
  "step2": "जाँच",
  "step3": "दाम",
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
  "c_motherboard": "मदरबोर्ड",
  "c_ram_stick": "रैम",
  "c_mobile_pcb": "मोबाइल बोर्ड",
  "c_li_ion_battery": "लिथियम बैटरी",
  "c_alkaline_battery": "AA/AAA सेल",
  "c_copper_wire": "तांबे का तार",
  "c_charger_adapter": "चार्जर/अडैप्टर",
  "c_hard_drive": "हार्ड ड्राइव",
  "c_aluminium_heatsink": "एल्युमिनियम हीटसिंक",
  "c_cfl_or_tube_light": "CFL/ट्यूब लाइट",
  "c_router_or_modem": "राउटर/मॉडेम",
  "c_remote": "रिमोट",
  "c_other": "अन्य",
  "priceUnknown": "दाम पता नहीं",
  "priceNote": "दाम का अंदाज़ा स्क्रैप डीलरों की सार्वजनिक वेबसाइटों (2026) से है, हमारा अपना सर्वे नहीं। असली ऑफर अलग हो सकते हैं।",
  "c_laptop": "लैपटॉप",
  "c_mobile_phone": "मोबाइल फोन",
  "c_power_supply": "पावर सप्लाई (SMPS)",
  "c_printer": "प्रिंटर",
  "c_crt_monitor_or_tv": "CRT मॉनिटर/टीवी",
  "c_lcd_led_monitor_or_tv": "LCD/LED मॉनिटर/टीवी",
  "c_desktop_cpu": "डेस्कटॉप CPU बॉक्स",
  "c_lead_acid_battery": "लेड-एसिड बैटरी (इन्वर्टर/UPS)",
  "c_ups_unit": "UPS",
  "c_copper_scrap": "साफ़ तांबा (कॉइल/पाइप)",
  "c_split_ac": "स्प्लिट AC",
  "c_window_ac": "विंडो AC",
  "c_refrigerator": "फ्रिज",
  "c_washing_machine": "वॉशिंग मशीन",
  "c_microwave": "माइक्रोवेव",
  "h_lead_acid_battery": "लेड-एसिड बैटरी: इसमें तेज़ाब और सीसा है। इसे सीधा रखें। खोलें नहीं, जलाएं नहीं, तेज़ाब न निकालें।",
  "h_refrigerant_gas": "इसमें रेफ्रिजरेंट गैस है। पाइप या कंप्रेसर को न काटें और न तोड़ें。"
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
 {
  "component": "motherboard",
  "basis": "per_kg",
  "min_inr": 150,
  "max_inr": 400,
  "confidence": "web_estimate",
  "checked_date": "2026-10-08",
  "sources": [
   {
    "name": "kabadiwalaonline",
    "url": "https://kabadiwalaonline.in/scrap-price-today/",
    "value": "Rs200-350/kg",
    "date": "2026"
   },
   {
    "name": "todaypricerates",
    "url": "https://resale.todaypricerates.com/ewaste-scrap-rate",
    "value": "PCB boards Rs400-800/kg",
    "date": "2025-26"
   },
   {
    "name": "scraprates.in",
    "url": "https://scraprates.in/gandhinagar/e-waste-scrap-price",
    "value": "circuit boards Rs150-400/kg",
    "date": "2026-08-06"
   },
   {
    "name": "Alibaba buying guide",
    "url": "https://electronics.alibaba.com/buyingguides/motherboard-cpu-scrap-guide-value,-recovery-selling-tips",
    "value": "medium grade Rs150-190, high Rs220-250/kg",
    "date": "mid-2024"
   },
   {
    "name": "Alibaba buying guide",
    "url": "https://electronics.alibaba.com/buyingguides/scrap-motherboard-for-sale-price,-value-where-to-sell",
    "value": "Rs60-850/kg, desktop ATX over Rs500",
    "date": "2026"
   },
   {
    "name": "IndiaMART listings",
    "url": "https://dir.indiamart.com/impcat/motherboard-scrap.html",
    "value": "Rs40-650/kg, wide spread",
    "date": "2026-10"
   },
   {
    "name": "Live Chennai",
    "url": "https://www.livechennai.com/scrap_prices_Chennai.asp",
    "value": "Rs120 per board",
    "date": "2025"
   }
  ],
  "source": "kabadiwalaonline; todaypricerates; scraprates.in; Alibaba buying guide; Alibaba buying guide; IndiaMART listings; Live Chennai"
 },
 {
  "component": "ram_stick",
  "basis": "per_kg",
  "min_inr": 400,
  "max_inr": 800,
  "confidence": "web_estimate",
  "checked_date": "2026-10-08",
  "sources": [
   {
    "name": "kabadiwalaonline",
    "url": "https://kabadiwalaonline.in/scrap-price-today/",
    "value": "Rs400-800/kg",
    "date": "2026"
   },
   {
    "name": "old Delhi dealer blog",
    "url": "http://electronicscrap.blogspot.com/p/our-current-buying-rates.html",
    "value": "Rs600/kg",
    "date": "undated"
   }
  ],
  "source": "kabadiwalaonline; old Delhi dealer blog"
 },
 {
  "component": "mobile_pcb",
  "basis": "per_kg",
  "min_inr": 250,
  "max_inr": 450,
  "confidence": "web_estimate_weak",
  "checked_date": "2026-10-08",
  "sources": [
   {
    "name": "kabadiwalaonline",
    "url": "https://kabadiwalaonline.in/scrap-price-today/",
    "value": "mobile scrap Rs300-600 (unit unclear)",
    "date": "2026"
   },
   {
    "name": "Alibaba buying guide",
    "url": "https://electronics.alibaba.com/buyingguides/scrap-motherboard-for-sale-price,-value-where-to-sell",
    "value": "mobile boards Rs250-350/kg",
    "date": "2026"
   },
   {
    "name": "TradeIndia",
    "url": "https://www.tradeindia.com/manufacturers/pcb-scrap.html",
    "value": "green Android board Rs100-120 per piece",
    "date": "2026-04"
   }
  ],
  "source": "kabadiwalaonline; Alibaba buying guide; TradeIndia"
 },
 {
  "component": "copper_wire",
  "basis": "per_kg",
  "min_inr": 170,
  "max_inr": 480,
  "confidence": "web_estimate",
  "checked_date": "2026-10-08",
  "sources": [
   {
    "name": "nationalrecycling.in",
    "url": "https://www.nationalrecycling.in/blog/copper-scrap-price-india-2026/",
    "value": "insulated wire Rs340-480/kg (55-75% Cu)",
    "date": "mid-2026"
   },
   {
    "name": "IndiaMART listing",
    "url": "https://www.indiamart.com/proddetail/pvc-insulated-copper-wire-scrap-22985524197.html",
    "value": "PVC insulated wire Rs320/kg (50-55% Cu)",
    "date": "2026"
   },
   {
    "name": "Prime Scrap Noida/Delhi",
    "url": "https://www.primescrap.in/rates",
    "value": "copper wire Rs200/kg",
    "date": "2026-06-23"
   },
   {
    "name": "Live Chennai",
    "url": "https://www.livechennai.com/scrap_prices_Chennai.asp",
    "value": "electrical wire Rs170/kg, gray wire Rs350/kg",
    "date": "2025-10-30"
   },
   {
    "name": "Reuze Hyderabad",
    "url": "https://www.reuze.in/scrap-rate-today",
    "value": "electrical wiring Rs100-300/kg",
    "date": "2026"
   }
  ],
  "source": "nationalrecycling.in; IndiaMART listing; Prime Scrap Noida/Delhi; Live Chennai; Reuze Hyderabad"
 },
 {
  "component": "aluminium_heatsink",
  "basis": "per_kg",
  "min_inr": 180,
  "max_inr": 350,
  "confidence": "web_estimate",
  "checked_date": "2026-10-08",
  "sources": [
   {
    "name": "kabadiwalaonline",
    "url": "https://kabadiwalaonline.in/price-list/",
    "value": "aluminium scrap Rs95-130/kg",
    "date": "2026-08-16"
   },
   {
    "name": "Prime Scrap",
    "url": "https://www.primescrap.in/rates",
    "value": "aluminium scrap Rs200/kg",
    "date": "2026-06-23"
   },
   {
    "name": "BankBazaar",
    "url": "https://www.bankbazaar.com/commodity-price/aluminium-price.html",
    "value": "aluminium Rs338/kg spot, Delhi scrap about Rs190",
    "date": "2026-10-07"
   },
   {
    "name": "Live Chennai",
    "url": "https://www.livechennai.com/scrap_prices_Chennai.asp",
    "value": "aluminium Rs350/kg",
    "date": "2025-10-30"
   },
   {
    "name": "Reuze Hyderabad",
    "url": "https://www.reuze.in/scrap-rate-today",
    "value": "aluminium Rs200/kg",
    "date": "2026"
   },
   {
    "name": "kabadiwalaonline",
    "url": "https://kabadiwalaonline.in/scrap-price-today/",
    "value": "aluminium Rs120-180/kg",
    "date": "2026-03-08"
   }
  ],
  "source": "kabadiwalaonline; Prime Scrap; BankBazaar; Live Chennai; Reuze Hyderabad; kabadiwalaonline"
 },
 {
  "component": "charger_adapter",
  "basis": "per_kg",
  "min_inr": 40,
  "max_inr": 100,
  "confidence": "web_estimate_weak",
  "checked_date": "2026-10-08",
  "sources": [
   {
    "name": "old Delhi dealer blog",
    "url": "http://electronicscrap.blogspot.com/p/our-current-buying-rates.html",
    "value": "cable scrap Rs30/kg",
    "date": "undated"
   },
   {
    "name": "todaypricerates",
    "url": "https://resale.todaypricerates.com/ewaste-scrap-rate",
    "value": "cables and wiring Rs60-120/kg",
    "date": "2025-26"
   }
  ],
  "source": "old Delhi dealer blog; todaypricerates"
 },
 {
  "component": "hard_drive",
  "basis": "per_piece",
  "min_inr": 50,
  "max_inr": 100,
  "confidence": "web_estimate",
  "checked_date": "2026-10-08",
  "sources": [
   {
    "name": "old Delhi dealer blog",
    "url": "http://electronicscrap.blogspot.com/p/our-current-buying-rates.html",
    "value": "Rs50 per piece",
    "date": "undated"
   },
   {
    "name": "Live Chennai",
    "url": "https://www.livechennai.com/scrap_prices_Chennai.asp",
    "value": "Rs70 per piece",
    "date": "2025"
   },
   {
    "name": "kabadiwalaonline",
    "url": "https://kabadiwalaonline.in/scrap-price-today/",
    "value": "Rs80-150/kg (about Rs40-75 per drive)",
    "date": "2026"
   }
  ],
  "source": "old Delhi dealer blog; Live Chennai; kabadiwalaonline"
 },
 {
  "component": "power_supply",
  "basis": "per_piece",
  "min_inr": 30,
  "max_inr": 70,
  "confidence": "web_estimate",
  "checked_date": "2026-10-08",
  "sources": [
   {
    "name": "Live Chennai",
    "url": "https://www.livechennai.com/scrap_prices_Chennai.asp",
    "value": "SMPS Rs30",
    "date": "2025"
   },
   {
    "name": "old Delhi dealer blog",
    "url": "http://electronicscrap.blogspot.com/p/our-current-buying-rates.html",
    "value": "Rs45 per piece",
    "date": "undated"
   },
   {
    "name": "IndiaMART Delhi",
    "url": "https://dir.indiamart.com/delhi/computer-scrap.html",
    "value": "power supply scrap Rs70 per piece",
    "date": "2026-10-02"
   }
  ],
  "source": "Live Chennai; old Delhi dealer blog; IndiaMART Delhi"
 },
 {
  "component": "printer",
  "basis": "per_kg",
  "min_inr": 30,
  "max_inr": 60,
  "confidence": "web_estimate",
  "checked_date": "2026-10-08",
  "sources": [
   {
    "name": "Prime Scrap",
    "url": "https://www.primescrap.in/rates",
    "value": "Rs40/kg",
    "date": "2026-06-23"
   },
   {
    "name": "Scrapia (IndiaMART)",
    "url": "https://www.indiamart.com/proddetail/led-and-lcd-tv-and-monitor-scrap-2855382183830.html",
    "value": "Rs40/kg",
    "date": "2026"
   },
   {
    "name": "old Delhi dealer blog",
    "url": "http://electronicscrap.blogspot.com/p/our-current-buying-rates.html",
    "value": "Rs15/kg",
    "date": "undated"
   },
   {
    "name": "Live Chennai",
    "url": "https://www.livechennai.com/scrap_prices_Chennai.asp",
    "value": "inkjet Rs50, dot-matrix Rs100, laser Rs300 per piece",
    "date": "2025-10-30"
   }
  ],
  "source": "Prime Scrap; Scrapia (IndiaMART); old Delhi dealer blog; Live Chennai"
 },
 {
  "component": "crt_monitor_or_tv",
  "basis": "per_piece",
  "min_inr": 100,
  "max_inr": 300,
  "confidence": "web_estimate",
  "checked_date": "2026-10-08",
  "sources": [
   {
    "name": "Prime Scrap",
    "url": "https://www.primescrap.in/rates",
    "value": "CRT monitor Rs300, CRT TV Rs200",
    "date": "2026-06-23"
   },
   {
    "name": "Reuze",
    "url": "https://www.reuze.in/scrap-rate-today",
    "value": "CRT TV Rs100-200",
    "date": "2026"
   },
   {
    "name": "Live Chennai",
    "url": "https://www.livechennai.com/scrap_prices_Chennai.asp",
    "value": "CRT monitor Rs120",
    "date": "2025"
   },
   {
    "name": "Recycle Baba",
    "url": "https://recyclebaba.com/scrap-price-list",
    "value": "CRT monitor Rs100-200",
    "date": "2025"
   },
   {
    "name": "Reuze Hyderabad",
    "url": "https://www.reuze.in/scrap-rate-today",
    "value": "CRT monitor Rs200, CRT TV Rs100-200",
    "date": "2026"
   }
  ],
  "source": "Prime Scrap; Reuze; Live Chennai; Recycle Baba; Reuze Hyderabad"
 },
 {
  "component": "lcd_led_monitor_or_tv",
  "basis": "per_piece",
  "min_inr": 50,
  "max_inr": 250,
  "confidence": "web_estimate_weak",
  "checked_date": "2026-10-08",
  "sources": [
   {
    "name": "Live Chennai",
    "url": "https://www.livechennai.com/scrap_prices_Chennai.asp",
    "value": "LCD monitors Rs50-100",
    "date": "2025"
   },
   {
    "name": "Recycle Baba",
    "url": "https://recyclebaba.com/scrap-price-list",
    "value": "TV scrap Rs250",
    "date": "2025"
   },
   {
    "name": "Scrapia (IndiaMART)",
    "url": "https://www.indiamart.com/proddetail/led-and-lcd-tv-and-monitor-scrap-2855382183830.html",
    "value": "LED/LCD TV or monitor Rs50 per piece",
    "date": "2026"
   },
   {
    "name": "Prime Scrap",
    "url": "https://www.primescrap.in/rates",
    "value": "LCD monitor/TV Rs40/kg",
    "date": "2026-06-23"
   },
   {
    "name": "Reuze Hyderabad",
    "url": "https://www.reuze.in/scrap-rate-today",
    "value": "LCD/LED TV Rs100-2000 per piece, LCD monitor Rs20/kg",
    "date": "2026"
   }
  ],
  "source": "Live Chennai; Recycle Baba; Scrapia (IndiaMART); Prime Scrap; Reuze Hyderabad"
 },
 {
  "component": "router_or_modem",
  "basis": "per_kg",
  "min_inr": 20,
  "max_inr": 60,
  "confidence": "web_estimate_weak",
  "checked_date": "2026-10-08",
  "sources": [
   {
    "name": "kabadiwalaonline",
    "url": "https://kabadiwalaonline.in/price-list/",
    "value": "mixed e-waste Rs30-90/kg",
    "date": "2026-08-16"
   },
   {
    "name": "scraprates.in Delhi",
    "url": "https://scraprates.in/delhi/e-waste-scrap-price",
    "value": "mixed e-waste Rs48.32/kg wholesale baseline",
    "date": "2026-07-03"
   },
   {
    "name": "Prime Scrap",
    "url": "https://www.primescrap.in/rates",
    "value": "metal e-waste Rs25-30/kg",
    "date": "2026-06"
   },
   {
    "name": "Reuze Hyderabad",
    "url": "https://www.reuze.in/scrap-rate-today",
    "value": "mixed e-waste Rs20/kg",
    "date": "2026"
   }
  ],
  "source": "kabadiwalaonline; scraprates.in Delhi; Prime Scrap; Reuze Hyderabad"
 },
 {
  "component": "remote",
  "basis": "per_kg",
  "min_inr": 5,
  "max_inr": 30,
  "confidence": "web_estimate_weak",
  "checked_date": "2026-10-08",
  "sources": [
   {
    "name": "kabadiwalaonline",
    "url": "https://kabadiwalaonline.in/price-list/",
    "value": "hard plastic Rs15-30/kg (proxy)",
    "date": "2026-08-16"
   },
   {
    "name": "Prime Scrap",
    "url": "https://www.primescrap.in/rates",
    "value": "plastic e-waste Rs15/kg",
    "date": "2026-06-23"
   },
   {
    "name": "Reuze Hyderabad",
    "url": "https://www.reuze.in/scrap-rate-today",
    "value": "hard plastic Rs2/kg",
    "date": "2026"
   }
  ],
  "source": "kabadiwalaonline; Prime Scrap; Reuze Hyderabad"
 },
 {
  "component": "laptop",
  "basis": "per_piece",
  "min_inr": 150,
  "max_inr": 600,
  "confidence": "web_estimate",
  "checked_date": "2026-10-08",
  "sources": [
   {
    "name": "kabadiwalaonline",
    "url": "https://kabadiwalaonline.in/price-list/",
    "value": "Rs150-450 per piece",
    "date": "2026-08-16"
   },
   {
    "name": "todaypricerates",
    "url": "https://resale.todaypricerates.com/ewaste-scrap-rate",
    "value": "Rs100-400 per unit",
    "date": "2025-26"
   },
   {
    "name": "Prime Scrap",
    "url": "https://www.primescrap.in/rates",
    "value": "dead laptop Rs700 per piece",
    "date": "2026-06-23"
   },
   {
    "name": "IndiaMART listings",
    "url": "https://dir.indiamart.com/impcat/laptop-scrap.html",
    "value": "Rs180-500/kg",
    "date": "2026"
   },
   {
    "name": "Live Chennai",
    "url": "https://www.livechennai.com/scrap_prices_Chennai.asp",
    "value": "laptop not working Rs300",
    "date": "2025-10-30"
   },
   {
    "name": "Reuze Hyderabad",
    "url": "https://www.reuze.in/scrap-rate-today",
    "value": "Rs200 and up per laptop (working ones far higher)",
    "date": "2026"
   }
  ],
  "source": "kabadiwalaonline; todaypricerates; Prime Scrap; IndiaMART listings; Live Chennai; Reuze Hyderabad"
 },
 {
  "component": "desktop_cpu",
  "basis": "per_piece",
  "min_inr": 120,
  "max_inr": 600,
  "confidence": "web_estimate_weak",
  "checked_date": "2026-10-08",
  "sources": [
   {
    "name": "Prime Scrap",
    "url": "https://www.primescrap.in/rates",
    "value": "desktop CPU Rs600 per piece",
    "date": "2026-06-23"
   },
   {
    "name": "Scrapia (IndiaMART)",
    "url": "https://www.indiamart.com/proddetail/led-and-lcd-tv-and-monitor-scrap-2855382183830.html",
    "value": "CPU computer scrap Rs120 per piece",
    "date": "2026"
   },
   {
    "name": "Live Chennai",
    "url": "https://www.livechennai.com/scrap_prices_Chennai.asp",
    "value": "P4/dual-core complete branded set Rs400",
    "date": "2025-10-30"
   },
   {
    "name": "Reuze Hyderabad",
    "url": "https://www.reuze.in/scrap-rate-today",
    "value": "CPU Rs50/kg",
    "date": "2026"
   }
  ],
  "source": "Prime Scrap; Scrapia (IndiaMART); Live Chennai; Reuze Hyderabad"
 },
 {
  "component": "mobile_phone",
  "basis": "per_piece",
  "min_inr": 50,
  "max_inr": 350,
  "confidence": "web_estimate",
  "checked_date": "2026-10-08",
  "sources": [
   {
    "name": "todaypricerates",
    "url": "https://resale.todaypricerates.com/ewaste-scrap-rate",
    "value": "Rs50-350 per phone",
    "date": "2025-26"
   },
   {
    "name": "Prime Scrap",
    "url": "https://www.primescrap.in/rates",
    "value": "smartphone Rs300, keypad phone Rs40, tablet Rs50",
    "date": "2026-06-23"
   },
   {
    "name": "Reuze Hyderabad",
    "url": "https://www.reuze.in/scrap-rate-today",
    "value": "mobile/tab Rs20-500 per piece",
    "date": "2026"
   }
  ],
  "source": "todaypricerates; Prime Scrap; Reuze Hyderabad"
 },
 {
  "component": "lead_acid_battery",
  "sources": [
   {
    "name": "Prime Scrap",
    "url": "https://www.primescrap.in/rates",
    "value": "inverter battery Rs85-95/kg",
    "date": "2026-06-23"
   },
   {
    "name": "kabadiwalaonline",
    "url": "https://kabadiwalaonline.in/scrap-price-today/",
    "value": "lead battery Rs100-120/kg",
    "date": "2026-03-08"
   },
   {
    "name": "Reuze Hyderabad",
    "url": "https://www.reuze.in/scrap-rate-today",
    "value": "battery Rs80-130/kg",
    "date": "2026"
   }
  ],
  "basis": "per_kg",
  "min_inr": 85,
  "max_inr": 130,
  "confidence": "web_estimate",
  "checked_date": "2026-10-08",
  "source": "Prime Scrap; kabadiwalaonline; Reuze Hyderabad"
 },
 {
  "component": "ups_unit",
  "sources": [
   {
    "name": "Live Chennai",
    "url": "https://www.livechennai.com/scrap_prices_Chennai.asp",
    "value": "0.5-2 kVA UPS with battery Rs200-800",
    "date": "2025-10-30"
   },
   {
    "name": "Prime Scrap",
    "url": "https://www.primescrap.in/rates",
    "value": "UPS Rs350 per piece",
    "date": "2026-06-23"
   }
  ],
  "basis": "per_piece",
  "min_inr": 200,
  "max_inr": 800,
  "confidence": "web_estimate_weak",
  "checked_date": "2026-10-08",
  "source": "Live Chennai; Prime Scrap"
 },
 {
  "component": "copper_scrap",
  "sources": [
   {
    "name": "Live Chennai",
    "url": "https://www.livechennai.com/scrap_prices_Chennai.asp",
    "value": "copper OC Rs850, DC Rs950/kg",
    "date": "2025-10-30"
   },
   {
    "name": "Reuze Hyderabad",
    "url": "https://www.reuze.in/scrap-rate-today",
    "value": "copper Rs1000/kg",
    "date": "2026"
   },
   {
    "name": "Prime Scrap",
    "url": "https://www.primescrap.in/rates",
    "value": "copper scrap Rs1000/kg",
    "date": "2026-06-23"
   }
  ],
  "basis": "per_kg",
  "min_inr": 850,
  "max_inr": 1000,
  "confidence": "web_estimate",
  "checked_date": "2026-10-08",
  "source": "Live Chennai; Reuze Hyderabad; Prime Scrap"
 },
 {
  "component": "split_ac",
  "sources": [
   {
    "name": "Live Chennai",
    "url": "https://www.livechennai.com/scrap_prices_Chennai.asp",
    "value": "split AC 1-3 ton Rs2,000-4,000",
    "date": "2025-10-30"
   },
   {
    "name": "Reuze Hyderabad",
    "url": "https://www.reuze.in/scrap-rate-today",
    "value": "split AC Rs3,500-5,500 per unit",
    "date": "2026"
   }
  ],
  "basis": "per_piece",
  "min_inr": 2000,
  "max_inr": 5500,
  "confidence": "web_estimate",
  "checked_date": "2026-10-08",
  "source": "Live Chennai; Reuze Hyderabad"
 },
 {
  "component": "window_ac",
  "sources": [
   {
    "name": "Live Chennai",
    "url": "https://www.livechennai.com/scrap_prices_Chennai.asp",
    "value": "window AC 1-2 ton Rs1,500-3,000",
    "date": "2025-10-30"
   },
   {
    "name": "Reuze Hyderabad",
    "url": "https://www.reuze.in/scrap-rate-today",
    "value": "window AC Rs3,000-5,000",
    "date": "2026"
   }
  ],
  "basis": "per_piece",
  "min_inr": 1500,
  "max_inr": 5000,
  "confidence": "web_estimate",
  "checked_date": "2026-10-08",
  "source": "Live Chennai; Reuze Hyderabad"
 },
 {
  "component": "refrigerator",
  "sources": [
   {
    "name": "Reuze Hyderabad",
    "url": "https://www.reuze.in/scrap-rate-today",
    "value": "fridge Rs500-9,000 per piece (very wide, single source)",
    "date": "2026"
   }
  ],
  "basis": "per_piece",
  "min_inr": 500,
  "max_inr": 9000,
  "confidence": "web_estimate_weak",
  "checked_date": "2026-10-08",
  "source": "Reuze Hyderabad"
 },
 {
  "component": "washing_machine",
  "sources": [
   {
    "name": "Reuze Hyderabad",
    "url": "https://www.reuze.in/scrap-rate-today",
    "value": "top load Rs700, front load Rs800",
    "date": "2026"
   }
  ],
  "basis": "per_piece",
  "min_inr": 700,
  "max_inr": 800,
  "confidence": "web_estimate_weak",
  "checked_date": "2026-10-08",
  "source": "Reuze Hyderabad"
 },
 {
  "component": "microwave",
  "sources": [
   {
    "name": "Reuze Hyderabad",
    "url": "https://www.reuze.in/scrap-rate-today",
    "value": "microwave Rs150-1,000 per piece",
    "date": "2026"
   }
  ],
  "basis": "per_piece",
  "min_inr": 150,
  "max_inr": 1000,
  "confidence": "web_estimate_weak",
  "checked_date": "2026-10-08",
  "source": "Reuze Hyderabad"
 },
 {
  "component": "li_ion_battery",
  "basis": "none",
  "min_inr": 0,
  "max_inr": 0,
  "confidence": "none",
  "checked_date": "2026-10-08",
  "sources": [],
  "source": "hazardous: no value shown, route to an authorized recycler"
 },
 {
  "component": "alkaline_battery",
  "basis": "none",
  "min_inr": 0,
  "max_inr": 0,
  "confidence": "none",
  "checked_date": "2026-10-08",
  "sources": [],
  "source": "no value shown"
 },
 {
  "component": "cfl_or_tube_light",
  "basis": "none",
  "min_inr": 0,
  "max_inr": 0,
  "confidence": "none",
  "checked_date": "2026-10-08",
  "sources": [],
  "source": "contains mercury: no value shown"
 },
 {
  "component": "other",
  "basis": "none",
  "min_inr": 0,
  "max_inr": 0,
  "confidence": "none",
  "checked_date": "2026-10-08",
  "sources": [],
  "source": "no reliable price: shown as unknown"
 }
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

### src/analyst/app.py
`python
"""POST /analyst {question, language}. A Gemini function-calling loop over the anonymous lot ledger.
Every number comes from a tool; the model only phrases the answer. The tool trace is returned so the chaining is visible.
Mock lots are ignored. No personal data exists in the ledger (location is rounded to ~1 km)."""
import json, os, urllib.request
import boto3

TABLE, KEY = os.environ.get("LOTS_TABLE", ""), os.environ.get("GEMINI_API_KEY", "")
MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
MAX_ROUNDS = 4
_t = None

def _lots():
    global _t
    _t = _t or boto3.resource("dynamodb").Table(TABLE)
    items, kw = [], {}
    while True:
        r = _t.scan(**kw); items += r.get("Items", [])
        if "LastEvaluatedKey" not in r: break
        kw["ExclusiveStartKey"] = r["LastEvaluatedKey"]
    return [l for l in items if not l.get("mock")]

def _cells(lots):
    cells = {}
    for l in lots:
        if l.get("cell_lat") is None: continue
        k = (float(l["cell_lat"]), float(l["cell_lon"]))
        c = cells.setdefault(k, {"lat": k[0], "lon": k[1], "lots": 0, "hazard_lots": 0, "kg": {}})
        c["lots"] += 1; c["hazard_lots"] += 1 if l.get("hazards") else 0
        for it in l.get("items", []):
            c["kg"][it["component"]] = c["kg"].get(it["component"], 0) + float(it.get("est_weight_g", 0)) / 1000
    return list(cells.values())

def overview(lots):
    kg, hz = {}, {}
    for l in lots:
        for it in l.get("items", []): kg[it["component"]] = kg.get(it["component"], 0) + float(it.get("est_weight_g", 0)) / 1000
        for h in l.get("hazards", []): hz[h] = hz.get(h, 0) + 1
    return {"lots": len(lots), "kg_by_material": {k: round(v, 2) for k, v in kg.items()}, "hazard_counts": hz,
            "value_min_inr": round(sum(float(l.get("total_min_inr", 0)) for l in lots)),
            "value_max_inr": round(sum(float(l.get("total_max_inr", 0)) for l in lots))}

def hotspots(lots, limit=5):
    cs = sorted(_cells(lots), key=lambda c: (-c["hazard_lots"], -c["lots"]))[:int(limit)]
    return [{k: c[k] for k in ("lat", "lon", "lots", "hazard_lots")} for c in cs]

def material_by_area(lots, component, min_kg=0):
    out = [{"lat": c["lat"], "lon": c["lon"], "kg": round(c["kg"].get(component, 0), 2)} for c in _cells(lots) if c["kg"].get(component, 0) >= float(min_kg)]
    return sorted(out, key=lambda x: -x["kg"])[:5]

TOOLS = {"overview": overview, "hotspots": hotspots, "material_by_area": material_by_area}
DECLS = [
    {"name": "overview", "description": "Totals: lots, kg by material, hazard counts, value range in rupees."},
    {"name": "hotspots", "description": "Areas (about 1 km cells) ranked by hazardous lots then lot count.",
     "parameters": {"type": "OBJECT", "properties": {"limit": {"type": "INTEGER"}}}},
    {"name": "material_by_area", "description": "Areas ranked by kg of one material, e.g. motherboard, copper_wire, lead_acid_battery.",
     "parameters": {"type": "OBJECT", "properties": {"component": {"type": "STRING"}, "min_kg": {"type": "NUMBER"}}, "required": ["component"]}},
]
SYSTEM = ("You help a recycler or city planner read an anonymous e-waste lot ledger. Use the tools for every number; never invent figures. "
          "Weights are estimated from photos and the ledger is a small early sample, so say so. Be brief and practical.")

def _gemini(contents):
    body = {"systemInstruction": {"parts": [{"text": SYSTEM}]}, "contents": contents,
            "tools": [{"functionDeclarations": DECLS}], "generationConfig": {"temperature": 0}}
    req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent",
                                 json.dumps(body).encode(), {"Content-Type": "application/json", "x-goog-api-key": KEY})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)["candidates"][0]["content"]

def _j(status, body):
    return {"statusCode": status, "headers": {"content-type": "application/json"}, "body": json.dumps(body)}

def handler(event, context):
    try:
        b = json.loads(event.get("body") or "{}")
        q, lang = str(b.get("question", ""))[:300].strip(), str(b.get("language", "en"))[:5]
        if not q: return _j(400, {"error": "question required"})
        lots = _lots()
    except Exception:
        return _j(400, {"error": "bad request"})
    if not lots:
        return _j(200, {"answer": "No real scans are saved yet, so there is nothing to analyse.", "tools_used": [], "lots_considered": 0})
    contents, trace = [{"role": "user", "parts": [{"text": f"{q}\n(Reply in language code: {lang})"}]}], []
    try:
        for _ in range(MAX_ROUNDS):
            msg = _gemini(contents)
            calls = [p["functionCall"] for p in msg.get("parts", []) if "functionCall" in p]
            if not calls:
                return _j(200, {"answer": "".join(p.get("text", "") for p in msg.get("parts", [])), "tools_used": trace, "lots_considered": len(lots)})
            contents.append(msg); out = []
            for c in calls:
                args = c.get("args") or {}
                try: res = TOOLS[c["name"]](lots, **args)
                except Exception as e: res = {"error": type(e).__name__}
                trace.append({"tool": c["name"], "args": args})
                out.append({"functionResponse": {"name": c["name"], "response": {"result": res}}})
            contents.append({"role": "user", "parts": out})
        return _j(200, {"answer": "Could not finish the analysis. Try a simpler question.", "tools_used": trace, "lots_considered": len(lots)})
    except Exception as e:
        print("analyst error:", repr(e)[:300])
        return _j(502, {"error": "analysis failed", "overview": overview(lots)})
`

### frontend/src/app/insights/page.tsx
`tsx
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
`

### scripts/accuracy.py
`python
import os
import sys
import csv
import base64
import time
import json
import urllib.request
from collections import defaultdict

API_URL = os.environ.get("NEXT_PUBLIC_API_URL", "")

def get_api_url():
    if API_URL:
        return API_URL
    # Try to read from frontend/.env.local
    env_path = os.path.join("frontend", ".env.local")
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            for line in f:
                if line.startswith("NEXT_PUBLIC_API_URL="):
                    return line.split("=", 1)[1].strip()
    return None

def run_accuracy(photos_dir, labels_csv):
    api = get_api_url()
    if not api:
        print("Error: Could not find NEXT_PUBLIC_API_URL.")
        sys.exit(1)
        
    api = api.rstrip("/") + "/agent"

    if not os.path.exists(labels_csv):
        print(f"Error: {labels_csv} not found.")
        sys.exit(1)

    labels = {}
    with open(labels_csv, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        # Expected columns: filename, components (comma sep), hazards (comma sep)
        for row in reader:
            comps = [c.strip() for c in row.get("components", "").split(",") if c.strip()]
            hazards = [h.strip() for h in row.get("hazards", "").split(",") if h.strip()]
            labels[row["filename"]] = {"components": set(comps), "hazards": set(hazards)}

    results = []
    
    print(f"Testing against API: {api}")
    print("-" * 50)
    for filename, true_labels in labels.items():
        filepath = os.path.join(photos_dir, filename)
        if not os.path.exists(filepath):
            print(f"Warning: Photo {filename} not found, skipping.")
            continue
            
        with open(filepath, "rb") as f:
            img_b64 = base64.b64encode(f.read()).decode("utf-8")
        
        ext = filename.split(".")[-1].lower()
        mime = f"image/{ext}" if ext in ["jpeg", "png", "webp"] else "image/jpeg"
        
        payload = {
            "image_b64": img_b64,
            "media_type": mime,
            "language": "en"
        }
        
        req = urllib.request.Request(api, data=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json"})
        
        start_time = time.time()
        try:
            with urllib.request.urlopen(req, timeout=40) as response:
                latency = time.time() - start_time
                data = json.loads(response.read().decode("utf-8"))
        except Exception as e:
            latency = time.time() - start_time
            print(f"[{filename}] Failed ({latency:.1f}s): {e}")
            results.append({"filename": filename, "error": str(e), "latency": latency})
            continue

        if data.get("type") == "error":
            print(f"[{filename}] Scan Failed ({latency:.1f}s)")
            results.append({"filename": filename, "error": "Scan failed", "latency": latency})
            continue
            
        if data.get("type") == "clarify":
            conf = data.get("scan", {}).get("confidence", 0)
            print(f"[{filename}] Clarify Requested ({latency:.1f}s) - Confidence: {conf}")
            results.append({"filename": filename, "clarify": True, "confidence": conf, "latency": latency})
            continue
            
        scan = data.get("scan", {})
        pred_comps = {item["component"] for item in scan.get("items", [])}
        pred_hazards = set(scan.get("hazards", []))
        conf = scan.get("confidence", 0)
        provider = data.get("provider", "unknown")
        
        comp_match = len(pred_comps.intersection(true_labels["components"])) / max(1, len(true_labels["components"]))
        haz_match = len(pred_hazards.intersection(true_labels["hazards"])) / max(1, len(true_labels["hazards"])) if true_labels["hazards"] else 1.0
        
        print(f"[{filename}] Success ({latency:.1f}s) via {provider} | Conf: {conf} | Comp Recall: {comp_match:.0%} | Haz Recall: {haz_match:.0%}")
        
        results.append({
            "filename": filename,
            "error": None,
            "clarify": False,
            "latency": latency,
            "provider": provider,
            "confidence": conf,
            "comp_match": comp_match,
            "haz_match": haz_match
        })

    # Summary
    print("-" * 50)
    print("SUMMARY")
    valid = [r for r in results if not r.get("error") and not r.get("clarify")]
    errors = [r for r in results if r.get("error")]
    clarifies = [r for r in results if r.get("clarify")]
    
    print(f"Total processed: {len(results)}")
    print(f"Valid results: {len(valid)}")
    print(f"Clarifications requested: {len(clarifies)}")
    print(f"Errors: {len(errors)}")
    
    if valid:
        avg_latency = sum(r["latency"] for r in valid) / len(valid)
        avg_conf = sum(r["confidence"] for r in valid) / len(valid)
        avg_comp = sum(r["comp_match"] for r in valid) / len(valid)
        avg_haz = sum(r["haz_match"] for r in valid) / len(valid)
        print(f"Average Latency: {avg_latency:.2f}s")
        print(f"Average Confidence: {avg_conf:.1f}")
        print(f"Component Accuracy/Recall: {avg_comp:.1%}")
        print(f"Hazard Recall: {avg_haz:.1%}")
    else:
        print("No valid results to summarize.")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python scripts/accuracy.py <photos_dir> <labels_csv>")
        sys.exit(1)
    run_accuracy(sys.argv[1], sys.argv[2])
`

### amplify.yml
`
version: 1
applications:
  - appRoot: frontend
    frontend:
      phases:
        preBuild:
          commands:
            - npm ci
        build:
          commands:
            - env | grep -e NEXT_PUBLIC_API_URL >> .env.production
            - npm run build
      artifacts:
        baseDirectory: .next
        files:
          - '**/*'
      cache:
        paths:
          - node_modules/**/*
          - .next/cache/**/*
`


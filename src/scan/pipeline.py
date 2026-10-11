"""KabadiAI Deterministic AI Scan Pipeline
Core e-waste identification, safety, pricing, and recycler routing.
Features:
- Request-scoped ScanContext (thread-safe, zero global dictionary mutation).
- Resilience engine (Circuit Breaker, Bedrock fallback, SHA-256 deduplication).
- In-memory TTL caching for reference pricing (28 items) and recyclers (300 items).
- Deterministic LCA environmental impact math.
"""
from __future__ import annotations
import base64, contextvars, json, math, os, re, time, urllib.parse, urllib.request, uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional, Dict, List, Any
import boto3

from src.scan.resilience import (
    GEMINI_BREAKER,
    backoff_jitter,
    compute_image_hash,
    get_dedup_cached_result,
    put_dedup_cached_result,
)

MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "amazon.nova-2-lite-v1:0")
MOCK = os.environ.get("MOCK_ANALYSIS", "0") == "1"
AGENT_MODE = os.environ.get("AGENT_MODE", "0") == "1"
PRICES_TABLE = os.environ.get("PRICES_TABLE", "")
RECYCLERS_TABLE = os.environ.get("RECYCLERS_TABLE", "")
LOTS_TABLE = os.environ.get("LOTS_TABLE", "")
AGGREGATES_TABLE = os.environ.get("AGGREGATES_TABLE", "")
PROVIDER_ORDER = [x.strip() for x in os.environ.get("PROVIDER_ORDER", "gemini,bedrock").split(",") if x.strip()]
GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash")
MIN_CONF, MAX_BYTES = 70, 4_000_000
MEDIA = {"image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp"}

COMPONENTS = {
    "alkaline_battery", "aluminium_heatsink", "cfl_or_tube_light", "charger_adapter",
    "copper_scrap", "copper_wire", "crt_monitor_or_tv", "desktop_cpu", "hard_drive",
    "laptop", "lcd_led_monitor_or_tv", "lead_acid_battery", "li_ion_battery", "microwave",
    "mobile_pcb", "mobile_phone", "motherboard", "other", "power_supply", "printer",
    "ram_stick", "refrigerator", "remote", "router_or_modem", "split_ac", "ups_unit",
    "washing_machine", "window_ac"
}
CONDITIONS = {"intact", "corroded", "swollen", "leaking", "broken", "unknown"}
HAZARDS = {"swollen_battery", "leaking_battery", "mercury_lamp", "crt_or_lead_glass", "lead_acid_battery", "refrigerant_gas"}
NO_VALUE = {"li_ion_battery", "alkaline_battery", "cfl_or_tube_light"}
DISCLAIMER = "Indicative only, not an official valuation. Recycler data covers Delhi-NCR only (DPCC/CPCB list, 2023)."

HAZARD_MESSAGES = {
    "swollen_battery": {"en": "DANGER: swollen lithium battery. Do not burn, puncture or crush.",
                        "hi": "खतरा: फूली हुई लिथियम बैटरी। इसे जलाएं नहीं, छेदें नहीं, दबाएं नहीं।"},
    "leaking_battery": {"en": "Leaking battery. Do not touch with bare hands. Keep it separate.",
                        "hi": "बैटरी से तरल निकल रहा है। नंगे हाथ से न छुएं। इसे अलग रखें।"},
    "mercury_lamp": {"en": "Contains mercury. Do not break the tube or bulb.",
                     "hi": "इसमें पारा (मरकरी) है। ट्यूब या बल्ब न तोड़ें।"},
    "crt_or_lead_glass": {"en": "Hazardous: lead glass. Do not break open.",
                          "hi": "खतरनाक: इसमें सीसे का कांच है। इसे न तोड़ें।"},
    "lead_acid_battery": {"en": "Lead-acid battery: contains acid and lead. Keep it upright. Do not open, burn or drain it.",
                          "hi": "लेड-एसिड बैटरी: इसमें तेज़ाब और सीसा है। इसे सीधा रखें। खोलें नहीं, जलाएं नहीं, तेज़ाब न निकालें।"},
    "refrigerant_gas": {"en": "Contains refrigerant gas. Do not cut or break the pipes or compressor.",
                        "hi": "इसमें रेफ्रिजरेंट गैस है। पाइप या कंप्रेसर को न काटें और न तोड़ें।"},
}
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

# ─── REQUEST-SCOPED CONTEXT ────────────────────────────────────────────────
@dataclass
class ScanContext:
    image: bytes = b""
    fmt: str = "jpeg"
    lat: Optional[float] = None
    lon: Optional[float] = None
    user_weight_g: Optional[int] = None
    lang: str = "en"
    no_save: bool = False
    deadline: float = 0.0
    provider: str = ""
    scan: dict = field(default_factory=dict)
    line_items: list = field(default_factory=list)
    totals: tuple = (0.0, 0.0)
    hazards: list = field(default_factory=list)
    recyclers: list = field(default_factory=list)
    collection_points: list = field(default_factory=list)
    result: dict = field(default_factory=dict)
    unpriced: int = 0

_ctx_var: contextvars.ContextVar[ScanContext] = contextvars.ContextVar("scan_context")

def get_context() -> ScanContext:
    try:
        return _ctx_var.get()
    except LookupError:
        c = ScanContext()
        _ctx_var.set(c)
        return c

def set_context(ctx: ScanContext):
    _ctx_var.set(ctx)

# ─── BOTO3 / DYNAMO / SSM REUSABLE CLIENTS ─────────────────────────────────
_ddb = None
_ssm = None

def _get_table(name: str):
    global _ddb
    if not name:
        return None
    _ddb = _ddb or boto3.resource("dynamodb")
    return _ddb.Table(name)

_CACHED_SECRETS: Dict[str, str] = {}
def _resolve_secret(val: str) -> str:
    global _ssm
    if not val:
        return ""
    if val in _CACHED_SECRETS:
        return _CACHED_SECRETS[val]
    if val.startswith("/") or val.startswith("arn:aws:ssm:"):
        try:
            if not _ssm:
                _ssm = boto3.client("ssm")
            res = _ssm.get_parameter(Name=val, WithDecryption=True)
            sec = res["Parameter"]["Value"]
            _CACHED_SECRETS[val] = sec
            return sec
        except Exception as e:
            print(f"SSM parameter read error for {val}:", repr(e))
            return val
    _CACHED_SECRETS[val] = val
    return val

def _get_gemini_key() -> str:
    return _resolve_secret(GEMINI_KEY or os.environ.get("GEMINI_API_KEY", ""))

# ─── IN-MEMORY TTL CACHES ──────────────────────────────────────────────────
_CACHE = {
    "prices": {},
    "prices_expiry": 0.0,
    "recyclers": [],
    "recyclers_expiry": 0.0,
}
PRICES_CACHE_TTL = 300.0     # 5 minutes
RECYCLERS_CACHE_TTL = 600.0  # 10 minutes

def load_all_prices() -> Dict[str, dict]:
    now = time.time()
    if _CACHE["prices"] and now < _CACHE["prices_expiry"]:
        return _CACHE["prices"]
    if not PRICES_TABLE:
        return _CACHE["prices"]
    try:
        t = _get_table(PRICES_TABLE)
        if t:
            items = t.scan().get("Items", [])
            if items:
                _CACHE["prices"] = {it.get("component"): it for it in items if it.get("component")}
                _CACHE["prices_expiry"] = now + PRICES_CACHE_TTL
    except Exception as e:
        print("Prices table cache preload error:", repr(e))
    return _CACHE["prices"]

DEFAULT_BASE_PRICES = {
    "motherboard": {"component": "motherboard", "basis": "per_kg", "min_inr": "150.0", "max_inr": "400.0"},
    "copper_wire": {"component": "copper_wire", "basis": "per_kg", "min_inr": "170.0", "max_inr": "480.0"},
    "copper_scrap": {"component": "copper_scrap", "basis": "per_kg", "min_inr": "850.0", "max_inr": "1000.0"},
    "aluminium_heatsink": {"component": "aluminium_heatsink", "basis": "per_kg", "min_inr": "180.0", "max_inr": "350.0"},
    "laptop": {"component": "laptop", "basis": "per_piece", "min_inr": "500.0", "max_inr": "1500.0"},
    "mobile_phone": {"component": "mobile_phone", "basis": "per_piece", "min_inr": "50.0", "max_inr": "350.0"},
    "desktop_cpu": {"component": "desktop_cpu", "basis": "per_piece", "min_inr": "300.0", "max_inr": "1000.0"},
    "other": {"component": "other", "basis": "per_kg", "min_inr": "15.0", "max_inr": "30.0"},
}

def get_price_row(comp: str) -> dict:
    prices = load_all_prices()
    row = prices.get(comp) or prices.get("other")
    if row:
        return row
    try:
        t = _get_table(PRICES_TABLE)
        if t:
            row = t.get_item(Key={"component": comp}).get("Item") or t.get_item(Key={"component": "other"}).get("Item")
            if row:
                return row
    except Exception:
        pass
    # Resilient fallback: use verified reference pricing if DynamoDB is unreachable or empty
    return DEFAULT_BASE_PRICES.get(comp) or DEFAULT_BASE_PRICES.get("other", {"basis": "none"})

def load_all_recyclers() -> List[dict]:
    now = time.time()
    if _CACHE["recyclers"] and now < _CACHE["recyclers_expiry"]:
        return _CACHE["recyclers"]
    if not RECYCLERS_TABLE:
        return _CACHE["recyclers"]
    try:
        t = _get_table(RECYCLERS_TABLE)
        if t:
            items = t.scan(
                ProjectionExpression="id, #n, address, city, #s, kind, lat, lon, toll_free, capacity_mta, notes",
                ExpressionAttributeNames={"#n": "name", "#s": "state"}
            ).get("Items", [])
            if items:
                _CACHE["recyclers"] = items
                _CACHE["recyclers_expiry"] = now + RECYCLERS_CACHE_TTL
    except Exception as e:
        print("Recyclers table cache preload error:", repr(e))
    return _CACHE["recyclers"]

def calculate_distance_km(a: float, b: float, c: float, d: float) -> float:
    p = math.pi / 180
    x = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(x))

def clean_scan_response(raw: dict) -> dict:
    items = []
    for it in raw.get("items", [])[:20]:
        items.append({
            "component": it.get("component") if it.get("component") in COMPONENTS else "other",
            "condition": it.get("condition") if it.get("condition") in CONDITIONS else "unknown",
            "count": max(1, int(it.get("count", 1) or 1)),
            "est_weight_g": max(0, int(it.get("est_weight_g", 0) or 0)),
        })
    return {
        "items": items,
        "hazards": [h for h in raw.get("hazards", []) if h in HAZARDS],
        "confidence": max(0, min(100, int(raw.get("confidence", 0) or 0))),
        "notes": str(raw.get("notes", ""))[:300]
    }

# ─── PROVIDER CALLS ────────────────────────────────────────────────────────
def call_bedrock(img: bytes, fmt: str, timeout: float = 12.0) -> str:
    from botocore.config import Config
    client = boto3.client("bedrock-runtime", config=Config(read_timeout=max(3, int(timeout)), connect_timeout=4, retries={"max_attempts": 1}))
    r = client.converse(
        modelId=MODEL_ID,
        messages=[{"role": "user", "content": [{"image": {"format": fmt, "source": {"bytes": img}}}, {"text": PROMPT}]}],
        inferenceConfig={"maxTokens": 1000}
    )
    return r["output"]["message"]["content"][0]["text"]

def call_gemini(img: bytes, mime: str, timeout: float = 12.0) -> str:
    g_key = _get_gemini_key()
    if not g_key:
        raise RuntimeError("No Gemini API key configured")
    body = {
        "contents": [{"parts": [{"inline_data": {"mime_type": mime, "data": base64.b64encode(img).decode()}}, {"text": PROMPT}]}],
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0, "maxOutputTokens": 1500}
    }
    last_err = None
    for model_name in (GEMINI_MODEL, "gemini-flash-latest"):
        for attempt in range(2):
            try:
                req = urllib.request.Request(
                    f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent",
                    json.dumps(body).encode(),
                    {"Content-Type": "application/json", "x-goog-api-key": g_key}
                )
                with urllib.request.urlopen(req, timeout=max(3, timeout)) as r:
                    return json.load(r)["candidates"][0]["content"]["parts"][0]["text"]
            except urllib.error.HTTPError as e:
                last_err = e
                if e.code in (503, 429, 500) and attempt == 0:
                    time.sleep(backoff_jitter(0, base=0.4))
                    continue
                break
            except Exception as e:
                last_err = e
                break
    raise last_err or RuntimeError("Gemini request failed")

def scan_with_resilience(img: bytes, fmt: str, ctx: ScanContext) -> dict:
    """Invokes AI providers with circuit breaker and Bedrock failover."""
    # Check deduplication cache first
    img_hash = compute_image_hash(img, ctx.lang, ctx.user_weight_g)
    cached = get_dedup_cached_result(img_hash)
    if cached:
        scan_copy = json.loads(json.dumps(cached))
        scan_copy["provider"] = "cache_dedup"
        return scan_copy

    errors = []
    for prov in PROVIDER_ORDER:
        left = ctx.deadline - time.time()
        if left < 4:
            errors.append(f"{prov}: out of time")
            break
        try:
            if prov == "gemini":
                def _do_gemini():
                    return call_gemini(img, "image/" + fmt, min(12.0, left - 1.0))
                def _fallback_bedrock():
                    return call_bedrock(img, fmt, min(12.0, left - 1.0))
                text = GEMINI_BREAKER.execute(_do_gemini, fallback_fn=_fallback_bedrock)
            elif prov == "bedrock":
                text = call_bedrock(img, fmt, min(12.0, left - 1.0))
            else:
                continue

            m = re.search(r"\{.*\}", text, re.S)
            if not m:
                raise ValueError("No JSON object found in response")
            scan = clean_scan_response(json.loads(m.group(0)))
            scan["provider"] = prov
            # Store in deduplication cache
            put_dedup_cached_result(img_hash, scan)
            return scan
        except Exception as e:
            errors.append(f"{prov}: {type(e).__name__}")
            print(f"Provider {prov} failed:", repr(e)[:250])

    raise RuntimeError("All providers failed: " + "; ".join(errors))

def evaluate_hazards(scan: dict) -> List[str]:
    h = set(scan.get("hazards", []))
    for it in scan.get("items", []):
        c, k = it.get("component"), it.get("condition")
        if c == "li_ion_battery" and k == "swollen": h.add("swollen_battery")
        if k == "leaking" and c in ("li_ion_battery", "alkaline_battery"): h.add("leaking_battery")
        if c == "cfl_or_tube_light": h.add("mercury_lamp")
        if c == "crt_monitor_or_tv": h.add("crt_or_lead_glass")
        if c in ("lead_acid_battery", "ups_unit"): h.add("lead_acid_battery")
        if c in ("split_ac", "window_ac", "refrigerator"): h.add("refrigerant_gas")
    return sorted(h & HAZARDS)

def calculate_environmental_impact(items: list) -> dict:
    co2, energy, tot_wt = 0.0, 0.0, 0
    impact_factors = {
        "motherboard": (6.0, 8.0), "ram_stick": (5.0, 7.0), "mobile_pcb": (7.0, 9.0),
        "copper_wire": (3.5, 4.5), "copper_scrap": (4.0, 5.0), "aluminium_heatsink": (8.0, 11.0),
        "charger_adapter": (2.0, 3.0), "hard_drive": (4.0, 6.0), "power_supply": (3.0, 4.0),
        "printer": (2.5, 3.5), "crt_monitor_or_tv": (7.0, 10.0), "lcd_led_monitor_or_tv": (5.0, 7.5),
        "router_or_modem": (3.0, 4.0), "remote": (1.5, 2.0), "laptop": (5.0, 7.0),
        "desktop_cpu": (4.5, 6.5), "mobile_phone": (4.0, 6.0), "lead_acid_battery": (8.0, 12.0),
        "li_ion_battery": (6.0, 9.0), "alkaline_battery": (2.0, 3.0), "cfl_or_tube_light": (1.5, 2.0),
        "ups_unit": (5.0, 7.0), "split_ac": (18.0, 25.0), "window_ac": (15.0, 20.0),
        "refrigerator": (15.0, 20.0), "washing_machine": (10.0, 14.0), "microwave": (4.0, 6.0),
        "other": (2.0, 3.0),
    }
    for it in items:
        c = it.get("component", "other")
        wt = it.get("est_weight_g", 0) or 0
        tot_wt += wt
        if wt <= 0:
            defaults = {
                "laptop": 2200, "desktop_cpu": 6500, "mobile_phone": 180, "crt_monitor_or_tv": 12000,
                "lcd_led_monitor_or_tv": 4500, "motherboard": 350, "ram_stick": 30, "power_supply": 1200,
                "refrigerator": 45000, "split_ac": 35000, "washing_machine": 30000
            }
            wt = defaults.get(c, 200) * it.get("count", 1)
        fac = impact_factors.get(c, (2.0, 3.0))
        kg = wt / 1000.0
        co2 += kg * fac[0]
        energy += kg * fac[1]
    return {
        "co2_offset_kg": round(co2, 2),
        "energy_saved_kwh": round(energy, 2),
        "trees_equivalent": round(co2 / 20.0, 2),
        "total_weight_kg": round(tot_wt / 1000.0, 2),
    }

def run_pipeline(ctx: ScanContext) -> dict:
    """Executes the full deterministic assessment pipeline for a given ScanContext."""
    # 1. AI Analysis
    if MOCK:
        scan = json.loads(json.dumps(MOCK_SCAN))
        ctx.provider = "mock"
    else:
        scan = scan_with_resilience(ctx.image, ctx.fmt, ctx)
        ctx.provider = scan.get("provider", "")
    scan["low_confidence"] = scan["confidence"] < MIN_CONF
    ctx.scan = scan

    # Low confidence handling
    if scan["low_confidence"]:
        return {
            "type": "clarify",
            "scan": {"confidence": scan["confidence"]},
            "clarify_message": "The photo is too blurry or dark. Please take a closer, well-lit photo."
        }

    # 2. Pricing
    rows, lo_t, hi_t = [], 0.0, 0.0
    uw = ctx.user_weight_g
    items = scan.get("items", [])
    if uw:
        tot = sum(i["est_weight_g"] for i in items)
        for i in items:
            i["est_weight_g"] = round(uw * ((i["est_weight_g"] / tot) if tot > 0 else 1 / len(items)))

    for it in items:
        row = get_price_row(it["component"])
        basis = str(row.get("basis", "none"))
        priced = it["component"] not in NO_VALUE and basis in ("per_kg", "per_piece")
        if not priced:
            lo = hi = 0.0
        elif basis == "per_piece":
            lo, hi = float(row["min_inr"]) * it["count"], float(row["max_inr"]) * it["count"]
        else:
            kg = it["est_weight_g"] / 1000.0
            lo, hi = float(row["min_inr"]) * kg, float(row["max_inr"]) * kg
        lo, hi = round(lo, 2), round(hi, 2)
        lo_t, hi_t = lo_t + lo, hi_t + hi
        rows.append({
            "component": it["component"], "condition": it["condition"], "count": it["count"],
            "est_weight_g": it["est_weight_g"], "min_inr": lo, "max_inr": hi,
            "hazardous": it["component"] in NO_VALUE, "priced": priced, "basis": basis,
            "confidence": str(row.get("confidence", "")), "source": str(row.get("source", "")),
            "checked_date": str(row.get("checked_date", "")),
            "sources": [{"name": str(x.get("name", "")), "value": str(x.get("value", "")), "date": str(x.get("date", ""))} for x in row.get("sources", [])]
        })
    ctx.unpriced = sum(1 for r in rows if not r["priced"] and not r["hazardous"])
    ctx.line_items, ctx.totals = rows, (round(lo_t, 2), round(hi_t, 2))

    # 3. Safety Text
    ctx.hazards = [
        {"hazard_code": c, "message": HAZARD_MESSAGES[c].get(ctx.lang, HAZARD_MESSAGES[c]["en"])}
        for c in evaluate_hazards(scan)
    ]

    # 4. Nearest Recyclers
    recyclers_out = []
    points_out = []
    if ctx.lat is not None and ctx.lon is not None:
        for r in load_all_recyclers():
            if r.get("lat") is None or r.get("lon") is None:
                continue
            try:
                rlat = float(r["lat"])
                rlon = float(r["lon"])
            except (ValueError, TypeError):
                continue
            d = calculate_distance_km(ctx.lat, ctx.lon, rlat, rlon)
            kind = r.get("kind", "recycler")
            dest_parts = [p for p in (r.get("name"), r.get("address"), r.get("city"), r.get("state")) if p]
            dest_query = urllib.parse.quote(", ".join(dest_parts)) if dest_parts else f"{rlat},{rlon}"
            item = {
                "id": r.get("id"),
                "name": r.get("name"),
                "address": r.get("address"),
                "city": r.get("city"),
                "state": r.get("state"),
                "kind": kind,
                "distance_km": round(d, 2),
                "directions_url": f"https://www.google.com/maps/dir/?api=1&destination={dest_query}"
            }
            if kind == "collection_point":
                if r.get("toll_free"): item["toll_free"] = str(r["toll_free"])
                if r.get("notes"): item["notes"] = str(r["notes"])
                points_out.append(item)
            else:
                if r.get("capacity_mta") is not None:
                    try:
                        item["capacity_mta"] = float(r["capacity_mta"])
                    except (ValueError, TypeError):
                        pass
                recyclers_out.append(item)
        recyclers_out.sort(key=lambda x: x["distance_km"])
        points_out.sort(key=lambda x: x["distance_km"])

    ctx.recyclers = recyclers_out[:4]
    ctx.collection_points = points_out[:4]

    # 5. Assemble Final Result
    lo, hi = ctx.totals
    result = {
        "type": "result",
        "scan": ctx.scan,
        "line_items": ctx.line_items,
        "total_min_inr": lo,
        "total_max_inr": hi,
        "hazard_messages": ctx.hazards,
        "recyclers": ctx.recyclers,
        "collection_points": ctx.collection_points,
        "general_warning": GENERAL.get(ctx.lang, GENERAL["en"]),
        "disclaimer": DISCLAIMER,
        "provider": ctx.provider,
        "unpriced_items": ctx.unpriced,
        "user_weight_provided": ctx.user_weight_g is not None,
        "environmental_impact": calculate_environmental_impact(ctx.line_items),
    }
    if MOCK:
        result["mock"] = True

    # 6. Save lot record (anonymous, rounded coordinates)
    if LOTS_TABLE and not ctx.no_save:
        lot = {
            "id": uuid.uuid4().hex[:10],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "status": "scanned",
            "mock": bool(MOCK),
            "provider": ctx.provider,
            "items": [{k: i[k] for k in ("component", "count", "est_weight_g", "min_inr", "max_inr")} for i in result["line_items"]],
            "hazards": [h["hazard_code"] for h in result["hazard_messages"]],
            "total_min_inr": result["total_min_inr"],
            "total_max_inr": result["total_max_inr"],
            "expires_at": int((datetime.now(timezone.utc) + timedelta(days=30)).timestamp())
        }
        if ctx.lat is not None and ctx.lon is not None:
            lot["cell_lat"], lot["cell_lon"] = round(ctx.lat, 2), round(ctx.lon, 2)
        try:
            t = _get_table(LOTS_TABLE)
            if t:
                t.put_item(Item=json.loads(json.dumps(lot), parse_float=Decimal))
                result["lot_id"] = lot["id"]
                _update_aggregates(lot)
        except Exception as e:
            print("Lot save error:", repr(e))

    return result


def _update_aggregates(lot: dict):
    """Atomically increment pre-aggregated summary and cell counters in AggregatesTable."""
    tbl_name = AGGREGATES_TABLE or os.environ.get("AGGREGATES_TABLE", "")
    if not tbl_name or lot.get("mock"):
        return
    try:
        t = _get_table(tbl_name)
        if not t:
            return
        total_items = sum(int(i.get("count", 1)) for i in lot.get("items", []))
        total_weight_g = sum(float(i.get("est_weight_g", 0)) for i in lot.get("items", []))
        hazard_count = len(lot.get("hazards", []))
        val_min = int(lot.get("total_min_inr", 0))
        val_max = int(lot.get("total_max_inr", 0))

        # 1. Atomic increment on summary#all
        t.update_item(
            Key={"id": "summary#all"},
            UpdateExpression="SET aggregate_type = :atype ADD total_lots :one, total_items :items, total_weight_g :wg, hazard_lots :hz, value_min_inr :vmin, value_max_inr :vmax",
            ExpressionAttributeValues={
                ":atype": "summary",
                ":one": 1,
                ":items": total_items,
                ":wg": Decimal(str(round(total_weight_g, 2))),
                ":hz": 1 if hazard_count > 0 else 0,
                ":vmin": val_min,
                ":vmax": val_max,
            }
        )

        # 2. Atomic increment on geographic cell
        cell_lat = lot.get("cell_lat")
        cell_lon = lot.get("cell_lon")
        if cell_lat is not None and cell_lon is not None:
            cell_id = f"cell#{cell_lat}#{cell_lon}"
            t.update_item(
                Key={"id": cell_id},
                UpdateExpression="SET aggregate_type = :atype, lat = :lat, lon = :lon ADD lot_count :one, item_count :items, hazard_count :hz",
                ExpressionAttributeValues={
                    ":atype": "cell",
                    ":lat": Decimal(str(cell_lat)),
                    ":lon": Decimal(str(cell_lon)),
                    ":one": 1,
                    ":items": total_items,
                    ":hz": hazard_count,
                }
            )
    except Exception as exc:
        print("Aggregates update error:", repr(exc))


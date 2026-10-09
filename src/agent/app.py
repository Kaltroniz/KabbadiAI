"""KabadiAI POST /agent.
Facts (prices, hazard text, recyclers) come from tables and fixed text, never from the model.
The model only reads the photo. Tools take no data arguments, so the agent cannot corrupt numbers.
AGENT_MODE=1 lets a Strands agent choose the order of steps; default (0) runs the same steps
deterministically. API Gateway HTTP APIs cut requests at 30 s, so measure agent latency first."""
import base64, json, math, os, re, uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import boto3

MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "us.amazon.nova-2-lite-v1:0")
MOCK = os.environ.get("MOCK_ANALYSIS", "0") == "1"
AGENT_MODE = os.environ.get("AGENT_MODE", "0") == "1"
PRICES_TABLE = os.environ.get("PRICES_TABLE", "")
RECYCLERS_TABLE = os.environ.get("RECYCLERS_TABLE", "")
LOTS_TABLE = os.environ.get("LOTS_TABLE", "")
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
        if c == "crt_monitor_or_tv": h.add("crt_or_lead_glass")
        if c in ("lead_acid_battery", "ups_unit"): h.add("lead_acid_battery")
        if c in ("split_ac", "window_ac", "refrigerator"): h.add("refrigerant_gas")
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

def _save_lot(res):
    """Store an anonymous lot record (no names or numbers; location rounded to ~1 km). Never breaks the response."""
    if not LOTS_TABLE or res.get("type") != "result":
        return None
    lat, lon = CTX.get("lat"), CTX.get("lon")
    lot = {"id": uuid.uuid4().hex[:10], "created_at": datetime.now(timezone.utc).isoformat(), "status": "scanned",
           "mock": bool(MOCK), "items": [{k: i[k] for k in ("component", "count", "est_weight_g", "min_inr", "max_inr")} for i in res["line_items"]],
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

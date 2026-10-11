"""KabadiAI POST /agent.
Facts (prices, hazard text, recyclers) come from tables and fixed text, never from the model.
The model only reads the photo. Tools take no data arguments, so the agent cannot corrupt numbers.
AGENT_MODE=1 lets a Strands agent choose the order of steps; default (0) runs the same steps
deterministically. API Gateway HTTP APIs cut requests at 30 s, so measure agent latency first."""
import base64, json, math, os, re, time, urllib.parse, urllib.request, uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import boto3

MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "amazon.nova-2-lite-v1:0")
MOCK = os.environ.get("MOCK_ANALYSIS", "0") == "1"
AGENT_MODE = os.environ.get("AGENT_MODE", "0") == "1"
PRICES_TABLE = os.environ.get("PRICES_TABLE", "")
RECYCLERS_TABLE = os.environ.get("RECYCLERS_TABLE", "")
LOTS_TABLE = os.environ.get("LOTS_TABLE", "")
AGGREGATES_TABLE = os.environ.get("AGGREGATES_TABLE", "")
PROVIDER_ORDER = [x.strip() for x in os.environ.get("PROVIDER_ORDER", "gemini,bedrock").split(",") if x.strip()]
GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash")  # confirm the exact id in Google AI Studio
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
_ssm = None

def _get_ssm_client():
    global _ssm
    if not _ssm:
        _ssm = boto3.client("ssm")
    return _ssm

_CACHED_SECRETS = {}
def _get_secret(val):
    if not val:
        return ""
    if val in _CACHED_SECRETS:
        return _CACHED_SECRETS[val]
    if val.startswith("/") or val.startswith("arn:aws:ssm:"):
        try:
            res = _get_ssm_client().get_parameter(Name=val, WithDecryption=True)
            secret = res["Parameter"]["Value"]
            _CACHED_SECRETS[val] = secret
            return secret
        except Exception as e:
            print(f"SSM get_parameter failed for {val}:", repr(e))
            return val
    _CACHED_SECRETS[val] = val
    return val

def _gemini_key():
    return _get_secret(GEMINI_KEY or os.environ.get("GEMINI_API_KEY", ""))

def _table(name):
    global _ddb
    _ddb = _ddb or boto3.resource("dynamodb")
    return _ddb.Table(name)

# Module-level TTL caches for near-zero latency and high throughput
_CACHE = {
    "prices": {},          # component -> item dict
    "prices_expiry": 0.0,
    "recyclers": [],       # list of recyclers
    "recyclers_expiry": 0.0,
}
PRICES_CACHE_TTL = 300     # 5 minutes
RECYCLERS_CACHE_TTL = 600  # 10 minutes

def _load_all_prices():
    now = time.time()
    if _CACHE["prices"] and now < _CACHE["prices_expiry"]:
        return _CACHE["prices"]
    if not PRICES_TABLE:
        return _CACHE["prices"]
    try:
        items = _table(PRICES_TABLE).scan().get("Items", [])
        if items:
            _CACHE["prices"] = {it.get("component"): it for it in items if it.get("component")}
            _CACHE["prices_expiry"] = now + PRICES_CACHE_TTL
    except Exception as e:
        print("Prices cache preload warning:", repr(e))
    return _CACHE["prices"]

def _price_row(comp):
    prices = _load_all_prices()
    row = prices.get(comp) or prices.get("other")
    if row:
        return row
    if not PRICES_TABLE:
        return {"basis": "none"}
    try:
        t = _table(PRICES_TABLE)
        return t.get_item(Key={"component": comp}).get("Item") or t.get_item(Key={"component": "other"}).get("Item") or {"basis": "none"}
    except Exception:
        return {"basis": "none"}

def _all_recyclers():
    now = time.time()
    if _CACHE["recyclers"] and now < _CACHE["recyclers_expiry"]:
        return _CACHE["recyclers"]
    if not RECYCLERS_TABLE:
        return _CACHE["recyclers"]
    try:
        # Use projection expression to only pull fields required by distance calculation & map links
        items = _table(RECYCLERS_TABLE).scan(
            ProjectionExpression="id, #n, address, city, #s, kind, lat, lon, toll_free, capacity_mta, notes",
            ExpressionAttributeNames={"#n": "name", "#s": "state"}
        ).get("Items", [])
        if items:
            _CACHE["recyclers"] = items
            _CACHE["recyclers_expiry"] = now + RECYCLERS_CACHE_TTL
    except Exception as e:
        print("Recyclers cache preload warning:", repr(e))
    return _CACHE["recyclers"]

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

def _text_bedrock(img, fmt, timeout=15):
    from botocore.config import Config
    client = boto3.client("bedrock-runtime", config=Config(read_timeout=max(3, int(timeout)), connect_timeout=5, retries={"max_attempts": 1}))
    r = client.converse(modelId=MODEL_ID, messages=[{"role": "user", "content": [
        {"image": {"format": fmt, "source": {"bytes": img}}}, {"text": PROMPT}]}], inferenceConfig={"maxTokens": 1000})
    return r["output"]["message"]["content"][0]["text"]

def _text_gemini(img, mime, timeout=18):
    body = {"contents": [{"parts": [{"inline_data": {"mime_type": mime, "data": base64.b64encode(img).decode()}}, {"text": PROMPT}]}],
            "generationConfig": {"responseMimeType": "application/json", "temperature": 0, "maxOutputTokens": 1500}}
    last_err = None
    for model_name in (GEMINI_MODEL, "gemini-flash-latest"):
        for attempt in range(2):
            try:
                g_key = _gemini_key()
                req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent",
                                             json.dumps(body).encode(), {"Content-Type": "application/json", "x-goog-api-key": g_key})
                with urllib.request.urlopen(req, timeout=max(3, timeout)) as r:
                    return json.load(r)["candidates"][0]["content"]["parts"][0]["text"]
            except urllib.error.HTTPError as e:
                last_err = e
                if e.code in (503, 429, 500) and attempt == 0:
                    time.sleep(0.6)
                    continue
                break
            except Exception as e:
                last_err = e
                break
    raise last_err or RuntimeError("Gemini failed")

try:
    from src.agent.resilience import GEMINI_BREAKER, compute_image_hash, get_dedup_cached_result, put_dedup_cached_result
except (ImportError, ValueError):
    try:
        from .resilience import GEMINI_BREAKER, compute_image_hash, get_dedup_cached_result, put_dedup_cached_result
    except (ImportError, ValueError):
        from resilience import GEMINI_BREAKER, compute_image_hash, get_dedup_cached_result, put_dedup_cached_result

def _scan_with_providers(img, fmt):
    """Tries each provider in PROVIDER_ORDER; the first valid answer wins. Records which one answered."""
    # Deduplication cache check
    img_hash = compute_image_hash(img, CTX.get("lang", "en"), CTX.get("user_weight_g"))
    cached = get_dedup_cached_result(img_hash)
    if cached:
        scan = json.loads(json.dumps(cached))
        scan["provider"] = "cache_dedup"
        return scan

    errors = []
    for prov in PROVIDER_ORDER:
        left = CTX.get("deadline", time.time() + 24) - time.time()
        if left < 4:  # not enough time for another attempt: fail in a controlled way before Lambda is killed
            errors.append(f"{prov}: skipped, out of time")
            break
        try:
            if prov == "gemini":
                g_key = _gemini_key()
                if not g_key: raise RuntimeError("no gemini key set")
                def _do_gemini():
                    return _text_gemini(img, "image/" + fmt, min(15, left - 1))
                def _fallback_bedrock():
                    return _text_bedrock(img, fmt, min(12, left - 1))
                text = GEMINI_BREAKER.execute(_do_gemini, fallback_fn=_fallback_bedrock)
            elif prov == "bedrock":
                text = _text_bedrock(img, fmt, min(15, left - 1))
            else:
                continue
            m = re.search(r"\{.*\}", text, re.S)
            scan = _clean(json.loads(m.group(0)))
            scan["provider"] = prov
            put_dedup_cached_result(img_hash, scan)
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

import contextvars

_ctx_store = contextvars.ContextVar("agent_ctx", default=None)

class _ContextProxy(dict):
    """Request-scoped dictionary proxy for thread-safety and concurrency protection."""
    def _d(self):
        d = _ctx_store.get()
        if d is None:
            d = {}
            _ctx_store.set(d)
        return d
    def __getitem__(self, k): return self._d()[k]
    def __setitem__(self, k, v): self._d()[k] = v
    def __delitem__(self, k): del self._d()[k]
    def get(self, k, default=None): return self._d().get(k, default)
    def __contains__(self, k): return k in self._d()
    def setdefault(self, k, default=None): return self._d().setdefault(k, default)
    def update(self, *args, **kwargs): return self._d().update(*args, **kwargs)
    def clear(self): self._d().clear()

CTX = _ContextProxy()

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
    uw = CTX.get("user_weight_g")          # validate 1..2_000_000 in the handler
    if uw:
        items = CTX["scan"]["items"]
        tot = sum(i["est_weight_g"] for i in items)
        for i in items:
            i["est_weight_g"] = round(uw * ((i["est_weight_g"] / tot) if tot > 0 else 1 / len(items)))
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
    CTX["unpriced"] = sum(1 for r in rows if not r["priced"] and not r["hazardous"])
    CTX["line_items"], CTX["totals"] = rows, (round(lo_t, 2), round(hi_t, 2))
    return {"total_min_inr": CTX["totals"][0], "total_max_inr": CTX["totals"][1]}

def _safety():
    lang = CTX["lang"]
    CTX["hazards"] = [{"hazard_code": c, "message": HAZARD_MESSAGES[c].get(lang, HAZARD_MESSAGES[c]["en"])}
                      for c in _hazards(CTX["scan"])]
    return {"hazards_found": len(CTX["hazards"])}

def _recyclers():
    lat, lon = CTX.get("lat"), CTX.get("lon")
    recyclers_out = []
    points_out = []
    if lat is not None and lon is not None:
        for r in _all_recyclers():
            if r.get("lat") is None or r.get("lon") is None:
                continue
            try:
                rlat = float(r["lat"])
                rlon = float(r["lon"])
            except (ValueError, TypeError):
                continue
            d = _km(lat, lon, rlat, rlon)
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
                if r.get("toll_free"):
                    item["toll_free"] = str(r["toll_free"])
                if r.get("notes"):
                    item["notes"] = str(r["notes"])
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

    CTX["recyclers"] = recyclers_out[:4]
    CTX["collection_points"] = points_out[:4]
    return {"recyclers_found": len(CTX["recyclers"]), "collection_points_found": len(CTX["collection_points"])}

def _calc_impact(items):
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
            defaults = {"laptop": 2200, "desktop_cpu": 6500, "mobile_phone": 180, "crt_monitor_or_tv": 12000,
                        "lcd_led_monitor_or_tv": 4500, "motherboard": 350, "ram_stick": 30, "power_supply": 1200,
                        "refrigerator": 45000, "split_ac": 35000, "washing_machine": 30000}
            wt = defaults.get(c, 200) * it.get("count", 1)
        fac = impact_factors.get(c, (2.0, 3.0))
        kg = wt / 1000.0
        co2 += kg * fac[0]
        energy += kg * fac[1]
    return {
        "co2_offset_kg": round(co2, 2),
        "energy_saved_kwh": round(energy, 2),
        "trees_equivalent": round(co2 / 20.0, 2),
        "total_weight_kg": round(tot_wt / 1000.0, 2)
    }

def _finish():
    lo, hi = CTX["totals"]
    res = {"type": "result", "scan": CTX["scan"], "line_items": CTX["line_items"], "total_min_inr": lo,
           "total_max_inr": hi, "hazard_messages": CTX["hazards"], "recyclers": CTX["recyclers"],
           "collection_points": CTX.get("collection_points", []),
           "general_warning": GENERAL.get(CTX["lang"], GENERAL["en"]), "disclaimer": DISCLAIMER, "provider": CTX.get("provider"), "unpriced_items": CTX.get("unpriced", 0),
           "user_weight_provided": CTX.get("user_weight_g") is not None,
           "environmental_impact": _calc_impact(CTX["line_items"])}
    CTX["result"] = res
    return "Result assembled."

def _save_lot(res):
    """Store an anonymous lot record (no names or numbers; location rounded to ~1 km). Never breaks the response."""
    if not LOTS_TABLE or CTX.get("no_save") or res.get("type") != "result":
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
        _update_aggregates(lot)
        return lot["id"]
    except Exception as e:
        print("lot save failed:", repr(e))
        return None

def _update_aggregates(lot):
    """Atomically increment pre-aggregated summary and cell counters in AggregatesTable."""
    tbl_name = AGGREGATES_TABLE or os.environ.get("AGGREGATES_TABLE", "")
    if not tbl_name or lot.get("mock"):
        return
    try:
        t = _table(tbl_name)
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
        user_wt = int(b["user_weight_g"]) if b.get("user_weight_g") is not None else None
        if user_wt is not None and not (1 <= user_wt <= 2_000_000):
            return _json(400, {"error": "bad weight"})
        _ctx_store.set({
            "image": img, "fmt": fmt, "lat": lat, "lon": lon, "user_weight_g": user_wt,
            "lang": str(b.get("language", "en"))[:5], "no_save": b.get("no_save") is True,
            "deadline": time.time() + (context.get_remaining_time_in_millis() / 1000 if context else 29) - 5
        })
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

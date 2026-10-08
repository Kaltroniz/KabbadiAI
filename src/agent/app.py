"""KabadiAI Strands agent — POST /agent

This is the agentic entry point.  The agent receives a base64 image (and
optionally a user weight correction or dealer offer) and coordinates five
tools to produce a structured triage result.

Confidence gate: if the scan confidence is below 70, the agent returns a
clarify response immediately, asking for a better photo.  It does NOT guess.

All hazard text comes from a fixed reviewed table (HAZARD_MESSAGES).
Facts (prices, disposal protocols) come from DynamoDB.  The model is never
asked to produce price estimates, legal claims, or safety text.

Request body:
    {
        "image_b64": "<base64>",
        "media_type": "image/jpeg" | "image/png" | "image/webp",
        "lat": <optional float>,
        "lon": <optional float>,
        "dealer_offer_inr": <optional float>,
        "language": "en" | "hi" | ...  (default "en")
    }

Response 200:
    {
        "type": "result" | "clarify",
        "scan": { ... },           # only when type=result
        "line_items": [ ... ],     # only when type=result
        "total_min_inr": <float>,  # only when type=result
        "total_max_inr": <float>,  # only when type=result
        "hazards": [ ... ],        # only when type=result
        "recyclers": [ ... ],      # only when type=result and lat/lon provided
        "verdict": "low"|"fair"|"high",  # only when dealer_offer_inr supplied
        "clarify_message": "...",  # only when type=clarify
        "disclaimer": "..."
    }

Errors: 400 (bad request), 502 (analysis/agent error).
"""
import base64, json, os, sys
import boto3

# ── Environment ───────────────────────────────────────────────────────────────
BEDROCK_MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "us.amazon.nova-2-lite-v1:0")
MOCK_ANALYSIS    = os.environ.get("MOCK_ANALYSIS", "0") == "1"
PRICES_TABLE     = os.environ.get("PRICES_TABLE", "")
RECYCLERS_TABLE  = os.environ.get("RECYCLERS_TABLE", "")

CONFIDENCE_THRESHOLD = 70
MAX_IMAGE_BYTES      = 4_000_000

MEDIA = {"image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp"}

COMPONENTS = {
    "motherboard", "ram_stick", "mobile_pcb", "li_ion_battery", "alkaline_battery",
    "copper_wire", "charger_adapter", "hard_drive", "aluminium_heatsink",
    "screen", "cfl_or_tube_light", "router_or_modem", "remote", "other",
}
CONDITIONS = {"intact", "corroded", "swollen", "leaking", "broken", "unknown"}
HAZARDS_ENUM = {"swollen_battery", "leaking_battery", "mercury_lamp", "crt_or_lead_glass"}
HAZARDOUS_COMPONENTS = {"li_ion_battery", "alkaline_battery", "cfl_or_tube_light"}

DISCLAIMER = (
    "Indicative only. Prices vary by condition, market, and date. "
    "Data covers Delhi-NCR authorized recyclers only (DPCC/CPCB 2023). "
    "Verify before acting on any value or recycler listing."
)

# ── Fixed, reviewed hazard messages (never model-generated) ──────────────────
# KEY RULE: this text must be reviewed by a native speaker before the demo.
# Safety text must NOT go through machine translation.
HAZARD_MESSAGES = {
    "swollen_battery": {
        "en": "DANGER: swollen lithium battery. Do not burn, puncture or crush.",
        "hi": "Khatra: Lithium battery phool gayi hai. Ise jalaayein, chhedein ya dabaayen nahi.",
    },
    "leaking_battery": {
        "en": "Leaking battery. Do not touch with bare hands. Keep it separate.",
        "hi": "Battery se liquid aa raha hai. Khali haathon se mat chhoein. Alag rakhein.",
    },
    "mercury_lamp": {
        "en": "Contains mercury. Do not break the tube or bulb.",
        "hi": "Isme mercury hai. Tube ya bulb mat todein.",
    },
    "crt_or_lead_glass": {
        "en": "Hazardous: lead glass. Do not break open.",
        "hi": "Khatarnaak: lead glass. Ise mat todein.",
    },
}
GENERAL_WARNING = {
    "en": "Never burn circuit boards or use acid to extract metal.",
    "hi": "Circuit boards kabhi mat jalaayein aur dhaatu nikaalane ke liye acid ka upyog mat karein.",
}

# ── DynamoDB helpers ──────────────────────────────────────────────────────────
_ddb_resource = None

def _ddb():
    global _ddb_resource
    if _ddb_resource is None:
        _ddb_resource = boto3.resource("dynamodb")
    return _ddb_resource


def _get_price_row(component: str) -> dict:
    table = _ddb().Table(PRICES_TABLE)
    item = table.get_item(Key={"component": component}).get("Item")
    if not item:
        item = table.get_item(Key={"component": "other"}).get("Item", {
            "component": "other", "min_inr_per_kg": 0, "max_inr_per_kg": 10,
            "source": "fallback", "checked_date": "unknown",
        })
    return item


def _scan_all_recyclers() -> list:
    table = _ddb().Table(RECYCLERS_TABLE)
    return table.scan().get("Items", [])


# ── Bedrock scan (mirrors src/scan/app.py but inline for the agent) ───────────
import re

SCAN_PROMPT = f"""You assess photographed discarded electronics for a household in India.
Return ONLY one JSON object, no prose, in this shape:
{{"items":[{{"component":<one of {sorted(COMPONENTS)}>,\"condition\":<one of {sorted(CONDITIONS)}>,\"count\":<int>,\"est_weight_g\":<int>}}],
 "hazards":[<subset of {sorted(HAZARDS_ENUM)}>],
 "confidence":<0-100>,
 "notes":"<short, plain English>"}}
Rules: list only what you can actually see. If the photo is blurry, dark or items are hidden, lower the confidence.
Flag swollen_battery only if a battery visibly bulges. Never guess hidden parts."""


def _extract_json(text: str) -> dict:
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        raise ValueError("no json in model output")
    return json.loads(m.group(0))


def _clean_scan(raw: dict) -> dict:
    items = []
    for it in raw.get("items", [])[:20]:
        comp = it.get("component") if it.get("component") in COMPONENTS else "other"
        cond = it.get("condition") if it.get("condition") in CONDITIONS else "unknown"
        items.append({"component": comp, "condition": cond,
                       "count": max(1, int(it.get("count", 1) or 1)),
                       "est_weight_g": max(0, int(it.get("est_weight_g", 0) or 0))})
    hazards = [h for h in raw.get("hazards", []) if h in HAZARDS_ENUM]
    conf = max(0, min(100, int(raw.get("confidence", 0) or 0)))
    return {"items": items, "hazards": hazards, "confidence": conf,
            "notes": str(raw.get("notes", ""))[:300]}


def _bedrock_scan(image_bytes: bytes, fmt: str) -> dict:
    bedrock = boto3.client("bedrock-runtime")
    for _ in range(2):
        try:
            r = bedrock.converse(
                modelId=BEDROCK_MODEL_ID,
                messages=[{"role": "user", "content": [
                    {"image": {"format": fmt, "source": {"bytes": image_bytes}}},
                    {"text": SCAN_PROMPT},
                ]}],
                inferenceConfig={"maxTokens": 1000},
            )
            text = r["output"]["message"]["content"][0]["text"]
            return _clean_scan(_extract_json(text))
        except (ValueError, KeyError, TypeError):
            continue
        except Exception as e:
            print("bedrock error:", repr(e))
            raise
    raise RuntimeError("model returned unparseable output after retries")


# ── Haversine distance ────────────────────────────────────────────────────────
import math

def _haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


# ── Strands tools ─────────────────────────────────────────────────────────────
# Import is conditional so the Lambda can still boot (and fail gracefully)
# if strands-agents is not yet installed.
try:
    from strands import Agent, tool as strands_tool
    STRANDS_AVAILABLE = True
except ImportError:
    STRANDS_AVAILABLE = False
    # Stub decorator so the module still imports cleanly in tests
    def strands_tool(fn):
        return fn


# Shared state per-invocation — populated by the handler before calling the agent
_invocation_ctx: dict = {}


@strands_tool
def analyze_image() -> dict:
    """Analyse the photographed e-waste using Amazon Bedrock vision.

    Identifies components, their condition, approximate weight and any hazards
    visible in the image.  If confidence is below 70 the result includes
    a low_confidence flag and the agent MUST call request_clarification next
    instead of proceeding to price or recycler lookup.

    Returns a scan result dict with keys: items, hazards, confidence, notes,
    and optionally low_confidence (bool).
    """
    ctx = _invocation_ctx
    if ctx.get("mock"):
        scan = {
            "items": [
                {"component": "motherboard",    "condition": "corroded", "count": 1, "est_weight_g": 320},
                {"component": "copper_wire",    "condition": "intact",   "count": 3, "est_weight_g":  90},
                {"component": "li_ion_battery", "condition": "swollen",  "count": 1, "est_weight_g": 150},
            ],
            "hazards": ["swollen_battery"],
            "confidence": 85,
            "notes": "MOCK DATA – Bedrock not called.",
        }
    else:
        scan = _bedrock_scan(ctx["image_bytes"], ctx["fmt"])

    if scan["confidence"] < CONFIDENCE_THRESHOLD:
        scan["low_confidence"] = True
    ctx["scan"] = scan
    return scan


@strands_tool
def request_clarification() -> dict:
    """Ask the user for a better photo because confidence is too low to proceed.

    Call this ONLY when analyze_image returned low_confidence=True.
    Never guess components or prices when confidence is below the threshold.

    Returns a clarify response dict.
    """
    return {
        "type": "clarify",
        "clarify_message": (
            "The photo is too blurry or dark to identify the items reliably. "
            "Please take a closer, well-lit photo and try again."
        ),
    }


@strands_tool
def fetch_indicative_price(component: str, count: int, est_weight_g: int) -> dict:
    """Look up the indicative scrap value for one component from the price table.

    Args:
        component: One of the known component enum values.
        count: Number of units of this component.
        est_weight_g: Estimated weight in grams.

    Returns a dict with min_inr, max_inr, hazardous flag, source note and
    checked_date.  Hazardous items return min_inr=0 and max_inr=0.
    """
    if component not in COMPONENTS:
        component = "other"
    row = _get_price_row(component)
    min_pkg = float(row.get("min_inr_per_kg", 0))
    max_pkg = float(row.get("max_inr_per_kg", 0))
    weight_kg = max(0, int(est_weight_g)) / 1000.0
    item_min = round(min_pkg * weight_kg * count, 2)
    item_max = round(max_pkg * weight_kg * count, 2)
    return {
        "component":    component,
        "count":        count,
        "est_weight_g": est_weight_g,
        "min_inr":      item_min,
        "max_inr":      item_max,
        "hazardous":    component in HAZARDOUS_COMPONENTS,
        "source":       str(row.get("source", "")),
        "checked_date": str(row.get("checked_date", "")),
    }


@strands_tool
def fetch_disposal_protocol(hazard_code: str, language: str = "en") -> dict:
    """Return the fixed, reviewed safety message for a hazard code.

    IMPORTANT: This returns text from a fixed reviewed table.  Never
    paraphrase or translate this text through the model.  Native speakers
    must review all translations before the demo.

    Args:
        hazard_code: One of swollen_battery, leaking_battery, mercury_lamp,
                     crt_or_lead_glass.
        language: BCP-47 language code, default "en".  Falls back to "en"
                  if the requested language is not in the table.

    Returns a dict with hazard_code, message (fixed text), and general_warning.
    """
    if hazard_code not in HAZARD_MESSAGES:
        return {"hazard_code": hazard_code, "message": None, "general_warning": None}
    msgs = HAZARD_MESSAGES[hazard_code]
    lang = language if language in msgs else "en"
    general = GENERAL_WARNING.get(lang, GENERAL_WARNING["en"])
    return {
        "hazard_code":     hazard_code,
        "message":         msgs[lang],
        "general_warning": general,
    }


@strands_tool
def find_recyclers(lat: float, lon: float) -> list:
    """Find up to 5 nearest authorized e-waste recyclers sorted by distance.

    Args:
        lat: User latitude in decimal degrees.
        lon: User longitude in decimal degrees.

    Returns a list of recycler dicts with id, name, address, city,
    distance_km and directions_url.  Coverage is Delhi-NCR only.
    """
    all_r = _scan_all_recyclers()
    enriched = []
    for r in all_r:
        dist = _haversine_km(lat, lon, float(r["lat"]), float(r["lon"]))
        enriched.append({
            "id":             r["id"],
            "name":           r["name"],
            "address":        r["address"],
            "city":           r["city"],
            "distance_km":    round(dist, 2),
            "directions_url": f"https://maps.google.com/maps?daddr={r['lat']},{r['lon']}&saddr={lat},{lon}",
        })
    enriched.sort(key=lambda x: x["distance_km"])
    return enriched[:5]


@strands_tool
def build_share_summary(
    scan: dict,
    line_items: list,
    total_min_inr: float,
    total_max_inr: float,
    hazard_messages: list,
) -> dict:
    """Assemble the final structured result that the frontend will render.

    Args:
        scan: The clean scan dict from analyze_image.
        line_items: Priced line items from fetch_indicative_price calls.
        total_min_inr: Sum of min values across all items.
        total_max_inr: Sum of max values across all items.
        hazard_messages: List of dicts from fetch_disposal_protocol calls.

    Returns the final result dict to be returned to the frontend.
    """
    return {
        "type":          "result",
        "scan":          scan,
        "line_items":    line_items,
        "total_min_inr": round(total_min_inr, 2),
        "total_max_inr": round(total_max_inr, 2),
        "hazard_messages": hazard_messages,
        "disclaimer":    DISCLAIMER,
    }


# ── Agent system prompt ───────────────────────────────────────────────────────
SYSTEM_PROMPT = """You are KabadiAI, an assistant that helps Indian households
understand the value and hazards of their discarded electronics (e-waste).

Follow this exact sequence every time:
1. Call analyze_image to identify items and hazards.
2. If analyze_image returns low_confidence=true, call request_clarification
   immediately and stop. Do not guess values or components.
3. For each item returned:
   a. If the component is valuable (min_inr_per_kg > 0), call fetch_indicative_price.
   b. If the component is hazardous (li_ion_battery, alkaline_battery,
      cfl_or_tube_light), call fetch_disposal_protocol for each hazard code.
4. For each hazard in the scan result, call fetch_disposal_protocol.
5. If lat/lon are available, call find_recyclers.
6. Call build_share_summary with the collected data and return its result.

Rules:
- Never invent prices, weights, or component names.
- Never produce safety text yourself — always use fetch_disposal_protocol.
- Never claim official valuations, government endorsement, or EPR subsidies.
- Always label values as indicative.
- Data covers Delhi-NCR recyclers only. Say so when recyclers are returned."""


# ── Fallback: non-agent path (used when strands not available) ────────────────
def _run_direct(ctx: dict) -> dict:
    """Direct (non-agent) execution path used as fallback or in mock mode.

    Calls each tool function directly in the correct sequence without a
    Strands agent.  Produces the same output schema.
    """
    scan = analyze_image()

    if scan.get("low_confidence"):
        return request_clarification()

    line_items = []
    total_min, total_max = 0.0, 0.0
    hazard_msgs = []
    language = ctx.get("language", "en")

    for it in scan["items"]:
        priced = fetch_indicative_price(it["component"], it["count"], it["est_weight_g"])
        line_items.append(priced)
        total_min += priced["min_inr"]
        total_max += priced["max_inr"]

    for hazard_code in scan["hazards"]:
        msg = fetch_disposal_protocol(hazard_code, language)
        hazard_msgs.append(msg)

    result = build_share_summary(scan, line_items, total_min, total_max, hazard_msgs)

    if ctx.get("lat") and ctx.get("lon"):
        result["recyclers"] = find_recyclers(ctx["lat"], ctx["lon"])

    dealer = ctx.get("dealer_offer_inr")
    if dealer is not None:
        if dealer < total_min:
            verdict = "low"
        elif dealer > total_max:
            verdict = "high"
        else:
            verdict = "fair"
        result["verdict"] = verdict

    return result


# ── Lambda handler ────────────────────────────────────────────────────────────
def _json(status: int, body: dict) -> dict:
    return {"statusCode": status,
            "headers": {"content-type": "application/json"},
            "body": json.dumps(body)}


def handler(event, context):
    # ── Parse request ─────────────────────────────────────────────────────────
    try:
        raw_body = event.get("body") or "{}"
        if event.get("isBase64Encoded"):
            raw_body = base64.b64decode(raw_body).decode()
        body = json.loads(raw_body)

        if not MOCK_ANALYSIS:
            fmt = MEDIA.get(body.get("media_type", "image/jpeg"))
            if not fmt:
                return _json(400, {"error": "unsupported image type"})
            image_bytes = base64.b64decode(body["image_b64"])
            if len(image_bytes) > MAX_IMAGE_BYTES:
                return _json(400, {"error": "image too large; resize before upload"})
        else:
            fmt = "jpeg"
            image_bytes = b""

        lat = float(body["lat"]) if "lat" in body else None
        lon = float(body["lon"]) if "lon" in body else None
        dealer_offer = float(body["dealer_offer_inr"]) if "dealer_offer_inr" in body else None
        language = str(body.get("language", "en"))[:10]
    except Exception:
        return _json(400, {"error": "bad request"})

    # ── Set per-invocation context ────────────────────────────────────────────
    global _invocation_ctx
    _invocation_ctx = {
        "mock":            MOCK_ANALYSIS,
        "image_bytes":     image_bytes,
        "fmt":             fmt,
        "lat":             lat,
        "lon":             lon,
        "dealer_offer_inr": dealer_offer,
        "language":        language,
    }

    # ── Run agent or direct fallback ──────────────────────────────────────────
    try:
        if STRANDS_AVAILABLE and not MOCK_ANALYSIS:
            agent = Agent(
                model=BEDROCK_MODEL_ID,
                system_prompt=SYSTEM_PROMPT,
                tools=[
                    analyze_image,
                    request_clarification,
                    fetch_indicative_price,
                    fetch_disposal_protocol,
                    find_recyclers,
                    build_share_summary,
                ],
            )
            # Build the user message from context
            user_msg = "Analyse the provided e-waste image."
            if lat and lon:
                user_msg += f" My location is lat={lat}, lon={lon}."
            if dealer_offer is not None:
                user_msg += f" The dealer offered ₹{dealer_offer}."
            if language != "en":
                user_msg += f" Respond in language code: {language}."

            # Pass image in the message
            response = agent([
                {"role": "user", "content": [
                    {"image": {"format": fmt, "source": {"bytes": image_bytes}}},
                    {"text": user_msg},
                ]}
            ])
            # Extract the last tool result that looks like our schema
            result = _extract_agent_result(response)
        else:
            result = _run_direct(_invocation_ctx)

        if MOCK_ANALYSIS:
            result["mock"] = True

        return _json(200, result)

    except Exception as e:
        print("agent error:", repr(e))
        return _json(502, {"error": "analysis failed"})


def _extract_agent_result(agent_response) -> dict:
    """Pull the structured result out of the Strands agent response.

    The agent's final message text may contain a JSON block (if build_share_summary
    was the last tool call) or we can inspect the tool use history.
    Fall back to parsing JSON from the response text.
    """
    # Try to get the last assistant text and parse JSON from it
    text = str(agent_response)
    try:
        m = re.search(r"\{.*\}", text, re.S)
        if m:
            candidate = json.loads(m.group(0))
            if "type" in candidate:
                return candidate
    except (json.JSONDecodeError, AttributeError):
        pass
    # If extraction fails, run the direct path as fallback
    return _run_direct(_invocation_ctx)

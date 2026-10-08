import base64, json, os, re
import boto3

MODEL_ID = os.environ["BEDROCK_MODEL_ID"]
bedrock = boto3.client("bedrock-runtime")

COMPONENTS = ["motherboard", "ram_stick", "mobile_pcb", "li_ion_battery", "alkaline_battery",
              "copper_wire", "charger_adapter", "hard_drive", "aluminium_heatsink",
              "screen", "cfl_or_tube_light", "router_or_modem", "remote", "other"]
CONDITIONS = ["intact", "corroded", "swollen", "leaking", "broken", "unknown"]
HAZARDS = ["swollen_battery", "leaking_battery", "mercury_lamp", "crt_or_lead_glass"]
MEDIA = {"image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp"}
MAX_BYTES = 4_000_000

PROMPT = f"""You assess photographed discarded electronics for a household in India.
Return ONLY one JSON object, no prose, in this shape:
{{"items":[{{"component":<one of {COMPONENTS}>,"condition":<one of {CONDITIONS}>,"count":<int>,"est_weight_g":<int>}}],
 "hazards":[<subset of {HAZARDS}>],
 "confidence":<0-100>,
 "notes":"<short, plain English>"}}
Rules: list only what you can actually see. If the photo is blurry, dark or items are hidden, lower the confidence.
Flag swollen_battery only if a battery visibly bulges. Never guess hidden parts."""


def _json(status, body):
    return {"statusCode": status, "headers": {"content-type": "application/json"}, "body": json.dumps(body)}


def _extract(text):
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        raise ValueError("no json")
    return json.loads(m.group(0))


def _clean(raw):
    items = []
    for it in raw.get("items", [])[:20]:
        comp = it.get("component") if it.get("component") in COMPONENTS else "other"
        cond = it.get("condition") if it.get("condition") in CONDITIONS else "unknown"
        items.append({"component": comp, "condition": cond,
                      "count": max(1, int(it.get("count", 1) or 1)),
                      "est_weight_g": max(0, int(it.get("est_weight_g", 0) or 0))})
    hazards = [h for h in raw.get("hazards", []) if h in HAZARDS]
    conf = max(0, min(100, int(raw.get("confidence", 0) or 0)))
    return {"items": items, "hazards": hazards, "confidence": conf, "notes": str(raw.get("notes", ""))[:300]}


def _analyze(img, fmt):
    r = bedrock.converse(
        modelId=MODEL_ID,
        messages=[{"role": "user", "content": [
            {"image": {"format": fmt, "source": {"bytes": img}}}, {"text": PROMPT}]}],
        inferenceConfig={"maxTokens": 1000})
    return r["output"]["message"]["content"][0]["text"]


def handler(event, context):
    try:
        raw_body = event.get("body") or "{}"
        if event.get("isBase64Encoded"):
            raw_body = base64.b64decode(raw_body).decode()
        body = json.loads(raw_body)
        fmt = MEDIA.get(body.get("media_type", "image/jpeg"))
        if not fmt:
            return _json(400, {"error": "unsupported image type"})
        img = base64.b64decode(body["image_b64"])
        if len(img) > MAX_BYTES:
            return _json(400, {"error": "image too large; resize before upload"})
    except Exception:
        return _json(400, {"error": "bad request"})

    for attempt in range(2):
        try:
            return _json(200, {"result": _clean(_extract(_analyze(img, fmt)))})
        except (ValueError, KeyError, TypeError):
            continue  # one retry on unparseable model output
        except Exception as e:
            print("model error:", repr(e))
            return _json(502, {"error": "analysis failed"})
    return _json(502, {"error": "model returned invalid output"})

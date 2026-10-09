"""POST /analyst {question, language}. A Gemini function-calling loop over the anonymous lot ledger.
Every number comes from a tool; the model only phrases the answer. The tool trace is returned so the chaining is visible.
Mock lots are ignored. No personal data exists in the ledger (location is rounded to ~1 km)."""
import json, os, urllib.request
import boto3

TABLE, KEY = os.environ.get("LOTS_TABLE", ""), os.environ.get("GEMINI_API_KEY", "")
MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.8-flash")
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

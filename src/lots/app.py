"""GET /stats: anonymous aggregates for the insights page. Mock lots are excluded. No personal data exists in the ledger
(location rounded to ~1 km). Scan is paginated; fine at hackathon scale."""
import json, os
from datetime import datetime, timezone
from decimal import Decimal
import boto3

TABLE = os.environ.get("LOTS_TABLE", "")
_t = None

def _all():
    global _t
    _t = _t or boto3.resource("dynamodb").Table(TABLE)
    items, kw = [], {}
    while True:
        r = _t.scan(**kw)
        items += r.get("Items", [])
        if "LastEvaluatedKey" not in r: return items
        kw["ExclusiveStartKey"] = r["LastEvaluatedKey"]

def _num(o):
    if isinstance(o, Decimal): return int(o) if o % 1 == 0 else float(o)
    raise TypeError

def compute_stats(lots):
    real = [l for l in lots if not l.get("mock")]
    grams, hazards, cells = {}, {}, {}
    for l in real:
        for it in l.get("items", []):
            grams[it["component"]] = grams.get(it["component"], 0) + float(it.get("est_weight_g", 0))
        for h in l.get("hazards", []):
            hazards[h] = hazards.get(h, 0) + 1
        if l.get("cell_lat") is not None:
            k = (float(l["cell_lat"]), float(l["cell_lon"]))
            c = cells.setdefault(k, {"lat": k[0], "lon": k[1], "lots": 0, "hazard_lots": 0, "value_min": 0.0, "value_max": 0.0})
            c["lots"] += 1; c["hazard_lots"] += 1 if l.get("hazards") else 0
            c["value_min"] += float(l.get("total_min_inr", 0)); c["value_max"] += float(l.get("total_max_inr", 0))
    return {"lots": len(real), "weight_kg_by_component": {k: round(v / 1000, 2) for k, v in grams.items()},
            "hazard_counts": hazards, "cells": list(cells.values()), "generated_at": datetime.now(timezone.utc).isoformat()}

def handler(event, context):
    try:
        return {"statusCode": 200, "headers": {"content-type": "application/json"}, "body": json.dumps(compute_stats(_all()), default=_num)}
    except Exception as e:
        print("stats error:", repr(e)[:300])
        return {"statusCode": 502, "headers": {"content-type": "application/json"}, "body": json.dumps({"error": "stats failed"})}

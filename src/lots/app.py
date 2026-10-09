import json, os, urllib.request
import boto3
from datetime import datetime, timezone

TABLE = os.environ.get("LOTS_TABLE", "")
_t = None

def _lots():
    global _t
    if not _t:
        _t = boto3.resource("dynamodb").Table(TABLE)
    items, kw = [], {}
    while True:
        r = _t.scan(**kw)
        items += r.get("Items", [])
        if "LastEvaluatedKey" not in r:
            break
        kw["ExclusiveStartKey"] = r["LastEvaluatedKey"]
    return [l for l in items if not l.get("mock")]

def _cells(lots):
    cells = {}
    for l in lots:
        if l.get("cell_lat") is None:
            continue
        k = (float(l["cell_lat"]), float(l["cell_lon"]))
        c = cells.setdefault(k, {"lat": k[0], "lon": k[1], "lots": 0, "hazard_lots": 0, "kg": {}})
        c["lots"] += 1
        c["hazard_lots"] += 1 if l.get("hazards") else 0
        for it in l.get("items", []):
            c["kg"][it["component"]] = c["kg"].get(it["component"], 0) + float(it.get("est_weight_g", 0)) / 1000
    return list(cells.values())

def _j(status, body):
    return {"statusCode": status, "headers": {"content-type": "application/json"}, "body": json.dumps(body)}

def handler(event, context):
    try:
        path = event.get("rawPath", "")
        if path.endswith("/stats"):
            lots = _lots()
            kg, hz = {}, {}
            for l in lots:
                for it in l.get("items", []):
                    kg[it["component"]] = kg.get(it["component"], 0) + float(it.get("est_weight_g", 0)) / 1000
                for h in l.get("hazards", []):
                    hz[h] = hz.get(h, 0) + 1
            
            delivered = sum(1 for l in lots if l.get("status") == "delivered")
            
            return _j(200, {
                "lots": len(lots),
                "delivered": delivered,
                "weight_kg_by_component": {k: round(v, 2) for k, v in kg.items()},
                "hazard_counts": hz,
                "cells": _cells(lots),
                "generated_at": datetime.now(timezone.utc).isoformat()
            })
        
        # GET /lots/{id}
        parts = path.split("/")
        if len(parts) >= 3 and parts[-2] == "lots":
            lot_id = parts[-1]
            global _t
            if not _t:
                _t = boto3.resource("dynamodb").Table(TABLE)
            res = _t.get_item(Key={"id": lot_id})
            if "Item" in res:
                return _j(200, res["Item"])
            return _j(404, {"error": "lot not found"})
        
        return _j(404, {"error": "not found"})
    except Exception as e:
        print("lots error:", repr(e))
        return _j(500, {"error": "internal error"})

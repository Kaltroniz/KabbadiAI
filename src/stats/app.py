"""KabadiAI GET /hotspots
Scans the LotsTable and aggregates item count and hazard flag
grouped by the rounded grid cell (cell_lat, cell_lon ~1 km resolution).
Mock lots are excluded so demo data does not skew the map.
"""
import json, os
from decimal import Decimal
import boto3

LOTS_TABLE = os.environ.get("LOTS_TABLE", "")

_t = None


def _table():
    global _t
    if not _t:
        _t = boto3.resource("dynamodb").Table(LOTS_TABLE)
    return _t


def _scan_all():
    """Full table scan, handles pagination."""
    items, kw = [], {}
    while True:
        r = _table().scan(**kw)
        items += r.get("Items", [])
        if "LastEvaluatedKey" not in r:
            break
        kw["ExclusiveStartKey"] = r["LastEvaluatedKey"]
    return [l for l in items if not l.get("mock")]


def _aggregate(lots):
    """Group lots by (cell_lat, cell_lon) cell."""
    cells = {}
    for lot in lots:
        lat = lot.get("cell_lat")
        lon = lot.get("cell_lon")
        if lat is None or lon is None:
            continue
        key = (float(lat), float(lon))
        cell = cells.setdefault(key, {
            "lat": key[0],
            "lon": key[1],
            "lot_count": 0,
            "item_count": 0,
            "hazard_count": 0,
        })
        cell["lot_count"] += 1
        cell["item_count"] += sum(int(i.get("count", 1)) for i in lot.get("items", []))
        cell["hazard_count"] += len(lot.get("hazards", []))

    hotspots = []
    for cell in cells.values():
        cell["has_hazard"] = cell["hazard_count"] > 0
        hotspots.append(cell)

    hotspots.sort(key=lambda x: x["lot_count"], reverse=True)
    return hotspots


def _json(status, body):
    def _default(obj):
        if isinstance(obj, Decimal):
            return float(obj)
        raise TypeError
    return {
        "statusCode": status,
        "headers": {
            "content-type": "application/json",
            "access-control-allow-origin": "*",
        },
        "body": json.dumps(body, default=_default),
    }


def handler(event, _context):
    try:
        lots = _scan_all()
        hotspots = _aggregate(lots)
        return _json(200, {"hotspots": hotspots, "total_lots": len(lots)})
    except Exception as exc:
        print("hotspots error:", repr(exc))
        return _json(500, {"error": "internal error"})

"""KabadiAI GET /hotspots
Scans the LotsTable and aggregates item count and hazard flag
grouped by the rounded grid cell (cell_lat, cell_lon ~1 km resolution).
Mock lots are excluded so demo data does not skew the map.
"""
import json, os
from decimal import Decimal
import boto3

LOTS_TABLE = os.environ.get("LOTS_TABLE", "")
AGGREGATES_TABLE = os.environ.get("AGGREGATES_TABLE", "")

_t = None


def _table():
    global _t
    if not _t:
        _t = boto3.resource("dynamodb").Table(LOTS_TABLE)
    return _t


def _query_aggregates():
    """Queries pre-aggregated cell hotspots from AggregatesTable TypeIndex in O(1) time."""
    tbl_name = AGGREGATES_TABLE or os.environ.get("AGGREGATES_TABLE", "")
    if not tbl_name:
        return None
    try:
        from boto3.dynamodb.conditions import Key
        agg_tbl = boto3.resource("dynamodb").Table(tbl_name)
        r = agg_tbl.query(
            IndexName="TypeIndex",
            KeyConditionExpression=Key("aggregate_type").eq("cell")
        )
        items = r.get("Items", [])
        if not items:
            return None
        hotspots = []
        total_lots = 0
        for it in items:
            l_cnt = int(it.get("lot_count", 0))
            h_cnt = int(it.get("hazard_count", 0))
            total_lots += l_cnt
            hotspots.append({
                "lat": float(it["lat"]),
                "lon": float(it["lon"]),
                "lot_count": l_cnt,
                "item_count": int(it.get("item_count", 0)),
                "hazard_count": h_cnt,
                "has_hazard": h_cnt > 0,
            })
        hotspots.sort(key=lambda x: x["lot_count"], reverse=True)
        return hotspots, total_lots
    except Exception as exc:
        print("Aggregate cells query failed:", repr(exc))
        return None



def _scan_all():
    """Full table scan, handles pagination with projection to minimize network & memory transfer."""
    items, kw = [], {
        "ProjectionExpression": "cell_lat, cell_lon, items, hazards, mock"
    }
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
            "cache-control": "public, max-age=60, stale-while-revalidate=300",
        },
        "body": json.dumps(body, default=_default),
    }


def handler(event, _context):
    try:
        agg_res = _query_aggregates()
        if agg_res is not None:
            hotspots, total_lots = agg_res
            return _json(200, {"hotspots": hotspots, "total_lots": total_lots})

        lots = _scan_all()
        hotspots = _aggregate(lots)
        return _json(200, {"hotspots": hotspots, "total_lots": len(lots)})
    except Exception as exc:
        print("hotspots error:", repr(exc))
        return _json(500, {"error": "internal error"})


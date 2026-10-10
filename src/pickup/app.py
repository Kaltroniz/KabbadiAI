"""KabadiAI Pickup endpoints
POST /pickup  – household submits a bulk pick-up request (lat, lon, description)
GET  /pickup  – kabadiwala dashboard fetches active requests

Items have a TTL of 7 days (expires_at epoch seconds) so stale requests
auto-expire from DynamoDB. The table must have TTL enabled on expires_at.
"""
import json, os, uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import boto3

PICKUPS_TABLE = os.environ.get("PICKUPS_TABLE", "")

_t = None


def _table():
    global _t
    if not _t:
        _t = boto3.resource("dynamodb").Table(PICKUPS_TABLE)
    return _t


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


def _post(body_str):
    try:
        b = json.loads(body_str or "{}")
    except Exception:
        return _json(400, {"error": "invalid JSON"})

    lat = b.get("lat")
    lon = b.get("lon")
    description = str(b.get("description", "")).strip()[:200]

    if lat is None or lon is None:
        return _json(400, {"error": "lat and lon are required"})
    try:
        lat, lon = float(lat), float(lon)
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise ValueError
    except (ValueError, TypeError):
        return _json(400, {"error": "invalid coordinates"})

    if not description:
        description = "Bulk pickup requested"

    now = datetime.now(timezone.utc)
    item = {
        "id": uuid.uuid4().hex[:12],
        "lat": str(round(lat, 6)),
        "lon": str(round(lon, 6)),
        "description": description,
        "status": "active",
        "created_at": now.isoformat(),
        # DynamoDB TTL – 7 days
        "expires_at": int((now + timedelta(days=7)).timestamp()),
    }
    _table().put_item(Item=item)
    return _json(201, {"id": item["id"], "message": "Pickup request saved."})


def _get():
    """Return all active (non-expired) pickup requests, newest first."""
    now_epoch = int(datetime.now(timezone.utc).timestamp())
    items, kw = [], {}
    while True:
        r = _table().scan(**kw)
        items += r.get("Items", [])
        if "LastEvaluatedKey" not in r:
            break
        kw["ExclusiveStartKey"] = r["LastEvaluatedKey"]

    active = [
        i for i in items
        if i.get("status") == "active" and int(i.get("expires_at", 0)) > now_epoch
    ]
    active.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return _json(200, {"pickups": active, "count": len(active)})


def handler(event, _context):
    method = event.get("requestContext", {}).get("http", {}).get("method", "GET").upper()
    try:
        if method == "POST":
            raw = event.get("body") or "{}"
            return _post(raw)
        if method == "GET":
            return _get()
        return _json(405, {"error": "method not allowed"})
    except Exception as exc:
        print("pickup error:", repr(exc))
        return _json(500, {"error": "internal error"})

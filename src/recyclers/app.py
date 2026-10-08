"""GET /recyclers?lat=<float>&lon=<float>

Returns up to 5 nearest authorized e-waste recyclers for the given coordinates,
sorted by straight-line (haversine) distance, ascending.

Response 200:
    {
        "recyclers": [
            {
                "id": "R1",
                "name": "...",
                "address": "...",
                "city": "Delhi",
                "lat": 28.53,
                "lon": 77.27,
                "distance_km": 2.1,
                "directions_url": "https://maps.google.com/..."
            },
            ...
        ],
        "coverage_note": "Authorized recyclers in Delhi-NCR only. Source: DPCC/CPCB 2023. Re-verify authorization before use."
    }

Errors: 400 (missing or invalid lat/lon), 502 (DynamoDB error).
"""
import json, math, os
import boto3

RECYCLERS_TABLE = os.environ.get("RECYCLERS_TABLE", "")
MAX_RESULTS = 5
COVERAGE_NOTE = (
    "Authorized recyclers in Delhi-NCR only. "
    "Source: DPCC/CPCB approved list 2023. "
    "Re-verify authorization before visiting."
)

_table = None


def _get_table():
    global _table
    if _table is None:
        _table = boto3.resource("dynamodb").Table(RECYCLERS_TABLE)
    return _table


def haversine_km(lat1, lon1, lat2, lon2):
    """Straight-line distance between two WGS-84 points in kilometres."""
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def nearest(lat, lon, recyclers, max_results=MAX_RESULTS):
    """Return up to max_results recyclers sorted by haversine distance."""
    enriched = []
    for r in recyclers:
        dist = haversine_km(lat, lon, float(r["lat"]), float(r["lon"]))
        directions = (
            f"https://maps.google.com/maps?daddr={r['lat']},{r['lon']}"
            f"&saddr={lat},{lon}"
        )
        enriched.append({
            "id":             r["id"],
            "name":           r["name"],
            "address":        r["address"],
            "city":           r["city"],
            "lat":            float(r["lat"]),
            "lon":            float(r["lon"]),
            "distance_km":    round(dist, 2),
            "directions_url": directions,
        })
    enriched.sort(key=lambda x: x["distance_km"])
    return enriched[:max_results]


def _json(status, body):
    return {"statusCode": status, "headers": {"content-type": "application/json"},
            "body": json.dumps(body)}


def handler(event, context):
    params = event.get("queryStringParameters") or {}
    try:
        lat = float(params["lat"])
        lon = float(params["lon"])
    except (KeyError, ValueError, TypeError):
        return _json(400, {"error": "lat and lon query parameters are required (decimal degrees)"})

    if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
        return _json(400, {"error": "lat or lon out of range"})

    try:
        resp = _get_table().scan()
        all_recyclers = resp.get("Items", [])
    except Exception as e:
        print("recyclers error:", repr(e))
        return _json(502, {"error": "recycler lookup failed"})

    result = nearest(lat, lon, all_recyclers)
    return _json(200, {"recyclers": result, "coverage_note": COVERAGE_NOTE})

"""POST /price

Request body:
    {
        "items": [
            {"component": "<enum>", "count": <int>, "est_weight_g": <int>},
            ...
        ],
        "dealer_offer_inr": <optional float>
    }

Response 200:
    {
        "line_items": [
            {
                "component": "<enum>",
                "count": <int>,
                "est_weight_g": <int>,
                "min_inr": <float>,
                "max_inr": <float>,
                "hazardous": <bool>
            },
            ...
        ],
        "total_min_inr": <float>,
        "total_max_inr": <float>,
        "source_note": "<string>",
        "checked_date": "<YYYY-MM-DD>",
        "disclaimer": "Indicative only. Verify with a local scrap dealer before accepting any offer.",
        "verdict": "low" | "fair" | "high"   # only when dealer_offer_inr supplied
    }

Errors: 400 (bad request), 502 (DynamoDB unavailable).

Verdict logic (compared against midpoint = (total_min + total_max) / 2):
    low  – dealer_offer_inr < total_min
    high – dealer_offer_inr > total_max
    fair – otherwise (dealer_offer within the indicative range)
"""
import json, os
import boto3
from boto3.dynamodb.conditions import Key
from decimal import Decimal

PRICES_TABLE = os.environ.get("PRICES_TABLE", "")
COMPONENTS = {
    "motherboard", "ram_stick", "mobile_pcb", "li_ion_battery", "alkaline_battery",
    "copper_wire", "charger_adapter", "hard_drive", "aluminium_heatsink",
    "screen", "cfl_or_tube_light", "router_or_modem", "remote", "other",
}
# Components with indicative 0/0 price that we treat as hazardous (no cash value)
HAZARDOUS = {"li_ion_battery", "alkaline_battery", "cfl_or_tube_light"}

DISCLAIMER = (
    "Indicative only. Prices vary by condition, market, and date. "
    "Verify with a local scrap dealer before accepting any offer."
)

_ddb = None


def _table():
    global _ddb
    if _ddb is None:
        _ddb = boto3.resource("dynamodb").Table(PRICES_TABLE)
    return _ddb


def _get_price(component):
    """Fetch one price row from DynamoDB.  Returns a dict or raises."""
    resp = _table().get_item(Key={"component": component})
    item = resp.get("Item")
    if not item:
        # Fall back to 'other' if component missing from table
        resp = _table().get_item(Key={"component": "other"})
        item = resp.get("Item", {"component": "other", "min_inr_per_kg": 0,
                                  "max_inr_per_kg": 10, "source": "fallback",
                                  "checked_date": "unknown"})
    return item


def _json(status, body):
    return {"statusCode": status, "headers": {"content-type": "application/json"},
            "body": json.dumps(body)}


def calculate_price(items, price_fetcher):
    """Pure calculation – separated from AWS I/O for unit-testability.

    price_fetcher(component) -> {"min_inr_per_kg": N, "max_inr_per_kg": N,
                                  "source": "...", "checked_date": "..."}
    Returns (line_items, total_min, total_max, source_note, checked_date).
    """
    line_items = []
    total_min = 0.0
    total_max = 0.0
    source_note = ""
    checked_date = ""

    for it in items:
        component = it.get("component", "other")
        if component not in COMPONENTS:
            component = "other"
        count = max(1, int(it.get("count", 1) or 1))
        weight_g = max(0, int(it.get("est_weight_g", 0) or 0))
        weight_kg = weight_g / 1000.0

        row = price_fetcher(component)
        min_per_kg = float(row.get("min_inr_per_kg", 0))
        max_per_kg = float(row.get("max_inr_per_kg", 0))
        source_note = str(row.get("source", ""))
        checked_date = str(row.get("checked_date", ""))

        item_min = round(min_per_kg * weight_kg * count, 2)
        item_max = round(max_per_kg * weight_kg * count, 2)

        total_min += item_min
        total_max += item_max

        line_items.append({
            "component":  component,
            "count":      count,
            "est_weight_g": weight_g,
            "min_inr":    item_min,
            "max_inr":    item_max,
            "hazardous":  component in HAZARDOUS,
        })

    return line_items, round(total_min, 2), round(total_max, 2), source_note, checked_date


def verdict(dealer_offer_inr, total_min, total_max):
    """Return 'low', 'fair', or 'high' compared to the indicative range."""
    if dealer_offer_inr < total_min:
        return "low"
    if dealer_offer_inr > total_max:
        return "high"
    return "fair"


def handler(event, context):
    try:
        raw_body = event.get("body") or "{}"
        body = json.loads(raw_body)
        items = body.get("items")
        if not isinstance(items, list) or len(items) == 0:
            return _json(400, {"error": "items must be a non-empty list"})
        dealer_offer = body.get("dealer_offer_inr")
        if dealer_offer is not None:
            dealer_offer = float(dealer_offer)
    except Exception:
        return _json(400, {"error": "bad request"})

    try:
        line_items, total_min, total_max, source_note, checked_date = calculate_price(
            items, _get_price
        )
    except Exception as e:
        print("price error:", repr(e))
        return _json(502, {"error": "price lookup failed"})

    result = {
        "line_items":    line_items,
        "total_min_inr": total_min,
        "total_max_inr": total_max,
        "source_note":   source_note,
        "checked_date":  checked_date,
        "disclaimer":    DISCLAIMER,
    }
    if dealer_offer is not None:
        result["verdict"] = verdict(dealer_offer, total_min, total_max)

    return _json(200, result)

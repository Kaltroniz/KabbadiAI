"""Unit tests for price calculation and verdict logic.

Run from the repo root (no AWS credentials needed):
    python -m pytest tests/test_price.py -v
"""
import importlib.util, pathlib, os

_SRC = pathlib.Path(__file__).parent.parent / "src" / "price" / "app.py"
os.environ.setdefault("PRICES_TABLE", "dummy")  # prevent env-var error at import time
_spec = importlib.util.spec_from_file_location("price_app", _SRC)
_price_app = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_price_app)

calculate_price = _price_app.calculate_price
verdict        = _price_app.verdict

# ── Fixture price data (mirrors data/prices.json) ─────────────────────────
PRICE_DB = {
    "motherboard":       {"min_inr_per_kg": 200, "max_inr_per_kg": 450, "source": "test", "checked_date": "2026-10-08"},
    "copper_wire":       {"min_inr_per_kg": 380, "max_inr_per_kg": 600, "source": "test", "checked_date": "2026-10-08"},
    "li_ion_battery":    {"min_inr_per_kg":   0, "max_inr_per_kg":   0, "source": "test", "checked_date": "2026-10-08"},
    "aluminium_heatsink":{"min_inr_per_kg":  80, "max_inr_per_kg": 130, "source": "test", "checked_date": "2026-10-08"},
    "other":             {"min_inr_per_kg":   0, "max_inr_per_kg":  10, "source": "test", "checked_date": "2026-10-08"},
}

def mock_fetcher(component):
    return PRICE_DB.get(component, PRICE_DB["other"])


# ── calculate_price tests ──────────────────────────────────────────────────

def test_single_item_value():
    """1 kg motherboard: min 200, max 450."""
    items = [{"component": "motherboard", "count": 1, "est_weight_g": 1000}]
    line_items, total_min, total_max, _, _ = calculate_price(items, mock_fetcher)
    assert len(line_items) == 1
    assert total_min == 200.0
    assert total_max == 450.0
    assert line_items[0]["hazardous"] is False


def test_hazardous_battery_zero_value():
    """Li-ion battery has 0/0 price and is flagged hazardous."""
    items = [{"component": "li_ion_battery", "count": 1, "est_weight_g": 200}]
    line_items, total_min, total_max, _, _ = calculate_price(items, mock_fetcher)
    assert total_min == 0.0
    assert total_max == 0.0
    assert line_items[0]["hazardous"] is True


def test_multiple_items_sum():
    """500 g motherboard + 200 g copper wire."""
    items = [
        {"component": "motherboard", "count": 1, "est_weight_g": 500},
        {"component": "copper_wire", "count": 1, "est_weight_g": 200},
    ]
    line_items, total_min, total_max, _, _ = calculate_price(items, mock_fetcher)
    # motherboard 500g: min=100, max=225
    # copper 200g:      min=76,  max=120
    assert total_min == round(100.0 + 76.0, 2)
    assert total_max == round(225.0 + 120.0, 2)


def test_count_multiplier():
    """3 x 100 g aluminium heatsinks."""
    items = [{"component": "aluminium_heatsink", "count": 3, "est_weight_g": 100}]
    line_items, total_min, total_max, _, _ = calculate_price(items, mock_fetcher)
    # 0.1 kg * 3 = 0.3 kg; min=80*0.3=24, max=130*0.3=39
    assert total_min == round(80 * 0.1 * 3, 2)
    assert total_max == round(130 * 0.1 * 3, 2)


def test_unknown_component_falls_back_to_other():
    """Unknown component string is treated as 'other'."""
    items = [{"component": "flux_capacitor", "count": 1, "est_weight_g": 1000}]
    line_items, total_min, total_max, _, _ = calculate_price(items, mock_fetcher)
    assert line_items[0]["component"] == "other"
    assert total_max == 10.0


def test_zero_weight_item():
    """Weight 0 g → value 0."""
    items = [{"component": "motherboard", "count": 1, "est_weight_g": 0}]
    _, total_min, total_max, _, _ = calculate_price(items, mock_fetcher)
    assert total_min == 0.0
    assert total_max == 0.0


# ── verdict tests ──────────────────────────────────────────────────────────

def test_verdict_low():
    """Offer below min → low."""
    assert verdict(50.0, 100.0, 300.0) == "low"


def test_verdict_fair():
    """Offer within range → fair."""
    assert verdict(200.0, 100.0, 300.0) == "fair"
    assert verdict(100.0, 100.0, 300.0) == "fair"   # at lower bound = fair
    assert verdict(300.0, 100.0, 300.0) == "fair"   # at upper bound = fair


def test_verdict_high():
    """Offer above max → high."""
    assert verdict(350.0, 100.0, 300.0) == "high"


def test_verdict_zero_range():
    """All hazardous items: min=max=0, any positive offer is high."""
    assert verdict(0.0,  0.0, 0.0) == "fair"
    assert verdict(10.0, 0.0, 0.0) == "high"


# ── handler-level smoke test (no AWS) ─────────────────────────────────────
import json

def test_handler_bad_request():
    result = _price_app.handler({"body": "not json"}, None)
    assert result["statusCode"] == 400

def test_handler_empty_items():
    result = _price_app.handler({"body": json.dumps({"items": []})}, None)
    assert result["statusCode"] == 400

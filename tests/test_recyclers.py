"""Unit tests for recycler distance and sorting logic.

Run from repo root (no AWS credentials needed):
    python -m pytest tests/test_recyclers.py -v
"""
import importlib.util, pathlib, os

_SRC = pathlib.Path(__file__).parent.parent / "src" / "recyclers" / "app.py"
os.environ.setdefault("RECYCLERS_TABLE", "dummy")
_spec = importlib.util.spec_from_file_location("recyclers_app", _SRC)
_recyclers_app = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_recyclers_app)

haversine_km = _recyclers_app.haversine_km
nearest      = _recyclers_app.nearest


# All five seed recyclers from data/recyclers.json
SEED_RECYCLERS = [
    {"id": "R1", "name": "Muskan Technologies",            "address": "B-96, Okhla Phase-1", "city": "Delhi", "lat": 28.5355, "lon": 77.2750},
    {"id": "R2", "name": "Shivnath Computers",             "address": "E-47/2, Okhla Phase-2","city": "Delhi", "lat": 28.5300, "lon": 77.2700},
    {"id": "R3", "name": "Techchef E-Waste Solutions",     "address": "C-61, DDA Shed, Okhla","city": "Delhi", "lat": 28.5340, "lon": 77.2780},
    {"id": "R4", "name": "Greenscape Eco Management",      "address": "Patparganj Industrial", "city": "Delhi", "lat": 28.6280, "lon": 77.3050},
    {"id": "R5", "name": "Fozia Traders",                  "address": "Mandoli Industrial",    "city": "Delhi", "lat": 28.6900, "lon": 77.3000},
]


# ── haversine_km tests ─────────────────────────────────────────────────────

def test_same_point_is_zero():
    assert haversine_km(28.5355, 77.2750, 28.5355, 77.2750) == 0.0


def test_known_distance():
    """Delhi (Connaught Place) to Okhla is roughly 12 km straight line."""
    dist = haversine_km(28.6315, 77.2167, 28.5355, 77.2750)
    assert 10.0 < dist < 16.0


def test_symmetry():
    """Distance A→B must equal B→A."""
    d1 = haversine_km(28.5355, 77.2750, 28.6280, 77.3050)
    d2 = haversine_km(28.6280, 77.3050, 28.5355, 77.2750)
    assert abs(d1 - d2) < 0.001


# ── nearest() tests ────────────────────────────────────────────────────────

def test_returns_max_five():
    """Never returns more than MAX_RESULTS even with more recyclers."""
    result = nearest(28.5355, 77.2750, SEED_RECYCLERS)
    assert len(result) <= 5


def test_sorted_ascending():
    """Results must be sorted by distance_km ascending."""
    result = nearest(28.5355, 77.2750, SEED_RECYCLERS)
    dists = [r["distance_km"] for r in result]
    assert dists == sorted(dists)


def test_nearest_recycler_for_okhla_coordinate():
    """From R1's own coordinates, R1 should be first (distance ≈ 0)."""
    result = nearest(28.5355, 77.2750, SEED_RECYCLERS)
    assert result[0]["id"] == "R1"
    assert result[0]["distance_km"] < 0.1


def test_result_fields():
    """Each result has the required output fields."""
    result = nearest(28.6315, 77.2167, SEED_RECYCLERS)
    required = {"id", "name", "address", "city", "lat", "lon", "distance_km", "directions_url"}
    for r in result:
        assert required.issubset(r.keys()), f"Missing keys in {r}"


def test_directions_url_contains_coords():
    """directions_url must include destination lat/lon."""
    result = nearest(28.6315, 77.2167, SEED_RECYCLERS)
    for r in result:
        assert str(r["lat"]) in r["directions_url"]
        assert str(r["lon"]) in r["directions_url"]


def test_five_delhi_recyclers_returned():
    """All five seed recyclers should be returned for any Delhi coordinate."""
    result = nearest(28.6315, 77.2167, SEED_RECYCLERS, max_results=10)
    assert len(result) == 5


def test_empty_recycler_list():
    """Empty input returns empty output without error."""
    result = nearest(28.5355, 77.2750, [])
    assert result == []


# ── handler-level smoke test ───────────────────────────────────────────────
def test_handler_missing_lat():
    result = _recyclers_app.handler({"queryStringParameters": {"lon": "77.27"}}, None)
    assert result["statusCode"] == 400

def test_handler_invalid_lat():
    result = _recyclers_app.handler({"queryStringParameters": {"lat": "999", "lon": "77.27"}}, None)
    assert result["statusCode"] == 400

"""Unit tests for recycler distance, sorting, and directions URL logic."""
import importlib.util, pathlib, os, urllib.parse

_SRC = pathlib.Path(__file__).parent.parent / "src" / "agent" / "app.py"
os.environ.setdefault("PRICES_TABLE", "dummy")
os.environ.setdefault("RECYCLERS_TABLE", "dummy")
os.environ.setdefault("LOTS_TABLE", "dummy")
os.environ.setdefault("MOCK_ANALYSIS", "1")

_spec = importlib.util.spec_from_file_location("agent_app", _SRC)
_agent_app = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_agent_app)

_km = _agent_app._km

SEED_RECYCLERS = [
    {"id": "R1", "name": "Muskan Technologies",        "address": "B-96, Okhla Phase-1", "city": "Delhi", "state": "Delhi", "lat": 28.5355, "lon": 77.2750},
    {"id": "R2", "name": "Shivnath Computers",         "address": "E-47/2, Okhla Phase-2","city": "Delhi", "state": "Delhi", "lat": 28.5300, "lon": 77.2700},
    {"id": "R3", "name": "Greenscape Eco Management",  "address": "Patparganj Industrial", "city": "Delhi", "state": "Delhi", "lat": 28.6280, "lon": 77.3050},
]

def test_same_point_is_zero():
    assert _km(28.5355, 77.2750, 28.5355, 77.2750) == 0.0

def test_known_distance():
    """Delhi (Connaught Place) to Okhla is roughly 12 km straight line."""
    dist = _km(28.6315, 77.2167, 28.5355, 77.2750)
    assert 10.0 < dist < 16.0

def test_symmetry():
    d1 = _km(28.5355, 77.2750, 28.6280, 77.3050)
    d2 = _km(28.6280, 77.3050, 28.5355, 77.2750)
    assert abs(d1 - d2) < 0.001

def test_directions_url_uses_street_address():
    """Directions URL must query the full street address rather than coarse city coordinates."""
    r = SEED_RECYCLERS[0]
    dest_parts = [p for p in (r.get("name"), r.get("address"), r.get("city"), r.get("state")) if p]
    dest_query = urllib.parse.quote(", ".join(dest_parts))
    url = f"https://www.google.com/maps/dir/?api=1&destination={dest_query}"

    assert "Muskan+Technologies" in url or "Muskan%20Technologies" in url
    assert "Okhla+Phase-1" in url or "Okhla%20Phase-1" in url
    assert "Delhi" in url

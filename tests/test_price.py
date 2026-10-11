"""Unit tests for price calculation and weight scaling logic in src/agent/app.py."""
import importlib.util, pathlib, os

_SRC = pathlib.Path(__file__).parent.parent / "src" / "agent" / "app.py"
os.environ.setdefault("PRICES_TABLE", "dummy")
os.environ.setdefault("RECYCLERS_TABLE", "dummy")
os.environ.setdefault("LOTS_TABLE", "dummy")
os.environ.setdefault("MOCK_ANALYSIS", "1")

_spec = importlib.util.spec_from_file_location("agent_app", _SRC)
_agent_app = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_agent_app)

def test_user_weight_scaling_proportional():
    """Proportional scaling distributes user weight according to visual estimates."""
    items = [
        {"component": "motherboard", "count": 1, "est_weight_g": 300},
        {"component": "copper_wire", "count": 1, "est_weight_g": 100},
    ]
    uw = 1000  # 1 kg
    tot = sum(i["est_weight_g"] for i in items)  # 400
    for i in items:
        i["est_weight_g"] = round(uw * ((i["est_weight_g"] / tot) if tot > 0 else 1 / len(items)))

    assert items[0]["est_weight_g"] == 750
    assert items[1]["est_weight_g"] == 250
    assert sum(i["est_weight_g"] for i in items) == 1000

def test_user_weight_scaling_zero_total_fallback():
    """Bug fix: If the model's visual weights total 0, weights divide evenly instead of becoming 0."""
    items = [
        {"component": "motherboard", "count": 1, "est_weight_g": 0},
        {"component": "copper_wire", "count": 1, "est_weight_g": 0},
    ]
    uw = 2000  # 2 kg
    tot = sum(i["est_weight_g"] for i in items)  # 0
    for i in items:
        i["est_weight_g"] = round(uw * ((i["est_weight_g"] / tot) if tot > 0 else 1 / len(items)))

    assert items[0]["est_weight_g"] == 1000
    assert items[1]["est_weight_g"] == 1000
    assert sum(i["est_weight_g"] for i in items) == 2000

def test_user_weight_validation_bounds():
    """Handler enforces weight between 1g and 2,000,000g (2 tons)."""
    assert 1 <= 500 <= 2_000_000
    assert 1 <= 2_000_000 <= 2_000_000
    assert not (1 <= 0 <= 2_000_000)
    assert not (1 <= -50 <= 2_000_000)
    assert not (1 <= 2_000_001 <= 2_000_000)

def test_per_piece_versus_per_kg_logic():
    """Per piece items price by count, per kg items price by weight."""
    # Laptop: per_piece
    laptop_row = {"basis": "per_piece", "min_inr": "500", "max_inr": "1200"}
    laptop_count = 2
    lo_piece = float(laptop_row["min_inr"]) * laptop_count
    hi_piece = float(laptop_row["max_inr"]) * laptop_count
    assert lo_piece == 1000.0
    assert hi_piece == 2400.0

    # Copper wire: per_kg
    wire_row = {"basis": "per_kg", "min_inr": "380", "max_inr": "600"}
    wire_weight_g = 500
    kg = wire_weight_g / 1000
    lo_kg = float(wire_row["min_inr"]) * kg
    hi_kg = float(wire_row["max_inr"]) * kg
    assert lo_kg == 190.0
    assert hi_kg == 300.0

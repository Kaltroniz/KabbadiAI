"""Unit tests for KabadiAI Gamification Engine.
Tests XP calculations, streak multipliers, level progression, environmental impact,
badge rules, collectible cards, and leaderboard generation.
"""
import sys, os
from datetime import date, timedelta
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src")))

from gamification.app import (
    calculate_level,
    update_user_streak,
    calculate_environmental_impact,
    get_mock_leaderboard,
    handler,
    LEVEL_TIERS,
    ALL_BADGES,
    COLLECTIBLE_CARDS,
    STORY_QUESTS
)

def test_level_progression():
    # Level 1 at 0 XP
    l1 = calculate_level(0)
    assert l1["level"] == 1
    assert l1["name"] == "Kabaadi Novice"
    assert l1["progress_percent"] == 0

    # Level 2 at 250 XP
    l2 = calculate_level(250)
    assert l2["level"] == 2
    assert l2["name"] == "Scrap Scout"
    assert 0 < l2["progress_percent"] < 100

    # Max level at 85000 XP
    l10 = calculate_level(85000)
    assert l10["level"] == 10
    assert l10["name"] == "Prakriti Rakshak 🌿"
    assert l10["is_max_level"] is True

def test_streak_calculation_consecutive():
    today = date.today().isoformat()
    yesterday = (date.today() - timedelta(days=1)).isoformat()

    # Yesterday scan -> streak increases
    res = update_user_streak(yesterday, current_streak=6, freeze_tokens=1)
    assert res["streak"] == 7
    assert res["multiplier"] == 1.25  # 7-day multiplier

def test_streak_freeze_token_usage():
    today = date.today().isoformat()
    day_before = (date.today() - timedelta(days=2)).isoformat()

    # Missed yesterday, but have 1 freeze token
    res = update_user_streak(day_before, current_streak=4, freeze_tokens=1)
    assert res["used_freeze"] is True
    assert res["streak"] == 5
    assert res["freeze_tokens"] == 0

def test_streak_reset_when_no_freeze():
    day_before = (date.today() - timedelta(days=2)).isoformat()

    # Missed yesterday, 0 freeze tokens -> resets to 1
    res = update_user_streak(day_before, current_streak=4, freeze_tokens=0)
    assert res["used_freeze"] is False
    assert res["streak"] == 1

def test_environmental_impact_math():
    items = [
        {"component": "motherboard", "est_weight_g": 1000, "count": 1},
        {"component": "copper_wire", "est_weight_g": 2000, "count": 1},
    ]
    # Motherboard: 1 kg * 6.0 = 6.0 kg CO2, 8.0 kWh
    # Copper wire: 2 kg * 3.5 = 7.0 kg CO2, 9.0 kWh
    # Total CO2: 13.0 kg CO2, Energy: 17.0 kWh, Trees: 13.0 / 20 = 0.65 trees
    impact = calculate_environmental_impact(items)
    assert impact["co2_offset_kg"] == 13.0
    assert impact["energy_saved_kwh"] == 17.0
    assert impact["trees_equivalent"] == 0.65
    assert impact["total_weight_kg"] == 3.0

def test_leaderboard_user_placement():
    board = get_mock_leaderboard(city="delhi", user_id="test_user", user_name="TestHero", user_xp=7500, user_diverted_kg=60.0)
    assert len(board) > 0
    user_entry = next((item for item in board if item["is_current_user"]), None)
    assert user_entry is not None
    assert "TestHero" in user_entry["name"]
    assert user_entry["xp"] == 7500
    # User with 7500 XP should be placed between 8900 and 6700 in Delhi list (Rank 4)
    assert user_entry["rank"] == 4

def test_badges_and_cards_integrity():
    assert len(ALL_BADGES) >= 28
    assert len(COLLECTIBLE_CARDS) == 28
    assert len(STORY_QUESTS) == 5

    # Check all cards have valid component ids and facts
    for card in COLLECTIBLE_CARDS:
        assert "id" in card
        assert "fact" in card
        assert "value_range" in card

def test_lambda_handler_scan_reward():
    import json
    event = {
        "rawPath": "/gamification/scan-reward",
        "httpMethod": "POST",
        "body": json.dumps({
            "items": [{"component": "laptop", "est_weight_g": 2000, "count": 1}],
            "hazards": ["swollen_battery"],
            "has_coords": True,
            "user_weight_provided": True,
            "is_offline_sync": False,
            "current_streak": 2,
            "known_cards": []
        })
    }
    resp = handler(event, None)
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert body["total_xp"] > 0
    assert "laptop" in body["new_cards_unlocked"]
    assert body["environmental_impact"]["co2_offset_kg"] > 0

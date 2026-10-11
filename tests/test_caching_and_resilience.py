"""Unit tests for Phase 1: In-memory TTL caching, secrets resolution, and cache-control headers."""
import os, time
import pytest

os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")
os.environ.setdefault("PRICES_TABLE", "dummy_prices")
os.environ.setdefault("RECYCLERS_TABLE", "dummy_recyclers")
os.environ.setdefault("LOTS_TABLE", "dummy_lots")
os.environ.setdefault("USERS_TABLE", "dummy_users")
os.environ.setdefault("MOCK_ANALYSIS", "1")

import src.agent.app as agent_app
import src.lots.app as lots_app
import src.stats.app as stats_app
import src.pickup.app as pickup_app
import src.gamification.app as gamification_app
import src.auth.app as auth_app


def test_agent_prices_in_memory_cache():
    """Verify that _load_all_prices populates and reuses in-memory cache."""
    # Seed cache manually to test in-memory lookup without DynamoDB
    agent_app._CACHE["prices"] = {
        "laptop": {"component": "laptop", "basis": "per_piece", "min_inr": "500", "max_inr": "1500"},
        "other": {"component": "other", "basis": "per_kg", "min_inr": "10", "max_inr": "20"},
    }
    agent_app._CACHE["prices_expiry"] = time.time() + 300

    row_laptop = agent_app._price_row("laptop")
    assert row_laptop["basis"] == "per_piece"
    assert row_laptop["min_inr"] == "500"

    row_unknown = agent_app._price_row("unknown_gizmo")
    assert row_unknown["component"] == "other"


def test_agent_recyclers_in_memory_cache():
    """Verify that _all_recyclers reuses in-memory cached list within TTL."""
    dummy_data = [
        {"id": "R1", "name": "Eco Recycler", "lat": 28.5, "lon": 77.2, "kind": "recycler"}
    ]
    agent_app._CACHE["recyclers"] = dummy_data
    agent_app._CACHE["recyclers_expiry"] = time.time() + 600

    recyclers = agent_app._all_recyclers()
    assert len(recyclers) == 1
    assert recyclers[0]["name"] == "Eco Recycler"


def test_secrets_resolution_and_caching():
    """Plain strings are returned immediately and cached; empty strings return empty."""
    assert agent_app._get_secret("") == ""
    assert agent_app._get_secret("plain-text-secret-key-123") == "plain-text-secret-key-123"
    assert "plain-text-secret-key-123" in agent_app._CACHED_SECRETS


def test_auth_jwt_secret_helper():
    """Auth Lambda resolves JWT secret via _jwt_secret and generates valid tokens."""
    auth_app._CACHED_SECRET = None
    token = auth_app._make_jwt({"email": "test@example.com", "id": "u123"})
    assert isinstance(token, str)
    assert token.count(".") == 2

    verified = auth_app._verify_jwt(token)
    assert verified is not None
    assert verified["email"] == "test@example.com"
    assert verified["id"] == "u123"


def test_cache_control_headers_on_read_endpoints(monkeypatch):
    """Verify that safe read endpoints emit Cache-Control headers with stale-while-revalidate."""
    # 1. Stats endpoint
    monkeypatch.setattr(lots_app, "_all", lambda: [])
    stats_res = lots_app.handler({"path": "/stats"}, None)
    assert stats_res["statusCode"] == 200
    assert "cache-control" in stats_res["headers"]
    assert "stale-while-revalidate" in stats_res["headers"]["cache-control"]

    # 2. Hotspots endpoint
    monkeypatch.setattr(stats_app, "_scan_all", lambda: [])
    hotspots_res = stats_app.handler({"path": "/hotspots"}, None)
    assert hotspots_res["statusCode"] == 200
    assert "cache-control" in hotspots_res["headers"]
    assert "stale-while-revalidate" in hotspots_res["headers"]["cache-control"]

    # 3. Gamification profile endpoint
    profile_res = gamification_app.handler({"rawPath": "/gamification/profile", "httpMethod": "GET"}, None)
    assert profile_res["statusCode"] == 200
    assert "Cache-Control" in profile_res["headers"]
    assert "stale-while-revalidate" in profile_res["headers"]["Cache-Control"]

    # 4. Gamification leaderboard endpoint
    board_res = gamification_app.handler({"rawPath": "/gamification/leaderboard", "httpMethod": "GET"}, None)
    assert board_res["statusCode"] == 200
    assert "Cache-Control" in board_res["headers"]
    assert "stale-while-revalidate" in board_res["headers"]["Cache-Control"]

"""Tests for Phase 3 Data Layer Scalability & Correctness:
  1. Server-authoritative leaderboard (GSI query, user rank computation)
  2. Gamification atomic reward with conditional idempotency (no double-award)
  3. Lucky spin 24h conditional cooldown
  4. Pre-aggregated statistics & hotspots query
  5. Modular Lambda Request Authorizer validation
"""
from __future__ import annotations
import json
import time
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest

from src.auth.authorizer import handler as authorizer_handler
from src.auth.app import _make_jwt
from src.gamification.app import (
    get_db_leaderboard,
    handler as gamification_handler,
)
from src.scan.pipeline import _update_aggregates
from src.stats.app import _query_aggregates, handler as stats_handler
from src.lots.app import _get_precomputed_stats, handler as lots_handler


def test_server_authoritative_leaderboard_query():
    """Verify get_db_leaderboard queries LeaderboardIndex and computes user rank."""
    mock_items = [
        {"id": "u1", "email": "aarav@example.com", "name": "Aarav", "xp": Decimal("5000"), "kg_diverted": Decimal("50.0"), "avatar": "🌟", "city": "delhi"},
        {"id": "u2", "email": "priya@example.com", "name": "Priya", "xp": Decimal("3500"), "kg_diverted": Decimal("32.5"), "avatar": "⚡", "city": "delhi"},
        {"id": "u3", "email": "rohan@example.com", "name": "Rohan", "xp": Decimal("2000"), "kg_diverted": Decimal("18.0"), "avatar": "🌱", "city": "delhi"},
    ]

    mock_table = MagicMock()
    mock_table.query.return_value = {"Items": mock_items, "Count": 3}

    with patch("src.gamification.app._table", return_value=mock_table), \
         patch.dict("os.environ", {"USERS_TABLE": "TestUsersTable"}):
        board, count, total_kg = get_db_leaderboard(city="delhi", user_email="priya@example.com")
        assert len(board) == 3
        assert count == 360
        assert total_kg == 100.5
        assert board[0]["name"] == "Aarav"
        assert board[0]["rank"] == 1
        assert "Priya" in board[1]["name"]
        assert board[1]["rank"] == 2
        assert board[1]["is_current_user"] is True



def test_gamification_scan_reward_idempotency():
    """Verify duplicate scan reward calls with the same lot_id do not double-award XP."""
    mock_table = MagicMock()
    mock_table.update_item.return_value = {"Attributes": {"xp": Decimal("1500")}}

    with patch("src.gamification.app._table", return_value=mock_table), \
         patch.dict("os.environ", {"USERS_TABLE": "TestUsersTable"}):

        event = {
            "path": "/gamification/scan-reward",
            "body": json.dumps({
                "items": [{"component": "laptop", "count": 1, "condition": "intact"}],
                "user_id": "testuser@gmail.com",
                "lot_id": "lot_abc123",
                "last_scan_date": "2026-10-10",
                "current_streak": 2,
                "freeze_tokens": 1
            })
        }
        res = gamification_handler(event, None)
        assert res["statusCode"] == 200
        body = json.loads(res["body"])
        assert body["already_awarded"] is False
        assert body["total_xp"] > 0

        # Simulate conditional check failure on duplicate award
        from botocore.exceptions import ClientError
        mock_table.update_item.side_effect = ClientError(
            {"Error": {"Code": "ConditionalCheckFailedException", "Message": "The conditional request failed"}},
            "UpdateItem"
        )

        res2 = gamification_handler(event, None)
        assert res2["statusCode"] == 200
        body2 = json.loads(res2["body"])
        assert body2["already_awarded"] is True
        assert body2["total_xp"] == 0  # Zero XP awarded on duplicate!


def test_lucky_spin_conditional_cooldown_block():
    """Verify lucky spin enforces 24h conditional write and returns 429 when on cooldown."""
    from botocore.exceptions import ClientError

    mock_table = MagicMock()
    mock_table.update_item.side_effect = ClientError(
        {"Error": {"Code": "ConditionalCheckFailedException", "Message": "The conditional request failed"}},
        "UpdateItem"
    )

    with patch("src.gamification.app._table", return_value=mock_table), \
         patch.dict("os.environ", {"USERS_TABLE": "TestUsersTable"}):

        event = {
            "path": "/gamification/lucky-spin",
            "body": json.dumps({"user_id": "player@gmail.com"})
        }
        res = gamification_handler(event, None)
        assert res["statusCode"] == 429
        body = json.loads(res["body"])
        assert body["cooldown_active"] is True


def test_aggregates_atomic_updates():
    """Verify _update_aggregates updates summary#all and cell records atomically."""
    mock_table = MagicMock()
    lot = {
        "id": "lot123",
        "mock": False,
        "items": [{"component": "mobile_phone", "count": 2, "est_weight_g": 350}],
        "hazards": ["swollen_battery"],
        "total_min_inr": 200,
        "total_max_inr": 500,
        "cell_lat": 28.61,
        "cell_lon": 77.23
    }

    with patch("src.scan.pipeline._get_table", return_value=mock_table), \
         patch.dict("os.environ", {"AGGREGATES_TABLE": "TestAggregatesTable"}):
        _update_aggregates(lot)

        # Should have called update_item twice: once for summary#all, once for cell
        assert mock_table.update_item.call_count == 2
        calls = mock_table.update_item.call_args_list
        keys = [c[1]["Key"]["id"] for c in calls]
        assert "summary#all" in keys
        assert "cell#28.61#77.23" in keys


def test_hotspots_handler_uses_precomputed_aggregates():
    """Verify /hotspots handler reads from AggregatesTable TypeIndex without scanning LotsTable."""
    mock_agg_table = MagicMock()
    mock_agg_table.query.return_value = {
        "Items": [
            {"lat": Decimal("28.61"), "lon": Decimal("77.23"), "lot_count": Decimal("15"), "item_count": Decimal("30"), "hazard_count": Decimal("2")},
            {"lat": Decimal("28.55"), "lon": Decimal("77.18"), "lot_count": Decimal("8"), "item_count": Decimal("12"), "hazard_count": Decimal("0")},
        ]
    }

    with patch("boto3.resource") as mock_boto, \
         patch.dict("os.environ", {"AGGREGATES_TABLE": "TestAggregatesTable"}):
        mock_boto.return_value.Table.return_value = mock_agg_table
        res = stats_handler({}, None)
        assert res["statusCode"] == 200
        body = json.loads(res["body"])
        assert len(body["hotspots"]) == 2
        assert body["total_lots"] == 23
        assert body["hotspots"][0]["lot_count"] == 15
        assert body["hotspots"][0]["has_hazard"] is True


def test_lots_stats_uses_precomputed_summary():
    """Verify /stats handler reads precomputed summary#all when available."""
    mock_agg_table = MagicMock()
    mock_agg_table.get_item.return_value = {
        "Item": {
            "id": "summary#all",
            "total_lots": Decimal("120"),
            "total_weight_g": Decimal("85000"),
            "weight_kg_by_component": {"laptop": Decimal("50.0")},
            "hazard_counts": {"swollen_battery": Decimal("5")},
        }
    }
    mock_agg_table.query.return_value = {
        "Items": [
            {"lat": Decimal("28.61"), "lon": Decimal("77.23"), "lot_count": Decimal("20"), "hazard_count": Decimal("1"), "value_min_inr": Decimal("100"), "value_max_inr": Decimal("200")}
        ]
    }

    with patch("boto3.resource") as mock_boto, \
         patch.dict("os.environ", {"AGGREGATES_TABLE": "TestAggregatesTable"}):
        mock_boto.return_value.Table.return_value = mock_agg_table
        res = lots_handler({"pathParameters": None}, None)
        assert res["statusCode"] == 200
        body = json.loads(res["body"])
        assert body["lots"] == 120
        assert len(body["cells"]) == 1


def test_modular_lambda_authorizer():
    """Verify Lambda request authorizer accepts valid tokens and denies bad tokens."""
    token = _make_jwt({"id": "u_999", "email": "scout@kabadiai.in", "role": "admin"})
    auth_event = {"headers": {"Authorization": f"Bearer {token}"}}
    res = authorizer_handler(auth_event, None)
    assert res["isAuthorized"] is True
    assert res["context"]["email"] == "scout@kabadiai.in"

    bad_event = {"headers": {"Authorization": "Bearer invalid.signature.here"}}
    res_bad = authorizer_handler(bad_event, None)
    assert res_bad["isAuthorized"] is False

    empty_event = {"headers": {}}
    res_empty = authorizer_handler(empty_event, None)
    assert res_empty["isAuthorized"] is False

"""Chaos and Graceful Degradation Test Suite for KabadiAI:
  1. Gemini 429 / Rate Limit: Circuit breaker opens, fast-fails to AWS Bedrock
  2. Gemini Network Timeout: Per-provider timeout aborts, failover to Bedrock
  3. DynamoDB Throttling: ProvisionedThroughputExceededException gracefully falls back to static base prices
  4. High-Concurrency Gamification Race: Exactly-once reward processing via conditional writes
  5. Aggregates Failure Degradation: Graceful fallback from AggregatesTable to LotsTable scan
"""
from __future__ import annotations
import concurrent.futures
import json
import time
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest
from botocore.exceptions import ClientError

from src.scan.resilience import CircuitBreaker
from src.scan.pipeline import (
    ScanContext,
    DEFAULT_BASE_PRICES,
    get_price_row,
    scan_with_resilience,
)
from src.gamification.app import handler as gamification_handler
from src.stats.app import handler as stats_handler


def test_gemini_429_circuit_breaker_trips_and_fails_over_to_bedrock():
    """Verify that a 429 from Gemini trips the circuit breaker and subsequent calls fast-fail to Bedrock."""
    cb = CircuitBreaker("gemini_chaos_test", failure_threshold=2, recovery_timeout_s=10.0)

    # 1. First failure: Gemini 429
    assert cb.allow_request() is True
    cb.record_failure()
    assert cb.state == "CLOSED"

    # 2. Second failure: Gemini 429 -> Circuit breaker trips to OPEN
    cb.record_failure()
    assert cb.state == "OPEN"
    assert cb.allow_request() is False

    # 3. Simulate provider execution: when cb is OPEN, execute with fast fallback to Bedrock
    gemini_called = False
    bedrock_called = False

    def mock_gemini():
        nonlocal gemini_called
        gemini_called = True
        return None

    def mock_bedrock():
        nonlocal bedrock_called
        bedrock_called = True
        return {"items": [{"component": "mobile_phone", "count": 1, "condition": "intact"}], "confidence": 92}

    provider_results = cb.execute(mock_gemini, fallback_fn=mock_bedrock)

    assert gemini_called is False  # Gemini was never called (protected downstream)
    assert bedrock_called is True  # Bedrock immediately took over
    assert provider_results["confidence"] == 92


def test_gemini_timeout_failover_within_budget():
    """Verify that provider timeouts are strictly bounded and do not exhaust Lambda deadline."""
    ctx = ScanContext(image=b"fake-image", fmt="jpeg", lang="en", deadline=time.time() + 20.0)

    mock_gemini_hang = MagicMock(side_effect=TimeoutError("Gemini REST request timed out after 18s"))
    mock_bedrock_success = MagicMock(return_value=json.dumps({
        "items": [{"component": "laptop", "count": 1, "condition": "intact"}],
        "confidence": 88
    }))

    with patch("src.scan.pipeline.call_gemini", mock_gemini_hang), \
         patch("src.scan.pipeline.call_bedrock", mock_bedrock_success):

        start = time.perf_counter()
        raw_analysis = scan_with_resilience(ctx.image, ctx.fmt, ctx)
        elapsed = time.perf_counter() - start

        assert elapsed < 5.0  # Fast transition
        assert raw_analysis["confidence"] == 88
        assert len(raw_analysis["items"]) == 1


def test_dynamodb_throttle_gracefully_falls_back_to_default_prices():
    """Verify that DynamoDB throttling on PricesTable does not crash pricing, but uses resilient fallback prices."""
    mock_table = MagicMock()
    # Simulate DynamoDB ProvisionedThroughputExceededException
    mock_table.scan.side_effect = ClientError(
        {"Error": {"Code": "ProvisionedThroughputExceededException", "Message": "Throughput exceeded"}},
        "Scan"
    )
    mock_table.get_item.side_effect = ClientError(
        {"Error": {"Code": "ProvisionedThroughputExceededException", "Message": "Throughput exceeded"}},
        "GetItem"
    )

    with patch("src.scan.pipeline._get_table", return_value=mock_table), \
         patch("src.scan.pipeline._CACHE", {"prices": {}, "prices_expiry": 0, "recyclers": None, "recyclers_expiry": 0}), \
         patch.dict("os.environ", {"PRICES_TABLE": "ThrottledPricesTable"}):

        row_laptop = get_price_row("laptop")
        row_cpu = get_price_row("desktop_cpu")

        # Must return valid reference price rows from DEFAULT_BASE_PRICES
        assert row_laptop["component"] == "laptop"
        assert float(row_laptop["min_inr"]) > 0
        assert row_cpu["component"] == "desktop_cpu"
        assert float(row_cpu["min_inr"]) > 0


def test_concurrent_gamification_race_guarantees_idempotency():
    """Simulate 10 concurrent requests attempting to award XP for the same lot_id."""
    mock_table = MagicMock()

    # Track how many times UpdateItem succeeded
    success_count = 0
    failure_count = 0

    def mock_update_item(*args, **kwargs):
        nonlocal success_count, failure_count
        # Only the very first write succeeds, subsequent concurrent writes fail ConditionCheck
        if success_count == 0:
            success_count += 1
            return {"Attributes": {"xp": Decimal("2500")}}
        else:
            failure_count += 1
            raise ClientError(
                {"Error": {"Code": "ConditionalCheckFailedException", "Message": "Duplicate lot"}},
                "UpdateItem"
            )

    mock_table.update_item.side_effect = mock_update_item

    event = {
        "path": "/gamification/scan-reward",
        "body": json.dumps({
            "items": [{"component": "television", "count": 1, "condition": "broken"}],
            "user_id": "racer@kabadiai.in",
            "lot_id": "lot_concurrent_race_999",
            "last_scan_date": "2026-10-11",
            "current_streak": 1,
            "freeze_tokens": 0
        })
    }

    awarded_list = []

    with patch("src.gamification.app._table", return_value=mock_table), \
         patch.dict("os.environ", {"USERS_TABLE": "TestUsersTable"}):

        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(gamification_handler, event, None) for _ in range(10)]
            for f in concurrent.futures.as_completed(futures):
                res = f.result()
                body = json.loads(res["body"])
                awarded_list.append(body["already_awarded"])

    # Exactly 1 request awarded, 9 blocked by idempotency
    assert awarded_list.count(False) == 1
    assert awarded_list.count(True) == 9
    assert success_count == 1
    assert failure_count == 9


def test_hotspots_gracefully_degrades_when_aggregates_table_fails():
    """Verify that if AggregatesTable fails or errors, /hotspots seamlessly falls back to LotsTable scan."""
    mock_agg_table = MagicMock()
    mock_agg_table.query.side_effect = ClientError(
        {"Error": {"Code": "ResourceNotFoundException", "Message": "AggregatesTable not found"}},
        "Query"
    )

    mock_lots_table = MagicMock()
    mock_lots_table.scan.return_value = {
        "Items": [
            {"cell_lat": Decimal("28.61"), "cell_lon": Decimal("77.23"), "items": [{"count": 2}], "hazards": [], "mock": False}
        ]
    }

    def mock_table_factory(name):
        if "Aggregates" in name:
            return mock_agg_table
        return mock_lots_table

    with patch("boto3.resource") as mock_boto, \
         patch.dict("os.environ", {"AGGREGATES_TABLE": "BrokenAggregatesTable", "LOTS_TABLE": "ValidLotsTable"}):

        mock_boto.return_value.Table.side_effect = mock_table_factory

        res = stats_handler({}, None)
        assert res["statusCode"] == 200
        body = json.loads(res["body"])
        assert len(body["hotspots"]) == 1
        assert body["hotspots"][0]["lot_count"] == 1

"""Unit tests for Phase 2: Async Scan Pipeline, Circuit Breaker, Deduplication, and Rate Limiting."""
import os, time
import pytest

os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")
os.environ.setdefault("PRICES_TABLE", "dummy_prices")
os.environ.setdefault("RECYCLERS_TABLE", "dummy_recyclers")
os.environ.setdefault("LOTS_TABLE", "dummy_lots")
os.environ.setdefault("SCAN_JOBS_TABLE", "dummy_scan_jobs")
os.environ.setdefault("MOCK_ANALYSIS", "1")

from src.scan.resilience import (
    CircuitBreaker,
    CircuitBreakerOpenException,
    backoff_jitter,
    compute_image_hash,
    get_dedup_cached_result,
    put_dedup_cached_result,
    is_rate_limited,
)
from src.scan.pipeline import ScanContext, run_pipeline, clean_scan_response
import src.scan.app as scan_app


def test_circuit_breaker_transitions():
    """Circuit breaker opens after failure threshold and fails over or rejects."""
    cb = CircuitBreaker("test_breaker", failure_threshold=2, recovery_timeout_s=0.2)
    assert cb.state == "CLOSED"
    assert cb.allow_request() is True

    # 1. First failure
    def _fail(): raise RuntimeError("Gemini 503")
    with pytest.raises(RuntimeError):
        cb.execute(_fail)
    assert cb.state == "CLOSED"
    assert cb.failure_count == 1

    # 2. Second failure triggers OPEN state
    with pytest.raises(RuntimeError):
        cb.execute(_fail)
    assert cb.state == "OPEN"
    assert cb.allow_request() is False

    # 3. Fallback execution works when OPEN
    fallback_called = False
    def _fallback():
        nonlocal fallback_called
        fallback_called = True
        return "fallback_ok"

    res = cb.execute(_fail, fallback_fn=_fallback)
    assert res == "fallback_ok"
    assert fallback_called is True

    # 4. After recovery timeout, transitions to HALF_OPEN
    time.sleep(0.25)
    assert cb.allow_request() is True
    assert cb.state == "HALF_OPEN"

    # 5. Success in HALF_OPEN resets to CLOSED
    def _succeed(): return "recovered"
    cb.execute(_succeed)
    assert cb.state == "CLOSED"
    assert cb.failure_count == 0


def test_image_hash_and_deduplication():
    """Verify SHA-256 image hashing and deduplication cache."""
    img_a = b"fake-jpeg-binary-data-sample-A"
    img_b = b"fake-jpeg-binary-data-sample-B"

    hash_a1 = compute_image_hash(img_a, "en", 1000)
    hash_a2 = compute_image_hash(img_a, "en", 1000)
    hash_b = compute_image_hash(img_b, "en", 1000)

    assert hash_a1 == hash_a2
    assert hash_a1 != hash_b

    # Cache put and get
    dummy_scan = {"items": [{"component": "motherboard", "count": 1}], "confidence": 95}
    put_dedup_cached_result(hash_a1, dummy_scan)

    cached = get_dedup_cached_result(hash_a1)
    assert cached is not None
    assert cached["items"][0]["component"] == "motherboard"
    assert get_dedup_cached_result("non_existent_hash") is None


def test_rate_limiter_blocks_excessive_traffic():
    """Verify rate limiter blocks client IP after exceeding window threshold."""
    ip = "203.0.113.42"
    for _ in range(6):
        assert is_rate_limited(ip) is False
    # 7th call in the same 10-second window is throttled
    assert is_rate_limited(ip) is True


def test_scan_pipeline_mock_execution():
    """Verify pure ScanContext pipeline execution with mock analysis."""
    ctx = ScanContext(
        image=b"sample-bytes",
        fmt="jpeg",
        lat=28.6139,
        lon=77.2090,
        user_weight_g=1500,
        lang="hi",
        deadline=time.time() + 20,
    )
    result = run_pipeline(ctx)
    assert result["type"] == "result"
    assert "line_items" in result
    assert result["total_min_inr"] > 0
    assert "environmental_impact" in result
    assert result["environmental_impact"]["co2_offset_kg"] > 0
    assert result["user_weight_provided"] is True


def test_upload_url_handler(monkeypatch):
    """POST /scan/upload-url returns presigned URL and file key."""
    event = {
        "rawPath": "/scan/upload-url",
        "httpMethod": "POST",
        "body": '{"content_type": "image/jpeg", "file_size": 204800}',
        "requestContext": {"http": {"sourceIp": "198.51.100.1"}}
    }
    res = scan_app.handle_upload_url(event)
    assert res["statusCode"] == 200
    body = scan_app.json.loads(res["body"])
    assert "upload_url" in body
    assert "file_key" in body
    assert "job_id" in body
    assert body["file_key"].startswith("uploads/")
    assert body["file_key"].endswith(".jpeg")


def test_submit_job_handler_queued(monkeypatch):
    """POST /scan/jobs enqueues job and returns 202 with QUEUED status."""
    event = {
        "rawPath": "/scan/jobs",
        "httpMethod": "POST",
        "body": '{"file_key": "uploads/2026-10-11/abc.jpeg", "lat": 28.5, "lon": 77.2, "language": "en"}',
        "requestContext": {"http": {"sourceIp": "198.51.100.2"}}
    }
    res = scan_app.handle_submit_job(event)
    assert res["statusCode"] == 202
    body = scan_app.json.loads(res["body"])
    assert body["status"] == "QUEUED"
    assert "job_id" in body
    assert body["poll_interval_ms"] == 1500

# KabadiAI Load Testing Suite & Benchmark Guide

This directory contains automated performance and load testing scripts designed to validate KabadiAI against the targets required for **~50k Daily Active Users (DAU)**:
- **~150 req/sec peak read traffic** (`/stats`, `/hotspots`, `/recyclers`, `/gamification/leaderboard`, `/gamification/profile`)
- **~20 AI scans/sec peak throughput** (`/scan/upload-url`, `/scan/jobs`, `/scan/jobs/{id}`)
- **p95 Latency < 500 ms** for non-AI read endpoints
- **Zero user-visible cascading failures** during AI provider throttling

---

## 1. Test Scripts

| Script | Tool | Focus | Target Throughput |
|---|---|---|---|
| `k6_read_endpoints.js` | k6 | Read endpoint caching, TTL cache hit rates, CloudFront headers | 150 - 250 req/sec |
| `k6_scan_pipeline.js` | k6 | S3 upload URL -> SQS async job queue -> worker polling | 20 scans/sec |
| `k6_gamification_concurrency.js` | k6 | Atomic DynamoDB `UpdateItem`, 24h lucky spin limit, idempotency | 50 concurrent VUs |
| `load_test_runner.py` | Python 3 | Zero-dependency standalone runner with latency percentiles | Configurable |

---

## 2. Pass / Fail Criteria

| Metric | Target Threshold | Rationale |
|---|---|---|
| **Non-AI Read p95 Latency** | **< 500 ms** | Fast mobile responsiveness on 4G networks in India |
| **Non-AI Read p50 Latency** | **< 150 ms** | Module-level TTL cache hits return in < 50 ms |
| **Read Error Rate** | **< 1.0%** | Zero unexpected 5xx errors; 429 backoff respected |
| **Async Scan Submit p95** | **< 400 ms** | Immediate 202 QUEUED return avoids Lambda concurrency exhaustion |
| **Idempotency Integrity** | **100%** | Duplicate lot reward calls must return `already_awarded: true` with 0 duplicate XP |
| **Lucky Spin 24h Cooldown** | **100%** | Consecutive spins within 24h must return HTTP 429 |

---

## 3. Running with k6

Install k6 via Homebrew (macOS) or package manager:
```bash
brew install k6
```

### Profile A: Read Endpoints Ramp & Spike (Target 150 req/s)
```bash
API_URL="https://your-api-id.execute-api.us-east-1.amazonaws.com" k6 run loadtest/k6_read_endpoints.js
```

### Profile B: Async AI Scan Pipeline (Target 20 scans/s)
> **IMPORTANT**: Ensure the test environment has `MOCK_ANALYSIS=1` set on the Lambda functions before running to simulate realistic load without calling live Gemini/Bedrock APIs.
```bash
API_URL="https://your-api-id.execute-api.us-east-1.amazonaws.com" k6 run loadtest/k6_scan_pipeline.js
```

### Profile C: Gamification Concurrency & Idempotency
```bash
API_URL="https://your-api-id.execute-api.us-east-1.amazonaws.com" k6 run loadtest/k6_gamification_concurrency.js
```

---

## 4. Running with Standalone Python Runner (No k6 needed)

If k6 is not installed on your system, execute the standalone Python test runner:
```bash
# Quick health check (10 workers, 10s)
python3 loadtest/load_test_runner.py --url https://your-api-url --profile quick

# Ramp profile (30 workers, 45s)
python3 loadtest/load_test_runner.py --url https://your-api-url --profile ramp

# Spike profile (60 workers, 25s)
python3 loadtest/load_test_runner.py --url https://your-api-url --profile spike

# Soak profile (25 workers, 120s)
python3 loadtest/load_test_runner.py --url https://your-api-url --profile soak
```

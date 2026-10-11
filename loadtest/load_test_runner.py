#!/usr/bin/env python3
"""KabadiAI Standalone Load Test Runner (Python stdlib)
Executes concurrent load tests against read endpoints, gamification, and scan APIs.
Measures latency percentiles (p50, p90, p95, p99), throughput, and error rates.

Usage:
  python3 loadtest/load_test_runner.py --url http://localhost:3000 --profile ramp
  python3 loadtest/load_test_runner.py --url https://api.kabadiai.in --profile soak
"""
import argparse
import json
import math
import random
import sys
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

def calculate_percentiles(latencies):
    if not latencies:
        return {"p50": 0, "p90": 0, "p95": 0, "p99": 0, "min": 0, "max": 0, "avg": 0}
    sorted_l = sorted(latencies)
    n = len(sorted_l)
    def p(pct):
        k = (n - 1) * (pct / 100.0)
        f = math.floor(k)
        c = math.ceil(k)
        if f == c:
            return sorted_l[int(k)]
        return sorted_l[f] * (c - k) + sorted_l[c] * (k - f)

    return {
        "p50": round(p(50), 2),
        "p90": round(p(90), 2),
        "p95": round(p(95), 2),
        "p99": round(p(99), 2),
        "min": round(sorted_l[0], 2),
        "max": round(sorted_l[-1], 2),
        "avg": round(sum(sorted_l) / n, 2),
    }

def worker_request(base_url, endpoint):
    url = f"{base_url.rstrip('/')}{endpoint}"
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "KabadiAI-LoadTester/1.0",
            "X-Correlation-Id": f"pyload-{time.time_ns()}"
        }
    )
    start = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            resp.read()
            elapsed_ms = (time.perf_counter() - start) * 1000.0
            return resp.status, elapsed_ms, None
    except urllib.error.HTTPError as e:
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        return e.code, elapsed_ms, str(e)
    except Exception as exc:
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        return 0, elapsed_ms, str(exc)

def run_load_profile(base_url, concurrency, duration_sec, profile_name):
    print(f"\n=======================================================")
    print(f"Profile: {profile_name.upper()} | Concurrency: {concurrency} workers | Duration: {duration_sec}s")
    print(f"Target: {base_url}")
    print(f"=======================================================")

    read_endpoints = [
        "/stats",
        "/hotspots",
        "/recyclers?lat=28.6139&lon=77.2090",
        "/gamification/leaderboard?city=delhi&xp=1500&name=Tester",
        "/gamification/profile",
    ]

    latencies = []
    status_counts = {}
    errors = 0
    total_requests = 0

    deadline = time.time() + duration_sec
    start_time = time.time()

    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        while time.time() < deadline:
            batch_size = concurrency * 2
            futures = [
                executor.submit(worker_request, base_url, random.choice(read_endpoints))
                for _ in range(batch_size)
            ]
            for f in as_completed(futures):
                code, elapsed_ms, err = f.result()
                total_requests += 1
                latencies.append(elapsed_ms)
                status_counts[code] = status_counts.get(code, 0) + 1
                if code not in (200, 202, 204):
                    errors += 1

            elapsed_so_far = time.time() - start_time
            rps = total_requests / elapsed_so_far if elapsed_so_far > 0 else 0
            sys.stdout.write(f"\rProgress: {int(elapsed_so_far)}s / {duration_sec}s | Req: {total_requests} | Req/s: {rps:.1f} | Errors: {errors}")
            sys.stdout.flush()

    total_time = time.time() - start_time
    rps = total_requests / total_time if total_time > 0 else 0
    pcts = calculate_percentiles(latencies)

    print("\n\n--- RESULTS ---")
    print(f"Total Requests      : {total_requests}")
    print(f"Throughput          : {rps:.2f} req/sec")
    print(f"Error Rate          : {(errors / total_requests * 100 if total_requests else 0):.2f}%")
    print(f"Status Breakdown    : {status_counts}")
    print(f"p50 Latency         : {pcts['p50']} ms")
    print(f"p90 Latency         : {pcts['p90']} ms")
    print(f"p95 Latency         : {pcts['p95']} ms (Target: < 500 ms)")
    print(f"p99 Latency         : {pcts['p99']} ms")
    print(f"Min / Max / Avg     : {pcts['min']} ms / {pcts['max']} ms / {pcts['avg']} ms")

    # Target Verification
    passed = pcts['p95'] < 500 and (errors / total_requests if total_requests else 1) < 0.01
    print(f"Target Pass/Fail    : {'✅ PASS' if passed else '❌ FAIL'}")
    return passed

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="KabadiAI Load Test Runner")
    parser.add_argument("--url", default="http://localhost:3000", help="Base API URL")
    parser.add_argument("--profile", choices=["ramp", "spike", "soak", "quick"], default="quick", help="Load test profile")
    args = parser.parse_args()

    profiles = {
        "quick": (10, 10, "Quick Health Verification"),
        "ramp": (30, 45, "Ramp Profile (Target Peak 150 req/s simulation)"),
        "spike": (60, 25, "Spike Profile (Traffic Surge)"),
        "soak": (25, 120, "Soak Stability Profile"),
    }

    c, d, name = profiles[args.profile]
    run_load_profile(args.url, c, d, name)

# ADR-006: Edge Acceleration and Regional Latency Optimization

## Status
Accepted

## Context
KabadiAI's target audience is located in India (Delhi-NCR and nationwide metro centers), whereas the backend AWS infrastructure currently resides in `us-east-1` (N. Virginia).
1. Direct round-trip TLS handshakes and HTTP requests between mobile devices in India and `us-east-1` incur a baseline network latency penalty of ~180ms to 240ms per round trip.
2. Amazon Bedrock Nova models (e.g. `amazon.nova-2-lite-v1:0` / `amazon.nova-lite-v1:0`) were initially made generally available in US regions (`us-east-1`, `us-west-2`), meaning moving the entire backend immediately to `ap-south-1` (Mumbai) risks Bedrock model unavailability or cross-region invocation charges.

## Decision
1. **Front API Gateway with Amazon CloudFront:**
   - Deploy an Amazon CloudFront distribution with edge Points of Presence (POPs) in Mumbai, Delhi, Chennai, Hyderabad, Kolkata, and Bengaluru.
   - Mobile users establish TLS 1.3 connections to nearby Indian edge locations in < 25 ms.
   - CloudFront routes traffic across AWS's optimized global fiber backbone to `us-east-1`, reducing packet loss and mobile connection re-negotiation times.
2. **Edge HTTP Caching:**
   - Configure `Cache-Control` response headers with short TTLs (e.g., 60s max-age + 300s `stale-while-revalidate`) on safe GET endpoints: `/hotspots`, `/stats`, `/gamification/profile`, `/gamification/leaderboard`.
   - Repeated reads are served directly from Indian edge caches with p95 < 30 ms.

## Alternatives Considered
- **Direct Migration of SAM Stack to `ap-south-1`:** While latency to DynamoDB would be reduced, Bedrock Nova 2 Lite model IDs are not guaranteed to be active in `ap-south-1`. CloudFront edge acceleration provides immediate 60-70% latency reduction without model migration risks.

## Consequences
- **Positive:** TLS termination in India reduces perceived latency by ~180ms; static and cached API reads are served in < 30ms from local edge caches; protects origin from DDoS traffic.

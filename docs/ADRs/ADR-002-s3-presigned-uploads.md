# ADR-002: Direct-to-S3 Presigned Uploads vs Base64 API Gateway Payloads

## Status
Accepted

## Context
Previously, photo uploads were base64-encoded directly into the JSON request body sent to `/agent`.
1. Base64 encoding inflates file size by ~33%, turning a 3MB photo into a 4MB JSON payload.
2. API Gateway HTTP APIs enforce a strict 10MB payload ceiling, but large payloads increase memory footprint and network transfer time across Lambda execution environments.
3. Raw base64 decode consumes significant CPU and RAM in Python Lambda workers.

## Decision
Implement direct-to-S3 uploads via presigned URLs:
1. Client requests a pre-signed PUT URL via `POST /scan/upload-url` (specifying `content_type` and optional file size).
2. Backend returns a presigned S3 URL valid for 15 minutes, with constrained `ContentType` (`image/jpeg`, `image/png`, `image/webp`) and object key format `uploads/{YYYY-MM-DD}/{jobId}.{ext}`.
3. Client PUTs the binary image directly to S3 with native progress events.
4. S3 Bucket includes a Lifecycle Rule: objects under `uploads/` automatically expire and are permanently deleted after **1 day (24 hours)** to protect user privacy and cap storage costs.

## Alternatives Considered
- **Direct API Gateway multipart/form-data upload:** Requires binary media type configuration and Lambda still buffers the full raw image payload in memory.
- **Permanent S3 storage:** Rejected for e-waste photos; storing photos indefinitely is an unnecessary privacy liability and creates unbounded AWS storage cost growth.

## Consequences
- **Positive:** Bypasses API Gateway payload overhead; reduces Lambda memory pressure; privacy-preserving 24-hour expiration keeps storage cost under $1/month; allows chunked/resumable client uploads on unstable mobile data.

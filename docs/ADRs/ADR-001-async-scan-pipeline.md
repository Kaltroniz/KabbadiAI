# ADR-001: Asynchronous Scan Pipeline Architecture

## Status
Accepted

## Context
The legacy `/agent` endpoint receives an image as base64-encoded JSON, forwards it synchronously to Google Gemini REST (with an 18-second timeout), and falls back to AWS Bedrock Nova 2 Lite (with a 15-second timeout) inside a single AWS Lambda function.
Under high traffic (peak ~20 scans/sec):
1. Upstream AI provider latency variations or 429 rate-limiting push execution times near or past API Gateway's hard 30-second timeout limit.
2. Lambda concurrent executions spike ($20 \text{ scans/s} \times 15\text{s} = 300\text{ concurrency}$), risking account-wide throttling of other critical functions (auth, profile, stats).
3. Client network disconnections during a 15-second wait result in orphaned compute and wasted API spend.

## Decision
We decouple the scan pipeline into an asynchronous queue-worker architecture:
1. `POST /scan/jobs` creates a unique `jobId`, registers an initial record in `ScanJobsTable` with status `QUEUED`, enqueues a message to Amazon SQS (`ScanJobsQueue`), and returns HTTP 202 with `jobId` immediately (< 200 ms).
2. A dedicated `ScanWorkerFunction` processes SQS batches (batch size 5, maximum concurrency 80 to protect AI quotas).
3. The worker writes the completed assessment into `ScanJobsTable` (TTL 24 hours).
4. Clients poll `GET /scan/jobs/{jobId}` with exponential backoff (1s, 2s, 3s) until completion.
5. The legacy synchronous `POST /agent` endpoint is retained intact behind a feature flag (`ENABLE_LEGACY_SYNC_AGENT=true`) for full backwards compatibility.

## Alternatives Considered
- **Synchronous with Exponential Backoff inside API Gateway:** Rejected. Fails when total time exceeds 29 seconds. Exhausts Lambda concurrency.
- **AWS Step Functions Express Workflows:** Viable, but adds state transition billing ($1.00 per million transitions), more complex IAM, and SAM template verbosity compared to SQS + Lambda with native DLQ redrive.
- **WebSocket API (API Gateway WebSockets):** Adds connection state management in DynamoDB, heartbeats, and client reconnection logic. Polling `GET /scan/jobs/{id}` for a 3-5 second window is simpler, resilient across mobile network changes, and works naturally with PWA service worker background sync.

## Consequences
- **Positive:** API Gateway never times out (job submission is sub-200ms). SQS buffers spikes seamlessly. Workers retry failed jobs up to 3 times before routing to DLQ. Concurrency is strictly bounded.
- **Negative:** Client requires polling logic; handled cleanly with a reusable frontend polling hook.

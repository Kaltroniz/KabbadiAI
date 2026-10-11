# KabadiAI Operational Runbook & Incident Response Guide

## 1. System Overview & On-Call Quick Reference
KabadiAI runs on an AWS serverless event-driven architecture designed for **~50k DAU** (~20 scans/sec, ~150 read req/sec):
- **API Gateway (HTTP API)**: Enforces per-route throttling and CORS across endpoints.
- **Asynchronous Scan Pipeline**: `POST /scan/upload-url` (presigned S3 PUT) -> `POST /scan/jobs` -> SQS `ScanJobsQueue` -> Lambda `ScanWorkerFunction` -> DynamoDB `ScanJobsTable` (TTL 24h).
- **Resilience Engine**: In-memory module TTL caches (prices 300s, recyclers 600s), SHA-256 perceptual deduplication cache (24h), and a 3-state Circuit Breaker (`CLOSED` -> `OPEN` -> `HALF_OPEN`) with AWS Bedrock Nova fallback.
- **Data Layer**: DynamoDB on-demand tables (`PricesTable`, `RecyclersTable`, `LotsTable`, `UsersTable` with `LeaderboardIndex` GSI, and `AggregatesTable` with `TypeIndex` GSI).

---

## 2. CloudWatch Alarms & Incident Playbooks

### Alarm 1: `ScanJobsDLQAlarm`
- **Severity**: P1 / High
- **Condition**: `ApproximateNumberOfMessagesVisible >= 1` on `ScanJobsDLQ` for 1 minute.
- **Meaning**: One or more scan jobs failed 3 worker retry attempts and were placed on the Dead Letter Queue.
- **Root Causes**:
  1. Corrupted image binary in S3 bucket.
  2. Both Gemini REST and Bedrock Nova endpoints failed or returned invalid JSON schemas.
  3. DynamoDB `ScanJobsTable` or `LotsTable` access error / IAM misconfiguration.
- **Triage Steps**:
  1. Inspect CloudWatch Logs for `/aws/lambda/kabadiai-ScanWorkerFunction`:
     ```bash
     aws logs filter-log-events --log-group-name /aws/lambda/kabadiai-ScanWorkerFunction --filter-pattern "ERROR" --start-time $(date -v-1H +%s000)
     ```
  2. Inspect message payload in SQS DLQ:
     ```bash
     aws sqs receive-message --queue-url <ScanJobsDLQ_URL> --attribute-names All --max-number-of-messages 5
     ```
  3. Identify the `job_id`, check S3 image object existence, and check DynamoDB `ScanJobsTable` status.
- **Remediation**:
  - If downstream AI was temporarily exhausted, redrive DLQ messages back to main queue:
    ```bash
    aws sqs start-message-move-task --source-arn <ScanJobsDLQ_ARN> --destination-arn <ScanJobsQueue_ARN>
    ```

---

### Alarm 2: `ScanJobsBacklogAlarm`
- **Severity**: P2 / Medium
- **Condition**: `ApproximateNumberOfMessagesVisible > 200` on `ScanJobsQueue` for 2 consecutive 60s periods.
- **Meaning**: Worker throughput is slower than image intake rate, causing scan job queue backlog.
- **Root Causes**:
  1. Sudden viral traffic spike (> 50 uploads/sec).
  2. Gemini latency degradation (response times climbing to 12s+ per call).
  3. Lambda reserved concurrency limit (80) reached, causing SQS message throttles.
- **Triage Steps**:
  1. Check `ScanWorkerFunction` duration and throttles:
     ```bash
     aws cloudwatch get-metric-data ... --metric-name Duration --dimensions Name=FunctionName,Value=ScanWorkerFunction
     ```
  2. Check Gemini Circuit Breaker state: check logs for `Circuit Breaker 'gemini' is OPEN`.
- **Remediation**:
  1. If traffic surge is genuine, temporarily increase `ScanWorkerFunction` reserved concurrency from 80 to 150:
     ```bash
     aws lambda put-function-concurrency --function-name <WorkerFunctionName> --reserved-concurrent-executions 150
     ```
  2. If Gemini is hanging, verify Bedrock fallback is active or flip `PROVIDER_ORDER` to `bedrock,gemini`.

---

### Alarm 3: `ApiGateway5xxAlarm`
- **Severity**: P1 / High
- **Condition**: `5XXError >= 10` on HTTP API within 2 evaluation periods.
- **Meaning**: Server-side Lambda unhandled exceptions or timeout aborts.
- **Root Causes**:
  1. Lambda function crash or syntax error.
  2. Secrets Manager / SSM parameter fetch timeout.
  3. DynamoDB table throughput failure.
- **Triage Steps**:
  1. Query CloudWatch Insights across all Lambda log groups:
     ```sql
     fields @timestamp, @logStream, @message
     | filter @message like /Traceback/ or @message like /Exception/
     | sort @timestamp desc
     | limit 20
     ```
  2. Check specific failing endpoint via HTTP API access logs.

---

### Alarm 4: `ApiGateway429Alarm` (Throttled Rate Limit)
- **Severity**: P3 / Low-Medium
- **Condition**: Spike in 429 responses on HTTP API routes.
- **Meaning**: Legitimate user traffic or abusive bot scrapers hitting per-route throttling caps.
- **Triage Steps**:
  1. Check route-level metrics:
     - `/auth/login` or `/auth/register`: brute-force credential stuffing attack.
     - `/scan/upload-url` or `/scan/jobs`: user or script rapidly uploading images.
     - `/stats` or `/hotspots`: heavy automated scraper.
- **Remediation**:
  - If legitimate traffic exceeds expected peak (e.g. hackathon demo or viral press release):
    Update `RouteSettings` in `template.yaml` to double the burst and rate limits and run `sam deploy`.

---

## 3. Routine Operational Maintenance

### 1. Backfilling Leaderboard Attributes
When onboarding existing users to the `LeaderboardIndex` GSI:
```bash
python3 scripts/backfill_leaderboard.py --table UsersTable --dry-run
python3 scripts/backfill_leaderboard.py --table UsersTable --region us-east-1
```

### 2. Backfilling Pre-Aggregated Statistics
When rebuilding `AggregatesTable` summaries and cell counters:
```bash
python3 scripts/backfill_aggregates.py --lots-table LotsTable --aggregates-table AggregatesTable --dry-run
python3 scripts/backfill_aggregates.py --lots-table LotsTable --aggregates-table AggregatesTable --region us-east-1
```

### 3. Rotating Secrets Safely
`JWT_SECRET` and `GEMINI_API_KEY` are stored in SSM Parameter Store (`SecureString`):
```bash
aws ssm put-parameter --name "/kabadiai/prod/gemini_api_key" --value "<NEW_KEY>" --type "SecureString" --overwrite
```
Lambda functions automatically pick up the new secret after cold restart or cache expiry.

---

## 4. Disaster Recovery & Rollback Matrix

| Failure Mode | Impact | Automated Defense | Manual Remediation |
|---|---|---|---|
| **Gemini Outage / Rate Limit** | Photo scan analysis | Circuit Breaker fast-trips to Bedrock Nova | Set `PROVIDER_ORDER=bedrock` in SAM template |
| **Bedrock Quota Exceeded** | AI Fallback | Deduplication cache returns cached results | Request quota increase via AWS Service Quotas |
| **LotsTable Throttling** | Ledger write delay | Anonymous lot save errors caught; does not break scan response | DynamoDB is on-demand; auto-scales automatically |
| **Broken Lambda Deploy** | API endpoint errors | SAM automatic CloudFormation rollback | `sam deploy --rollback` or deploy previous Git tag |

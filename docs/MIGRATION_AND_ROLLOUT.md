# KabadiAI Scalability Migration & Rollout Plan

This document details the step-by-step deployment procedure, backfill workflows, feature flag flips, manual account actions, and rollback protocols across all phases of the scalability architecture.

---

## 1. Manual Prerequisites & User Account Setup

Before deploying the CloudFormation stack via AWS SAM, the following one-time AWS account actions should be performed in the target AWS Region (`us-east-1`):

### 1.1 Enable AWS Bedrock Model Access
Ensure Amazon Bedrock Nova Lite model access is granted:
1. Open the **AWS Management Console** -> **Amazon Bedrock** -> **Model access**.
2. Request access to `Amazon Nova 2 Lite` (`amazon.nova-2-lite-v1:0`).
3. Model access is approved immediately within the AWS console.

### 1.2 Store Secrets in AWS Systems Manager (SSM) Parameter Store
To avoid plaintext secrets in CloudFormation parameters:
```bash
# 1. Store Gemini API Key (SecureString)
aws ssm put-parameter \
  --name "/kabadiai/prod/gemini_api_key" \
  --value "<YOUR_ACTUAL_GEMINI_KEY>" \
  --type "SecureString"

# 2. Store JWT Signing Secret (SecureString)
aws ssm put-parameter \
  --name "/kabadiai/prod/jwt_secret" \
  --value "$(openssl rand -hex 32)" \
  --type "SecureString"
```

---

## 2. Phase-by-Phase Deployment Sequence

### Step 1: Local Verification (Zero Mutation)
Verify all tests and build artifacts locally:
```bash
# 1. Run all 39 backend pytest tests (100% green)
python3 -m pytest tests/ -v

# 2. Lint CloudFormation SAM template
cfn-lint template.yaml

# 3. Compile frontend Next.js production bundle
cd frontend && npm run build && cd ..
```

---

### Step 2: Deploy Infrastructure via AWS SAM
Deploy the CloudFormation template using SAM CLI:
```bash
sam build
sam deploy --guided
```
When prompted for parameters:
- `Stack Name`: `kabadiai-backend`
- `AWS Region`: `us-east-1`
- `GeminiApiKey`: `/kabadiai/prod/gemini_api_key` (SSM path)
- `JwtSecret`: `/kabadiai/prod/jwt_secret` (SSM path)
- `AllowedOrigins`: `http://localhost:3000,https://main.*.amplifyapp.com`
- `MockAnalysis`: `0`
- `Confirm changes before deploy`: `Y`

---

### Step 3: Run Database Backfill Scripts
Once `UsersTable` and `AggregatesTable` are provisioned with their new GSIs:

#### 3.1 Backfill Leaderboard Index GSI
Populates `leaderboard_key="national"`, `xp`, and `city` on existing user records:
```bash
# Dry run check first
python3 scripts/backfill_leaderboard.py --table <UsersTableName> --dry-run

# Live execution
python3 scripts/backfill_leaderboard.py --table <UsersTableName> --region us-east-1
```

#### 3.2 Backfill Pre-Aggregated Statistics & Hotspots
Aggregates existing non-mock lots into `summary#all` and `cell#<lat>#<lon>` in `AggregatesTable`:
```bash
# Dry run check first
python3 scripts/backfill_aggregates.py --lots-table <LotsTableName> --aggregates-table <AggregatesTableName> --dry-run

# Live execution
python3 scripts/backfill_aggregates.py --lots-table <LotsTableName> --aggregates-table <AggregatesTableName> --region us-east-1
```

---

### Step 4: Frontend Rollout & Feature Flag Verification

The frontend automatically detects the async scan pipeline capability. Environment variables can be configured in AWS Amplify or `.env.local`:

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | CloudFormation Output `ApiUrl` | Backend API base URL |
| `NEXT_PUBLIC_ASYNC_SCAN` | `"1"` | Enables S3 presigned PUT + SQS worker polling (set `"0"` to revert to sync `/agent`) |
| `NEXT_PUBLIC_MAP_TILE_URL` | CartoCDN Dark Tiles | Configurable dark mode map tiles |

Deploy the frontend via AWS Amplify:
```bash
cd frontend
npm run build
# Commit and push to git branch connected to AWS Amplify
```

---

## 3. Rollback Procedures

If an issue is detected post-deployment, follow the specific rollback procedure:

### Scenario A: Async Scan Worker Issue
- **Symptom**: CloudWatch alarm `ScanJobsDLQAlarm` or `ScanJobsBacklogAlarm` fires.
- **Instant Mitigation**: Flip frontend feature flag `NEXT_PUBLIC_ASYNC_SCAN=0` in AWS Amplify environment variables. The frontend will immediately route all scans through the legacy synchronous `/agent` endpoint without code changes.

### Scenario B: AI Provider Rate Limiting
- **Symptom**: Gemini API throws persistent 429s.
- **Mitigation**: The Circuit Breaker automatically fails over to AWS Bedrock Nova. To bypass Gemini entirely, update the SAM parameter `PROVIDER_ORDER=bedrock,gemini` and redeploy.

### Scenario C: Complete CloudFormation Stack Rollback
To revert the backend stack to the previous stable release:
```bash
aws cloudformation rollback-stack --stack-name kabadiai-backend
```
Or redeploy the previous Git tag using SAM.

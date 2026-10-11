# KabadiAI High-Scalability Architecture Specification

This document details the target architecture, data flows, and component interactions designed to support 50,000 DAU at sub-second p95 latencies.

## 1. System Topology Overview

```mermaid
graph TB
    subgraph Clients["Clients & Edge Network"]
        MobilePWA["Mobile PWA (Amplify Hosting)"]
        SW["Service Worker Cache & Offline Queue"]
        CF["CloudFront Global Edge CDN (India Edge POPs)"]
    end

    subgraph API_Tier["API Gateway HTTP API v2"]
        APIGW["HttpApi Gateway (us-east-1)"]
        RouteRead["Read Route Settings (Burst: 200, Rate: 150)"]
        RouteWrite["Write Route Settings (Burst: 40, Rate: 20)"]
    end

    subgraph Async_Engine["Async AI Processing Subsystem"]
        S3Bucket[("S3 Uploads Bucket<br/>(24h Lifecycle Expiration)")]
        SQSQueue["SQS ScanJobsQueue<br/>(DLQ attached)"]
        WorkerLambda["ScanWorkerFunction<br/>(Batch Size: 5, Max Concurrency: 80)"]
        DedupCache[("ScanDedupCache<br/>SHA-256 Hash Matching")]
    end

    subgraph AI_Core["Resilient AI Engine"]
        CB["Circuit Breaker<br/>(Max Failures: 3, Cooloff: 30s)"]
        GeminiFlash["Google Gemini Flash REST"]
        BedrockNova["AWS Bedrock Nova 2 Lite"]
    end

    subgraph Storage_Tier["DynamoDB On-Demand Tables"]
        ScanJobs[("ScanJobsTable (TTL 24h)")]
        UsersTbl[("UsersTable (GSI: city-xp-index)")]
        AggregatesTbl[("AggregatesTable (Hotspots & Stats)")]
        PricesTbl[("PricesTable (In-Memory Cached)")]
        RecyclersTbl[("RecyclersTable (In-Memory Cached)")]
    end

    MobilePWA --> CF
    CF --> APIGW
    APIGW --> RouteRead
    APIGW --> RouteWrite

    RouteWrite -->|1. Get Presigned URL| MobilePWA
    MobilePWA -->|2. Direct PUT Image| S3Bucket
    MobilePWA -->|3. POST /scan/jobs| SQSQueue
    SQSQueue --> WorkerLambda
    WorkerLambda --> DedupCache
    WorkerLambda --> CB
    CB -->|Primary| GeminiFlash
    CB -.->|Fallback| BedrockNova
    WorkerLambda --> ScanJobs
    MobilePWA -->|4. Poll /scan/jobs/{id}| ScanJobs

    RouteWrite -->|Atomic Gamification Updates| UsersTbl
    WorkerLambda -->|Atomic Lot Aggregation| AggregatesTbl
    RouteRead -->|Cached Reads| AggregatesTbl
    RouteRead -->|GSI Query| UsersTbl
```

## 2. Asynchronous Scan Pipeline Sequence Flow

```mermaid
sequenceDiagram
    autonumber
    actor User as User / Mobile Browser
    participant S3 as S3 Uploads Bucket
    participant API as API Gateway (HttpApi)
    participant SQS as SQS ScanJobsQueue
    participant Worker as ScanWorker Lambda
    participant DDB as ScanJobsTable
    participant AI as Gemini / Bedrock

    User->>API: POST /scan/upload-url {contentType: "image/jpeg"}
    API-->>User: 200 OK {uploadUrl, fileKey, jobId}
    
    User->>S3: PUT /uploads/{jobId}.jpeg (Binary Stream)
    S3-->>User: 200 OK
    
    User->>API: POST /scan/jobs {jobId, fileKey, lat, lon, user_weight_g, language}
    API->>SQS: Enqueue Job Message
    API->>DDB: PutItem {jobId, status: "QUEUED", created_at}
    API-->>User: 202 Accepted {jobId, status: "QUEUED", poll_interval_ms: 1500}

    SQS->>Worker: Consume Message Batch
    Worker->>DDB: UpdateItem {status: "PROCESSING"}
    Worker->>S3: Get Object (Read Bytes)
    Worker->>Worker: Check SHA-256 Image Cache
    alt Cache Hit
        Worker->>Worker: Use Cached AI Detections
    else Cache Miss
        Worker->>AI: Invoke Gemini (with Circuit Breaker)
        alt Gemini Fails / 429
            Worker->>AI: Failover to Bedrock Nova 2 Lite
        end
    end
    Worker->>Worker: Deterministic Pricing, Safety, Recyclers (In-Memory Cache)
    Worker->>DDB: PutItem {jobId, status: "COMPLETED", result: {...}}

    loop Polling (1.5s - 3s backoff)
        User->>API: GET /scan/jobs/{jobId}
        API->>DDB: GetItem(jobId)
        alt Job Processing
            API-->>User: 200 OK {status: "PROCESSING"}
        else Job Completed
            API-->>User: 200 OK {status: "COMPLETED", result: {...}}
        end
    end
```

## 3. Server-Authoritative Gamification Flow

```mermaid
sequenceDiagram
    autonumber
    actor User as User
    participant API as API Gateway
    participant Gamify as Gamification Lambda
    participant Users as UsersTable

    User->>API: POST /gamification/scan-reward (Bearer JWT, scanResult, lotId)
    API->>Gamify: Forward Request with Claims
    Gamify->>Gamify: Verify Scan & Lot ID (Idempotency Key)
    Gamify->>Users: UpdateItem with Atomic Expressions:<br/>ADD xp :gain, total_weight_g :wt<br/>SET last_scan_date = :today, streak = :st<br/>Condition: attribute_not_exists(processed_lots.#lotId)
    Users-->>Gamify: Return New Values
    Gamify-->>User: 200 OK {total_xp, new_level, streak, bonuses, idempotent: true}
```

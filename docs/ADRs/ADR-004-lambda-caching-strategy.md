# ADR-004: Lambda In-Memory TTL Caching vs DynamoDB DAX

## Status
Accepted

## Context
Every invocation of `/agent` queried DynamoDB `PricesTable` for each identified component and performed a full scan of `RecyclersTable` (~300 items). Under 20 scans/sec, this triggers 20 full table scans per second of recyclers data and up to 100 GetItem requests per second on prices data.
However:
- The Prices table contains exactly 28 rows, which change on a weekly or monthly schedule.
- The Recyclers table contains ~300 authorized DPCC/CPCB facilities, updated very infrequently.

## Decision
Implement module-level in-memory TTL caching inside Lambda execution environments:
1. Maintain an in-memory cache dictionary with a configurable TTL (e.g., 5 minutes for prices, 10 minutes for recyclers).
2. On first invocation (cold start), load the dataset and cache it in the container global scope.
3. Subsequent warm invocations serve queries in < 0.1 ms directly from RAM with zero DynamoDB calls.
4. When TTL expires, the warm container refreshes asynchronously or synchronously on the next call.
5. Reuse persistent `boto3.resource` and `boto3.client` sessions across invocations by initializing them once outside the handler.

## Alternatives Considered
- **DynamoDB Accelerator (DAX):** Provides microsecond caching, but requires running inside a VPC and costs minimum ~$150-$200/month for a 3-node cluster. Gross overkill for 28 price items and 300 recyclers.
- **Querying DynamoDB on every call:** Wasteful RCU consumption and adds 10-30ms round-trip latency per request.

## Consequences
- **Positive:** Cache hit ratio > 99.9% under sustained traffic. Recyclers and prices lookups become 0.1 ms in-memory operations. DynamoDB RCUs on these tables drop from thousands per minute to near zero.
- **Negative:** Updates take up to 5-10 minutes to propagate across all warm Lambda instances; fully acceptable for reference prices and recycler directories.

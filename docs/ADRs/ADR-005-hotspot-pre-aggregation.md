# ADR-005: Hotspot and Insights Pre-Aggregation vs Full Table Scans

## Status
Accepted

## Context
Endpoints `/hotspots`, `/stats`, and `/analyst` performed full table scans over `LotsTable` to calculate aggregate metrics (lots per ~1km grid cell, kg per component, hazard count).
As user activity scales to 75,000 scans per day:
- `LotsTable` grows to hundreds of thousands of items over its 30-day TTL window.
- Scanning hundreds of thousands of items will exceed Lambda memory and execution time limits (> 30s), resulting in 502/504 errors on `/hotspots` and `/stats`.
- DynamoDB scan cost scales linearly $O(N)$ with table size.

## Decision
Implement a pre-aggregated data layer for analytics:
1. Maintain pre-aggregated statistics in an `AggregatesTable`:
   - Summary statistics item: `PK = "summary#all"`, tracking total lots, material weights, and hazard occurrences via atomic `ADD` operations during scan saves.
   - Grid cell items: `PK = "cell#<cell_lat>#<cell_lon>"`, tracking `lot_count`, `item_count`, and `hazard_count`.
2. `/stats` and `/hotspots` query this aggregated dataset directly:
   - Reading summary totals is a single $O(1)$ `GetItem`.
   - Reading active map hotspots is a lightweight query or fast scan over only the active geographic cells, rather than millions of raw individual lot records.
3. For backwards compatibility and safe deployment, if the aggregate item is missing or during backfill, fallback to paginated bounded scan with a short circuit.

## Alternatives Considered
- **DynamoDB Streams to Lambda Aggregator:** Excellent pattern; can be layered on if write contention on single summary items becomes an issue. For 20 writes/sec, direct atomic `UpdateItem` with `ADD` or sharded counter buckets (10 shards) provides great simplicity.

## Consequences
- **Positive:** Latency for `/hotspots` and `/stats` drops from multiple seconds to < 100 ms, completely independent of total historical scan volume.
- **Negative:** Slightly increased write-time logic when persisting a new lot.

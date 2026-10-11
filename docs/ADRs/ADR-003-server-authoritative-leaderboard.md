# ADR-003: Server-Authoritative Leaderboard Architecture

## Status
Accepted

## Context
In the prototype implementation, `/gamification/leaderboard` received client-provided query parameters (`?xp=1250&name=You&kg=14.5`) and injected the caller into an in-memory mock leaderboard. This allows bad actors to manipulate client state to forge top ranks. Furthermore, scanning the full `UsersTable` at scale is an $O(N)$ operation that rapidly degrades and consumes excessive DynamoDB RCUs.

## Decision
1. **Server-Authoritative Ranks:** The backend queries authenticated user records by `user_id` or JWT identity directly from DynamoDB `UsersTable`. Client query parameters for XP and weight are strictly ignored for authorized updates and rankings.
2. **DynamoDB Global Secondary Index (GSI):** Create a GSI on `UsersTable`:
   - Partition Key: `leaderboard_key` (e.g., `city#delhi`, `national`)
   - Sort Key: `xp` (Number, descending scan)
   - Projection: `INCLUDE` (`name`, `avatar`, `level`, `kg_diverted`, `user_id`)
3. For hot top-20 leaderboards, the query reads only the top 20 items from the GSI with `ScanIndexForward=False` and `Limit=20`, completing in < 15 ms and consuming only ~2-4 RCUs.
4. User rank calculation: Top-20 + current user rank lookup via efficient partition projection or pre-aggregated rank buckets.

## Alternatives Considered
- **ElastiCache Redis Sorted Sets (`ZADD` / `ZREVRANGE`):** Outstanding for millions of concurrent real-time rank updates, but introduces a dedicated VPC requirement, NAT Gateway charges (~$32/month per NAT GW), and minimum node sizing (~$18/month). At 50k DAU, DynamoDB GSI + short edge cache headers provides identical performance at negligible cost without VPC overhead.

## Consequences
- **Positive:** Complete elimination of client score spoofing; sub-20ms reads without full-table scans; zero VPC/Redis infrastructure cost.

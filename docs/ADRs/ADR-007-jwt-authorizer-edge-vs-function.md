# ADR-007: JWT Authentication Architecture (Edge Gateway vs Function-Level vs Modular Authorizer)

## Context
KabadiAI features a multilingual Progressive Web App designed to lower the friction for community e-waste recycling in India. Users can immediately photograph e-waste, receive real-time AI computer vision identification, get component valuation, locate authorized CPCB recyclers, and view regional hotspot maps without mandatory sign-up or login walls.

For gamification, streaks, collectible card trading, and bulk pickup requests, users can optionally register/log in via email/password or Google OAuth (`/auth/login`, `/auth/register`, `/auth/google`). Tokens are issued as standard HMAC-SHA256 (HS256) symmetric JSON Web Tokens signed by `JWT_SECRET`.

In Phase 3, we evaluated whether to migrate token verification from Lambda handlers to an edge API Gateway authorizer.

## Options Considered

### Option 1: Native HTTP API JWT Authorizer (`Type: JWT`)
- **Mechanism**: API Gateway natively validates JWT signatures before invoking any backend Lambda function.
- **Limitation**: API Gateway's native JWT authorizer strictly requires asymmetric cryptography (RS256, ES256, EdDSA) paired with an OpenID Connect (OIDC) Discovery URL / JSON Web Key Set (JWKS) endpoint. It does **not** support symmetric HS256 JWTs signed with a shared secret (`JWT_SECRET`).
- **Verdict**: Incompatible with the existing token signing algorithm without a breaking redesign of the entire auth subsystem (introducing an external IdP like AWS Cognito or an asymmetric JWKS service).

### Option 2: Route-Level Lambda Request Authorizer (`Type: Request`)
- **Mechanism**: A dedicated Python Lambda authorizer verifies the `Authorization: Bearer <token>` header, caching the authorization result for 300 seconds using `AuthorizerPayloadFormatVersion: 2.0`.
- **Limitation**: If attached as the `DefaultAuthorizer` across the HttpApi, all unauthenticated requests (such as guest scans, viewing recyclers, viewing public stats/hotspots) would be rejected with `401 Unauthorized` at the edge gateway.
- **Verdict**: Would severely break viral onboarding and guest user flows.

### Option 3: Selected Edge Route Authorizer + Function-Level Hybrid (Selected)
- **Mechanism**:
  1. All public browsing and onboarding routes (`/agent`, `/scan/*`, `/price`, `/recyclers`, `/stats`, `/lots/{id}`, `/hotspots`, `/pickup`) remain unblocked to maximize reach.
  2. Authenticated user endpoints (`/auth/me`, `/gamification/scan-reward`, `/gamification/lucky-spin`) validate tokens with fast in-memory cached secrets (`_jwt_secret()` SSM cache).
  3. A modular Lambda request authorizer (`src/auth/authorizer.py`) is provided in the repository, ready to be attached to private route groups (e.g. `/user/*`, `/admin/*`) when multi-tenant administrative dashboards are added.

## Decision
Retain hybrid function-level validation for guest-tolerant endpoints with SSM parameter caching, and provide `src/auth/authorizer.py` for edge-cached authorization when private administrative routes are configured.

## Consequences
- **Positive**: 100% backward compatible; zero friction for first-time unauthenticated users scanning e-waste; no external Cognito or JWKS server costs.
- **Negative**: User-authenticated endpoints run ~1ms of HMAC-SHA256 verification in Python, which is negligible compared to DynamoDB calls.

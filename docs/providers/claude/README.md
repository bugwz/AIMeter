# Claude Usage Query Implementation

This document describes the complete implementation of Claude usage/quota querying in AIMeter, covering authentication modes, API endpoints, data parsing, token refresh, error handling, and the overall data flow.

---

## Table of Contents

1. [Authentication Modes Overview](#1-authentication-modes-overview)
2. [Cookie Authentication](#2-cookie-authentication)
3. [OAuth Authentication](#3-oauth-authentication)
4. [Usage Data Structure & Parsing](#4-usage-data-structure--parsing)
5. [Percentage & Cost Normalization](#5-percentage--cost-normalization)
6. [Account Type Detection](#6-account-type-detection)
7. [Refresh Protection Mechanism](#7-refresh-protection-mechanism)
8. [Error Handling](#8-error-handling)
9. [Data Flow Summary](#9-data-flow-summary)
10. [File Index](#10-file-index)

---

## 1. Authentication Modes Overview

The Claude adapter (`src/adapters/ClaudeAdapter.ts`) implements the `IProviderAdapter` interface and supports two authentication modes:

| Mode | `AuthType` | Use Case |
|------|-----------|----------|
| Cookie | `AuthType.COOKIE` | Access claude.ai Web API using browser `sessionKey` cookie |
| OAuth  | `AuthType.OAUTH`  | Access Anthropic API using OAuth 2.0 + PKCE access token |

Both modes ultimately return a `UsageSnapshot` containing a `progress` array (rate-limit windows) and an optional `cost` snapshot (overage spending).

---

## 2. Cookie Authentication

### 2.1 Credential Format

```typescript
{ type: AuthType.COOKIE; value: string; source?: 'browser' | 'manual' }
```

The `value` field accepts:
- A raw `sessionKey` value (e.g. `sk-ant-...`)
- A full cookie string with semicolon-separated key-value pairs

### 2.2 Cookie Parsing Logic

The adapter calls `parseClaudeCookiePairs()` to normalize the raw input:

1. Strips leading/trailing quotes and the `cookie:` prefix
2. If the value starts with `sk-ant-`, treats it directly as the `sessionKey`
3. Splits on semicolons and filters out browser-only attributes (`path`, `expires`, `domain`, etc.)
4. Deduplicates entries, preserving explicitly provided `sessionKey` values

### 2.3 Request Header Construction

All cookie-mode requests use the following headers to simulate a browser session:

```typescript
{
  Cookie: cookieHeader,
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Origin: 'https://claude.ai',
  Referer: 'https://claude.ai/',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ...',
}
```

### 2.4 API Endpoints

Base URL: `https://claude.ai/api`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/organizations` | GET | Validate the cookie and list organizations |
| `/api/account` | GET | Fetch account info (email, membership, plan) |
| `/api/organizations/{orgId}/usage` | GET | Fetch usage data (Session / Weekly windows) |
| `/api/organizations/{orgId}/overage_spend_limit` | GET | Fetch overage spending data |

### 2.5 Credential Validation

```
GET /api/organizations
  ├─ 200 OK  → parse orgId → valid: true
  ├─ 401/403 → cookie expired/invalid → prompt user to re-copy sessionKey
  └─ empty[] → no organizations found → valid: false
```

---

## 3. OAuth Authentication

### 3.1 OAuth Service Configuration

The OAuth flow is managed by `server/services/ClaudeOAuthService.ts` using a fixed client configuration:

```
Client ID:    9d1c250a-e61b-44d9-88ed-5944d1962f5e
Authorize:    https://claude.ai/oauth/authorize
Token URL:    https://platform.claude.com/v1/oauth/token
Redirect URI: https://platform.claude.com/oauth/code/callback
Scope:        org:create_api_key user:profile user:inference
              user:sessions:claude_code user:mcp_servers
```

### 3.2 Authorization Code Flow (PKCE)

**Step 1 — Generate Authorization URL**

```
POST /providers/claude/oauth/generate-auth-url
→ Server generates state + code_verifier (32 random bytes, base64url-encoded)
→ code_challenge = base64url(SHA256(code_verifier))
→ Stores session with 30-minute TTL
← { authUrl: "https://claude.ai/oauth/authorize?...", sessionId: "uuid" }
```

**Step 2 — User Authorizes in Browser**

The user visits `authUrl`. Claude redirects to the callback URI with `code` and `state` query parameters.

**Step 3 — Exchange Code for Tokens**

```
POST /providers/claude/oauth/exchange-code
Body: { sessionId, code, state? }

→ Verify session has not expired (within 30 minutes)
→ POST https://platform.claude.com/v1/oauth/token
   Body: { code, grant_type: "authorization_code", client_id,
           redirect_uri, code_verifier, state? }
← { accessToken, refreshToken, expiresAt, clientId }
```

### 3.3 OAuth Credential Format

```typescript
{
  type: AuthType.OAUTH;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date | string;   // ISO 8601
  scope?: string;
  clientId?: string;
}
```

### 3.4 API Endpoints

| Endpoint | Method | Purpose | Key Headers |
|----------|--------|---------|-------------|
| `https://api.anthropic.com/api/oauth/usage` | GET | Fetch usage data | `Authorization: Bearer {token}`, `anthropic-beta: oauth-2025-04-20` |
| `https://api.anthropic.com/api/oauth/profile` | GET | Fetch account type | Same as above |
| `https://platform.claude.com/v1/oauth/token` | POST | Refresh access token | `Content-Type: application/x-www-form-urlencoded` |

### 3.5 Token Refresh Strategy

The adapter implements both **proactive** and **reactive** token refresh:

```
fetchOAuthUsageWithRefresh()
  │
  ├─ Proactive refresh: token expiring within max(refreshInterval, 5) minutes?
  │   └─ Yes → perform refresh_token grant, update credentials in memory
  │
  ├─ GET https://api.anthropic.com/api/oauth/usage
  │   └─ Success → parse and return UsageSnapshot
  │
  └─ Failed (401 / token expired / access denied)?
      └─ Yes → Reactive refresh: perform refresh_token grant
               → Retry GET /api/oauth/usage
               → ProviderUsageService persists updated credentials to DB
```

**Token refresh request:**

```http
POST https://platform.claude.com/v1/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&refresh_token={token}&client_id={clientId}
```

**Expiration threshold:**

```typescript
// Trigger proactive refresh if token expires within max(refreshInterval, 5) minutes
const thresholdMs = Math.max(refreshInterval, 5) * 60 * 1000;
return (expiresAt - Date.now()) < thresholdMs;
```

**Credential persistence:**
`ProviderUsageService` fingerprints OAuth credentials (JSON serialization of `accessToken`, `refreshToken`, `expiresAt`, etc.) before and after the fetch. If the fingerprint changed, it calls `storage.updateProvider()` to persist the refreshed tokens to the database.

---

## 4. Usage Data Structure & Parsing

### 4.1 OAuth Usage Response

Sample response (see `demo.1.json` / `demo.2.json`):

```json
{
  "five_hour": {
    "utilization": 0,
    "resets_at": "2026-03-08T12:00:00.693264+00:00"
  },
  "seven_day": {
    "utilization": 14,
    "resets_at": "2026-03-14T08:00:00.693283+00:00"
  },
  "seven_day_oauth_apps": null,
  "seven_day_sonnet": null,
  "extra_usage": {
    "is_enabled": false,
    "monthly_limit": null,
    "used_credits": null
  }
}
```

| Field | Description |
|-------|-------------|
| `five_hour.utilization` | Session (5-hour) window usage rate, 0–1 or 0–100 |
| `seven_day.utilization` | Weekly (7-day) window usage rate |
| `seven_day_oauth_apps` | Fallback for `seven_day` when the primary field is null |
| `seven_day_sonnet` | Dedicated Sonnet quota window for Max / Enterprise accounts |
| `extra_usage` | Overage spending data (only valid when `is_enabled` is true) |

**Parsing strategy:**

1. `five_hour` → `Session` window (300 minutes)
2. `seven_day` preferred; falls back to `seven_day_oauth_apps` → `Weekly` window (10,080 minutes)
3. Max / Enterprise account with `seven_day_sonnet` present → append `Weekly Sonnet` window
4. Unknown account type with `seven_day_sonnet` present → also append (best-effort display)

### 4.2 Cookie Usage Response

Cookie mode handles two response formats:

**Format 1: `limits` array (newer API)**

```json
{
  "limits": [
    { "id": "chat_usage_limit", "name": "Session", "used": 10, "limit": 100, "reset_at": "..." },
    { "id": "weekly_usage_limit", "name": "Weekly", "used": 50, "limit": 500, "reset_at": "..." }
  ]
}
```

Looks up `chat_usage_limit` (or `session_limit`) and `weekly_usage_limit` by `id`, then computes `used / limit * 100`.

**Format 2: `utilization` objects (legacy fallback)**

```json
{
  "five_hour": { "utilization": 0.45, "used": 45, "limit": 100, "resets_at": "..." },
  "seven_day":  { "utilization": 0.62, "resets_at": "..." }
}
```

Prefers the `utilization` field; falls back to `used / limit` if `utilization` is absent.

### 4.3 UsageSnapshot Output Type

```typescript
interface UsageSnapshot {
  provider: UsageProvider;   // 'claude'
  progress: ProgressItem[];
  cost?: ProviderCostSnapshot;
  updatedAt: Date;
}

interface ProgressItem {
  name: string;           // 'Session' | 'Weekly' | 'Weekly Sonnet'
  desc?: string;          // e.g. '5 hours window'
  usedPercent: number;    // 0–100+ (can exceed 100 for overquota)
  used?: number;          // Absolute value (cookie mode only)
  limit?: number;
  windowMinutes?: number; // 300 or 10080
  resetsAt?: Date;
}

interface ProviderCostSnapshot {
  used: number;       // Amount spent (USD)
  limit: number;      // Monthly cap (USD)
  remaining: number;
  currency: string;   // 'USD'
  period: string;     // 'Monthly'
}
```

---

## 5. Percentage & Cost Normalization

### 5.1 Utilization to Percent Conversion

The Claude API may return `utilization` as either a 0–1 ratio or a 0–100 percentage:

```typescript
utilizationToPercent(utilization: number): number {
  return utilization <= 1 ? utilization * 100 : utilization;
}
```

### 5.2 Percentage Rounding (No Upper Cap)

```typescript
normalizePercent(value: number): number {
  return Math.round(Math.max(0, value) * 100) / 100;
}
```

> **Important:** The value is **not capped at 100**. Values above 100% indicate an overquota state, which the `QuotaBar` component renders in red with an "Overquota" label.

### 5.3 Cost Unit Conversion

Overage amounts are returned in minor units (cents). The conversion logic is:

```typescript
// Base conversion: cents → dollars
used  = usedMinor  / 100;
limit = limitMinor / 100;

// Non-Enterprise accounts with limit >= 1000 after conversion:
// rescale again (handles abnormally large values returned by the API)
if (!isEnterprise && limit >= 1000) {
  used  /= 100;
  limit /= 100;
}
```

---

## 6. Account Type Detection

### 6.1 Cookie Mode — Inferred from Organization Data

```
GET /api/account → memberships[0].organization
  ├─ rateLimitTier contains 'max'        → 'Claude Max'
  ├─ rateLimitTier contains 'pro'        → 'Claude Pro'
  ├─ rateLimitTier contains 'team'       → 'Claude Team'
  ├─ rateLimitTier contains 'enterprise' → 'Claude Enterprise'
  └─ billingType contains 'stripe'       → 'Claude Pro'
```

### 6.2 OAuth Mode — Fetched from Profile Endpoint

```
GET https://api.anthropic.com/api/oauth/profile
← { account_type: "claude_pro" }  or  { subscription_type: "..." }
```

The resolved account type is stored in `attrs.claudeAccountType` and drives the `seven_day_sonnet` window visibility logic.

---

## 7. Refresh Protection Mechanism

The `POST /providers/:id/refresh` endpoint applies three layers of protection to avoid hammering the upstream API:

```
refreshProviderWithProtection(provider)
  │
  ├─ [Cache] Latest record is less than 3 minutes old?
  │   └─ Yes → return cached data, fromCache: true
  │
  ├─ [Failure cooldown] attrs.lastFailedAt within the last 1 minute?
  │   └─ Yes → return last known data (stale: true), or 503 if none exists
  │
  ├─ [Concurrency lock] attrs.fetchInProgressSince within the last 30 seconds?
  │   └─ Yes → return last known data (stale: true, refreshing: true)
  │
  └─ Acquire lock → call adapter → release lock
      ├─ Success: clear failure state, write new snapshot, return data
      └─ Failure: release lock, write lastFailedAt
                  ├─ Historical data exists → stale fallback response
                  └─ No history           → 400 error response
```

---

## 8. Error Handling

### 8.1 OAuth Auth Error Detection

The following error message patterns set `authRequired: true`, prompting the user to re-authenticate:

- `token expired`
- `access denied`
- `oauth error: 401`
- `auth invalid`
- `invalid_client`
- `invalid_grant`

### 8.2 HTTP Status Code Mapping

| Status | Handling |
|--------|---------|
| 401 | Cookie expired / OAuth token expired → trigger refresh or prompt re-auth |
| 403 + `user:profile` in body | OAuth token is missing the `user:profile` scope |
| 403 (other) | Access denied |
| 429 | Rate limited → advise user to wait and retry |

### 8.3 Request Timeout

All outbound HTTP requests are protected by a 12-second timeout:

```typescript
signal: AbortSignal.timeout(12_000)
```

---

## 9. Data Flow Summary

### Cookie Authentication

```
User provides sessionKey
  └─ parseClaudeCookiePairs() → Cookie header string
      └─ GET /api/organizations → resolve orgId
          └─ GET /api/organizations/{orgId}/usage → ClaudeUsageResponse
              └─ GET /api/organizations/{orgId}/overage_spend_limit → cost data
                  └─ parseWebUsage() + parseOverageAmount()
                      └─ UsageSnapshot { progress, cost }
```

### OAuth Authentication

```
generateAuthUrl() → user authorizes in browser
  └─ exchangeCode() → POST /oauth/token → { accessToken, refreshToken, expiresAt }
      └─ fetchOAuthUsageWithRefresh()
          ├─ [Proactive refresh?] POST /oauth/token (refresh_token grant)
          ├─ GET https://api.anthropic.com/api/oauth/usage → OAuthUsageResponse
          ├─ [Reactive refresh?] 401 → POST /oauth/token → retry
          └─ parseOAuthUsage() → UsageSnapshot
              └─ ProviderUsageService detects credential change
                  └─ storage.updateProvider() persists new tokens
```

---

## 10. File Index

| File | Responsibility |
|------|----------------|
| `src/adapters/ClaudeAdapter.ts` | Core adapter: auth, HTTP requests, response parsing |
| `src/adapters/interface.ts` | `IProviderAdapter` interface definition |
| `src/adapters/utils.ts` | Shared utilities: `roundPercentage`, `fetchWithTimeout` |
| `server/services/ClaudeOAuthService.ts` | OAuth authorization code flow (PKCE, session management) |
| `server/services/ProviderUsageService.ts` | Adapter invocation entry point, OAuth token persistence |
| `server/services/ProviderRefreshService.ts` | Cache, failure cooldown, concurrency lock, stale fallback |
| `server/routes/providers.ts` | REST routes: `/providers/claude/oauth/*`, `/providers/:id/refresh` |
| `src/types/provider.ts` | `ProviderConfig`, `Credential`, `AuthType` type definitions |
| `src/types/usage.ts` | `UsageSnapshot`, `ProgressItem`, `ProviderCostSnapshot` types |
| `docs/providers/claude/demo.1.json` | Sample OAuth usage API response (seven_day populated) |
| `docs/providers/claude/demo.2.json` | Sample OAuth usage API response (with resets_at) |

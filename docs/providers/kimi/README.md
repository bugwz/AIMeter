# Kimi Usage Query Implementation

This document describes the complete implementation of Kimi (Moonshot AI) usage/quota querying in AIMeter.

---

## Table of Contents

1. [Authentication Modes Overview](#1-authentication-modes-overview)
2. [Token Extraction & JWT Decoding](#2-token-extraction--jwt-decoding)
3. [Request Headers](#3-request-headers)
4. [API Endpoints](#4-api-endpoints)
5. [Usage Data Structure & Parsing](#5-usage-data-structure--parsing)
6. [Subscription & Plan Detection](#6-subscription--plan-detection)
7. [Rate Limit Window Parsing](#7-rate-limit-window-parsing)
8. [Error Handling](#8-error-handling)
9. [Data Flow Summary](#9-data-flow-summary)
10. [File Index](#10-file-index)

---

## 1. Authentication Modes Overview

The Kimi adapter (`src/adapters/KimiAdapter.ts`) supports three credential types, all resolving to a JWT bearer token:

| Mode | `AuthType` | Extraction |
|------|-----------|-----------|
| Cookie | `AuthType.COOKIE` | Extracts `kimi-auth={token}` value from cookie string; if no `kimi-auth=` prefix found, uses the entire value |
| JWT | `AuthType.JWT` | Uses `credentials.value` directly |
| API Key | `AuthType.API_KEY` | Uses `credentials.value` directly |

---

## 2. Token Extraction & JWT Decoding

### 2.1 Token Extraction

```typescript
if JWT    → credentials.value
if COOKIE → match /kimi-auth=([^;]+)/ or fall back to full value
if API_KEY→ credentials.value
```

### 2.2 JWT Payload Decoding

The adapter decodes the JWT payload (base64url → JSON) to extract session metadata, without verifying the signature:

```typescript
interface KimiJWTPayload {
  device_id?: string;
  ssid?: string;      // session ID
  sub?: string;       // user ID / traffic ID
  exp?: number;       // expiry timestamp (seconds)
}
```

**Validation:** If `exp` is present and `exp * 1000 < Date.now()`, the token is considered expired before any network request is made.

---

## 3. Request Headers

All API requests use the decoded JWT fields to populate session headers:

```typescript
{
  'Authorization': `Bearer ${token}`,
  'Cookie': `kimi-auth=${token}`,
  'Content-Type': 'application/json',
  'Origin': 'https://www.kimi.com',
  'Referer': 'https://www.kimi.com/code/console',
  'x-msh-platform': 'web',
  'x-language': 'en-US',
  'x-msh-device-id': sessionInfo?.device_id || '',
  'x-msh-session-id': sessionInfo?.ssid || '',
  'x-traffic-id': sessionInfo?.sub || '',
  'User-Agent': 'Mozilla/5.0 ...',
}
```

---

## 4. API Endpoints

Both requests are made in parallel:

| Endpoint | Method | Body | Purpose |
|----------|--------|------|---------|
| `https://www.kimi.com/apiv2/kimi.gateway.billing.v1.BillingService/GetUsages` | POST | JSON | Fetch usage quota data |
| `https://www.kimi.com/apiv2/kimi.gateway.order.v1.SubscriptionService/GetSubscription` | POST | `{}` | Fetch subscription plan name |

### 4.1 Usage Fetch with Payload Fallback

The usage endpoint is tried with three different request payloads in sequence, stopping at the first response that contains `usages`:

```typescript
const payloads = [
  { scope: ['FEATURE_CODING'] },   // preferred: array form
  { scope: 'FEATURE_CODING' },     // fallback: string form
  {},                               // last resort: empty body
];
```

---

## 5. Usage Data Structure & Parsing

### 5.1 Usage Response

```typescript
interface KimiUsageResponse {
  usages?: {
    scope: string;                   // e.g. 'FEATURE_CODING'
    detail: {
      used: number | string;
      limit: number | string;
      remaining: number | string;
      resetTime?: string;            // ISO datetime
    };
    limits?: {                       // sub-window rate limits
      scope: string;
      window?: { duration?: number; timeUnit?: string };
      detail: { used, limit, remaining, resetTime? };
    }[];
  }[];
}
```

### 5.2 Scope Selection

The adapter looks for the `FEATURE_CODING` scope first:

```typescript
const codingUsage = data.usages?.find(u => u.scope === 'FEATURE_CODING') || data.usages?.[0];
```

### 5.3 Progress Windows

| Window | Source | Description |
|--------|--------|-------------|
| `Weekly` | `codingUsage.detail` | Primary 7-day quota window (`windowMinutes: 10080`) |
| `Rate Limit` | `codingUsage.limits[0].detail` | Sub-window rate limit (duration from `window` field) |

```typescript
usedPercent      = roundPercentage((used / limit) * 100)
remainingPercent = roundPercentage((remaining / limit) * 100)
resetsAt         = new Date(detail.resetTime)
```

### 5.4 Sample (`demo.usage.json`)

The usage response contains a `usages` array where each element has a `scope` string, a `detail` object with absolute counts, and an optional `limits` array for sub-window limits.

### 5.5 UsageSnapshot Output

```typescript
{
  provider: 'kimi',
  progress: [
    { name: 'Weekly',     desc: '7 days window', usedPercent, used, limit, remainingPercent, windowMinutes: 10080, resetsAt },
    { name: 'Rate Limit', desc: '{N} hours window', usedPercent, used, limit, remainingPercent, windowMinutes, resetsAt },
  ],
  identity: { plan: 'Adagio' },
  updatedAt: Date,
}
```

---

## 6. Subscription & Plan Detection

The subscription endpoint (`GetSubscription`) returns the plan title from `subscription.goods.title` or `purchaseSubscription.goods.title`:

```json
{
  "subscription": {
    "goods": { "title": "Adagio" },
    "status": "SUBSCRIPTION_STATUS_ACTIVE"
  }
}
```

If neither field has a value, `identity` is omitted from the snapshot.

---

## 7. Rate Limit Window Parsing

The `window` object in `limits[]` specifies the sub-window duration:

```typescript
interface Window { duration?: number; timeUnit?: string }
```

| `timeUnit` | Conversion |
|-----------|-----------|
| `*MINUTE*` | `duration` minutes |
| `*HOUR*` | `duration × 60` minutes |
| `*DAY*` | `duration × 1440` minutes |
| `*WEEK*` | `duration × 10080` minutes |
| `*MONTH*` | `duration × 43200` minutes |

The resulting minutes are passed to `formatWindowDurationFromMinutes()` to produce the `desc` string (e.g. `"5 hours window"`).

---

## 8. Error Handling

| Condition | Error Message |
|-----------|--------------|
| 401 / 403 | `Invalid or expired Kimi token` |
| Other non-2xx | `Kimi API error: {status}` |
| Token expired (JWT `exp`) | `JWT expired` (returned as `ValidationResult.reason`) |
| Invalid JWT format | `Invalid JWT format` |
| No usages returned | Returns empty `progress: []` snapshot |

All requests use a 12-second timeout via `fetchWithTimeout`.

---

## 9. Data Flow Summary

```
User provides kimi-auth JWT (via cookie, JWT, or API key)
  └─ extractToken() → raw JWT string
      └─ decodeJWT() → { device_id, ssid, sub, exp }
          ├─ Validate: exp × 1000 < now? → return expired error
          └─ Build request headers with session fields
              └─ [Parallel]
                  ├─ POST GetUsages (try 3 payloads until usages present)
                  └─ POST GetSubscription → plan title
              └─ parseUsage(usageData, identity)
                  ├─ Find FEATURE_CODING scope → detail (Weekly window)
                  └─ limits[0].detail → Rate Limit sub-window
                      └─ UsageSnapshot { progress[Weekly, Rate Limit?], identity }
```

---

## 10. File Index

| File | Responsibility |
|------|----------------|
| `src/adapters/KimiAdapter.ts` | Core adapter: JWT decode, parallel fetch, scope parsing |
| `src/adapters/utils.ts` | `fetchWithTimeout`, `roundPercentage`, `formatWindowDurationFromMinutes` |
| `docs/providers/kimi/demo.usage.json` | Sample GetUsages response |
| `docs/providers/kimi/demo.subscription.json` | Sample GetSubscription response |

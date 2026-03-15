# Cursor Usage Query Implementation

This document describes the complete implementation of Cursor usage/quota querying in AIMeter.

---

## Table of Contents

1. [Authentication Mode Overview](#1-authentication-mode-overview)
2. [Cookie Extraction & Headers](#2-cookie-extraction--headers)
3. [API Endpoints](#3-api-endpoints)
4. [Usage Data Structure & Parsing](#4-usage-data-structure--parsing)
5. [Unit Conversion](#5-unit-conversion)
6. [Cost Snapshot](#6-cost-snapshot)
7. [Error Handling](#7-error-handling)
8. [Data Flow Summary](#8-data-flow-summary)
9. [File Index](#9-file-index)

---

## 1. Authentication Mode Overview

The Cursor adapter (`src/adapters/CursorAdapter.ts`) supports a single authentication mode:

| Mode | `AuthType` | Use Case |
|------|-----------|---------|
| Cookie | `AuthType.COOKIE` | Browser session cookie from cursor.com |

The required cookie is `WorkosCursorSessionToken`, which is set after logging in at cursor.com.

---

## 2. Cookie Extraction & Headers

### 2.1 Cookie Input Normalization

```typescript
// Strip surrounding quotes and "cookie:" prefix
raw = value.trim().replace(/^"(.*)"$/, '$1').replace(/^cookie:\s*/i, '')

// If the string already contains WorkosCursorSessionToken=, use as-is
if (/WorkosCursorSessionToken\s*=/.test(raw)) → use raw

// If it looks like a plain token (no '='), auto-wrap it
return `WorkosCursorSessionToken=${tokenValue};`
```

### 2.2 Request Headers

```typescript
{
  'Cookie': cookie,
  'Accept': 'application/json',
}
```

### 2.3 Credential Validation

```
GET https://cursor.com/api/auth/me
  ├─ 200 OK → valid: true
  ├─ 401/403 → invalid: 'Invalid or expired session'
  └─ other  → invalid: 'HTTP {status}'
```

---

## 3. API Endpoints

Three endpoints are called during a usage fetch:

| Endpoint | Method | Purpose | Parallel |
|----------|--------|---------|---------|
| `https://cursor.com/api/usage-summary` | GET | Primary usage data | Yes |
| `https://cursor.com/api/auth/me` | GET | User identity & `sub` (user ID) | Yes |
| `https://cursor.com/api/usage?user={sub}` | GET | Legacy plan usage (fallback) | After `/auth/me` |

The first two requests are made in parallel. The legacy endpoint is only called when `userData.sub` is available.

---

## 4. Usage Data Structure & Parsing

### 4.1 Primary Response (`demo.team.json`, `demo.user.free.json`)

```typescript
interface CursorUsageResponse {
  billingCycleStart?: string;      // ISO datetime
  billingCycleEnd?: string;        // ISO datetime
  membershipType?: string;         // 'free', 'pro', 'enterprise', 'team'
  individualUsage?: {
    plan?: {
      used?: number;               // in cents (÷100 for USD)
      limit?: number;
      remaining?: number;
      totalPercentUsed?: number;
    };
    onDemand?: {
      used?: number;
      limit?: number | null;
      remaining?: number | null;
    };
  };
  // Older response shape
  usage_summary?: {
    plan_usage?: { used?, limit?, remaining?, total_percent_used? };
    on_demand_usage?: { used?, limit?, remaining? };
    billing_cycle_end?: string;
  };
}
```

Fields are read from `individualUsage` first, falling back to `usage_summary`.

### 4.2 Legacy Response (`https://cursor.com/api/usage`)

```typescript
interface CursorLegacyUsageResponse {
  'gpt-4'?: {
    numRequests?: number;
    numRequestsTotal?: number;
    maxRequestUsage?: number;     // request count limit
  };
}
```

Used only when `individualUsage.plan.limit` is 0 or absent. If `maxRequestUsage` is present, `numRequestsTotal` (or `numRequests`) is used as the consumed count.

### 4.3 Progress Windows

| Window | Source | Notes |
|--------|--------|-------|
| `Plan` | `individualUsage.plan` or `usage_summary.plan_usage` or legacy `gpt-4` | Primary monthly quota |
| `Secondary` | `individualUsage.onDemand` or `usage_summary.on_demand_usage` | On-demand spending quota (only shown when `limit > 0`) |

### 4.4 UsageSnapshot Output

```typescript
{
  provider: 'cursor',
  progress: [
    { name: 'Plan',      usedPercent, used, limit, remainingPercent, resetsAt, desc: '28 days window' },
    { name: 'Secondary', usedPercent, used, limit, remainingPercent, resetsAt },  // if on-demand
  ],
  cost: { used, limit, remaining, currency: 'USD', period: 'monthly' },
  identity: { plan: 'Pro' },
  updatedAt: Date,
}
```

Membership types are normalized:

| Raw `membershipType` | Display |
|---------------------|---------|
| `free` | `Free` |
| `pro` | `Pro` |
| `team` | `Team` |
| `enterprise` | `Enterprise` |

---

## 5. Unit Conversion

Plan and on-demand usage values from the API are in **cents** (1/100 USD). The adapter divides all values by 100 before storing:

```typescript
planUsed      = planUsedRaw      / 100   // display in USD
planLimit     = planLimitRaw     / 100
onDemandUsed  = onDemandUsedRaw  / 100
```

Percentage is calculated from the raw integer values before division to avoid floating-point error:

```typescript
usedPercent = roundPercentage((planUsedRaw / planLimitRaw) * 100)
```

---

## 6. Cost Snapshot

When `onDemand.limit` is a positive number, a `cost` field is included in the snapshot:

```typescript
cost = {
  used:      onDemandUsedRaw      / 100,
  limit:     onDemandLimitRaw     / 100,
  remaining: onDemandRemainingRaw / 100,
  currency:  'USD',
  period:    'monthly',
}
```

This represents pay-as-you-go spending within the billing cycle.

---

## 7. Error Handling

| Condition | Error Message |
|-----------|--------------|
| 401 / 403 on usage-summary | `Invalid or expired Cursor session` |
| Other non-2xx on usage-summary | `Cursor API error: {status}` |
| No cookie provided | `No cookie provided` |
| Legacy endpoint fails | Silently ignored (returns `null`) |

All requests use a 12-second timeout via `fetchWithTimeout`.

---

## 8. Data Flow Summary

```
User provides WorkosCursorSessionToken cookie
  └─ extractCookie() → normalized cookie string
      └─ [Parallel]
          ├─ GET https://cursor.com/api/usage-summary → CursorUsageResponse
          └─ GET https://cursor.com/api/auth/me       → CursorUserResponse (sub)
              └─ GET https://cursor.com/api/usage?user={sub} → legacy CursorLegacyUsageResponse
      └─ parseUsage(usageData, userData, legacyData)
          ├─ Resolve plan window: individualUsage.plan → usage_summary.plan_usage → legacy gpt-4
          ├─ Resolve on-demand window: individualUsage.onDemand → usage_summary.on_demand_usage
          └─ UsageSnapshot { progress[Plan, Secondary?], cost?, identity }
```

---

## 9. File Index

| File | Responsibility |
|------|----------------|
| `src/adapters/CursorAdapter.ts` | Core adapter: cookie normalization, parallel fetch, parsing |
| `src/adapters/utils.ts` | `fetchWithTimeout`, `roundPercentage` utilities |
| `doc/providers/cursor/demo.user.free.json` | Sample response for free-tier user |
| `doc/providers/cursor/demo.team.json` | Sample response for enterprise/team user |
| `doc/providers/cursor/demo.auth.json` | Sample `/auth/me` response |

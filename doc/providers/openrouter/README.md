# OpenRouter Usage Query Implementation

This document describes the complete implementation of OpenRouter credit and quota querying in AIMeter.

---

## Table of Contents

1. [Authentication Mode Overview](#1-authentication-mode-overview)
2. [API Key Extraction & Headers](#2-api-key-extraction--headers)
3. [API Endpoints](#3-api-endpoints)
4. [Usage Data Structure & Parsing](#4-usage-data-structure--parsing)
5. [Reset Time Calculation](#5-reset-time-calculation)
6. [Progress Item Construction](#6-progress-item-construction)
7. [Error Handling](#7-error-handling)
8. [Data Flow Summary](#8-data-flow-summary)
9. [File Index](#9-file-index)

---

## 1. Authentication Mode Overview

The OpenRouter adapter (`src/adapters/OpenRouterAdapter.ts`) supports a single authentication mode:

| Mode | `AuthType` | Use Case |
|------|-----------|---------|
| API Key | `AuthType.API_KEY` | OpenRouter API key (prefix `sk-or-v1-`) |

---

## 2. API Key Extraction & Headers

### 2.1 Key Extraction

```typescript
if (credentials.type === AuthType.API_KEY) → credentials.value
```

### 2.2 Request Headers

```typescript
{
  'Authorization': `Bearer ${apiKey}`,
  'Accept': 'application/json',
}
```

### 2.3 Credential Validation

```
GET https://openrouter.ai/api/v1/credits
  ├─ 200 OK  → valid: true
  ├─ 401/403 → invalid: 'Invalid API key'
  └─ other   → invalid: 'HTTP {status}'
```

---

## 3. API Endpoints

Two requests are made in parallel:

| Endpoint | Method | Purpose | Required |
|----------|--------|---------|---------|
| `https://openrouter.ai/api/v1/credits` | GET | Total credit balance | Yes |
| `https://openrouter.ai/api/v1/key` | GET | Per-key spending limit & usage | No (failure silently ignored) |

---

## 4. Usage Data Structure & Parsing

### 4.1 Credits Response (`demo.credits.json`)

```json
{
  "data": {
    "total_credits": 40,
    "total_usage": 38.388786896
  }
}
```

| Field | Meaning |
|-------|---------|
| `total_credits` | Total credits purchased (USD) |
| `total_usage` | Total amount spent (USD) |

`balance = total_credits - total_usage`

### 4.2 Key Response (`demo.key.json`)

```json
{
  "data": {
    "label": "sk-or-v1-12a...333",
    "limit": 33,
    "limit_reset": "daily",
    "limit_remaining": 33,
    "usage": 0,
    "usage_daily": 0,
    "rate_limit": { "requests": -1, "interval": "10s" }
  }
}
```

| Field | Meaning |
|-------|---------|
| `limit` | Spending limit for this key (USD) |
| `limit_reset` | Reset period: `"daily"`, `"weekly"`, or `"monthly"` |
| `limit_remaining` | Remaining budget under the key limit |
| `usage` | Amount spent by this key |

A key-level limit item is only added to progress when `limit !== null && limit !== undefined`.

---

## 5. Reset Time Calculation

When a key limit with a `limit_reset` period is present, the adapter calculates the next reset time from the current UTC time:

| `limit_reset` | Reset Logic |
|--------------|-------------|
| `"daily"` | Next midnight UTC (start of tomorrow) |
| `"weekly"` | Next Monday 00:00 UTC |
| `"monthly"` | First day of next month 00:00 UTC |
| Other / null | `undefined` (no reset time shown) |

```typescript
// Example: weekly reset
const dayOfWeek = utcNow.getUTCDay();           // 0=Sun, 1=Mon, ...
const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
resetDate = Date.UTC(year, month, date + daysUntilMonday, 0, 0, 0);
```

---

## 6. Progress Item Construction

Up to two progress items are included in the snapshot:

### 6.1 Key-Level Credits (conditional)

Only present when the `/key` response includes a non-null `limit`:

```typescript
{
  name: resetLabel,         // 'Daily Credits', 'Weekly Credits', 'Monthly Credits', or 'Credits'
  desc: resetWindowDesc,    // '1 day window', '7 days window', '30 days window', or 'total window'
  usedPercent:  roundPercentage((keyUsed / limitTotal) * 100),
  used:         keyUsed,    // formatCurrency(key.data.usage)
  limit:        limitTotal, // formatCurrency(key.data.limit - key.data.usage)  ← remaining budget
  remainingPercent: ...,
  resetsAt,
}
```

> Note: `limit` in the progress item stores the **remaining budget** (`key.limit - key.usage`), not the full limit.

### 6.2 Total Credits (always present)

```typescript
{
  name: 'Total Credits',
  desc: 'total window',
  usedPercent:     roundPercentage((creditsUsed / creditsLimit) * 100),
  used:            creditsUsed,    // total_usage rounded to cents
  limit:           creditsLimit,   // total_credits rounded to cents
  remainingPercent: roundPercentage((creditsBalance / creditsLimit) * 100),
  // no resetsAt
}
```

Currency amounts are rounded to 2 decimal places: `Math.round(value * 100) / 100`.

### 6.3 UsageSnapshot Output

```typescript
{
  provider: 'openrouter',
  progress: [
    { name: 'Daily Credits', desc: '1 day window', usedPercent, used, limit, resetsAt },  // if key has limit
    { name: 'Total Credits', desc: 'total window', usedPercent, used, limit },
  ],
  identity: { plan: 'Pay as you go' },
  updatedAt: Date,
}
```

---

## 7. Error Handling

| Condition | Error Message |
|-----------|--------------|
| 401 on `/credits` | `OpenRouter API key invalid. Please check your key.` |
| 429 | `Rate limit exceeded. Please wait and try again.` |
| Other non-2xx on `/credits` | `OpenRouter API error: {status}` |
| `/key` request fails | Silently ignored (key data is optional) |

All requests use a 12-second timeout via `fetchWithTimeout`.

---

## 8. Data Flow Summary

```
User provides OpenRouter API key
  └─ extractAPIKey() → raw key string
      └─ [Parallel]
          ├─ GET https://openrouter.ai/api/v1/credits → OpenRouterCreditsResponse
          └─ GET https://openrouter.ai/api/v1/key     → OpenRouterKeyResponse (optional)
      └─ parseUsage(credits, key)
          ├─ [key.limit present?]
          │   └─ keyUsed, limitRemaining, resetLabel, resetsAt
          │       └─ push key-level progress item
          └─ creditsUsed = total_usage, creditsLimit = total_credits
              └─ push Total Credits progress item
          └─ UsageSnapshot { progress[Credits?, Total Credits], identity }
```

---

## 9. File Index

| File | Responsibility |
|------|----------------|
| `src/adapters/OpenRouterAdapter.ts` | Core adapter: key extraction, parallel fetch, credit parsing |
| `src/adapters/utils.ts` | `fetchWithTimeout`, `roundPercentage` utilities |
| `doc/providers/openrouter/demo.credits.json` | Sample `/credits` API response |
| `doc/providers/openrouter/demo.key.json` | Sample `/key` API response with daily limit |

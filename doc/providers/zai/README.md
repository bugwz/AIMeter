# z.ai Usage Query Implementation

This document describes the complete implementation of z.ai (also accessible via the BigModel China endpoint) usage/quota querying in AIMeter.

---

## Table of Contents

1. [Authentication Mode Overview](#1-authentication-mode-overview)
2. [API Key & Headers](#2-api-key--headers)
3. [API Endpoint & Region Routing](#3-api-endpoint--region-routing)
4. [Usage Data Structure & Parsing](#4-usage-data-structure--parsing)
5. [Progress Item Construction](#5-progress-item-construction)
6. [Window Duration Mapping](#6-window-duration-mapping)
7. [Plan Name Resolution](#7-plan-name-resolution)
8. [Error Handling](#8-error-handling)
9. [Environment Variables](#9-environment-variables)
10. [Data Flow Summary](#10-data-flow-summary)
11. [File Index](#11-file-index)

---

## 1. Authentication Mode Overview

The z.ai adapter (`src/adapters/ZaiAdapter.ts`) supports a single authentication mode:

| Mode | `AuthType` | Use Case |
|------|-----------|---------|
| API Key | `AuthType.API_KEY` | z.ai API key from the developer platform |

---

## 2. API Key & Headers

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
GET {quotaURL}
  ├─ 200 + valid JSON + success → valid: true
  ├─ 401/403              → invalid: 'Invalid API key'
  ├─ success: false       → invalid: response msg
  └─ code !== 200         → invalid: response msg
```

---

## 3. API Endpoint & Region Routing

### 3.1 Default Endpoints

| Region | Base URL | Full Quota Path |
|--------|---------|----------------|
| Global (default) | `https://api.z.ai` | `https://api.z.ai/api/monitor/usage/quota/limit` |
| China (`bigmodel-cn`) | `https://open.bigmodel.cn` | `https://open.bigmodel.cn/api/monitor/usage/quota/limit` |

### 3.2 Region Normalization

The following `config.region` values map to the China endpoint:

- `cn`
- `china`
- `bigmodel-cn`
- `zai_bigmodel_cn`

All other values use the global endpoint.

### 3.3 Environment Variable Overrides

The quota URL can be fully overridden via environment variables (resolved in priority order):

1. `Z_AI_QUOTA_URL` — full URL used directly
2. `Z_AI_API_HOST` — host/base URL; the path `/api/monitor/usage/quota/limit` is appended automatically
3. `config.region` → calculated base URL (default)

---

## 4. Usage Data Structure & Parsing

### 4.1 Response Envelope

```typescript
interface ZaiQuotaResponse {
  code?: number;       // 200 = success
  msg?: string;
  success?: boolean;
  data?: {             // primary container (preferred)
    limits?: ZaiLimitRaw[];
    planName?: string;
    plan?: string;
    planType?: string;
    packageName?: string;
  };
  limits?: ZaiLimitRaw[];  // fallback: top-level limits array
}
```

The adapter checks `payload.data.limits` first and falls back to the top-level `payload.limits`.

### 4.2 Limit Item Schema

```typescript
interface ZaiLimitRaw {
  type?: string;              // 'TOKENS_LIMIT' | 'TIME_LIMIT'
  name?: string;              // Used as type if type is absent
  unit?: number | string;     // Time unit code (see §6)
  number?: number | string;   // Window duration in the given unit
  usage?: number | string;    // Total quota (= limit)
  currentValue?: number | string; // Currently consumed amount
  remaining?: number | string;    // Remaining quota
  percentage?: number | string;   // Direct used % (fallback)
  usageDetails?: { modelCode: string; usage: number }[];
  nextResetTime?: number | string; // Unix timestamp (seconds or milliseconds)
}
```

Numeric fields accept both `number` and string-encoded numbers (`"123"`).

### 4.3 Limit Type Classification

| `type` / `name` value | Classification |
|----------------------|---------------|
| `TOKENS_LIMIT` | Token quota window |
| `TIME_LIMIT` | Time-based quota (e.g. web searches) |
| Anything else | **Ignored** (filtered out) |

---

## 5. Progress Item Construction

### 5.1 Token Limits (`TOKENS_LIMIT`)

Token limits are sorted by `unit` before rendering:

| `unit` | Display Order | Label |
|--------|-------------|-------|
| `3` | First | `Session` |
| `6` | Second | `Weekly` |
| Other | Last | `Tokens` |

### 5.2 Time Limits (`TIME_LIMIT`)

All time-limit items display as **`Web Searches`**, appended after token limits.

### 5.3 Used/Limit Calculation

```typescript
// Limit = usage field (total quota)
limitValue = limit.usage  // if > 0

// Used = derived from remaining or currentValue
usedFromRemaining = limitValue - remaining
used = max(0, min(limitValue, max(usedFromRemaining, currentValue)))

// usedPercent:
if (limitValue > 0 && usedValue is defined)
  → roundPercentage(used / limit * 100)
else if (limit.percentage is defined)
  → roundPercentage(limit.percentage)   // direct fallback
else
  → 0
```

### 5.4 Reset Timestamp

`nextResetTime` is a Unix timestamp in either seconds or milliseconds:

```typescript
toDate(value): Date {
  timestamp = value > 1_000_000_000_000 ? value : value * 1000
  return new Date(timestamp)
}
```

### 5.5 UsageSnapshot Output

```typescript
{
  provider: 'zai',
  progress: [
    { name: 'Session',     usedPercent, used, limit, remainingPercent, windowMinutes: 300,   resetsAt },
    { name: 'Weekly',      usedPercent, used, limit, remainingPercent, windowMinutes: 10080, resetsAt },
    { name: 'Web Searches',usedPercent, used, limit, remainingPercent, windowMinutes,        resetsAt },
  ],
  identity: { plan: 'Pro' },
  updatedAt: Date,
}
```

---

## 6. Window Duration Mapping

The `unit` field encodes the time unit for the window. Combined with `number`, the window in minutes is:

| `unit` | Unit Meaning | Minutes Formula |
|--------|-------------|----------------|
| `1` | Days | `number × 1440` |
| `3` | Hours | `number × 60` |
| `5` | Minutes | `number` |
| `6` | Days (weekly) | `number × 1440` |
| Other | Unknown | `undefined` |

Examples:
- `unit=3, number=5` → 300 minutes (5-hour Session window)
- `unit=6, number=7` → 10080 minutes (7-day Weekly window)

---

## 7. Plan Name Resolution

The plan name is extracted from the response container using the following field priority:

```typescript
candidates = [
  container.planName,
  container.plan,
  container.planType,
  container.packageName,
]
// Returns the first non-empty string value found
```

If none of these fields contain a value, `identity` is omitted from the snapshot.

---

## 8. Error Handling

| Condition | Error Message |
|-----------|--------------|
| 401 / 403 | `'Invalid z.ai API key'` |
| Other non-2xx | `'z.ai API error: {status} - {body}'` |
| Empty response body (200) | `'Empty response body (HTTP 200). Check z.ai region and API key.'` |
| Invalid JSON | `'Invalid z.ai JSON response'` |
| `success === false` or `code !== 200` | `payload.msg` or `'z.ai API returned an error'` |
| No limits parsed | `'No usage data returned by z.ai quota API'` |
| 429 | `'z.ai API rate limit exceeded. Please try again later.'` |

All requests use a 12-second timeout via `fetchWithTimeout`.

---

## 9. Environment Variables

| Variable | Description |
|----------|-------------|
| `Z_AI_QUOTA_URL` | Full quota endpoint URL override (highest priority) |
| `Z_AI_API_HOST` | Base host/URL override; quota path is appended automatically |

---

## 10. Data Flow Summary

```
User provides z.ai API key
  └─ extractApiKey() → raw key string
      └─ resolveQuotaURL(config)
          ├─ Z_AI_QUOTA_URL env? → use directly
          ├─ Z_AI_API_HOST env?  → append quota path
          └─ config.region → global or bigmodel-cn base URL
      └─ GET {quotaURL}
          └─ ZaiQuotaResponse
              └─ parsePayload(payload)
                  ├─ Check success / code fields → throw on error
                  ├─ Resolve limits array (data.limits → payload.limits)
                  └─ parseLimit(raw) → ParsedLimit[] (TOKENS_LIMIT | TIME_LIMIT only)
              └─ toProgressItems(limits)
                  ├─ tokenLimits (sorted by unit: 3 → 6 → other) → Session / Weekly / Tokens
                  └─ timeLimits → Web Searches
              └─ pickPlan(container) → plan string
              └─ UsageSnapshot { progress, identity }
```

---

## 11. File Index

| File | Responsibility |
|------|----------------|
| `src/adapters/ZaiAdapter.ts` | Core adapter: region routing, limit parsing, window mapping |
| `src/adapters/utils.ts` | `fetchWithTimeout`, `roundPercentage` utilities |

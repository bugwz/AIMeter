# MiniMax Usage Query Implementation

This document describes the complete implementation of MiniMax Coding Plan usage/quota querying in AIMeter.

---

## Table of Contents

1. [Authentication Modes Overview](#1-authentication-modes-overview)
2. [Region Support](#2-region-support)
3. [API Endpoints](#3-api-endpoints)
4. [Request Construction](#4-request-construction)
5. [Usage Data Structure & Parsing](#5-usage-data-structure--parsing)
6. [Plan Name Resolution](#6-plan-name-resolution)
7. [Error Handling](#7-error-handling)
8. [Data Flow Summary](#8-data-flow-summary)
9. [File Index](#9-file-index)

---

## 1. Authentication Modes Overview

The MiniMax adapter (`src/adapters/MiniMaxAdapter.ts`) supports two authentication modes:

| Mode | `AuthType` | Use Case |
|------|-----------|---------|
| Cookie | `AuthType.COOKIE` | Browser session from platform.minimax.io or platform.minimaxi.com |
| API Key | `AuthType.API_KEY` | API key from the MiniMax developer platform |

The two modes use different base domains but the same endpoint paths.

---

## 2. Region Support

MiniMax has separate platforms for China and global users, each with distinct domains:

| Region Value | Cookie Domain | API Key Domain | Notes |
|-------------|--------------|----------------|-------|
| `cn` / `minimax_cn` | `platform.minimaxi.com` | `api.minimaxi.com` | China region |
| `global` / `minimax_global` | `platform.minimax.io` | `api.minimax.io` | Global (default) |

Region is configured in `config.region` and defaults to global if not specified.

---

## 3. API Endpoints

Three requests are made in parallel during a fetch:

| Request | Method | URL | Purpose |
|---------|--------|-----|---------|
| Coding Plan Remains | GET | `/v1/api/openplatform/coding_plan/remains` | Primary usage data |
| User Info | GET | `/v1/api/openplatform/user/info` | Account metadata (optional) |
| Coding Plan HTML | GET | `/user-center/payment/coding-plan?cycle_type=3` | Plan name extraction (optional) |

**Full base URLs by region and auth type:**

| Auth | Region | Base |
|------|--------|------|
| Cookie | Global | `https://platform.minimax.io` |
| Cookie | China | `https://platform.minimaxi.com` |
| API Key | Global | `https://api.minimax.io` |
| API Key | China | `https://api.minimaxi.com` |

---

## 4. Request Construction

### 4.1 Cookie Auth Headers

```typescript
{
  'Cookie': credentials.value,
  'Origin':  'https://platform.minimax.io',   // or .minimaxi.com for CN
  'Referer': 'https://platform.minimax.io/user-center/payment/coding-plan?cycle_type=3',
  'Accept':  'application/json, text/plain, */*',
  'User-Agent': 'Mozilla/5.0 ...',
}
```

### 4.2 API Key Auth Headers

```typescript
{
  'Authorization': `Bearer ${credentials.value}`,
  'Accept':        'application/json, text/plain, */*',
  'User-Agent':    'Mozilla/5.0 ...',
}
```

### 4.3 API Error Codes

The response body includes a `base_resp` envelope:

| `status_code` | Meaning |
|--------------|---------|
| `0` | Success |
| `1004` | Cookie missing or expired |
| Other | API error with `status_msg` |

---

## 5. Usage Data Structure & Parsing

### 5.1 Usage Response (`demo.json`)

```json
{
  "model_remains": [
    {
      "model_name": "MiniMax-M2",
      "start_time": 1772935200000,
      "end_time": 1772953200000,
      "remains_time": 2874631,
      "current_interval_total_count": 1500,
      "current_interval_usage_count": 1492
    }
  ],
  "base_resp": { "status_code": 0, "status_msg": "success" }
}
```

The `model_remains` array contains one entry per model. The adapter always uses the **first element** as the primary data source.

### 5.2 Count Semantics

| Field | Meaning |
|-------|---------|
| `current_interval_total_count` | Total token budget for the window (× 15) |
| `current_interval_usage_count` | **Remaining** tokens |

```typescript
usedCount  = totalCount - remainingCount
limitValue = Math.round(totalCount / 15)   // convert tokens → prompt units
usedValue  = Math.round(usedCount  / 15)
```

Percentage is computed from the divided values:

```typescript
usedPercent = roundPercentage((usedValue / limitValue) * 100)
```

### 5.3 Timestamp Normalization

`start_time` and `end_time` may be Unix **seconds** or **milliseconds**. The adapter normalizes:

```typescript
toTimestampMs(value: number): number {
  return value >= 1_000_000_000_000 ? value : value * 1000;
}
```

Window duration in minutes is derived from `(endMs - startMs) / 60000`.

`resetsAt` is set to `new Date(toTimestampMs(end_time))` only when `remains_time > 0`.

### 5.4 UsageSnapshot Output

```typescript
{
  provider: 'minimax',
  progress: [
    {
      name: 'Prompt',
      desc: '{N} hour window for models: MiniMax-M2, MiniMax-M2.1, MiniMax-M2.5',
      usedPercent,
      used:  limitValue - remaining,
      limit: limitValue,
      windowMinutes,
      resetsAt,
    }
  ],
  identity: { plan: 'Plus' },
  updatedAt: Date,
}
```

All model names from `model_remains` are collected (deduplicated, preserving order) and included in the `desc` string.

---

## 6. Plan Name Resolution

The plan name is resolved using a priority chain:

1. **Calculated from `limitValue`** (most accurate):

| `limitValue` | Region | Plan |
|-------------|--------|------|
| 40 | CN | `Starter` |
| 100 | CN | `Plus` or `Plus-Highspeed` |
| 300 | CN | `Max` or `Max-High-Speed` |
| 2000 | CN | `Ultra-High-Speed` |
| 100 | Global | `Starter` |
| 300 | Global | `Plus` or `Plus-High-Speed` |
| 1000 | Global | `Max` or `Max-High-Speed` |
| 2000 | Global | `Ultra-High-Speed` |

`isHighSpeed` is true when `model_name` contains `highspeed` or `high-speed`.

2. **From HTML `__NEXT_DATA__`** — parsed from the `<script id="__NEXT_DATA__">` tag on the coding plan page.

3. **From API response** — `data.current_subscribe_title`, `data.plan_name`, `data.combo_title`, etc.

---

## 7. Error Handling

| Condition | Error Message |
|-----------|--------------|
| 401 / 403 | `Invalid or expired MiniMax credentials` |
| `base_resp.status_code === 1004` | `MiniMax cookie is missing or expired. Please log in again and update your Cookie.` |
| Other API error code | `MiniMax API error: {status_msg} (code: {status_code})` |
| Empty `model_remains` | `No usage data found` |
| Empty response body | `Empty response. Check region setting (Global vs China).` |
| User info / HTML fetch fails | Silently ignored (optional data) |

All requests use a 12-second timeout via `fetchWithTimeout`.

---

## 8. Data Flow Summary

```
User provides Cookie or API Key + region config
  └─ buildRequest(credentials, region) → { headers, url }
      └─ [Parallel]
          ├─ GET /coding_plan/remains        → MiniMaxUsageResponse
          ├─ GET /user/info                  → MiniMaxUserInfoResponse (optional)
          └─ GET /user-center/payment/...    → HTML (plan name, optional)
      └─ parseUsage(data, userInfo, planNameFromHTML, region)
          ├─ primaryModel = model_remains[0]
          ├─ usedCount = totalCount - remainingCount
          ├─ limitValue = round(totalCount / 15)
          ├─ windowMinutes from start_time / end_time
          ├─ modelNames = collect all model_name values
          └─ getPlanNameFromUsage() → plan string
              └─ UsageSnapshot { progress[Prompt], identity }
```

---

## 9. File Index

| File | Responsibility |
|------|----------------|
| `src/adapters/MiniMaxAdapter.ts` | Core adapter: region routing, parallel fetch, token/count parsing |
| `src/adapters/utils.ts` | `fetchWithTimeout`, `roundPercentage`, `formatWindowDurationFromMinutes` |
| `docs/providers/minimax/demo.json` | Sample coding plan remains API response |

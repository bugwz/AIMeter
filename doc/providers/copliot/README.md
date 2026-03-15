# Copilot Usage Query Implementation

This document describes the complete implementation of GitHub Copilot usage/quota querying in AIMeter.

---

## Table of Contents

1. [Authentication Modes Overview](#1-authentication-modes-overview)
2. [Token Extraction & Headers](#2-token-extraction--headers)
3. [API Endpoint](#3-api-endpoint)
4. [Usage Data Structure & Parsing](#4-usage-data-structure--parsing)
5. [Quota Label Formatting](#5-quota-label-formatting)
6. [Reset Date Calculation](#6-reset-date-calculation)
7. [Error Handling](#7-error-handling)
8. [Data Flow Summary](#8-data-flow-summary)
9. [File Index](#9-file-index)

---

## 1. Authentication Modes Overview

The Copilot adapter (`src/adapters/CopilotAdapter.ts`) supports two authentication modes:

| Mode | `AuthType` | Token Format | Use Case |
|------|-----------|-------------|---------|
| OAuth | `AuthType.OAUTH` | `accessToken` field | GitHub OAuth app flow |
| API Key | `AuthType.API_KEY` | `value` field | Personal access token or Copilot token |

Both modes use the same `Authorization: token {value}` header format and call the same endpoint.

---

## 2. Token Extraction & Headers

### 2.1 Token Extraction

```typescript
if (credentials.type === AuthType.OAUTH)   → credentials.accessToken
if (credentials.type === AuthType.API_KEY) → credentials.value
```

### 2.2 Request Headers

All requests include the following headers to identify as the Copilot VS Code extension:

```typescript
{
  'Authorization': `token ${token}`,
  'Accept': 'application/json',
  'Editor-Version': 'vscode/1.96.2',
  'Editor-Plugin-Version': 'copilot-chat/0.26.7',
  'User-Agent': 'GitHubCopilotChat/0.26.7',
  'X-Github-Api-Version': '2025-04-01',
}
```

### 2.3 Credential Validation

```
GET https://api.github.com/copilot_internal/user
  ├─ 200 OK → valid: true
  ├─ 401/403 → invalid: 'Invalid GitHub token'
  └─ other  → invalid: 'HTTP {status}'
```

---

## 3. API Endpoint

```
GET https://api.github.com/copilot_internal/user
```

A single request returns all quota information for the authenticated user.

---

## 4. Usage Data Structure & Parsing

### 4.1 Response Type

```typescript
interface CopilotUsageResponse {
  login?: string;
  copilot_plan?: string;               // 'individual', 'business', etc.
  quota_reset_date?: string;           // ISO date, used in quota_snapshots mode
  limited_user_reset_date?: string;    // ISO date, used in limited_user mode
  limited_user_subscribed_day?: number;

  // Format 1 (newer): quota_snapshots
  quota_snapshots?: Record<string, CopilotQuotaSnapshot | undefined>;

  // Format 2 (older): limited_user_quotas
  limited_user_quotas?: Record<string, number | undefined>;   // remaining counts
  monthly_quotas?: Record<string, number | undefined>;        // limit counts
}
```

### 4.2 Format 1: `quota_snapshots` (Newer API — e.g. `demo.individual.json`)

Each key in `quota_snapshots` is a quota type (e.g. `premium_interactions`, `chat`, `completions`):

```json
{
  "quota_snapshots": {
    "premium_interactions": {
      "entitlement": 300,
      "remaining": 300,
      "percent_remaining": 100,
      "unlimited": false
    },
    "chat": {
      "entitlement": 0,
      "unlimited": true
    }
  },
  "quota_reset_date": "2026-04-01"
}
```

Parsing priority for `usedPercent`:
1. `percent_remaining` → `usedPercent = 100 - percent_remaining`
2. `used` + `limit` → `usedPercent = used / limit * 100`
3. `entitlement` + `remaining` → `usedPercent = (entitlement - remaining) / entitlement * 100`

Parsing for `limit`: prefers `entitlement`, then `limit`.

Quota keys are sorted by rank before display:
- `premium_interactions` → rank 0 (shown first)
- `chat` → rank 1
- everything else → rank 10

### 4.3 Format 2: `limited_user_quotas` (Older API — e.g. `demo.free.json`)

```json
{
  "limited_user_quotas": { "chat": 500, "completions": 3876 },
  "monthly_quotas":      { "chat": 500, "completions": 4000 },
  "limited_user_reset_date": "2026-03-26"
}
```

`limited_user_quotas` holds **remaining** counts; `monthly_quotas` holds **limits**.

```typescript
used = Math.max(0, limit - remaining)
usedPercent = used / limit * 100
```

Keys are shown in preferred order: `chat`, `completions`, then any others.

### 4.4 UsageSnapshot Output

```typescript
{
  provider: 'copilot',
  progress: [
    { name: 'Premium', usedPercent, used, limit, remainingPercent, resetsAt, resetDescription: 'Monthly reset' },
    { name: 'Chat',    usedPercent, used, limit, remainingPercent, resetsAt },
    // ...
  ],
  identity: { plan: 'Individual' },
  updatedAt: Date,
}
```

---

## 5. Quota Label Formatting

Quota keys are converted to human-readable labels:

| Raw Key | Display Label |
|---------|--------------|
| `premium_interactions` | `Premium` |
| `chat` | `Chat` |
| `completions` | `Completions` |
| `foo_bar_baz` | `Foo Bar Baz` (title-cased, `_` → space) |

The plan name is title-cased from the `copilot_plan` field (e.g. `individual` → `Individual`).

---

## 6. Reset Date Calculation

The reset date is parsed from `quota_reset_date` (Format 1) or `limited_user_reset_date` (Format 2).

The window description (e.g. `"28 days window"`) is calculated by comparing the reset date against the previous billing cycle start, derived from `limited_user_subscribed_day`:

```
previousReset = Date.UTC(prevYear, prevMonth, min(subscribedDay, daysInPrevMonth))
windowDays = round((resetsAt - previousReset) / 86400000)
```

---

## 7. Error Handling

| Condition | Error Message |
|-----------|--------------|
| 401 / 403 | `Invalid or expired GitHub token` |
| Other non-2xx | `Copilot API error: {status}` |
| No token provided | `No token provided` |

All requests use a 12-second timeout via `fetchWithTimeout`.

---

## 8. Data Flow Summary

```
User provides OAuth token or API key
  └─ extractToken() → raw token string
      └─ GET https://api.github.com/copilot_internal/user
          └─ CopilotUsageResponse
              ├─ quota_snapshots present?
              │   └─ extractProgressFromQuotaSnapshots() → ProgressItem[]
              └─ Fallback: limited_user_quotas + monthly_quotas
                  └─ extractProgressFromLimitedQuotas() → ProgressItem[]
              └─ parseUsage() → UsageSnapshot { progress, identity }
```

---

## 9. File Index

| File | Responsibility |
|------|----------------|
| `src/adapters/CopilotAdapter.ts` | Core adapter: token extraction, request, quota parsing |
| `src/adapters/utils.ts` | `fetchWithTimeout`, `roundPercentage` utilities |
| `doc/providers/copliot/demo.individual.json` | Sample response with `quota_snapshots` format |
| `doc/providers/copliot/demo.free.json` | Sample response with `limited_user_quotas` format |

# Antigravity Usage Query Implementation

This document describes the complete implementation of Antigravity (Google Cloud Code Assist) usage/quota querying in AIMeter.

---

## Table of Contents

1. [Authentication Mode Overview](#1-authentication-mode-overview)
2. [OAuth Credential Format](#2-oauth-credential-format)
3. [Token Refresh Strategy](#3-token-refresh-strategy)
4. [API Endpoints & Base URL Fallback](#4-api-endpoints--base-url-fallback)
5. [Project ID Resolution](#5-project-id-resolution)
6. [Usage Data Structure & Parsing](#6-usage-data-structure--parsing)
7. [Display Modes](#7-display-modes)
8. [Error Handling](#8-error-handling)
9. [Environment Variables](#9-environment-variables)
10. [Data Flow Summary](#10-data-flow-summary)
11. [File Index](#11-file-index)

---

## 1. Authentication Mode Overview

The Antigravity adapter (`src/adapters/AntigravityAdapter.ts`) supports a single authentication mode:

| Mode | `AuthType` | Use Case |
|------|-----------|---------|
| OAuth | `AuthType.OAUTH` | Google OAuth 2.0 access token issued for the Cloud Code Assist API |

The underlying OAuth provider is Google (`https://oauth2.googleapis.com`). The adapter calls Google Cloud internal API endpoints using the `Bearer` access token.

---

## 2. OAuth Credential Format

```typescript
{
  type: AuthType.OAUTH;
  accessToken: string;        // Required
  refreshToken?: string;      // Required for automatic token refresh
  expiresAt?: Date | string;  // Used to trigger proactive refresh
  clientId?: string;          // Defaults to the built-in Antigravity client ID
  clientSecret?: string;      // Falls back to ANTIGRAVITY_OAUTH_CLIENT_SECRET env var
  projectId?: string;         // Cached after first resolution; optional on first use
}
```

The credential input also accepts a plain access token string or a JSON bundle with both camelCase and snake_case field names (`access_token`, `refresh_token`, `client_id`, `client_secret`, `project_id`, `expiry_date`).

**OAuth Link Flow (managed by server routes):**
- `POST /api/providers/antigravity/oauth/generate-auth-url`
- `POST /api/providers/antigravity/oauth/exchange-code`

The exchange response may include a `projectId`.

---

## 3. Token Refresh Strategy

The adapter implements **proactive** and **reactive** token refresh using Google's token endpoint.

### 3.1 Token Expiration Check

```typescript
// Proactive threshold: 5 minutes before expiry
const REFRESH_SKEW_MS = 5 * 60 * 1000;
isTokenExpiringSoon = expiresAt.getTime() <= Date.now() + REFRESH_SKEW_MS;
```

### 3.2 Proactive Refresh

Triggered at the start of `buildRequestContext()` when the token is expiring soon and a `refreshToken` is present:

```
buildRequestContext(oauth, allowTokenRefresh=true)
  └─ isTokenExpiringSoon? AND refreshToken present?
      └─ refreshAccessToken() → update oauth.accessToken + oauth.expiresAt
```

### 3.3 Reactive Refresh

Triggered on `401` / `403` responses from the Cloud API, once per request chain (`allowTokenRefresh` is set to `false` after the first reactive refresh):

```
POST {baseURL}/v1internal:...
  └─ 401 / 403 AND allowTokenRefresh AND refreshToken?
      └─ refreshAccessToken() → retry same request
          └─ allowTokenRefresh = false (no further retries)
```

### 3.4 Token Refresh Request

```http
POST https://oauth2.googleapis.com/token
Content-Type: application/x-www-form-urlencoded

client_id={clientId}&client_secret={clientSecret}
&refresh_token={refreshToken}&grant_type=refresh_token
```

`clientId` resolves as: `credentials.clientId` → `ANTIGRAVITY_OAUTH_CLIENT_ID` env → built-in default ID.
`clientSecret` resolves as: `credentials.clientSecret` → `ANTIGRAVITY_OAUTH_CLIENT_SECRET` env (required).

---

## 4. API Endpoints & Base URL Fallback

All Cloud API requests are `POST` with JSON bodies and `Authorization: Bearer {token}`.

### 4.1 Base URLs (tried in order)

```typescript
const DEFAULT_BASE_URLS = [
  'https://daily-cloudcode-pa.googleapis.com',
  'https://cloudcode-pa.googleapis.com',
];
```

The adapter maintains a `preferredBaseURL` field. On a successful response, the responding URL becomes preferred and is tried first on subsequent calls.

**Fallback triggers** (try next URL instead of failing):

| HTTP Status | Behavior |
|------------|---------|
| 404 | Try next URL |
| 408 | Try next URL |
| 429 | Try next URL |
| 5xx | Try next URL |
| 401 / 403 | Reactive token refresh, then retry |
| Other non-2xx | Throw error immediately |

### 4.2 Endpoints Called

| Endpoint | Purpose | When Called |
|----------|---------|------------|
| `POST /v1internal:loadCodeAssist` | Fetch project ID and tier info | Always (to resolve projectId) |
| `POST /v1internal:onboardUser` | Onboard user if no project exists | Only when `loadCodeAssist` returns no `cloudaicompanionProject` |
| `POST /v1internal:fetchAvailableModels` | Fetch per-model quota fractions | Always (primary data source) |

### 4.3 Request Bodies

**`loadCodeAssist`:**
```json
{ "metadata": { "ideType": "ANTIGRAVITY" } }
```

**`onboardUser`:**
```json
{
  "tierId": "{tier}",
  "metadata": {
    "ideType": "ANTIGRAVITY",
    "platform": "PLATFORM_UNSPECIFIED",
    "pluginType": "GEMINI"
  }
}
```

**`fetchAvailableModels`:**
```json
{ "project": "{projectId}" }
```

---

## 5. Project ID Resolution

A `projectId` is required for the `fetchAvailableModels` call. The adapter resolves it using a 4-step chain:

```
ensureProjectId(context, existingProjectId?, loadInfo?)
  │
  ├─ 1. existingProjectId present? → use it directly
  │
  ├─ 2. loadCodeAssist() → cloudaicompanionProject field?
  │       ├─ string → use as projectId
  │       └─ object with .id → use .id
  │
  ├─ 3. No project found → extract tierId from paidTier or currentTier
  │       └─ onboardUser(tierId) → cloudaicompanionProject in response?
  │           └─ use extracted projectId
  │
  └─ 4. Reload loadCodeAssist() after onboard → try again
      └─ Still no projectId → throw: 'Antigravity project ID is unavailable. Re-authenticate and retry.'
```

Once resolved, `projectId` is written back to `credentials.projectId` so it is persisted for future calls.

---

## 6. Usage Data Structure & Parsing

### 6.1 `fetchAvailableModels` Response

```typescript
interface AntigravityFetchModelsResponse {
  models?: Record<string, {
    displayName?: string;
    model?: string;
    isInternal?: boolean;
    quotaInfo?: {
      remainingFraction?: number;  // 0.0–1.0
      resetTime?: string;          // ISO datetime or timestamp
    };
  }>;
}
```

### 6.2 Per-Model Progress

Each model key becomes one `ProgressItem`. Internal models (`isInternal === true`) are excluded. Models without a valid `remainingFraction` are also excluded.

```typescript
usedPercent      = roundPercentage((1 - remainingFraction) * 100)
remainingPercent = roundPercentage(100 - usedPercent)
limit            = 100   // normalized
used             = usedPercent
windowMinutes    = 300   // all models use a 5-hour window
```

Model names are resolved in priority order: `displayName` → `model` → map key.

Progress items are sorted alphabetically by model name.

### 6.3 Plan Name

Extracted from the `loadCodeAssist` response via `paidTier` or `currentTier`:

```typescript
// Each tier field is either a plain string or an object:
if (typeof tier === 'string')         → tier as plan name
if (typeof tier === 'object')
  ├─ tier.name → plan name
  └─ tier.id   → plan name (fallback)
```

### 6.4 UsageSnapshot Output

```typescript
{
  provider: 'antigravity',
  progress: [
    { name: 'Gemini 2.0 Flash', usedPercent, remainingPercent, used, limit: 100, windowMinutes: 300, resetsAt },
    { name: 'Gemini 2.5 Pro',   usedPercent, remainingPercent, used, limit: 100, windowMinutes: 300, resetsAt },
    // ... sorted alphabetically
  ],
  identity: { plan: 'Standard' },
  updatedAt: Date,
}
```

---

## 7. Display Modes

The dashboard supports two display modes controlled via `attrs.antigravity.displayMode`:

| Mode | Behavior |
|------|---------|
| `"pool"` (default) | Show pooled quotas — models are grouped into named pools |
| `"models"` | Show all models individually |

Pool configuration example in `attrs`:

```json
{
  "antigravity": {
    "displayMode": "pool",
    "poolConfig": {
      "Claude":        ["claude", "gpt-oss"],
      "Gemini Pro":    ["gemini", "pro"],
      "Gemini Flash":  ["gemini", "flash"]
    }
  }
}
```

> Note: The full model-level `progress` data is always stored in history regardless of display mode.

---

## 8. Error Handling

| Condition | Error / Behavior |
|-----------|-----------------|
| `credentials.type !== OAUTH` | `'Antigravity requires OAuth authentication'` |
| Empty `accessToken` | `'Antigravity OAuth access token is required'` |
| 401 / 403 with no refresh token | Throws `AuthError` → `valid: false` |
| 401 / 403 with refresh token | Reactive token refresh → retry once |
| Token refresh requires client secret | `'Antigravity OAuth refresh requires ANTIGRAVITY_OAUTH_CLIENT_SECRET'` |
| Token refresh HTTP error | `AuthError: 'Antigravity token refresh failed: HTTP {status}'` |
| 429 from Cloud API | Try next base URL |
| No models returned | `'No model quota data returned by Antigravity API'` |
| projectId unavailable | `'Antigravity project ID is unavailable. Re-authenticate and retry.'` |

All requests use a 12-second timeout via `fetchWithTimeout`.

---

## 9. Environment Variables

| Variable | Required | Description |
|----------|---------|-------------|
| `ANTIGRAVITY_OAUTH_CLIENT_SECRET` | Yes (for token refresh) | OAuth client secret for Google token refresh |
| `ANTIGRAVITY_OAUTH_CLIENT_ID` | No | Override built-in OAuth client ID |

---

## 10. Data Flow Summary

```
User provides OAuth accessToken (+ optional refreshToken, projectId)
  └─ requireOAuthCredential() → AntigravityOAuthCredential
      └─ buildRequestContext(oauth, allowTokenRefresh=true)
          ├─ isTokenExpiringSoon? → proactive refreshAccessToken()
          └─ CloudRequestContext { accessToken, allowTokenRefresh, oauth }
              │
              └─ loadCodeAssist() → { cloudaicompanionProject, paidTier, currentTier }
                  └─ ensureProjectId()
                      ├─ Extract from loadCodeAssist response
                      └─ Fallback: onboardUser(tierId) → reload
                  └─ fetchAvailableModels(projectId) → models{}
                      ├─ [401/403] → reactive refreshAccessToken() → retry
                      └─ [404/408/429/5xx] → try next base URL
                  └─ Map models → ProgressItem[] (sorted by name)
                  └─ extractPlanName(loadInfo) → plan string
                  └─ UsageSnapshot { progress[per-model], identity }
                      └─ Persist updated accessToken + projectId to credentials
```

---

## 11. File Index

| File | Responsibility |
|------|----------------|
| `src/adapters/AntigravityAdapter.ts` | Core adapter: OAuth handling, project resolution, model quota parsing |
| `src/adapters/utils.ts` | `fetchWithTimeout`, `roundPercentage` utilities |
| `server/routes/providers.ts` | OAuth link flow routes (`/antigravity/oauth/*`) |

# Providers API `/api/providers`

All endpoints require a **normal or admin session cookie** (`requireApiAuth(['normal', 'admin'])`). Some endpoints additionally require the `admin` role.

---

### `GET /api/providers`

Returns all configured providers. The `normal` role receives no credential fields; the `admin` role receives sanitized (redacted) credentials.

#### Authentication

normal or admin session cookie.

#### Request Example

```bash
curl -b cookies.txt http://localhost:3001/api/providers
```

#### Response Example (admin role)

```json
{
  "success": true,
  "data": [
    {
      "id": "prov_abc123",
      "provider": "claude",
      "name": "My Claude",
      "refreshInterval": 5,
      "displayOrder": 0,
      "region": null,
      "claudeAuthMode": "cookie",
      "plan": "Claude Pro",
      "opencodeWorkspaceId": null,
      "defaultProgressItem": null,
      "credentials": {
        "type": "cookie",
        "value": "[COOKIE]"
      }
    }
  ]
}
```

The `normal` role response omits the `credentials` field entirely.

---

### `GET /api/providers/credentials`

Returns the full provider list with sanitized credentials. Admin only.

#### Authentication

admin session cookie.

#### Request Example

```bash
curl -b cookies.txt http://localhost:3001/api/providers/credentials
```

#### Response Example

Same structure as `GET /api/providers` (admin role). Credential values are redacted:

- `api_key`: first 4 + last 4 characters visible, middle replaced with `****`
- `cookie`: replaced with `[COOKIE]`
- `oauth`: `accessToken`/`refreshToken`/`idToken` → `[TOKEN]`; `clientSecret` → `[SECRET]`
- `jwt`: replaced with `[JWT]`

#### Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 403 | `FORBIDDEN` | Not an admin |

---

### `GET /api/providers/:id`

Returns a single provider with **unredacted** credentials. Admin only.

#### Authentication

admin session cookie.

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Provider ID |

#### Request Example

```bash
curl -b cookies.txt http://localhost:3001/api/providers/prov_abc123
```

#### Response Example

```json
{
  "success": true,
  "data": {
    "id": "prov_abc123",
    "provider": "claude",
    "name": "My Claude",
    "refreshInterval": 5,
    "displayOrder": 0,
    "region": null,
    "claudeAuthMode": "cookie",
    "plan": "Claude Pro",
    "opencodeWorkspaceId": null,
    "defaultProgressItem": null,
    "credentials": {
      "type": "cookie",
      "value": "actual_cookie_value_here"
    }
  }
}
```

#### Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 403 | `FORBIDDEN` | Not an admin |
| 404 | `NOT_FOUND` | Provider not found |

---

### `POST /api/providers`

Creates a new provider. Credentials are validated live and an initial usage fetch is triggered immediately after creation. Admin only.

#### Authentication

admin session cookie.

#### Request Body

```json
{
  "provider": "openrouter",
  "authType": "api_key",
  "credentials": "sk-or-v1-xxxxxxxxxxxx",
  "name": "OpenRouter Main",
  "refreshInterval": 10,
  "region": null,
  "claudeAuthMode": null,
  "plan": null,
  "opencodeWorkspaceId": null,
  "defaultProgressItem": null
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `provider` | string | Yes | Provider type — see [Provider Types](#provider-types) |
| `authType` | string | Yes | Auth type — see [Auth Types](#auth-types) |
| `credentials` | string | Yes | Credential value (format depends on `authType`) |
| `name` | string | No | Custom display name; must be unique within the same provider type |
| `refreshInterval` | number | No | Auto-refresh interval in minutes; default `5`; `0` disables auto-refresh |
| `region` | string | No | Region identifier for multi-region providers (MiniMax, z.ai) |
| `claudeAuthMode` | string | No | Claude only: `cookie` or `oauth` |
| `plan` | string | No | Claude only: optional plan metadata (for display and usage interpretation) |
| `opencodeWorkspaceId` | string | No | OpenCode only: workspace ID (`wrk_...`) |
| `defaultProgressItem` | string | No | Progress item name to display as primary in history charts |

#### Request Example

```bash
curl -b cookies.txt -X POST http://localhost:3001/api/providers \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "openrouter",
    "authType": "api_key",
    "credentials": "sk-or-v1-xxxxxxxxxxxx",
    "name": "OpenRouter Main",
    "refreshInterval": 10
  }'
```

#### Response Example

```json
{
  "success": true,
  "data": {
    "id": "prov_xyz789",
    "provider": "openrouter",
    "refreshInterval": 10,
    "displayOrder": 1,
    "region": null,
    "name": "OpenRouter Main",
    "claudeAuthMode": null,
    "plan": null,
    "opencodeWorkspaceId": null
  }
}
```

#### Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 403 | `FORBIDDEN` | Not an admin |
| 400 | `INVALID_REQUEST` | Missing `provider` or `credentials` |
| 400 | `DUPLICATE_NAME` | A provider of this type with that name already exists |
| 400 | `INVALID_CREDENTIALS` | Credential format is invalid |
| 400 | `VALIDATION_FAILED` | Live credential validation failed |
| 409 | `READONLY_STORAGE` | Storage is read-only |

---

### `PUT /api/providers/order`

Updates the display order of providers. Admin only.

#### Authentication

admin session cookie.

#### Request Body

```json
{
  "ids": ["prov_abc123", "prov_xyz789", "prov_def456"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ids` | string[] | Yes | Provider IDs in the desired display order |

#### Request Example

```bash
curl -b cookies.txt -X PUT http://localhost:3001/api/providers/order \
  -H "Content-Type: application/json" \
  -d '{"ids": ["prov_abc123", "prov_xyz789"]}'
```

#### Response Example

Returns the updated provider list (without credentials).

```json
{
  "success": true,
  "data": [
    {
      "id": "prov_abc123",
      "provider": "claude",
      "name": "My Claude",
      "refreshInterval": 5,
      "displayOrder": 0,
      "region": null,
      "claudeAuthMode": "cookie",
      "plan": "Claude Pro",
      "opencodeWorkspaceId": null,
      "defaultProgressItem": null
    }
  ]
}
```

#### Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 403 | `FORBIDDEN` | Not an admin |
| 400 | `INVALID_REQUEST` | `ids` is not a non-empty string array |
| 400 | `INVALID_ORDER` | IDs do not match the existing providers |

---

### `PUT /api/providers/:id`

Updates an existing provider. All fields are optional. `authType` and `credentials` must be provided together or both omitted. Credentials are re-validated and a usage refresh is triggered on update. Admin only.

#### Authentication

admin session cookie.

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Provider ID |

#### Request Body (all fields optional)

```json
{
  "name": "New Name",
  "refreshInterval": 15,
  "region": "minimax_cn",
  "authType": "api_key",
  "credentials": "new_api_key",
  "claudeAuthMode": "oauth",
  "plan": "Claude Max",
  "opencodeWorkspaceId": "wrk_xxx",
  "defaultProgressItem": "Fast Requests"
}
```

#### Request Example

```bash
curl -b cookies.txt -X PUT http://localhost:3001/api/providers/prov_abc123 \
  -H "Content-Type: application/json" \
  -d '{"refreshInterval": 15}'
```

#### Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 403 | `FORBIDDEN` | Not an admin |
| 404 | `NOT_FOUND` | Provider not found |
| 400 | `INVALID_REQUEST` | Only one of `authType`/`credentials` was provided |
| 400 | `DUPLICATE_NAME` | Another provider of the same type already uses that name |
| 400 | `INVALID_CREDENTIALS` | Credential format is invalid |
| 400 | `VALIDATION_FAILED` | Live credential validation failed |

---

### `DELETE /api/providers/:id`

Deletes a provider and all associated history. Admin only.

#### Authentication

admin session cookie.

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Provider ID |

#### Request Example

```bash
curl -b cookies.txt -X DELETE http://localhost:3001/api/providers/prov_abc123
```

#### Response Example

```json
{
  "success": true
}
```

#### Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 403 | `FORBIDDEN` | Not an admin |
| 409 | `READONLY_STORAGE` | Storage is read-only |

---

### `POST /api/providers/:id/refresh`

Refreshes usage data for a single provider with built-in cache and failure control. Admin only.

Behavior summary:

- If latest data is younger than ~3 minutes, the endpoint returns cached data (`fromCache: true`) instead of forcing a live fetch.
- If the previous fetch failed recently (~60s cooldown), the endpoint may return stale cached data (`stale: true`) or `503` when no cached data exists.
- If another refresh is currently running (~30s lock timeout), the endpoint may return stale data with `refreshing: true`, or `{ data: null, refreshing: true }` when no cached data exists.
- On live fetch failure with cached data available, the endpoint returns stale data plus `fetchError`; Claude OAuth auth failures may additionally set `authRequired: true`.

#### Authentication

admin session cookie.

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Provider ID |

#### Request Example

```bash
curl -b cookies.txt -X POST http://localhost:3001/api/providers/prov_abc123/refresh
```

#### Response Example (fresh or cached data)

```json
{
  "success": true,
  "data": {
    "provider": "claude",
    "progress": [
      {
        "name": "Fast Requests",
        "usedPercent": 45,
        "remainingPercent": 55,
        "used": 225,
        "limit": 500,
        "windowMinutes": 10080,
        "resetsAt": 1741910400,
        "resetDescription": "Resets weekly"
      }
    ],
    "updatedAt": 1741824000,
    "refreshInterval": 5,
    "fromCache": true,
    "cachedAt": 1741824000
  }
}
```

#### Response Example (stale fallback)

```json
{
  "success": true,
  "data": {
    "provider": "claude",
    "progress": [
      {
        "name": "Fast Requests",
        "usedPercent": 45,
        "remainingPercent": 55,
        "windowMinutes": 10080,
        "resetsAt": 1741910400
      }
    ],
    "updatedAt": 1741824000,
    "refreshInterval": 5,
    "stale": true,
    "staleAt": 1741824060,
    "refreshing": true,
    "authRequired": true,
    "fetchError": "Claude OAuth auth invalid: invalid_grant"
  }
}
```

#### Response Example (concurrent lock, no cache)

```json
{
  "success": true,
  "data": null,
  "refreshing": true,
  "refreshInterval": 5
}
```

`resetsAt`, `updatedAt`, `cachedAt`, and `staleAt` are Unix timestamps (seconds).

#### Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 403 | `FORBIDDEN` | Not an admin |
| 404 | `NOT_FOUND` | Provider not found |
| 400 | `ADAPTER_NOT_FOUND` | No adapter registered for this provider type |
| 400 | `FETCH_ERROR` | Live fetch failed and no cached fallback is available |
| 503 | `TEMPORARILY_UNAVAILABLE` | Recent fetch failed and no cached data is available yet |

---

### `GET /api/providers/:id/history`

Returns raw (non-compressed) usage history for a single provider.

#### Authentication

normal or admin session cookie.

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Provider ID |

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `days` | number | `30` | Number of days to query; range 1–365 |

#### Request Example

```bash
curl -b cookies.txt "http://localhost:3001/api/providers/prov_abc123/history?days=7"
```

---

### `POST /api/providers/copilot/auth/start`

Starts a GitHub Copilot OAuth device authorization flow. Returns the device code and the URL the user must visit to authorize. Admin only.

#### Authentication

admin session cookie.

#### Request Example

```bash
curl -b cookies.txt -X POST http://localhost:3001/api/providers/copilot/auth/start
```

#### Response Example

```json
{
  "success": true,
  "data": {
    "flowId": "flow_abc123",
    "deviceCode": "device_code_value",
    "userCode": "ABCD-EFGH",
    "verificationUri": "https://github.com/login/device",
    "expiresIn": 900,
    "interval": 5
  }
}
```

Direct the user to `verificationUri` to enter `userCode`, then poll the status endpoint at the cadence given by `interval`.

#### Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 403 | `FORBIDDEN` | Not an admin |
| 500 | `COPILOT_AUTH_START_FAILED` | Failed to initiate device flow |

---

### `GET /api/providers/copilot/auth/status/:flowId`

Polls the current state of a Copilot OAuth device flow. Poll at the `interval` returned by the start endpoint.

#### Authentication

admin session cookie.

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `flowId` | string | The `flowId` returned by the start endpoint |

#### Request Example

```bash
curl -b cookies.txt http://localhost:3001/api/providers/copilot/auth/status/flow_abc123
```

#### Response Example (pending)

```json
{
  "success": true,
  "data": {
    "status": "pending",
    "tempCredentialId": null
  }
}
```

#### Response Example (authorized)

```json
{
  "success": true,
  "data": {
    "status": "authorized",
    "tempCredentialId": "tmp_cred_xyz"
  }
}
```

Once `status` is `"authorized"`, pass `tempCredentialId` to the complete endpoint.

#### Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 403 | `FORBIDDEN` | Not an admin |
| 404 | `FLOW_NOT_FOUND` | `flowId` does not exist or has expired |

---

### `POST /api/providers/copilot/auth/complete`

Completes the Copilot OAuth flow and creates the provider. Admin only.

#### Authentication

admin session cookie.

#### Request Body

```json
{
  "tempCredentialId": "tmp_cred_xyz",
  "name": "My Copilot",
  "refreshInterval": 5
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tempCredentialId` | string | Yes | Temporary credential ID from the status endpoint |
| `name` | string | Yes | Display name for the new provider (cannot be empty) |
| `refreshInterval` | number | No | Auto-refresh interval in minutes; default `5` |

#### Request Example

```bash
curl -b cookies.txt -X POST http://localhost:3001/api/providers/copilot/auth/complete \
  -H "Content-Type: application/json" \
  -d '{
    "tempCredentialId": "tmp_cred_xyz",
    "name": "My Copilot",
    "refreshInterval": 5
  }'
```

#### Response Example

```json
{
  "success": true,
  "data": {
    "id": "prov_copilot1",
    "provider": "copilot",
    "refreshInterval": 5,
    "displayOrder": 2,
    "name": "My Copilot"
  }
}
```

#### Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 403 | `FORBIDDEN` | Not an admin |
| 400 | `INVALID_REQUEST` | `tempCredentialId` or `name` is missing |
| 400 | `DUPLICATE_NAME` | A Copilot provider with that name already exists |
| 400 | `VALIDATION_FAILED` | Credential validation failed |
| 400 | `COPILOT_AUTH_COMPLETE_FAILED` | Other error (e.g. temp credential already consumed) |

---

### `POST /api/providers/claude/oauth/generate-auth-url`

Generates a one-time Claude OAuth authorization URL and session ID for PKCE code exchange. Admin only.

#### Authentication

admin session cookie.

#### Request Example

```bash
curl -b cookies.txt -X POST http://localhost:3001/api/providers/claude/oauth/generate-auth-url
```

#### Response Example

```json
{
  "success": true,
  "data": {
    "authUrl": "https://claude.ai/oauth/authorize?...",
    "sessionId": "9b2f82b2-06ea-4f2d-8dbf-4eb6ad4cd953"
  }
}
```

#### Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 403 | `FORBIDDEN` | Not an admin |
| 500 | `CLAUDE_OAUTH_GENERATE_FAILED` | Failed to generate authorization URL |

---

### `POST /api/providers/claude/oauth/exchange-code`

Exchanges a Claude OAuth authorization code for tokens using the previously generated `sessionId`. Admin only.

#### Authentication

admin session cookie.

#### Request Body

```json
{
  "sessionId": "9b2f82b2-06ea-4f2d-8dbf-4eb6ad4cd953",
  "code": "callback_url_or_code",
  "state": "optional_state"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sessionId` | string | Yes | Session ID from `generate-auth-url` |
| `code` | string | Yes | OAuth code, callback URL, or `code#state` format |
| `state` | string | No | Optional state override |

#### Request Example

```bash
curl -b cookies.txt -X POST http://localhost:3001/api/providers/claude/oauth/exchange-code \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "9b2f82b2-06ea-4f2d-8dbf-4eb6ad4cd953",
    "code": "https://platform.claude.com/oauth/code/callback?code=abc&state=xyz"
  }'
```

#### Response Example

```json
{
  "success": true,
  "data": {
    "accessToken": "...",
    "refreshToken": "...",
    "expiresAt": "2026-03-10T16:35:00.000Z",
    "clientId": "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
  }
}
```

#### Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 403 | `FORBIDDEN` | Not an admin |
| 400 | `INVALID_REQUEST` | Missing `sessionId` or `code` |
| 400 | `CLAUDE_OAUTH_EXCHANGE_FAILED` | Code exchange failed |

---

## Appendix

### Provider Types

| Value | Display Name |
|-------|-------------|
| `aliyun` | Aliyun |
| `claude` | Claude |
| `codex` | Codex |
| `kimi` | Kimi |
| `minimax` | MiniMax |
| `zai` | z.ai |
| `copilot` | Copilot |
| `openrouter` | OpenRouter |
| `ollama` | Ollama |
| `opencode` | OpenCode |
| `cursor` | Cursor |

### Auth Types

| Value | Description | Supported Providers |
|-------|-------------|---------------------|
| `api_key` | API key | OpenRouter, Aliyun, etc. |
| `cookie` | Browser session cookie | Claude, Kimi, Cursor, etc. |
| `oauth` | OAuth access token | Claude (OAuth mode), Copilot (device flow), Codex |
| `jwt` | JWT token | Select providers |

> Codex only supports `oauth`. Kimi only supports `cookie`.

### Credential Object Formats

When creating or updating, `credentials` is passed as a plain string. In API responses (and in storage), credentials are represented as typed objects:

**api_key**
```json
{ "type": "api_key", "value": "sk-xxx...", "keyPrefix": "sk-xxx" }
```

**cookie**
```json
{ "type": "cookie", "value": "session=xxx; ...", "source": "manual" }
```

**oauth**
```json
{
  "type": "oauth",
  "accessToken": "ghu_xxx",
  "refreshToken": "ghr_xxx",
  "expiresAt": "2026-06-01T00:00:00.000Z",
  "clientId": "client_id",
  "clientSecret": "client_secret",
  "projectId": "project_id"
}
```

**jwt**
```json
{ "type": "jwt", "value": "eyJhbGci..." }
```

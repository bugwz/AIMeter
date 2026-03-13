# System API `/api/system` + `/api/system/jobs` + `/api/system/secrets`

---

### `GET /api/system/capabilities`

Returns the server's runtime capabilities. The frontend uses this to control which UI features are available. Response content may differ by role — admin sees more configuration details.

#### Authentication

normal or admin session cookie (`requireApiAuth(['normal', 'admin'])`).

#### Request Example

```bash
curl -b cookies.txt http://localhost:3001/api/system/capabilities
```

#### Response Example

```json
{
  "success": true,
  "data": {
    "auth": {
      "normal": {
        "enabled": true,
        "mutable": true,
        "needsSetup": false
      },
      "admin": {
        "enabled": true,
        "mutable": true,
        "needsSetup": false
      }
    },
    "runtime": {
      "mode": "server",
      "mockEnabled": false
    },
    "features": {
      "scheduler": true,
      "cronJobs": false
    }
  }
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `auth.normal.enabled` | boolean | Whether authentication is enabled for the normal role |
| `auth.normal.mutable` | boolean | Whether the normal password can be changed |
| `auth.normal.needsSetup` | boolean | Whether the normal password still needs to be set |
| `auth.admin.*` | — | Same fields for the admin role |
| `runtime.mode` | string | Runtime mode: `server` or `serverless` |
| `runtime.mockEnabled` | boolean | Whether mock mode is active |
| `features.scheduler` | boolean | Whether the background scheduler is running |
| `features.cronJobs` | boolean | Whether cron job refresh is configured (`AIMETER_CRON_SECRET` is set) |

#### Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 401 | `UNAUTHORIZED` | Not authenticated |

---

### `POST /api/system/jobs/refresh`

Batch-refreshes all (or selected) providers' usage data. Designed for integration with Vercel Cron Jobs or any external scheduler.

**This endpoint does not use session cookie authentication.** It is authenticated via the `x-aimeter-cron-secret` request header.

#### Authentication

Request header: `x-aimeter-cron-secret: <secret>`.

Secret source by deployment mode:
- **Database mode**: auto-generated at first startup; retrieve the current value from the admin Settings page or `GET /api/system/secrets`.
- **Env/config mode**: must match the configured `cronSecret` value. Configuration priority is `config.yaml` > environment variables (`AIMETER_CRON_SECRET`) > defaults.

Returns 503 if no cron secret is available.

#### Request Body (optional)

```json
{
  "providerIds": ["prov_abc123", "prov_xyz789"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `providerIds` | string[] | No | Specific provider IDs to refresh; omit to refresh all providers |

#### Request Examples

**curl**

```bash
# Refresh all providers
curl -X POST http://localhost:3001/api/system/jobs/refresh \
  -H "x-aimeter-cron-secret: your_32_char_cron_secret" \
  -H "Content-Type: application/json"

# Refresh specific providers only
curl -X POST http://localhost:3001/api/system/jobs/refresh \
  -H "x-aimeter-cron-secret: your_32_char_cron_secret" \
  -H "Content-Type: application/json" \
  -d '{"providerIds": ["prov_abc123", "prov_xyz789"]}'
```

**Python (requests)**

```python
import requests

BASE_URL = "http://localhost:3001"
CRON_SECRET = "your_32_char_cron_secret"

headers = {
    "x-aimeter-cron-secret": CRON_SECRET,
    "Content-Type": "application/json",
}

# Refresh all providers
response = requests.post(f"{BASE_URL}/api/system/jobs/refresh", headers=headers)
data = response.json()
print(f"total={data['data']['total']}, success={data['data']['success']}, failed={data['data']['failed']}")

# Refresh specific providers only
response = requests.post(
    f"{BASE_URL}/api/system/jobs/refresh",
    headers=headers,
    json={"providerIds": ["prov_abc123", "prov_xyz789"]},
)
```

**JavaScript / Node.js (fetch)**

```js
const BASE_URL = "http://localhost:3001";
const CRON_SECRET = "your_32_char_cron_secret";

// Refresh all providers
const res = await fetch(`${BASE_URL}/api/system/jobs/refresh`, {
  method: "POST",
  headers: {
    "x-aimeter-cron-secret": CRON_SECRET,
    "Content-Type": "application/json",
  },
});
const data = await res.json();
console.log(`total=${data.data.total}, success=${data.data.success}, failed=${data.data.failed}`);

// Refresh specific providers only
await fetch(`${BASE_URL}/api/system/jobs/refresh`, {
  method: "POST",
  headers: {
    "x-aimeter-cron-secret": CRON_SECRET,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ providerIds: ["prov_abc123", "prov_xyz789"] }),
});
```

#### Response Example

```json
{
  "success": true,
  "data": {
    "total": 3,
    "success": 2,
    "failed": 1,
    "durationMs": 4231,
    "results": [
      {
        "id": "prov_abc123",
        "provider": "claude",
        "ok": true,
        "updatedAt": 1773050400
      },
      {
        "id": "prov_xyz789",
        "provider": "kimi",
        "ok": true,
        "updatedAt": 1773050401
      },
      {
        "id": "prov_err456",
        "provider": "openrouter",
        "ok": false,
        "error": "Unauthorized: invalid API key"
      }
    ]
  }
}
```

| Field | Description |
|-------|-------------|
| `total` | Total number of providers processed |
| `success` | Number of successful refreshes |
| `failed` | Number of failures |
| `durationMs` | Total elapsed time in milliseconds |
| `results[].ok` | Whether this provider refreshed successfully |
| `results[].updatedAt` | Data timestamp on success (Unix seconds) |
| `results[].error` | Error message on failure |

#### Vercel Cron Jobs Integration

Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/system/jobs/refresh",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

Set `AIMETER_CRON_SECRET` (or `auth.cronSecret` in `config.yaml`) and include it in your cron request headers.

#### Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 503 | `CRON_SECRET_NOT_CONFIGURED` | No cron secret is available (not configured in env/config and not found in DB) |
| 401 | `UNAUTHORIZED` | `x-aimeter-cron-secret` header is missing or incorrect |

---

### `GET /api/system/secrets`

Returns the current effective cron secret and endpoint secret. In env/config mode, values come directly from the active runtime config; in database mode, values come from the `settings` table.

#### Authentication

admin session cookie (`requireApiAuth(['normal', 'admin'])` + `requireAdminRole`).

#### Request Example

```bash
curl -b cookies.txt http://localhost:3001/api/system/secrets
```

#### Response Example

```json
{
  "success": true,
  "data": {
    "cronSecret": "a3f8c2...(32 hex chars)",
    "endpointSecret": "9d1e74...(32 hex chars)"
  }
}
```

#### Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 401 | `UNAUTHORIZED` | Not authenticated |
| 403 | `FORBIDDEN` | Authenticated but not admin |

---

### `POST /api/system/secrets/cron/reset`

Rotates the cron secret — generates a new 32-character hex secret and overwrites the value in the `settings` table. **The old secret stops working immediately.**

#### Authentication

admin session cookie.

#### Request Example

```bash
curl -X POST -b cookies.txt http://localhost:3001/api/system/secrets/cron/reset
```

#### Response Example

```json
{
  "success": true,
  "data": {
    "cronSecret": "new_32_hex_secret..."
  }
}
```

#### Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 401 | `UNAUTHORIZED` | Not authenticated |
| 403 | `FORBIDDEN` | Authenticated but not admin |
| 409 | `READ_ONLY_SECRET` | Secret mutation is currently read-only |

---

### `POST /api/system/secrets/endpoint/reset`

Rotates the endpoint secret — same behavior as the cron secret reset, but for the endpoint secret used by `/api/endpoint/subscriptions`.

#### Authentication

admin session cookie.

#### Request Example

```bash
curl -X POST -b cookies.txt http://localhost:3001/api/system/secrets/endpoint/reset
```

#### Response Example

```json
{
  "success": true,
  "data": {
    "endpointSecret": "new_32_hex_secret..."
  }
}
```

#### Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 401 | `UNAUTHORIZED` | Not authenticated |
| 403 | `FORBIDDEN` | Authenticated but not admin |
| 409 | `READ_ONLY_SECRET` | Secret mutation is currently read-only |

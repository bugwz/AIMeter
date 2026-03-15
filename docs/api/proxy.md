# Proxy API `/api/proxy`

All endpoints require a **normal or admin session cookie** (`requireApiAuth(['normal', 'admin'])`). `POST /proxy/refresh` additionally requires the `admin` role.

---

### `POST /api/proxy/latest`

Returns usage data for all configured providers. It prefers latest cached records; if no cached record exists for a provider, the server may fetch live data for that provider and persist it.

#### Authentication

normal or admin session cookie.

#### Request Example

```bash
curl -b cookies.txt -X POST http://localhost:3001/api/proxy/latest
```

#### Response Example

```json
{
  "success": true,
  "data": [
    {
      "id": "prov_abc123",
      "provider": "claude",
      "name": "My Claude",
      "region": null,
      "refreshInterval": 5,
      "identity": { "plan": "Pro" },
      "progress": [
        {
          "name": "Fast Requests",
          "desc": null,
          "usedPercent": 45,
          "remainingPercent": 55,
          "used": 225,
          "limit": 500,
          "windowMinutes": 10080,
          "resetsAt": 1741910400,
          "resetDescription": "Resets weekly"
        }
      ],
      "updatedAt": 1741824000
    },
    {
      "id": "prov_err456",
      "provider": "kimi",
      "code": "UNKNOWN",
      "message": "No data available",
      "timestamp": 1741824000
    }
  ]
}
```

Each item in the array is either a usage record (contains `progress`) or an error record (contains `code`). Distinguish them by checking for the `progress` field.

**Usage record fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Provider ID |
| `provider` | string | Provider type |
| `name` | string\|null | Provider display name |
| `region` | string | Region identifier |
| `refreshInterval` | number | Provider refresh interval (minutes) |
| `identity.plan` | string | Subscription plan (e.g. Pro, Starter) |
| `progress` | array | Progress item array |
| `progress[].usedPercent` | number | Percentage used; may exceed 100 for overquota scenarios |
| `progress[].resetsAt` | number\|null | Reset timestamp (Unix seconds) |
| `updatedAt` | number | Data timestamp (Unix seconds) |

**Error record fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Provider ID |
| `provider` | string | Provider type |
| `code` | string | Error code |
| `message` | string | Error message |
| `timestamp` | number | Unix seconds |

#### Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 401 | `UNAUTHORIZED` | Not authenticated |
| 500 | `LATEST_ERROR` | Server error |

---

### `POST /api/proxy/refresh`

Refreshes all configured providers with the same per-provider protection rules used by single refresh (recent-cache reuse and failure cooldown). Admin only. May take several seconds depending on the number of providers.

#### Authentication

admin session cookie.

#### Request Example

```bash
curl -b cookies.txt -X POST http://localhost:3001/api/proxy/refresh
```

#### Response Example

Same structure as `/proxy/latest`. Each provider item may additionally include:
- `fromCache: true` when recent data was reused.
- `stale: true` and `staleAt` when fallback cached data is returned after a fetch failure/cooldown.
- `fetchError` and `authRequired` for degraded fallback responses.

#### Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 403 | `FORBIDDEN` | Not an admin |
| 500 | `REFRESH_ERROR` | Batch refresh failed |

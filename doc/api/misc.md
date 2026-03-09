# Miscellaneous Endpoints

The following endpoints require no authentication and are accessible by any client.

---

### `GET /api/health`

Health check endpoint. Returns the service status and current server time. Suitable for container liveness probes and load balancer health checks.

#### Authentication

None (public endpoint).

#### Request Example

```bash
curl http://localhost:3001/api/health
```

#### Response Example

```json
{
  "status": "ok",
  "timestamp": "2026-03-09T10:00:00.000Z"
}
```

| Field | Description |
|-------|-------------|
| `status` | Always `"ok"` when the server is running |
| `timestamp` | Current server time (ISO 8601) |

**Kubernetes liveness probe example:**

```yaml
livenessProbe:
  httpGet:
    path: /api/health
    port: 3001
  initialDelaySeconds: 10
  periodSeconds: 30
```

**Docker HEALTHCHECK example:**

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1
```

---

### `GET /api/entry-context`

Returns the role and base path for the current URL path. Used by the frontend on initial page load to determine whether to render the normal dashboard or the admin panel.

**This endpoint is rate-limited** per IP address.

#### Authentication

None (public endpoint), subject to rate limiting.

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `path` | string | `/` | The current URL path (typically `window.location.pathname`) |

#### Request Example

```bash
curl "http://localhost:3001/api/entry-context?path=/"
```

#### Response Example (normal path)

```json
{
  "success": true,
  "data": {
    "role": "normal",
    "basePath": "/",
    "invalidAdminPath": false
  }
}
```

#### Response Example (admin path)

```json
{
  "success": true,
  "data": {
    "role": "admin",
    "basePath": "/abcdefghij1234567890...",
    "invalidAdminPath": false
  }
}
```

| Field | Description |
|-------|-------------|
| `role` | `"normal"` or `"admin"` depending on whether `path` matches the configured admin route secret |
| `basePath` | Base path for the role — the admin route secret path for admin, `/` for normal |
| `invalidAdminPath` | Reserved field; always `false` |

The frontend uses `role` and `basePath` to bootstrap the correct UI.

#### Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 429 | `RATE_LIMITED` | Too many requests from this IP; response includes `retryAfterSeconds` |

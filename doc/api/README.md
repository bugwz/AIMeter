# AIMeter API Reference

AIMeter is a self-hosted usage tracking dashboard for AI providers. This document covers all server-side API endpoints.

## Base Information

- **Default port**: `3001`
- **Base URL**: `http://localhost:3001`
- **Request body format**: `application/json` (unless otherwise noted)
- **Response format**: `application/json` (unless otherwise noted)

---

## Authentication

### Session Cookie (primary)

Most API endpoints use session cookie authentication. After a successful login, the server sets a role-specific cookie:

| Role | Cookie name |
|------|-------------|
| normal | `aimeter_normal_session` |
| admin | `aimeter_admin_session` |

Cookie flags: `HttpOnly; SameSite=Strict; Path=/`. The `Secure` flag is added in production. Default TTL is **12 hours** (configurable via `AIMETER_AUTH_SESSION_TTL_SECONDS`).

Token format: `base64url(payload).hmac_sha256_signature`. The signature is bound to the current password hash — changing a password immediately invalidates all existing tokens for that role.

### Endpoint Secret (`/api/endpoint` only)

`/api/endpoint/subscriptions` additionally accepts an endpoint secret header, fixed to the `normal` role:

```
x-aimeter-endpoint-secret: <configured_secret>
```

Secret source by deployment mode:
- **Database mode**: auto-generated at first startup and stored in the `settings` table; retrieve the value from the admin Settings page or via `GET /api/system/secrets`.
- **Env/config mode**: must match the `AIMETER_ENDPOINT_SECRET` environment variable (or `auth.endpointSecret` in `config.yaml`) and should be exactly 32 random characters.

If no secret is configured or found, secret-based authentication is unavailable.

### Cron Secret (`/api/system/jobs/refresh` only)

```
x-aimeter-cron-secret: <configured_secret>
```

Secret source by deployment mode:
- **Database mode**: auto-generated at first startup and stored in the `settings` table; retrieve the value from the admin Settings page or via `GET /api/system/secrets`.
- **Env/config mode**: must match the `AIMETER_CRON_SECRET` environment variable (or `auth.cronSecret` in `config.yaml`) and should be exactly 32 random characters.

If not configured, the endpoint returns 503.

---

## Roles

| Role | Description |
|------|-------------|
| `normal` | Read-only access to usage data |
| `admin` | Full management — create/update/delete providers, view credentials, trigger refreshes |

Some endpoints are accessible to both roles but return different data (e.g. `GET /api/providers` hides credentials for the `normal` role).

---

## Response Format

### Success

```json
{
  "success": true,
  "data": { ... }
}
```

### Error

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description"
  }
}
```

---

## HTTP Status Codes

| Code | Meaning |
|------|---------|
| `200` | OK |
| `400` | Bad request (invalid parameters, password policy violation, etc.) |
| `401` | Unauthenticated or invalid credentials |
| `403` | Authenticated but insufficient role (admin required) |
| `404` | Resource not found |
| `409` | Conflict (e.g. read-only storage) |
| `410` | Gone — endpoint permanently disabled (bootstrap already completed) |
| `429` | Rate limited |
| `500` | Internal server error |
| `503` | Service unavailable (e.g. cron secret not configured) |

---

## Security Headers

Applied to every response:

| Header | Value |
|--------|-------|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `no-referrer` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Cross-Origin-Resource-Policy` | `same-origin` |
| `Content-Security-Policy` | `default-src 'self'; ...` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` (production only) |

---

## Endpoint Index

### [Auth `/api/auth`](./auth.md)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/auth/:role/status` | Get auth status for a role | Public |
| POST | `/api/auth/bootstrap` | First-time initialization | Public (one-time) |
| POST | `/api/auth/:role/setup` | Set password for a role | Public (before setup) |
| POST | `/api/auth/:role/verify` | Login | Public |
| POST | `/api/auth/:role/logout` | Logout | Public |
| POST | `/api/auth/admin/change-password` | Change password | admin session |
| GET | `/api/auth/admin/audit-logs` | Query audit logs | admin session |

### [Providers `/api/providers`](./providers.md)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/providers` | List providers | normal/admin |
| GET | `/api/providers/credentials` | List providers with credentials | admin |
| GET | `/api/providers/:id` | Get a single provider | admin |
| POST | `/api/providers` | Create provider | admin |
| PUT | `/api/providers/order` | Reorder providers | admin |
| PUT | `/api/providers/:id` | Update provider | admin |
| DELETE | `/api/providers/:id` | Delete provider | admin |
| POST | `/api/providers/:id/refresh` | Manually refresh usage | admin |
| GET | `/api/providers/:id/history` | Get provider history | normal/admin |
| POST | `/api/providers/copilot/auth/start` | Start Copilot OAuth device flow | admin |
| GET | `/api/providers/copilot/auth/status/:flowId` | Poll OAuth flow status | admin |
| POST | `/api/providers/copilot/auth/complete` | Complete OAuth and create provider | admin |
| POST | `/api/providers/claude/oauth/generate-auth-url` | Generate Claude OAuth authorization URL | admin |
| POST | `/api/providers/claude/oauth/exchange-code` | Exchange Claude OAuth code for tokens | admin |
| POST | `/api/providers/antigravity/oauth/generate-auth-url` | Generate Antigravity OAuth authorization URL | admin |
| POST | `/api/providers/antigravity/oauth/exchange-code` | Exchange Antigravity OAuth code for tokens | admin |

### [History `/api/history`](./history.md)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/history` | Get compressed history data | normal/admin |

### [Proxy `/api/proxy`](./proxy.md)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/proxy/latest` | Latest cached usage for all providers | normal/admin |
| POST | `/api/proxy/refresh` | Force live refresh of all providers | admin |

### [Data Export `/api/endpoint`](./endpoint.md)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/endpoint/subscriptions` | Multi-format data export | normal/admin (Endpoint Secret supported) |

### [System `/api/system`](./system.md)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/system/capabilities` | Get runtime capabilities | normal/admin |
| GET | `/api/system/secrets` | Get cron & endpoint secrets (DB mode only) | admin |
| POST | `/api/system/secrets/cron/reset` | Rotate cron secret (DB mode only) | admin |
| POST | `/api/system/secrets/endpoint/reset` | Rotate endpoint secret (DB mode only) | admin |
| POST | `/api/system/jobs/refresh` | Cron batch refresh | Cron Secret |

### [Miscellaneous](./misc.md)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/health` | Health check | Public |
| GET | `/api/entry-context` | Entry context for frontend init | Public (rate limited) |

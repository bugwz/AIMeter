# Auth API `/api/auth`

All `/api/auth` responses include `Cache-Control: no-store`.

---

### `GET /api/auth/:role/status`

Returns the authentication status for the specified role. Used by the frontend to decide whether to redirect to a setup or login page.

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `role` | string | `normal` or `admin` |

#### Authentication

None (public endpoint).

#### Request Example

```bash
curl http://localhost:3001/api/auth/normal/status
```

#### Response Example

```json
{
  "success": true,
  "data": {
    "role": "normal",
    "needsSetup": false,
    "bootstrapRequired": false,
    "authenticated": true,
    "authEnabled": true,
    "authMutable": true
  }
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `role` | string | Role name |
| `needsSetup` | boolean | Whether a password still needs to be set (includes incomplete bootstrap) |
| `bootstrapRequired` | boolean | Whether bootstrap must be completed first (normal role only) |
| `authenticated` | boolean | Whether the current request is authenticated for this role |
| `authEnabled` | boolean | Whether authentication is enabled for this role |
| `authMutable` | boolean | Whether the password can be changed |

#### Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 404 | `NOT_FOUND` | `role` is not `normal` or `admin` |

---

### `POST /api/auth/bootstrap`

**First-time initialization**: sets the normal password, admin password, and admin route path in a single call. Returns 410 on all subsequent calls.

#### Authentication

None (public, one-time endpoint).

#### Request Body

```json
{
  "normalPassword": "mypassword123",
  "adminPassword": "adminpass456",
  "adminRoutePath": "abcd1234efgh5678ijkl9012mnop3456"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `normalPassword` | string | Yes | At least 12 characters, must contain letters and digits |
| `adminPassword` | string | Yes | Same rules; must differ from `normalPassword` |
| `adminRoutePath` | string | Yes | Exactly 32 alphanumeric characters (no special characters) |

#### Request Example

```bash
curl -X POST http://localhost:3001/api/auth/bootstrap \
  -H "Content-Type: application/json" \
  -d '{
    "normalPassword": "mypassword123",
    "adminPassword": "adminpass456",
    "adminRoutePath": "abcd1234efgh5678ijkl9012mnop3456"
  }'
```

#### Response Example

```json
{
  "success": true,
  "data": {
    "adminBasePath": "/abcd1234efgh5678ijkl9012mnop3456",
    "message": "Initial setup completed successfully"
  }
}
```

A session cookie for the `normal` role is automatically set on success.

#### Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 410 | `BOOTSTRAP_DISABLED` | Setup already completed; endpoint is permanently disabled |
| 429 | `RATE_LIMITED` | Too many requests |
| 400 | `INVALID_PASSWORD` | Password fails length/character/uniqueness rule |
| 400 | `INVALID_ADMIN_ROUTE_PATH` | Secret is not exactly 32 alphanumeric characters |
| 409 | `READONLY_STORAGE` | Storage is read-only |
| 500 | `INTERNAL_ERROR` | Server error |

---

### `POST /api/auth/:role/setup`

Sets the password for the specified role. Only valid when no password is configured for that role yet.

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `role` | string | `normal` or `admin` |

#### Authentication

None (accessible when password is not yet set).

#### Request Body

```json
{
  "password": "mypassword123"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `password` | string | Yes | At least 12 characters, must contain letters and digits |

#### Request Example

```bash
curl -X POST http://localhost:3001/api/auth/normal/setup \
  -H "Content-Type: application/json" \
  -d '{"password": "mypassword123"}'
```

#### Response Example

```json
{
  "success": true,
  "data": { "message": "Password set successfully" }
}
```

A session cookie for the role is automatically set on success.

#### Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 404 | `NOT_FOUND` | Invalid role |
| 429 | `RATE_LIMITED` | Too many attempts |
| 400 | `INVALID_PASSWORD` | Password does not meet requirements |
| 400 | `ALREADY_SETUP` | A password is already configured for this role |
| 409 | `READONLY_STORAGE` | Storage is read-only |

---

### `POST /api/auth/:role/verify`

Verifies the password and issues a session cookie on success.

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `role` | string | `normal` or `admin` |

#### Authentication

None (login endpoint).

#### Request Body

```json
{
  "password": "mypassword123"
}
```

#### Request Example

```bash
curl -c cookies.txt -X POST http://localhost:3001/api/auth/normal/verify \
  -H "Content-Type: application/json" \
  -d '{"password": "mypassword123"}'
```

#### Response Example (correct password)

```json
{
  "success": true,
  "data": { "valid": true }
}
```

#### Response Example (wrong password)

```json
{
  "success": true,
  "data": { "valid": false }
}
```

HTTP status is `200` in both cases; check `data.valid` to determine the outcome.

#### Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 404 | `NOT_FOUND` | Invalid role |
| 429 | `TOO_MANY_ATTEMPTS` | Too many failed attempts; includes `retryAfterSeconds` |
| 400 | `INVALID_REQUEST` | `password` field is missing |

---

### `POST /api/auth/:role/logout`

Clears the session cookie for the specified role.

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `role` | string | `normal` or `admin` |

#### Authentication

None (cookie is cleared unconditionally).

#### Request Example

```bash
curl -b cookies.txt -X POST http://localhost:3001/api/auth/normal/logout
```

#### Response Example

```json
{
  "success": true,
  "data": { "message": "Logged out successfully" }
}
```

#### Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 404 | `NOT_FOUND` | Invalid role |

---

### `POST /api/auth/admin/change-password`

Changes the password for any role. Requires an admin session and the current password of the target role. The target role's session cookie is cleared on success — that role must re-authenticate.

#### Authentication

Admin session cookie required.

#### Request Body

```json
{
  "targetRole": "normal",
  "oldPassword": "mypassword123",
  "newPassword": "newpassword456"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `targetRole` | string | Yes | `normal` or `admin` |
| `oldPassword` | string | Yes | Current password of the target role |
| `newPassword` | string | Yes | New password; at least 12 characters, must contain letters and digits |

#### Request Example

```bash
curl -b cookies.txt -X POST http://localhost:3001/api/auth/admin/change-password \
  -H "Content-Type: application/json" \
  -d '{
    "targetRole": "normal",
    "oldPassword": "mypassword123",
    "newPassword": "newpassword456"
  }'
```

#### Response Example

```json
{
  "success": true,
  "data": { "message": "Password changed successfully" }
}
```

#### Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 401 | `UNAUTHORIZED` | Missing or invalid admin session cookie |
| 400 | `INVALID_REQUEST` | Missing required fields |
| 400 | `INVALID_PASSWORD` | New password fails requirements |
| 400 | `INVALID_PASSWORD` | `oldPassword` is incorrect |
| 409 | `READONLY_STORAGE` | Storage is read-only |

---

### `GET /api/auth/admin/audit-logs`

Returns recent audit log entries (up to 1000).

#### Authentication

Admin session cookie required.

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | `200` | Number of entries to return; max 1000 |

#### Request Example

```bash
curl -b cookies.txt "http://localhost:3001/api/auth/admin/audit-logs?limit=50"
```

#### Response Example

```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "ip": "127.0.0.1",
      "method": "POST",
      "path": "/api/auth/normal/verify",
      "statusCode": 200,
      "durationMs": 42,
      "eventType": "normal_login_success",
      "details": { "result": "success", "role": "normal" },
      "createdAt": "2026-03-09T10:00:00.000Z"
    }
  ]
}
```

#### Audit Log Fields

| Field | Description |
|-------|-------------|
| `ip` | Request source IP |
| `method` | HTTP method |
| `path` | Request path |
| `statusCode` | Response status code |
| `durationMs` | Processing time in milliseconds |
| `eventType` | Event type, e.g. `normal_login_success`, `admin_login_failed` |
| `details` | Additional context object |

#### Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 401 | `UNAUTHORIZED` | Missing or invalid admin session cookie |

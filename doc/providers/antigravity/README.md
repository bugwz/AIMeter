# Antigravity Provider

AIMeter supports Antigravity via **server-side Cloud Code APIs** (no local process probing required).

## Auth Model

- Auth type: `oauth`
- Required field: `accessToken`
- Optional fields: `refreshToken`, `clientId`, `expiresAt`, `projectId`

Credential input can be either:

1. Plain access token string
2. JSON bundle string with fields such as:
   - `accessToken` / `access_token`
   - `refreshToken` / `refresh_token`
   - `clientId` / `client_id`
   - `clientSecret` / `client_secret`
   - `projectId` / `project_id` / `project`
   - `expiresAt` / `expiry_date`

## OAuth Link Flow

Backend endpoints:

- `POST /api/providers/antigravity/oauth/generate-auth-url`
- `POST /api/providers/antigravity/oauth/exchange-code`

The exchange endpoint returns token info and may include `projectId`.

## Environment Variables

- `ANTIGRAVITY_OAUTH_CLIENT_SECRET` (required for code exchange and refresh)
- `ANTIGRAVITY_OAUTH_CLIENT_ID` (optional; defaults to official client ID)

## Display Modes

Antigravity supports UI display settings under provider `attrs`:

```json
{
  "antigravity": {
    "displayMode": "pool",
    "poolConfig": {
      "Claude": ["claude", "gpt-oss"],
      "Gemini Pro": ["gemini", "pro"],
      "Gemini Flash": ["gemini", "flash"]
    }
  }
}
```

- `displayMode: "pool"` (default): show pooled quotas
- `displayMode: "models"`: show full model list

Note: history storage keeps full model progress data in both modes.

# Configuration Mapping

This document describes the mapping between `config.yaml` fields and environment variables, including behavior and default values.

## Priority

Current implementation priority:

1. `config.yaml` (or file set by `AIMETER_CONFIG_FILE`)
2. Environment variables
3. Built-in defaults

## Config File Loading

| Purpose | Environment Variable | Description |
|---|---|---|
| Config file path | `AIMETER_CONFIG_FILE` | Optional. Path to YAML config file. Default lookup: `./config.yaml`. |

## Mapping Table

| `config.yaml` field | Environment variable | Type | Required | Default | Description |
|---|---|---|---|---|---|
| `server.apiUrl` | `AIMETER_API_URL` | `string` | No | `/api` | Backend API base path used by frontend/runtime context. |
| `server.frontendPort` | `AIMETER_FRONTEND_PORT` | `number` | No | `3000` | Frontend dev server port. |
| `server.backendPort` | `AIMETER_BACKEND_PORT` | `number` | No | `3001` | Backend HTTP listening port. |
| `server.protocol` | `AIMETER_SERVER_PROTOCOL` | `http`/`https` | No | `https` in `serverless`, otherwise `http` | Affects security headers (e.g. HSTS only when `https`). |
| `runtime.mockEnabled` | `AIMETER_MOCK_ENABLED` | `boolean` | No | `false` | Enables mock data mode when set to `true`. |
| `runtime.mockAutoGenerate` | `AIMETER_MOCK_AUTO_GENERATE` | `boolean` | No | `true` | Auto-generates mock providers/history on startup in mock mode. |
| `runtime.mode` | `AIMETER_RUNTIME_MODE` | `node`/`serverless` | No | `node` | Runtime mode; `node` starts in-process scheduler, `serverless` disables it. |
| `database.engine` | `AIMETER_DATABASE_ENGINE` | `sqlite`/`d1`/`mysql`/`postgres` | **Yes** | - | Database engine. Must be explicitly configured. |
| `database.connection` | `AIMETER_DATABASE_CONNECTION` | `string` | **Yes** | - | DB connection string/path/binding name. Must be explicitly configured. |
| `database.encryptionKey` | `AIMETER_ENCRYPTION_KEY` | `string` | No | unset | Optional encryption key input; in DB mode, key material is persisted and managed by system settings. |
| `database.cfHyperdriveBinding` | `AIMETER_CF_HYPERDRIVE_BINDING` | `string` | No | `HYPERDRIVE` in Workers MySQL path | Optional Cloudflare Hyperdrive binding name for `database.engine=mysql`. |
| `auth.sessionTtlSeconds` | `AIMETER_AUTH_SESSION_TTL_SECONDS` | `number` | No | `14400` | Auth session TTL in seconds. |
| `auth.cronSecret` | `AIMETER_CRON_SECRET` | `string` | No | unset | Optional cron API secret. If set, should be 32 random chars. |
| `auth.endpointSecret` | `AIMETER_ENDPOINT_SECRET` | `string` | No | unset | Optional endpoint API secret. If set, should be 32 random chars. |
| `auth.rateLimit.windowMs` | `AIMETER_AUTH_RATE_LIMIT_WINDOW_MS` | `number` | No | `60000` | Login rate-limit window size in milliseconds. |
| `auth.rateLimit.maxAttempts` | `AIMETER_AUTH_RATE_LIMIT_MAX_ATTEMPTS` | `number` | No | `5` | Max failed attempts allowed in one window. |
| `auth.rateLimit.blockMs` | `AIMETER_AUTH_RATE_LIMIT_BLOCK_MS` | `number` | No | `300000` | Block duration after limit exceeded (milliseconds). |

## Validation Rules

- `database.engine` must be one of `sqlite`, `d1`, `mysql`, `postgres`.
- `database.connection` must be non-empty.
- If provided, `AIMETER_CRON_SECRET` / `AIMETER_ENDPOINT_SECRET` should be exactly 32 characters.
- If `AIMETER_SERVER_PROTOCOL` is invalid (not `http`/`https`), startup fails with config validation error.

## Reference Templates

- [config.all.yaml](../../config.all.yaml)
- [.env.all](../../.env.all)

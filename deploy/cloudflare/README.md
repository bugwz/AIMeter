# Deploy AIMeter to Cloudflare Workers

This guide covers Cloudflare Workers deployment for AIMeter with:

- `env-only` mode
- `database.engine=d1` mode
- External `mysql` / `postgres` modes

---

## One-Click Deploy

Use this single deploy entry for all modes:

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/bugwz/AIMeter)

Mode selection is controlled by your environment variables and bindings:

| Mode | Storage | Engine | Mock |
|---|---|---|---|
| Env-only | Env | N/A | Off |
| Env-only | Env | N/A | On |
| D1 | Database | `d1` | Off |
| D1 | Database | `d1` | On |
| MySQL | Database | `mysql` | Off |
| MySQL | Database | `mysql` | On |
| PostgreSQL | Database | `postgres` | Off |
| PostgreSQL | Database | `postgres` | On |

---

## Env Value Visibility

Cloudflare Deploy Button treats `.env.example` / `.dev.vars.example` entries as secrets,
so values are hidden in the UI.

This repository uses `.env.all` for local setup and keeps Worker defaults in
`wrangler.jsonc` `vars` so values remain visible during deployment.

If you want a value to stay visible in Cloudflare, set it as a plain text variable
(`vars`) instead of a secret.

---

## Runtime Model

- Recommended runtime mode on Workers: `AIMETER_RUNTIME_MODE=serverless`
- Recommended protocol: `AIMETER_SERVER_PROTOCOL=https`
- Frontend static assets are served by Workers Assets (`dist/`)
- API routes are handled by the Worker (`/api/*`)

---

## Environment Variables by Mode

| Mode | Required envs |
|---|---|
| Env-only | `AIMETER_RUNTIME_MODE=serverless`, `AIMETER_SERVER_PROTOCOL=https`, `AIMETER_DATABASE_ENABLED=false`, `AIMETER_NORMAL_PASSWORD`, `AIMETER_ADMIN_PASSWORD`, `AIMETER_ADMIN_ROUTE_PATH`, `AIMETER_AUTH_SESSION_SECRET`, `AIMETER_PROVIDERS_JSON` |
| D1 | `AIMETER_RUNTIME_MODE=serverless`, `AIMETER_SERVER_PROTOCOL=https`, `AIMETER_DATABASE_ENABLED=true`, `AIMETER_DATABASE_ENGINE=d1`, `AIMETER_DATABASE_CONNECTION=<D1 binding name>` |
| MySQL | `AIMETER_RUNTIME_MODE=serverless`, `AIMETER_SERVER_PROTOCOL=https`, `AIMETER_DATABASE_ENABLED=true`, `AIMETER_DATABASE_ENGINE=mysql`, `AIMETER_DATABASE_CONNECTION=<mysql dsn>` |
| PostgreSQL | `AIMETER_RUNTIME_MODE=serverless`, `AIMETER_SERVER_PROTOCOL=https`, `AIMETER_DATABASE_ENABLED=true`, `AIMETER_DATABASE_ENGINE=postgres`, `AIMETER_DATABASE_CONNECTION=<postgres dsn>` |

Mock-only additional env:

- `AIMETER_MOCK_ENABLED=true`

Optional integration secrets (all modes):

- `AIMETER_CRON_SECRET`
- `AIMETER_ENDPOINT_SECRET`

---

## D1 Binding Semantics

When `AIMETER_DATABASE_ENGINE=d1`:

- `AIMETER_DATABASE_CONNECTION` is interpreted as the D1 binding name directly (for example `DB`)
- No extra D1-specific env/config key is required
- The Worker must have a D1 binding with the same name

Important:

- `d1` is Cloudflare Workers runtime only
- If `engine=d1` is used outside Cloudflare Workers, AIMeter fails at startup with an explicit error

---

## Constraints

| Feature | Status |
|---|---|
| SQLite local file persistence in Workers | Not supported |
| D1 database mode | Supported (Cloudflare Workers runtime only) |
| Env-only mode | Supported |
| MySQL/PostgreSQL mode | Supported (external DB required) |
| In-process scheduler (`runtime=node`) | Not recommended on Workers |
| Serverless refresh flow | Supported via API-triggered refresh / external scheduler |

---

## Verification Checklist

After deployment:

1. Health check returns `status: ok` from `/api/health`
2. SPA deep links load normally (non-API paths resolve to frontend app)
3. Auth flow works for the selected mode (`env-only` or database-backed)
4. Database-backed mode can save provider settings and write/read history
5. For `d1`, confirm the binding name exactly matches `AIMETER_DATABASE_CONNECTION`

---

## Local Development Notes

- Workers local development requires Wrangler
- `engine=d1` local testing should use a local D1 binding setup via Wrangler
- For non-Cloudflare local backend runs, use `sqlite`, `mysql`, or `postgres` instead of `d1`

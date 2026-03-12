# Deploy AIMeter to Cloudflare Workers

This guide covers Cloudflare Workers deployment for AIMeter with:

- `env-only` mode
- `database.engine=d1` mode
- External `mysql` / `postgres` modes

---

## Deployment Steps

1. Click the one-click deploy button, then configure required env variables in Cloudflare.

   [![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/bugwz/AIMeter)

   In Cloudflare's deploy page:

   - Connect/authorize GitHub if prompted. (If you see an error about being unable to fetch repository content, try disabling proxy software and retry.)
   - Confirm project import.
   - Set required env variables by mode (one mode per row; one required key per line with example):
   - `AIMETER_ADMIN_ROUTE_PATH` and `AIMETER_AUTH_SESSION_SECRET` should be 32-character random strings (do not reuse example values).

   | Mode | Required envs (with examples) |
   |---|---|
   | Env-only | `AIMETER_RUNTIME_MODE=serverless`<br>`AIMETER_SERVER_PROTOCOL=https`<br>`AIMETER_DATABASE_ENABLED=false`<br>`AIMETER_NORMAL_PASSWORD=normalpassword123`<br>`AIMETER_ADMIN_PASSWORD=adminpassword123`<br>`AIMETER_ADMIN_ROUTE_PATH=f84c1b56d2a90e37c4f1a8b62d95e013`<br>`AIMETER_AUTH_SESSION_SECRET=7f1c39b8e2d64a01c5f73a9d0b4e8c26`<br>`AIMETER_PROVIDERS_JSON=[{"id":"openai","enabled":true}]` |
   | D1 | `AIMETER_RUNTIME_MODE=serverless`<br>`AIMETER_SERVER_PROTOCOL=https`<br>`AIMETER_DATABASE_ENABLED=true`<br>`AIMETER_DATABASE_ENGINE=d1`<br>`AIMETER_DATABASE_CONNECTION=DB` |
   | MySQL | `AIMETER_RUNTIME_MODE=serverless`<br>`AIMETER_SERVER_PROTOCOL=https`<br>`AIMETER_DATABASE_ENABLED=true`<br>`AIMETER_DATABASE_ENGINE=mysql`<br>`AIMETER_DATABASE_CONNECTION=mysql://user:pass@host:3306/aimeter` |
   | PostgreSQL | `AIMETER_RUNTIME_MODE=serverless`<br>`AIMETER_SERVER_PROTOCOL=https`<br>`AIMETER_DATABASE_ENABLED=true`<br>`AIMETER_DATABASE_ENGINE=postgres`<br>`AIMETER_DATABASE_CONNECTION=postgres://user:pass@host:5432/aimeter` |

2. Wait for the first build/deploy to complete.
3. If you selected `d1`, complete the D1 binding steps in the next section.
4. After D1 binding is saved, open your service URL and complete the Initial Setup form.
   Database schema/data initialization runs only after you submit that setup form.

---

## D1 Post-Deploy Binding Steps

D1 bindings are **not** configured through environment variables alone. For `AIMETER_DATABASE_ENGINE=d1`,
you must manually link the D1 database to the Worker in the Cloudflare dashboard after the first deploy.

### Step 1 — Create D1 database

1. In Cloudflare dashboard, expand **Storage & databases**.
2. Find **D1 SQL database**, then click **Create Database**.
3. Enter database name: `aimeter-db`.
4. Click **Create**.

### Step 2 — Bind the D1 database to your Worker

1. Go back and expand **Compute**.
2. Open **Workers & Pages**.
3. Open your deployed Worker.
4. Click **Bindings**.
5. Click **Add binding**.
6. Select **D1 database**.
7. Fill in the two fields:

   | Field | Value |
   |---|---|
   | **Variable name** | `DB` (must match `AIMETER_DATABASE_CONNECTION`) |
   | **D1 database** | Select `aimeter-db` (the database created in Step 1) |

8. Submit/Save binding.

After saving the binding, open your deployed service URL, fill all required fields on the
Initial Setup page, and click submit. At that moment the system initializes required tables/data
(`providers`, `usage_records`, `settings`, `audit_logs`).

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

## Local Development Notes

- Workers local development requires Wrangler
- `engine=d1` local testing should use a local D1 binding setup via Wrangler
- For non-Cloudflare local backend runs, use `sqlite`, `mysql`, or `postgres` instead of `d1`

---

## Required Env Variables (Reference)

Only required env variables are listed below (one mode per row; one required key per line with example).

| Mode | Required envs |
|---|---|
| Env-only | `AIMETER_RUNTIME_MODE=serverless`<br>`AIMETER_SERVER_PROTOCOL=https`<br>`AIMETER_DATABASE_ENABLED=false`<br>`AIMETER_NORMAL_PASSWORD=normalpassword123`<br>`AIMETER_ADMIN_PASSWORD=adminpassword123`<br>`AIMETER_ADMIN_ROUTE_PATH=f84c1b56d2a90e37c4f1a8b62d95e013`<br>`AIMETER_AUTH_SESSION_SECRET=7f1c39b8e2d64a01c5f73a9d0b4e8c26`<br>`AIMETER_PROVIDERS_JSON=[{"id":"openai","enabled":true}]` |
| D1 | `AIMETER_RUNTIME_MODE=serverless`<br>`AIMETER_SERVER_PROTOCOL=https`<br>`AIMETER_DATABASE_ENABLED=true`<br>`AIMETER_DATABASE_ENGINE=d1`<br>`AIMETER_DATABASE_CONNECTION=DB` |
| MySQL | `AIMETER_RUNTIME_MODE=serverless`<br>`AIMETER_SERVER_PROTOCOL=https`<br>`AIMETER_DATABASE_ENABLED=true`<br>`AIMETER_DATABASE_ENGINE=mysql`<br>`AIMETER_DATABASE_CONNECTION=mysql://user:pass@host:3306/aimeter` |
| PostgreSQL | `AIMETER_RUNTIME_MODE=serverless`<br>`AIMETER_SERVER_PROTOCOL=https`<br>`AIMETER_DATABASE_ENABLED=true`<br>`AIMETER_DATABASE_ENGINE=postgres`<br>`AIMETER_DATABASE_CONNECTION=postgres://user:pass@host:5432/aimeter` |

### D1 Variable Semantics

When `AIMETER_DATABASE_ENGINE=d1`:

- `AIMETER_DATABASE_CONNECTION` is interpreted as the D1 binding name directly (for example `DB`)
- No extra D1-specific env/config key is required
- The Worker must have a D1 binding with the same name

Important:

- `d1` is Cloudflare Workers runtime only
- If `engine=d1` is used outside Cloudflare Workers, AIMeter fails at startup with an explicit error

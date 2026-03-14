# Deploy AIMeter to Cloudflare Workers

This guide covers Cloudflare Workers deployment for AIMeter with:

- `database.engine=d1` mode
- External `mysql` / `postgres` modes (MySQL recommends Hyperdrive binding)

---

## Deployment Steps (4 Steps)

### Step 1 — Deploy service

1. Click one-click deploy and import the repo:

   [![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/bugwz/AIMeter)

2. On the deploy page, connect GitHub and finish the first deploy.
3. Set runtime env vars by mode:

   | Mode | Required envs (with examples) |
   |---|---|
   | D1 | `AIMETER_RUNTIME_MODE=serverless`<br>`AIMETER_SERVER_PROTOCOL=https`<br>`AIMETER_DATABASE_ENGINE=d1`<br>`AIMETER_DATABASE_CONNECTION=DB` |
   | MySQL | `AIMETER_RUNTIME_MODE=serverless`<br>`AIMETER_SERVER_PROTOCOL=https`<br>`AIMETER_DATABASE_ENGINE=mysql`<br>`AIMETER_DATABASE_CONNECTION=mysql://user:pass@host:3306/aimeter?ssl={"rejectUnauthorized":true}`<br>`AIMETER_CF_HYPERDRIVE_BINDING=HYPERDRIVE` (optional, default `HYPERDRIVE`) |
   | PostgreSQL | `AIMETER_RUNTIME_MODE=serverless`<br>`AIMETER_SERVER_PROTOCOL=https`<br>`AIMETER_DATABASE_ENGINE=postgres`<br>`AIMETER_DATABASE_CONNECTION=postgres://user:pass@host:5432/aimeter?sslmode=require` |

### Step 2 — Create data services (optional, based on your database mode)

1. If using `d1`, create a D1 database (optional for non-`d1` modes):
   - Go to **Storage & databases** -> **D1 SQL database** -> **Create Database**
   - Recommended name: `aimeter-db`
2. If using MySQL on Workers, create Hyperdrive (optional but recommended):
   - Go to **Storage & databases** -> **Hyperdrive** -> **Create**
   - Choose **Connect to a public database**
   - Set **Configuration name** to `hyperdriver-aimeter`
   - Fill in the upstream MySQL connection details
   - Set Hyperdrive cache to **Disabled** during initial setup to avoid initialization anomalies
   - After system initialization is complete, you can enable cache based on workload needs

### Step 3 — Bind services to Worker (optional, only when used)

1. Open **Compute** -> **Workers & Pages** -> your Worker -> **Bindings** -> **Add binding**.
2. Bind D1 only when `AIMETER_DATABASE_ENGINE=d1` and you created a D1 service in Step 2:

   | Field | Value |
   |---|---|
   | **Type** | D1 database |
   | **Variable name** | `DB` (must match `AIMETER_DATABASE_CONNECTION`) |
   | **Database** | Select `aimeter-db` |

3. Bind Hyperdrive only when using MySQL on Workers and you created a Hyperdrive service in Step 2:

   | Field | Value |
   |---|---|
   | **Type** | Hyperdrive |
   | **Variable name** | `HYPERDRIVE` (or your custom name, must match `AIMETER_CF_HYPERDRIVE_BINDING`) |
   | **Target** | Select the Hyperdrive service created in Step 2 |

4. If you use a custom Hyperdrive variable name, set `AIMETER_CF_HYPERDRIVE_BINDING=<your_name>`.

### Step 4 — Initialize system

1. Open the deployed service URL.
2. Complete the Initial Setup form and submit.
3. On successful submit, AIMeter initializes tables/data:
   `providers`, `usage_records`, `settings`, `audit_logs`.
4. If you use MySQL on Workers, AIMeter enables `mysql2 disableEval` compatibility automatically.

---

## Constraints

| Feature | Status |
|---|---|
| SQLite local file persistence in Workers | Not supported |
| D1 database mode | Supported (Cloudflare Workers runtime only) |
| MySQL/PostgreSQL mode | Supported (external DB required; MySQL on Workers should use Hyperdrive) |
| In-process scheduler (`runtime=node`) | Not recommended on Workers |
| Serverless refresh flow | Supported via API-triggered refresh or CF Cron Triggers |
| Cron Triggers (scheduled refresh) | Supported via `scheduled` handler in `worker.ts` |

---

## Cron Triggers (Scheduled Refresh)

AIMeter's `worker.ts` includes a `scheduled` handler that fires on Cloudflare Cron Triggers.
It calls `/api/system/jobs/refresh` internally using the stored `cron_secret`.

`wrangler.jsonc` ships with a default cron schedule:

```jsonc
"triggers": {
  "crons": ["*/5 * * * *"]
}
```

This triggers a full provider refresh every 5 minutes. Adjust the expression as needed.

To enable Cron Triggers on an existing Worker:
1. Go to **Compute** → **Workers & Pages** → your Worker → **Triggers** → **Cron Triggers** → **Add Cron Trigger**.
2. Enter a cron expression (e.g. `*/5 * * * *`).
3. Ensure `AIMETER_CRON_SECRET` is set so the handler can authenticate against the refresh endpoint.

---

## Fetch Timeout

All provider adapters enforce a **12-second per-request timeout** via `AbortSignal.timeout()`.
When an upstream API hangs, the fetch aborts at 12s and the refresh endpoint returns a stale
fallback response instead of waiting for the Worker's 25s CPU limit.

This applies to all deployment targets (CF Workers, Vercel, Node.js container).

---

## MySQL + Hyperdrive (Recommended on Workers)

When `AIMETER_DATABASE_ENGINE=mysql` runs in Cloudflare Workers, AIMeter enables
`mysql2`'s `disableEval` compatibility mode automatically. To improve reliability and
connection reuse, bind Hyperdrive and let AIMeter read the connection from that binding.

1. In Cloudflare dashboard, create a Hyperdrive config pointing to your MySQL database.
   - During first-time initialization, set Hyperdrive cache to **Disabled**.
   - After initialization finishes and system behavior is stable, enable cache as needed.
2. In your Worker, add a Hyperdrive binding (default variable name: `HYPERDRIVE`).
3. Set:
   - `AIMETER_DATABASE_ENGINE=mysql`
   - `AIMETER_DATABASE_CONNECTION=<your mysql dsn>` (fallback and non-Workers use)
   - Optional `AIMETER_CF_HYPERDRIVE_BINDING=HYPERDRIVE` if your binding name is custom.

If the Hyperdrive binding is absent, AIMeter falls back to `AIMETER_DATABASE_CONNECTION`
in Workers while keeping `disableEval` enabled.

---

## Local Development Notes

- Workers local development requires Wrangler
- For non-Cloudflare local backend runs, use `sqlite`, `mysql`, or `postgres` instead of `d1`

### Local D1 testing with `wrangler dev`

`wrangler.jsonc` does not include a `d1_databases` block (to avoid forcing D1 on all deployment paths). For local D1 testing, add it temporarily before running `wrangler dev`:

```jsonc
// add to wrangler.jsonc for local dev only, do not commit with a real database_id
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "aimeter",
    "database_id": "00000000-0000-0000-0000-000000000000"
  }
]
```

Wrangler ignores `database_id` in local mode and creates a local SQLite file automatically. Any placeholder UUID works.

```bash
wrangler dev
# first request triggers schema init (single D1 batch round-trip instead of 7 serial calls)

npx wrangler d1 execute aimeter --local \
  --command "SELECT name FROM sqlite_master WHERE type='table'"
# should list: providers, usage_records, settings, audit_logs
```

### Observability

`wrangler.jsonc` has `observability.enabled = true` (logs enabled, traces disabled).
After deploying, visit **Cloudflare Dashboard → Workers → your Worker → Logs** to view invocation logs.
Traces can be enabled separately by setting `traces.enabled = true` when needed.

---

## Required Env Variables (Reference)

| Mode | Required envs |
|---|---|
| D1 | `AIMETER_RUNTIME_MODE=serverless`<br>`AIMETER_SERVER_PROTOCOL=https`<br>`AIMETER_DATABASE_ENGINE=d1`<br>`AIMETER_DATABASE_CONNECTION=DB` |
| MySQL | `AIMETER_RUNTIME_MODE=serverless`<br>`AIMETER_SERVER_PROTOCOL=https`<br>`AIMETER_DATABASE_ENGINE=mysql`<br>`AIMETER_DATABASE_CONNECTION=mysql://user:pass@host:3306/aimeter?ssl={"rejectUnauthorized":true}`<br>`AIMETER_CF_HYPERDRIVE_BINDING=HYPERDRIVE` (optional) |
| PostgreSQL | `AIMETER_RUNTIME_MODE=serverless`<br>`AIMETER_SERVER_PROTOCOL=https`<br>`AIMETER_DATABASE_ENGINE=postgres`<br>`AIMETER_DATABASE_CONNECTION=postgres://user:pass@host:5432/aimeter?sslmode=require` |

### Database Connection Notes (MySQL/PostgreSQL)

- The target database must be created in advance.
- AIMeter initializes tables only (`providers`, `usage_records`, `settings`, `audit_logs`).
- AIMeter does not create the database itself.
- MySQL self-signed cert: `?ssl={"rejectUnauthorized":false}`
- PostgreSQL self-signed cert: `?sslmode=no-verify`

### D1 Variable Semantics

When `AIMETER_DATABASE_ENGINE=d1`:

- `AIMETER_DATABASE_CONNECTION` is interpreted as the D1 binding name directly (for example `DB`)
- No extra D1-specific env/config key is required
- The Worker must have a D1 binding with the same name

Important:

- `d1` is Cloudflare Workers runtime only
- If `engine=d1` is used outside Cloudflare Workers, AIMeter fails at startup with an explicit error

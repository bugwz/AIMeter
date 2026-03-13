# Deploy AIMeter to Vercel

## One-Click Deploy Buttons

| Mode | Mock | Deploy |
|---|---|---|
| MySQL | Off | [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbugwz%2FAIMeter&env=AIMETER_RUNTIME_MODE%2CAIMETER_SERVER_PROTOCOL%2CAIMETER_DATABASE_ENGINE%2CAIMETER_DATABASE_CONNECTION&envDefaults=%7B%22AIMETER_RUNTIME_MODE%22%3A%22serverless%22%2C%22AIMETER_SERVER_PROTOCOL%22%3A%22https%22%2C%22AIMETER_DATABASE_ENGINE%22%3A%22mysql%22%2C%22AIMETER_DATABASE_CONNECTION%22%3A%22mysql%3A%2F%2FUSER%3APASSWORD%40HOST%3A3306%2FDATABASE%22%7D&envDescription=AIMeter+Vercel+%2B+MySQL&envLink=https%3A%2F%2Fgithub.com%2Fbugwz%2FAIMeter%2Fblob%2Fmain%2Fdeploy%2Fvercel%2FREADME.md) |
| PostgreSQL | Off | [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbugwz%2FAIMeter&env=AIMETER_RUNTIME_MODE%2CAIMETER_SERVER_PROTOCOL%2CAIMETER_DATABASE_ENGINE%2CAIMETER_DATABASE_CONNECTION&envDefaults=%7B%22AIMETER_RUNTIME_MODE%22%3A%22serverless%22%2C%22AIMETER_SERVER_PROTOCOL%22%3A%22https%22%2C%22AIMETER_DATABASE_ENGINE%22%3A%22postgres%22%2C%22AIMETER_DATABASE_CONNECTION%22%3A%22postgresql%3A%2F%2FUSER%3APASSWORD%40HOST%3A5432%2FDATABASE%3Fsslmode%3Drequire%22%7D&envDescription=AIMeter+Vercel+%2B+PostgreSQL&envLink=https%3A%2F%2Fgithub.com%2Fbugwz%2FAIMeter%2Fblob%2Fmain%2Fdeploy%2Fvercel%2FREADME.md) |
| MySQL | On | [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbugwz%2FAIMeter&env=AIMETER_MOCK_ENABLED%2CAIMETER_RUNTIME_MODE%2CAIMETER_SERVER_PROTOCOL%2CAIMETER_DATABASE_ENGINE%2CAIMETER_DATABASE_CONNECTION&envDefaults=%7B%22AIMETER_MOCK_ENABLED%22%3A%22true%22%2C%22AIMETER_RUNTIME_MODE%22%3A%22serverless%22%2C%22AIMETER_SERVER_PROTOCOL%22%3A%22https%22%2C%22AIMETER_DATABASE_ENGINE%22%3A%22mysql%22%2C%22AIMETER_DATABASE_CONNECTION%22%3A%22mysql%3A%2F%2FUSER%3APASSWORD%40HOST%3A3306%2FDATABASE%22%7D&envDescription=AIMeter+Vercel+%2B+MySQL+mock+mode&envLink=https%3A%2F%2Fgithub.com%2Fbugwz%2FAIMeter%2Fblob%2Fmain%2Fdeploy%2Fvercel%2FREADME.md) |
| PostgreSQL | On | [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbugwz%2FAIMeter&env=AIMETER_MOCK_ENABLED%2CAIMETER_RUNTIME_MODE%2CAIMETER_SERVER_PROTOCOL%2CAIMETER_DATABASE_ENGINE%2CAIMETER_DATABASE_CONNECTION&envDefaults=%7B%22AIMETER_MOCK_ENABLED%22%3A%22true%22%2C%22AIMETER_RUNTIME_MODE%22%3A%22serverless%22%2C%22AIMETER_SERVER_PROTOCOL%22%3A%22https%22%2C%22AIMETER_DATABASE_ENGINE%22%3A%22postgres%22%2C%22AIMETER_DATABASE_CONNECTION%22%3A%22postgresql%3A%2F%2FUSER%3APASSWORD%40HOST%3A5432%2FDATABASE%3Fsslmode%3Drequire%22%7D&envDescription=AIMeter+Vercel+%2B+PostgreSQL+mock+mode&envLink=https%3A%2F%2Fgithub.com%2Fbugwz%2FAIMeter%2Fblob%2Fmain%2Fdeploy%2Fvercel%2FREADME.md) |

---

## Deployment Scenarios (Config + Defaults)

Set env variables by scenario (one scenario per row):

| Scenario | Required envs (with defaults/examples) |
|---|---|
| MySQL (Mock Off) | `AIMETER_RUNTIME_MODE=serverless`<br>`AIMETER_SERVER_PROTOCOL=https`<br>`AIMETER_DATABASE_ENGINE=mysql`<br>`AIMETER_DATABASE_CONNECTION=mysql://USER:PASSWORD@HOST:3306/DATABASE` |
| PostgreSQL (Mock Off) | `AIMETER_RUNTIME_MODE=serverless`<br>`AIMETER_SERVER_PROTOCOL=https`<br>`AIMETER_DATABASE_ENGINE=postgres`<br>`AIMETER_DATABASE_CONNECTION=postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require` |
| MySQL (Mock On) | `AIMETER_MOCK_ENABLED=true`<br>`AIMETER_RUNTIME_MODE=serverless`<br>`AIMETER_SERVER_PROTOCOL=https`<br>`AIMETER_DATABASE_ENGINE=mysql`<br>`AIMETER_DATABASE_CONNECTION=mysql://USER:PASSWORD@HOST:3306/DATABASE` |
| PostgreSQL (Mock On) | `AIMETER_MOCK_ENABLED=true`<br>`AIMETER_RUNTIME_MODE=serverless`<br>`AIMETER_SERVER_PROTOCOL=https`<br>`AIMETER_DATABASE_ENGINE=postgres`<br>`AIMETER_DATABASE_CONNECTION=postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require` |

---

## Environment Variables (Required)

Database configuration is mandatory.

| Mode | Required envs (with examples) |
|---|---|
| MySQL | `AIMETER_RUNTIME_MODE=serverless`<br>`AIMETER_SERVER_PROTOCOL=https`<br>`AIMETER_DATABASE_ENGINE=mysql`<br>`AIMETER_DATABASE_CONNECTION=mysql://USER:PASSWORD@HOST:3306/DATABASE` |
| PostgreSQL | `AIMETER_RUNTIME_MODE=serverless`<br>`AIMETER_SERVER_PROTOCOL=https`<br>`AIMETER_DATABASE_ENGINE=postgres`<br>`AIMETER_DATABASE_CONNECTION=postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require` |

Mock-only additional env:
- `AIMETER_MOCK_ENABLED=true`

Optional integration secrets: `AIMETER_CRON_SECRET`, `AIMETER_ENDPOINT_SECRET`
- In database mode, these values are used only for first-time initialization (then managed in DB).

Secrets can be generated with:

```bash
openssl rand -hex 16
```

---

## Database Setup

Important:
- For MySQL/PostgreSQL, the target database must be created before deployment.
- AIMeter initializes required tables only (`providers`, `usage_records`, `settings`, `audit_logs`).
- AIMeter does not create the database itself.

### MySQL DSN

```text
mysql://USER:PASSWORD@HOST:3306/DATABASE
```

If SSL is required, use `ssl` in the DSN query:

```text
mysql://USER:PASSWORD@HOST:3306/DATABASE?ssl={"rejectUnauthorized":true}
```

If your MySQL uses a self-signed certificate, use:

```text
mysql://USER:PASSWORD@HOST:3306/DATABASE?ssl={"rejectUnauthorized":false}
```

### PostgreSQL DSN

```text
postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
```

If your PostgreSQL uses a self-signed certificate, use:

```text
postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=no-verify
```

## Cron / Background Jobs Setup

Vercel Cron cannot send custom headers, but AIMeter's job endpoint requires `x-aimeter-cron-secret`. Use an external service instead:

Recommended schedule: run every 5 minutes.
Reason: provider refresh uses a minimum granularity of 5 minutes. Different providers can have
different refresh intervals, and each API call every 5 minutes will evaluate all providers'
refresh windows.

Example:
- Provider A refresh interval = 5 minutes
- Provider B refresh interval = 30 minutes
- In 30 minutes, the endpoint runs 6 times
- A can refresh on every run
- B may refresh only on the 6th run when its 30-minute window is reached

### Option A: cron-job.org (free)

1. Create an account at [cron-job.org](https://cron-job.org)
2. Create a new cron job:
   - **URL**: `https://your-app.vercel.app/api/system/jobs/refresh`
   - **Method**: `POST`
   - **Header**: `x-aimeter-cron-secret: <your AIMETER_CRON_SECRET value>`
   - **Schedule**: every 5 minutes

### Option B: GitHub Actions

Add `.github/workflows/cron.yml` to your repository:

```yaml
name: AIMeter Cron
on:
  schedule:
    - cron: '*/5 * * * *'  # every 5 minutes
  workflow_dispatch:

jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger usage refresh
        run: |
          curl -X POST https://your-app.vercel.app/api/system/jobs/refresh \
            -H "x-aimeter-cron-secret: ${{ secrets.AIMETER_CRON_SECRET }}"
```

Add `AIMETER_CRON_SECRET` as a GitHub Actions secret in your repository settings.

---

## Constraints

| Feature | Status |
|---|---|
| SQLite persistent storage | Not supported on Vercel serverless filesystem |
| In-process scheduler | Disabled (`AIMETER_RUNTIME_MODE=serverless`) |
| In-memory rate limiting | Resets on cold start |
| Static files | Served from Vercel CDN (`dist/`) |
| `window.__AIMETER_ENTRY__` injection | Not used — frontend falls back to `GET /api/entry-context` |

---

## Verification

After deploying:

1. **Health check**: `GET https://your-app.vercel.app/api/health` → `{"status":"ok"}`
2. **SPA routing**: Navigate to any deep URL — page should load correctly
3. **Admin path**: complete bootstrap first, then use the generated/stored admin path
4. **Local test (Postgres)**: `AIMETER_DATABASE_ENGINE=postgres AIMETER_DATABASE_CONNECTION=<dsn> vercel dev`
5. **Local test (MySQL)**: `AIMETER_DATABASE_ENGINE=mysql AIMETER_DATABASE_CONNECTION=<dsn> vercel dev`

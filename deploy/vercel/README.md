# Deploy AIMeter to Vercel

## One-Click Deploy Buttons

| Mode | Storage | Mock | Deploy |
|---|---|---|---|
| No DB (Env-only) | `AIMETER_DATABASE_ENABLED=false` | Off | [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbugwz%2FAIMeter&env=AIMETER_SERVER_PROTOCOL%2CAIMETER_RUNTIME_MODE%2CAIMETER_MOCK_ENABLED%2CAIMETER_AUTH_SESSION_SECRET%2CAIMETER_DATABASE_ENABLED%2CAIMETER_NORMAL_PASSWORD%2CAIMETER_ADMIN_PASSWORD%2CAIMETER_ADMIN_ROUTE_PATH%2CAIMETER_PROVIDER_IDS%2CAIMETER_PROVIDER__PRIMARY__TYPE%2CAIMETER_PROVIDER__PRIMARY__AUTH_TYPE%2CAIMETER_PROVIDER__PRIMARY__CREDENTIAL%2CAIMETER_PROVIDER__PRIMARY__REFRESH_INTERVAL&envDefaults=%7B%22AIMETER_SERVER_PROTOCOL%22%3A%22https%22%2C%22AIMETER_RUNTIME_MODE%22%3A%22serverless%22%2C%22AIMETER_PROVIDER_IDS%22%3A%22primary%22%2C%22AIMETER_PROVIDER__PRIMARY__TYPE%22%3A%22cursor%22%2C%22AIMETER_PROVIDER__PRIMARY__AUTH_TYPE%22%3A%22cookie%22%2C%22AIMETER_PROVIDER__PRIMARY__REFRESH_INTERVAL%22%3A%225%22%2C%22AIMETER_MOCK_ENABLED%22%3A%22false%22%2C%22AIMETER_DATABASE_ENABLED%22%3A%22false%22%7D&envDescription=AIMeter+Vercel+no-database+mode+%28all+env+vars%29&envLink=https%3A%2F%2Fgithub.com%2Fbugwz%2FAIMeter%2Fblob%2Fmain%2Fdeploy%2Fvercel%2FREADME.md) |
| MySQL | `AIMETER_DATABASE_ENGINE=mysql` | Off | [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbugwz%2FAIMeter&env=AIMETER_SERVER_PROTOCOL%2CAIMETER_RUNTIME_MODE%2CAIMETER_MOCK_ENABLED%2CAIMETER_DATABASE_ENABLED%2CAIMETER_DATABASE_ENGINE%2CAIMETER_DATABASE_CONNECTION&envDefaults=%7B%22AIMETER_SERVER_PROTOCOL%22%3A%22https%22%2C%22AIMETER_RUNTIME_MODE%22%3A%22serverless%22%2C%22AIMETER_MOCK_ENABLED%22%3A%22false%22%2C%22AIMETER_DATABASE_ENABLED%22%3A%22true%22%2C%22AIMETER_DATABASE_ENGINE%22%3A%22mysql%22%7D&envDescription=AIMeter+Vercel+%2B+MySQL&envLink=https%3A%2F%2Fgithub.com%2Fbugwz%2FAIMeter%2Fblob%2Fmain%2Fdeploy%2Fvercel%2FREADME.md) |
| PostgreSQL | `AIMETER_DATABASE_ENGINE=postgres` | Off | [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbugwz%2FAIMeter&env=AIMETER_SERVER_PROTOCOL%2CAIMETER_RUNTIME_MODE%2CAIMETER_MOCK_ENABLED%2CAIMETER_DATABASE_ENABLED%2CAIMETER_DATABASE_ENGINE%2CAIMETER_DATABASE_CONNECTION&envDefaults=%7B%22AIMETER_SERVER_PROTOCOL%22%3A%22https%22%2C%22AIMETER_RUNTIME_MODE%22%3A%22serverless%22%2C%22AIMETER_MOCK_ENABLED%22%3A%22false%22%2C%22AIMETER_DATABASE_ENABLED%22%3A%22true%22%2C%22AIMETER_DATABASE_ENGINE%22%3A%22postgres%22%7D&envDescription=AIMeter+Vercel+%2B+PostgreSQL&envLink=https%3A%2F%2Fgithub.com%2Fbugwz%2FAIMeter%2Fblob%2Fmain%2Fdeploy%2Fvercel%2FREADME.md) |
| No DB (Env-only) | `AIMETER_DATABASE_ENABLED=false` | On | [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbugwz%2FAIMeter&env=AIMETER_SERVER_PROTOCOL%2CAIMETER_RUNTIME_MODE%2CAIMETER_MOCK_ENABLED%2CAIMETER_AUTH_SESSION_SECRET%2CAIMETER_DATABASE_ENABLED%2CAIMETER_NORMAL_PASSWORD%2CAIMETER_ADMIN_PASSWORD%2CAIMETER_ADMIN_ROUTE_PATH%2CAIMETER_PROVIDER_IDS%2CAIMETER_PROVIDER__PRIMARY__TYPE%2CAIMETER_PROVIDER__PRIMARY__AUTH_TYPE%2CAIMETER_PROVIDER__PRIMARY__CREDENTIAL%2CAIMETER_PROVIDER__PRIMARY__REFRESH_INTERVAL&envDefaults=%7B%22AIMETER_SERVER_PROTOCOL%22%3A%22https%22%2C%22AIMETER_RUNTIME_MODE%22%3A%22serverless%22%2C%22AIMETER_PROVIDER_IDS%22%3A%22primary%22%2C%22AIMETER_PROVIDER__PRIMARY__TYPE%22%3A%22cursor%22%2C%22AIMETER_PROVIDER__PRIMARY__AUTH_TYPE%22%3A%22cookie%22%2C%22AIMETER_PROVIDER__PRIMARY__REFRESH_INTERVAL%22%3A%225%22%2C%22AIMETER_MOCK_ENABLED%22%3A%22true%22%2C%22AIMETER_DATABASE_ENABLED%22%3A%22false%22%7D&envDescription=AIMeter+Vercel+no-database+mock+mode&envLink=https%3A%2F%2Fgithub.com%2Fbugwz%2FAIMeter%2Fblob%2Fmain%2Fdeploy%2Fvercel%2FREADME.md) |
| MySQL | `AIMETER_DATABASE_ENGINE=mysql` | On | [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbugwz%2FAIMeter&env=AIMETER_SERVER_PROTOCOL%2CAIMETER_RUNTIME_MODE%2CAIMETER_MOCK_ENABLED%2CAIMETER_DATABASE_ENABLED%2CAIMETER_DATABASE_ENGINE%2CAIMETER_DATABASE_CONNECTION&envDefaults=%7B%22AIMETER_SERVER_PROTOCOL%22%3A%22https%22%2C%22AIMETER_RUNTIME_MODE%22%3A%22serverless%22%2C%22AIMETER_MOCK_ENABLED%22%3A%22true%22%2C%22AIMETER_DATABASE_ENABLED%22%3A%22true%22%2C%22AIMETER_DATABASE_ENGINE%22%3A%22mysql%22%7D&envDescription=AIMeter+Vercel+%2B+MySQL+mock+mode&envLink=https%3A%2F%2Fgithub.com%2Fbugwz%2FAIMeter%2Fblob%2Fmain%2Fdeploy%2Fvercel%2FREADME.md) |
| PostgreSQL | `AIMETER_DATABASE_ENGINE=postgres` | On | [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbugwz%2FAIMeter&env=AIMETER_SERVER_PROTOCOL%2CAIMETER_RUNTIME_MODE%2CAIMETER_MOCK_ENABLED%2CAIMETER_DATABASE_ENABLED%2CAIMETER_DATABASE_ENGINE%2CAIMETER_DATABASE_CONNECTION&envDefaults=%7B%22AIMETER_SERVER_PROTOCOL%22%3A%22https%22%2C%22AIMETER_RUNTIME_MODE%22%3A%22serverless%22%2C%22AIMETER_MOCK_ENABLED%22%3A%22true%22%2C%22AIMETER_DATABASE_ENABLED%22%3A%22true%22%2C%22AIMETER_DATABASE_ENGINE%22%3A%22postgres%22%7D&envDescription=AIMeter+Vercel+%2B+PostgreSQL+mock+mode&envLink=https%3A%2F%2Fgithub.com%2Fbugwz%2FAIMeter%2Fblob%2Fmain%2Fdeploy%2Fvercel%2FREADME.md) |

---

## Environment Variables (By Mode)

| Mode | Required envs |
|---|---|
| No DB (Env-only) | `AIMETER_SERVER_PROTOCOL`, `AIMETER_RUNTIME_MODE`, `AIMETER_MOCK_ENABLED`, `AIMETER_DATABASE_ENABLED=false`, `AIMETER_AUTH_SESSION_SECRET`, `AIMETER_ADMIN_ROUTE_PATH`, `AIMETER_NORMAL_PASSWORD`, `AIMETER_ADMIN_PASSWORD`, `AIMETER_PROVIDER_IDS`, `AIMETER_PROVIDER__PRIMARY__TYPE`, `AIMETER_PROVIDER__PRIMARY__AUTH_TYPE`, `AIMETER_PROVIDER__PRIMARY__CREDENTIAL` |
| MySQL | `AIMETER_SERVER_PROTOCOL`, `AIMETER_RUNTIME_MODE`, `AIMETER_MOCK_ENABLED`, `AIMETER_DATABASE_ENABLED=true`, `AIMETER_DATABASE_ENGINE=mysql`, `AIMETER_DATABASE_CONNECTION` |
| PostgreSQL | `AIMETER_SERVER_PROTOCOL`, `AIMETER_RUNTIME_MODE`, `AIMETER_MOCK_ENABLED`, `AIMETER_DATABASE_ENABLED=true`, `AIMETER_DATABASE_ENGINE=postgres`, `AIMETER_DATABASE_CONNECTION` |

Optional integration secrets (all modes): `AIMETER_CRON_SECRET`, `AIMETER_ENDPOINT_SECRET`.
- In env-only mode, the related endpoint is unavailable when the secret is unset.
- In database mode, these values are used only for first-time initialization (then managed in DB).
- In database mode, `AIMETER_ENCRYPTION_KEY`, `AIMETER_AUTH_SESSION_SECRET`, and `AIMETER_ADMIN_ROUTE_PATH` from env/config are ignored.

Secrets can be generated with:

```bash
openssl rand -hex 16
```

For cron/endpoint secret (same length):

```bash
openssl rand -hex 16
```

---

## Database Setup

### MySQL DSN

```text
mysql://USER:PASSWORD@HOST:3306/DATABASE
```

### PostgreSQL DSN

```text
postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
```

## Cron / Background Jobs Setup

Vercel Cron cannot send custom headers, but AIMeter's job endpoint requires `x-aimeter-cron-secret`. Use an external service instead:

### Option A: cron-job.org (free)

1. Create an account at [cron-job.org](https://cron-job.org)
2. Create a new cron job:
   - **URL**: `https://your-app.vercel.app/api/system/jobs/refresh`
   - **Method**: `POST`
   - **Header**: `x-aimeter-cron-secret: <your AIMETER_CRON_SECRET value>`
   - **Schedule**: every hour (or your preferred interval)

### Option B: GitHub Actions

Add `.github/workflows/cron.yml` to your repository:

```yaml
name: AIMeter Cron
on:
  schedule:
    - cron: '0 * * * *'  # every hour
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
| Env-only mode (`AIMETER_DATABASE_ENABLED=false`) | Supported (history disabled) |
| In-process scheduler | Disabled (`AIMETER_RUNTIME_MODE=serverless`) |
| In-memory rate limiting | Resets on cold start |
| Static files | Served from Vercel CDN (`dist/`) |
| `window.__AIMETER_ENTRY__` injection | Not used — frontend falls back to `GET /api/entry-context` |

---

## Verification

After deploying:

1. **Health check**: `GET https://your-app.vercel.app/api/health` → `{"status":"ok"}`
2. **SPA routing**: Navigate to any deep URL — page should load correctly
3. **Admin path**:
   - Env-only mode: visit `https://your-app.vercel.app/<AIMETER_ADMIN_ROUTE_PATH>`
   - Database mode: complete bootstrap first, then use the generated/stored admin path
4. **Local test (Postgres)**: `AIMETER_DATABASE_ENGINE=postgres AIMETER_DATABASE_CONNECTION=<dsn> vercel dev`
5. **Local test (MySQL)**: `AIMETER_DATABASE_ENGINE=mysql AIMETER_DATABASE_CONNECTION=<dsn> vercel dev`
6. **Local test (Env-only mock)**: `AIMETER_DATABASE_ENABLED=false AIMETER_MOCK_ENABLED=true vercel dev`

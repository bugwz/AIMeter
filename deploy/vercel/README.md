# Deploy AIMeter to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_ORG/AIMeter&env=NODE_ENV,AIMETER_RUNTIME_MODE,AIMETER_TRUST_PROXY,AIMETER_SECURE_COOKIE,AIMETER_DATABASE_ENGINE,AIMETER_DATABASE_CONNECTION,AIMETER_ENCRYPTION_KEY,AIMETER_AUTH_SESSION_SECRET,AIMETER_ADMIN_ROUTE_SECRET,AIMETER_CRON_SECRET&envDescription=AIMeter%20Vercel%20configuration&envLink=https://github.com/YOUR_ORG/AIMeter/blob/main/deploy/vercel/README.md)

> **Before using the button** replace `YOUR_ORG` in the URL above with your GitHub username or organization name.

---

## Environment Variables

Set these in the Vercel project settings (or via the deploy button prompt):

| Variable | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | |
| `AIMETER_RUNTIME_MODE` | `serverless` | Disables in-process scheduler |
| `AIMETER_TRUST_PROXY` | `true` | Required behind Vercel's proxy |
| `AIMETER_SECURE_COOKIE` | `true` | HTTPS-only session cookies |
| `AIMETER_DATABASE_ENGINE` | `postgres` | SQLite is not supported on Vercel |
| `AIMETER_DATABASE_CONNECTION` | `postgresql://...` | See Database Setup below |
| `AIMETER_ENCRYPTION_KEY` | *(generate)* | `openssl rand -hex 32` |
| `AIMETER_AUTH_SESSION_SECRET` | *(generate)* | `openssl rand -hex 32` |
| `AIMETER_ADMIN_ROUTE_SECRET` | *(generate)* | `openssl rand -hex 32` |
| `AIMETER_CRON_SECRET` | *(generate)* | `openssl rand -hex 24` |

---

## Database Setup

Vercel functions require an external PostgreSQL database. Recommended providers:

- **[Neon](https://neon.tech)** — serverless Postgres, generous free tier
- **[Supabase](https://supabase.com)** — Postgres with additional tooling

Connection string format:
```
postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
```

Set this as `AIMETER_DATABASE_CONNECTION`.

---

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
| SQLite database | Not supported — use PostgreSQL |
| In-process scheduler | Disabled (`AIMETER_RUNTIME_MODE=serverless`) |
| In-memory rate limiting | Resets on cold start |
| Static files | Served from Vercel CDN (`dist/`) |
| `window.__AIMETER_ENTRY__` injection | Not used — frontend falls back to `GET /api/entry-context` |

---

## Verification

After deploying:

1. **Health check**: `GET https://your-app.vercel.app/api/health` → `{"status":"ok"}`
2. **SPA routing**: Navigate to any deep URL — page should load correctly
3. **Admin path**: Visit `https://your-app.vercel.app/<AIMETER_ADMIN_ROUTE_SECRET>` → admin view
4. **Local test**: `AIMETER_DATABASE_ENGINE=postgres AIMETER_DATABASE_CONNECTION=<dsn> vercel dev`

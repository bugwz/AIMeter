# AIMeter

AIMeter is a self-hosted dashboard for tracking AI provider usage, quota, and history in one place.

It includes a React frontend, an Express backend, multi-provider adapters, scheduled refresh, and database-backed runtime storage.

<div align="center">

[**English**](README.md) | [简体中文](doc/readme/README-zh-CN.md) | [繁體中文](doc/readme/README-zh-TW.md) | [日本語](doc/readme/README-ja.md) | [Français](doc/readme/README-fr.md) | [Deutsch](doc/readme/README-de.md) | [Español](doc/readme/README-es.md) | [Português](doc/readme/README-pt.md) | [Русский](doc/readme/README-ru.md) | [한국어](doc/readme/README-ko.md)

</div>

<div align="center">
  <img src="doc/img/dashboard.png" alt="AIMeter dashboard" width="100%" />
</div>

## Features

- Unified dashboard for multiple providers
- Provider settings and credential management
- Usage history and chart views
- Endpoint and widget related pages
- Automatic refresh scheduler in node runtime mode
- Mock mode for local development and demos
- Storage backends: SQLite, PostgreSQL, MySQL
- Environment-first config override model

## Supported Providers

Current provider adapters include:

- Aliyun
- Antigravity
- Claude
- Codex
- Kimi
- MiniMax
- z.ai
- Copilot
- OpenRouter
- Ollama
- OpenCode
- Cursor

## Tech Stack

- Frontend: React 18, TypeScript, Vite, Tailwind CSS
- Backend: Node.js, Express, TypeScript
- Database: better-sqlite3, pg, mysql2

## Project Structure

```text
.
├─ src/                 # Frontend app
├─ server/              # Backend API, auth, jobs, storage
├─ doc/                 # Design notes, provider examples, translations
├─ config.example.yaml  # Full config template
└─ .env.example         # Environment variable template
```

## Quick Start

### 1. Install

```bash
npm install
```

### 2. Configure

```bash
cp .env.example .env
cp config.example.yaml config.yaml
```

Edit `config.yaml` and/or `.env` based on your deployment.

### 3. Run frontend + backend

```bash
npm run dev:all
```

Default local endpoints:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3001`

## Common Scripts

```bash
npm run dev            # frontend only
npm run start:server   # backend only
npm run dev:all        # frontend + backend
npm run dev:mock:all   # frontend + backend in mock mode
npm run build          # type-check and build frontend
npm run preview        # preview production frontend build
```

## Configuration Model

Priority order:

1. Environment variables (`.env`)
2. `config.yaml`
3. Built-in defaults

Key areas:

- `server`: API URL, frontend/backend ports, CORS, trust proxy
- `runtime`: `node` or `serverless`, mock switch
- `database`: engine, DSN/path, encryption keys
- `auth`: session secret, cookie options, rate limits, admin secrets
- `providers`: provider list (used when database mode is disabled)

## Runtime Modes

- `node`: starts in-process scheduler for periodic refresh.
- `serverless`: scheduler is disabled; refresh is request-driven.

## Database Engines

AIMeter supports:

- SQLite (default)
- PostgreSQL
- MySQL



## Container Deployment

AIMeter ships a single-container stack: **nginx** (HTTPS, port 3000) terminates TLS and proxies to Node.js (internal port 3001).

```bash
./deploy/container/build.sh   # build the image
./deploy/container/run.sh     # start the service
```

Security keys are auto-generated on first start — no manual configuration required.

For full details see [deploy/container/README.md](deploy/container/README.md).

## Security Notes

For production deployment:

- In database mode, `AIMETER_ENCRYPTION_KEY` and `AIMETER_AUTH_SESSION_SECRET` are auto-generated on first start and stored in the database. Override them only for multi-instance deployments.
- `AIMETER_CRON_SECRET` and `AIMETER_ENDPOINT_SECRET` are optional in env-only mode, but the related secret-auth endpoint stays unavailable until configured.
- In database mode, `AIMETER_CRON_SECRET` and `AIMETER_ENDPOINT_SECRET` are used only for first-time initialization; after that, values are managed in DB.
- Enable secure cookies behind HTTPS.
- Restrict CORS origins.
- Keep admin/cron/endpoint secrets private.

<div align="center">

<img src="public/img/logo-light.svg" width="80" height="80" align="center" alt="AIMeter logo">

# AIMeter

AIMeter is a self-hosted dashboard for tracking AI provider usage, quota, and historical trends.

</div>

<div align="center">

[![React](https://img.shields.io/badge/React-Frontend-61dafb?logo=react&logoColor=white)](#tech-stack)
[![Express](https://img.shields.io/badge/Express-API-000000?logo=express)](#tech-stack)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178c6?logo=typescript&logoColor=white)](#tech-stack)
[![Runtime](https://img.shields.io/badge/Runtime-Node%20%7C%20Serverless-22c55e)](#runtime-modes)
[![Providers](https://img.shields.io/badge/Providers-Multi-0ea5e9)](#supported-providers)
[![Deploy](https://img.shields.io/badge/Deploy-Vercel-000000?logo=vercel)](deploy/vercel/README.md)
[![Deploy](https://img.shields.io/badge/Deploy-Cloudflare-f38020?logo=cloudflare&logoColor=white)](deploy/cloudflare/README.md)

</div>

<div align="center">

[**English**](README.md) | [简体中文](doc/readme/README-zh-CN.md) | [繁體中文](doc/readme/README-zh-TW.md) | [日本語](doc/readme/README-ja.md) | [Français](doc/readme/README-fr.md) | [Deutsch](doc/readme/README-de.md) | [Español](doc/readme/README-es.md) | [Português](doc/readme/README-pt.md) | [Русский](doc/readme/README-ru.md) | [한국어](doc/readme/README-ko.md)

</div>

<div align="center">
  <img src="doc/img/dashboard.png" alt="AIMeter dashboard" width="100%" />
</div>

<div align="center">
  <table>
    <tr>
      <td align="center" width="33.33%">
        <img src="doc/img/history.png" alt="AIMeter usage history" width="100%" />
      </td>
      <td align="center" width="33.33%">
        <img src="doc/img/endpoint.png" alt="AIMeter endpoint" width="100%" />
      </td>
      <td align="center" width="33.33%">
        <img src="doc/img/settings.png" alt="AIMeter settings" width="100%" />
      </td>
    </tr>
  </table>
</div>

## Features

- React frontend dashboard
- Express backend API
- Multi-provider adapter architecture
- Runtime modes: `node` and `serverless`
- Database-backed storage and bootstrap flow
- Unified dashboard across multiple AI providers
- Provider credential management and quota display
- Usage history and chart pages
- Endpoint/proxy related API pages
- Bootstrap + admin route initialization flow
- Multiple database engines: `sqlite`, `d1`, `postgres`, `mysql`
- Cloudflare Cron Triggers support via `scheduled` handler

## Supported Providers

<div align="center">
<table>
  <tr>
    <td align="center" valign="middle" width="140" height="110">
      <img src="public/providers/aliyun.svg" alt="Aliyun" width="40" height="40" style="object-fit: contain;" /><br />
      Aliyun
    </td>
    <td align="center" valign="middle" width="140" height="110">
      <img src="public/providers/antigravity.svg" alt="Antigravity" width="40" height="40" style="object-fit: contain;" /><br />
      Antigravity
    </td>
    <td align="center" valign="middle" width="140" height="110">
      <img src="public/providers/claude.svg" alt="Claude" width="40" height="40" style="object-fit: contain;" /><br />
      Claude
    </td>
    <td align="center" valign="middle" width="140" height="110">
      <img src="public/providers/codex.svg" alt="Codex" width="40" height="40" style="object-fit: contain;" /><br />
      Codex
    </td>
    <td align="center" valign="middle" width="140" height="110">
      <img src="public/providers/kimi.svg" alt="Kimi" width="40" height="40" style="object-fit: contain;" /><br />
      Kimi
    </td>
    <td align="center" valign="middle" width="140" height="110">
      <img src="public/providers/minimax.svg" alt="MiniMax" width="40" height="40" style="object-fit: contain;" /><br />
      MiniMax
    </td>
  </tr>
  <tr>
    <td align="center" valign="middle" width="140" height="110">
      <img src="public/providers/zai.svg" alt="z.ai" width="40" height="40" style="object-fit: contain;" /><br />
      z.ai
    </td>
    <td align="center" valign="middle" width="140" height="110">
      <img src="public/providers/copilot.svg" alt="Copilot" width="40" height="40" style="object-fit: contain;" /><br />
      Copilot
    </td>
    <td align="center" valign="middle" width="140" height="110">
      <img src="public/providers/openrouter.svg" alt="OpenRouter" width="40" height="40" style="object-fit: contain;" /><br />
      OpenRouter
    </td>
    <td align="center" valign="middle" width="140" height="110">
      <img src="public/providers/ollama.svg" alt="Ollama" width="40" height="40" style="object-fit: contain;" /><br />
      Ollama
    </td>
    <td align="center" valign="middle" width="140" height="110">
      <img src="public/providers/opencode.svg" alt="OpenCode" width="40" height="40" style="object-fit: contain;" /><br />
      OpenCode
    </td>
    <td align="center" valign="middle" width="140" height="110">
      <img src="public/providers/cursor.svg" alt="Cursor" width="40" height="40" style="object-fit: contain;" /><br />
      Cursor
    </td>
  </tr>
</table>
</div>

Provider-specific examples and integration notes: [doc/providers](doc/providers)

## Tech Stack

- Frontend: React 18, TypeScript, Vite, Tailwind CSS
- Backend: Node.js, Express, TypeScript
- Storage: SQLite / Cloudflare D1 / PostgreSQL / MySQL

## Project Structure

```text
.
├─ src/                  # Frontend app
├─ server/               # Backend API, auth, jobs, storage
├─ deploy/               # Deployment guides by platform
├─ doc/                  # API docs, provider examples, translations, config docs
├─ config.all.yaml       # Full config template
├─ config.yaml           # Active local config (create by copy)
└─ .env.all              # Full env template
```

## Quick Start

### Option 1: Container (Docker)

Single-container deployment with nginx + Node.js. Data is persisted via a volume mount.

```bash
mkdir -p ~/aimeter/db ~/aimeter/log
docker run -d --name aimeter \
  -p 3000:3000 \
  -e AIMETER_DATABASE_ENGINE=sqlite \
  -e AIMETER_DATABASE_CONNECTION=/aimeter/db/aimeter.db \
  -e AIMETER_SERVER_PORT=3000 \
  -e AIMETER_BACKEND_PORT=3001 \
  -e AIMETER_RUNTIME_MODE=node \
  -v ~/aimeter/db:/aimeter/db \
  -v ~/aimeter/log:/aimeter/log \
  bugwz/aimeter:latest
```

Then open: `http://localhost:3000`

For Docker Compose, HTTPS, MySQL/PostgreSQL, or multi-arch builds: [deploy/container/README.md](deploy/container/README.md)

### Option 2: Vercel

Serverless deployment on Vercel. Requires an external MySQL or PostgreSQL database.

| Mode | Deploy |
|---|---|
| MySQL | [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbugwz%2FAIMeter&env=AIMETER_RUNTIME_MODE%2CAIMETER_SERVER_PROTOCOL%2CAIMETER_DATABASE_ENGINE%2CAIMETER_DATABASE_CONNECTION&envDefaults=%7B%22AIMETER_RUNTIME_MODE%22%3A%22serverless%22%2C%22AIMETER_SERVER_PROTOCOL%22%3A%22https%22%2C%22AIMETER_DATABASE_ENGINE%22%3A%22mysql%22%2C%22AIMETER_DATABASE_CONNECTION%22%3A%22mysql%3A%2F%2FUSER%3APASSWORD%40HOST%3A3306%2FDATABASE%22%7D&envDescription=AIMeter+Vercel+%2B+MySQL&envLink=https%3A%2F%2Fgithub.com%2Fbugwz%2FAIMeter%2Fblob%2Fmain%2Fdeploy%2Fvercel%2FREADME.md) |
| PostgreSQL | [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbugwz%2FAIMeter&env=AIMETER_RUNTIME_MODE%2CAIMETER_SERVER_PROTOCOL%2CAIMETER_DATABASE_ENGINE%2CAIMETER_DATABASE_CONNECTION&envDefaults=%7B%22AIMETER_RUNTIME_MODE%22%3A%22serverless%22%2C%22AIMETER_SERVER_PROTOCOL%22%3A%22https%22%2C%22AIMETER_DATABASE_ENGINE%22%3A%22postgres%22%2C%22AIMETER_DATABASE_CONNECTION%22%3A%22postgresql%3A%2F%2FUSER%3APASSWORD%40HOST%3A5432%2FDATABASE%3Fsslmode%3Drequire%22%7D&envDescription=AIMeter+Vercel+%2B+PostgreSQL&envLink=https%3A%2F%2Fgithub.com%2Fbugwz%2FAIMeter%2Fblob%2Fmain%2Fdeploy%2Fvercel%2FREADME.md) |

Set env vars, complete bootstrap, then configure an external cron service to call `/api/system/jobs/refresh` every 5 minutes.

For cron setup and full configuration: [deploy/vercel/README.md](deploy/vercel/README.md)

### Option 3: Cloudflare Workers

Serverless deployment on Cloudflare Workers. Supports Cloudflare D1, MySQL, or PostgreSQL.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/bugwz/AIMeter)

After deploying, set runtime env vars by database mode:

| Mode | Required env vars |
|---|---|
| D1 | `AIMETER_RUNTIME_MODE=serverless`<br>`AIMETER_SERVER_PROTOCOL=https`<br>`AIMETER_DATABASE_ENGINE=d1`<br>`AIMETER_DATABASE_CONNECTION=DB` |
| MySQL | `AIMETER_RUNTIME_MODE=serverless`<br>`AIMETER_SERVER_PROTOCOL=https`<br>`AIMETER_DATABASE_ENGINE=mysql`<br>`AIMETER_DATABASE_CONNECTION=mysql://USER:PASSWORD@HOST:3306/DATABASE` |
| PostgreSQL | `AIMETER_RUNTIME_MODE=serverless`<br>`AIMETER_SERVER_PROTOCOL=https`<br>`AIMETER_DATABASE_ENGINE=postgres`<br>`AIMETER_DATABASE_CONNECTION=postgres://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require` |

Cron Triggers are built-in — `wrangler.jsonc` schedules a refresh every 5 minutes automatically.

For D1 binding, Hyperdrive, and full setup steps: [deploy/cloudflare/README.md](deploy/cloudflare/README.md)

## Scripts

```bash
npm run dev            # frontend only
npm run start:server   # backend only
npm run dev:all        # frontend + backend
npm run dev:mock:all   # frontend + backend (mock mode)
npm run build          # type-check and build frontend
npm run preview        # preview frontend build
npm run cf:dev         # local Cloudflare Workers dev (Wrangler)
npm run cf:deploy      # deploy to Cloudflare Workers
```

## Configuration

Config sources and priority in current implementation:

1. `config.yaml` (or path from `AIMETER_CONFIG_FILE`)
2. Environment variables
3. Built-in defaults

Important:

- `database.engine` / `AIMETER_DATABASE_ENGINE` is required.
- `database.connection` / `AIMETER_DATABASE_CONNECTION` is required.
- In `serverless` mode, in-process scheduler is disabled; use CF Cron Triggers or an external scheduler.
- In `node` mode, in-process scheduler starts automatically.

Detailed field mapping and explanations:

- [doc/conf/README.md](doc/conf/README.md)

## Deployment

Supported deployment modes and links:

- [deploy/README.md](deploy/README.md)
- [deploy/container/README.md](deploy/container/README.md)
- [deploy/cloudflare/README.md](deploy/cloudflare/README.md)
- [deploy/vercel/README.md](deploy/vercel/README.md)

## API Documentation

- [doc/api/README.md](doc/api/README.md)

## Security Notes

- Session secret and encryption-related settings are initialized and persisted by system storage during bootstrap in database mode.
- `AIMETER_CRON_SECRET` and `AIMETER_ENDPOINT_SECRET` are optional integration secrets; when provided, use strong 32-char random values.
- Use `AIMETER_SERVER_PROTOCOL=https` in production to enable strict transport-related security headers.

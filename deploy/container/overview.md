# AIMeter

AIMeter is a self-hosted dashboard for tracking AI provider usage, quota, and historical trends.

[![React](https://img.shields.io/badge/React-Frontend-61dafb?logo=react&logoColor=white)](https://github.com/bugwz/AIMeter#tech-stack)
[![Express](https://img.shields.io/badge/Express-API-000000?logo=express)](https://github.com/bugwz/AIMeter#tech-stack)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178c6?logo=typescript&logoColor=white)](https://github.com/bugwz/AIMeter#tech-stack)
[![GitHub](https://img.shields.io/badge/GitHub-bugwz%2FAIMeter-181717?logo=github)](https://github.com/bugwz/AIMeter)

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
- Multiple database engines: `sqlite`, `postgres`, `mysql`

## Supported Providers

Aliyun · Antigravity · Claude · Codex · Kimi · MiniMax · z.ai · Copilot · OpenRouter · Ollama · OpenCode · Cursor

Provider-specific examples and integration notes: [github.com/bugwz/AIMeter — docs/providers](https://github.com/bugwz/AIMeter/tree/main/docs/providers)

## Tech Stack

- Frontend: React 18, TypeScript, Vite, Tailwind CSS
- Backend: Node.js, Express, TypeScript
- Storage: SQLite / PostgreSQL / MySQL

## Quick Start

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

For Docker Compose, HTTPS, MySQL/PostgreSQL, or multi-arch builds: [deploy/container/README.md](https://github.com/bugwz/AIMeter/blob/main/deploy/container/README.md)

## Configuration

Config sources and priority:

1. `config.yaml` (or path from `AIMETER_CONFIG_FILE`)
2. Environment variables
3. Built-in defaults

**Required environment variables:**

| Variable | Description |
|---|---|
| `AIMETER_DATABASE_ENGINE` | `sqlite`, `postgres`, or `mysql` |
| `AIMETER_DATABASE_CONNECTION` | Connection string or file path |
| `AIMETER_RUNTIME_MODE` | `node` (in-process scheduler) or `serverless` |
| `AIMETER_SERVER_PORT` | Frontend/proxy port (default `3000`) |
| `AIMETER_BACKEND_PORT` | Backend API port (default `3001`) |

- In `node` mode, the in-process scheduler starts automatically.
- In `serverless` mode, use an external cron to call `/api/system/jobs/refresh` every 5 minutes.

Detailed field mapping and explanations: [docs/conf/README.md](https://github.com/bugwz/AIMeter/blob/main/docs/conf/README.md)

## Deployment

- [Container deployment guide](https://github.com/bugwz/AIMeter/blob/main/deploy/container/README.md)
- [Vercel deployment guide](https://github.com/bugwz/AIMeter/blob/main/deploy/vercel/README.md)
- [Cloudflare Workers deployment guide](https://github.com/bugwz/AIMeter/blob/main/deploy/cloudflare/README.md)
- [All deployment options](https://github.com/bugwz/AIMeter/blob/main/deploy/README.md)

## API Documentation

[docs/api/README.md](https://github.com/bugwz/AIMeter/blob/main/docs/api/README.md)

## Security Notes

- Session secret and encryption-related settings are initialized and persisted by system storage during bootstrap in database mode.
- `AIMETER_CRON_SECRET` and `AIMETER_ENDPOINT_SECRET` are optional integration secrets; when provided, use strong 32-char random values.
- Use `AIMETER_SERVER_PROTOCOL=https` in production to enable strict transport-related security headers.

## Source

[github.com/bugwz/AIMeter](https://github.com/bugwz/AIMeter)

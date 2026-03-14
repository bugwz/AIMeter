# AIMeter — Container Deployment

Single-container deployment: **nginx** (port 3000) proxies to **Node.js** (internal port 3001).

Default mode is **HTTP** — no browser certificate warnings. HTTPS is opt-in via `AIMETER_SERVER_PROTOCOL=https`.

## Directory Structure

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build: frontend builder → production image with nginx + openssl |
| `entrypoint.sh` | Startup script: select protocol → configure nginx → start Node.js |
| `healthcheck.sh` | Protocol-aware health probe used by Docker's `HEALTHCHECK` |
| `nginx/nginx-http.conf` | nginx plain HTTP reverse proxy config (`:3000` → `:3001`) |
| `nginx/nginx-https.conf` | nginx SSL reverse proxy config (`:3000` → `:3001`) |
| `docker-compose.yml` | Service definition, port mapping, volumes, and environment variables |
| `build.sh` | Build image; supports multi-arch and push to registry |
| `run.sh` | Manage the service: `up` / `down` / `restart` / `logs` / `status` |

## Prerequisites

- **Docker** with Compose v2 (`docker compose`) or Compose v1 (`docker-compose`)
- `build.sh` must be run from anywhere — it resolves the project root automatically

> `build.sh` also supports **Podman** (preferred over Docker if both are installed).
> `run.sh` requires Docker Compose.

## Quick Start

### Option 1: docker run

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
  --restart unless-stopped \
  bugwz/aimeter:latest
```

Then open: http://localhost:3000

### Option 2: docker compose

Docker Compose automatically creates host directories listed under `volumes` on startup — no manual `mkdir` needed.

```bash
# Option A: use the compose file from the repo
./deploy/container/run.sh

# Option B: download compose file and start standalone
curl -O https://raw.githubusercontent.com/bugwz/AIMeter/main/deploy/container/docker-compose.yml
docker compose up -d
```

Then open: http://localhost:3000

## Protocol Modes

### HTTP (default)

Plain HTTP with no certificate warnings. Ideal for use behind a reverse proxy (nginx, Caddy, Traefik) that handles TLS termination.

```bash
mkdir -p ~/aimeter/db ~/aimeter/log
docker run -d --name aimeter \
  -p 3000:3000 \
  -e AIMETER_SERVER_PROTOCOL=http \
  -e AIMETER_DATABASE_ENGINE=sqlite \
  -e AIMETER_DATABASE_CONNECTION=/aimeter/db/aimeter.db \
  -e AIMETER_SERVER_PORT=3000 \
  -e AIMETER_BACKEND_PORT=3001 \
  -e AIMETER_RUNTIME_MODE=node \
  -v ~/aimeter/db:/aimeter/db \
  -v ~/aimeter/log:/aimeter/log \
  --restart unless-stopped \
  bugwz/aimeter:latest
```

### HTTPS with auto-generated self-signed certificate

Set `AIMETER_SERVER_PROTOCOL=https`. A self-signed RSA 2048 certificate valid for 10 years is generated automatically on first start. Your browser will show a security warning — proceed past it for local/development use.

```bash
mkdir -p ~/aimeter/conf ~/aimeter/db ~/aimeter/log
docker run -d --name aimeter \
  -p 3000:3000 \
  -e AIMETER_SERVER_PROTOCOL=https \
  -e AIMETER_DATABASE_ENGINE=sqlite \
  -e AIMETER_DATABASE_CONNECTION=/aimeter/db/aimeter.db \
  -e AIMETER_SERVER_PORT=3000 \
  -e AIMETER_BACKEND_PORT=3001 \
  -e AIMETER_RUNTIME_MODE=node \
  -v ~/aimeter/conf:/aimeter/conf \
  -v ~/aimeter/db:/aimeter/db \
  -v ~/aimeter/log:/aimeter/log \
  --restart unless-stopped \
  bugwz/aimeter:latest
```

### HTTPS with your own certificate

Place `server.crt` and `server.key` in `~/aimeter/conf/`, then mount it:

```bash
mkdir -p ~/aimeter/conf ~/aimeter/db ~/aimeter/log
# copy your certificate files first:
# cp your-cert.crt ~/aimeter/conf/server.crt
# cp your-cert.key ~/aimeter/conf/server.key
docker run -d --name aimeter \
  -p 3000:3000 \
  -e AIMETER_SERVER_PROTOCOL=https \
  -e AIMETER_DATABASE_ENGINE=sqlite \
  -e AIMETER_DATABASE_CONNECTION=/aimeter/db/aimeter.db \
  -e AIMETER_SERVER_PORT=3000 \
  -e AIMETER_BACKEND_PORT=3001 \
  -e AIMETER_RUNTIME_MODE=node \
  -v ~/aimeter/conf:/aimeter/conf \
  -v ~/aimeter/db:/aimeter/db \
  -v ~/aimeter/log:/aimeter/log \
  --restart unless-stopped \
  bugwz/aimeter:latest
```

## Database Configuration

### SQLite (default)

```bash
mkdir -p ~/aimeter/db ~/aimeter/log
docker run -d --name aimeter \
  -p 3000:3000 \
  -e AIMETER_SERVER_PROTOCOL=http \
  -e AIMETER_DATABASE_ENGINE=sqlite \
  -e AIMETER_DATABASE_CONNECTION=/aimeter/db/aimeter.db \
  -e AIMETER_SERVER_PORT=3000 \
  -e AIMETER_BACKEND_PORT=3001 \
  -e AIMETER_RUNTIME_MODE=node \
  -v ~/aimeter/db:/aimeter/db \
  -v ~/aimeter/log:/aimeter/log \
  --restart unless-stopped \
  bugwz/aimeter:latest
```

### MySQL

```bash
mkdir -p ~/aimeter/log
docker run -d --name aimeter \
  -p 3000:3000 \
  -e AIMETER_SERVER_PROTOCOL=http \
  -e AIMETER_DATABASE_ENGINE=mysql \
  -e AIMETER_DATABASE_CONNECTION=mysql://user:pass@host:3306/aimeter \
  -e AIMETER_SERVER_PORT=3000 \
  -e AIMETER_BACKEND_PORT=3001 \
  -e AIMETER_RUNTIME_MODE=node \
  -v ~/aimeter/log:/aimeter/log \
  --restart unless-stopped \
  bugwz/aimeter:latest
```

### PostgreSQL

```bash
mkdir -p ~/aimeter/log
docker run -d --name aimeter \
  -p 3000:3000 \
  -e AIMETER_SERVER_PROTOCOL=http \
  -e AIMETER_DATABASE_ENGINE=postgres \
  -e AIMETER_DATABASE_CONNECTION=postgres://user:pass@host:5432/aimeter \
  -e AIMETER_SERVER_PORT=3000 \
  -e AIMETER_BACKEND_PORT=3001 \
  -e AIMETER_RUNTIME_MODE=node \
  -v ~/aimeter/log:/aimeter/log \
  --restart unless-stopped \
  bugwz/aimeter:latest
```

## Managing the Service

All subcommands are passed to `run.sh`:

| Command | Description |
|---------|-------------|
| `./run.sh` or `./run.sh up` | Start the service in detached mode (default) |
| `./run.sh down` | Stop and remove the service containers |
| `./run.sh restart` | Recreate and restart the service |
| `./run.sh logs` | Follow live service logs |
| `./run.sh status` | Show current service status |

## Persistent Storage (Volumes)

| Host Path (default) | Container Path | Stores |
|---------------------|---------------|--------|
| `~/aimeter/db` | `/aimeter/db` | SQLite database (`aimeter.db`) |
| `~/aimeter/log` | `/aimeter/log` | Application and nginx access/error logs |
| `~/aimeter/conf` | `/aimeter/conf` | TLS certificates (`server.crt`, `server.key`) — HTTPS mode only |

Without volumes, all data is lost when the container is removed. The `docker-compose.yml` mounts `db` and `log` volumes by default.

## Building the Image

Supported platforms: `linux/amd64` (x86_64 servers/VPS) and `linux/arm64` (AWS Graviton, Apple Silicon Docker).

> Building on macOS Apple Silicon without `--platform` produces an `arm64` image that will fail on x86_64 Linux with `exec format error`.

```bash
# Local build — automatically detects current machine architecture
./deploy/container/build.sh

# Build for a specific platform
./deploy/container/build.sh --platform linux/amd64
./deploy/container/build.sh --platform linux/arm64

# Single platform + push to registry
./deploy/container/build.sh --platform linux/amd64 --push

# Multi-arch build — must use --push (Docker cannot load multi-arch images locally)
./deploy/container/build.sh --platform linux/amd64,linux/arm64 --push

# Custom image name and tag
./deploy/container/build.sh --name myrepo/aimeter --tag v1.0.0 --push
```

Run `./deploy/container/build.sh --help` for the full option reference.

## Environment Variable Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `AIMETER_SERVER_PROTOCOL` | `http` | `http` (no cert warnings) or `https` (TLS, self-signed or custom cert) |
| `AIMETER_SERVER_PORT` | `3000` | External port nginx listens on (must match `-p` in `docker run`) |
| `AIMETER_BACKEND_PORT` | `3001` | Internal Node.js listening port (nginx proxies to this) |
| `AIMETER_DATABASE_ENGINE` | `sqlite` | Database engine: `sqlite`, `mysql`, or `postgres` |
| `AIMETER_DATABASE_CONNECTION` | `/aimeter/db/aimeter.db` | DB file path or connection URL |
| `AIMETER_RUNTIME_MODE` | `node` | `node` (built-in scheduler) or `serverless` (external cron trigger) |
| `AIMETER_AUTH_SESSION_TTL_SECONDS` | `43200` | Session TTL in seconds (default: 12 hours) |
| `AIMETER_CRON_SECRET` | _(auto)_ | Optional 32-char secret for cron endpoint |
| `AIMETER_ENDPOINT_SECRET` | _(auto)_ | Optional 32-char secret for API endpoint |
| `AIMETER_ENCRYPTION_KEY` | _(auto)_ | Encrypts sensitive data at rest — auto-generated on first start |
| `AIMETER_AUTH_SESSION_SECRET` | _(auto)_ | Signs session tokens — auto-generated on first start |

## Security Notes

- `AIMETER_ENCRYPTION_KEY` and `AIMETER_AUTH_SESSION_SECRET` are auto-generated on first start and persisted in the database — no manual setup required.
- Self-signed certificates are suitable for local use only. Use a CA-signed certificate for production HTTPS.
- In HTTP mode, TLS termination should be handled by an upstream reverse proxy.

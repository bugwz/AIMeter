# AIMeter — Container Deployment

Single-container deployment: **nginx** (HTTPS, port 3000) terminates TLS and proxies to **Node.js** (internal port 3001). A self-signed TLS certificate is auto-generated on first startup if none is provided.

## Directory Structure

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build: frontend builder → production image with nginx + openssl |
| `entrypoint.sh` | Startup script: check/generate TLS cert → start nginx → start Node.js |
| `nginx/nginx.conf` | nginx SSL reverse proxy config (`:3000` → `:3001`) |
| `docker-compose.yml` | Service definition, port mapping, and environment variables |
| `build.sh` | Build image; auto-tags with git version + `latest` |
| `run.sh` | Manage the service: `up` / `down` / `restart` / `logs` / `status` |

## Prerequisites

- **Docker** with Compose v2 (`docker compose`) or Compose v1 (`docker-compose`)
- `build.sh` must be run from the **project root** (it resolves the root automatically)

> `build.sh` also supports **Podman** (preferred over Docker if both are installed).
> `run.sh` requires Docker Compose and does not support Podman.

## Quick Start

```bash
# 1. Build the image (run from anywhere; script resolves project root)
./deploy/container/build.sh

# 2. Edit docker-compose.yml — replace the placeholder security keys:
#    AIMETER_ENCRYPTION_KEY, AIMETER_AUTH_SESSION_SECRET

# 3. Start the service
./deploy/container/run.sh

# 4. Open the app (accept the browser warning for the self-signed cert)
open https://localhost:3000
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

## TLS Certificates

### Auto-generated (default)

If no certificate is found at startup, `entrypoint.sh` generates a self-signed RSA 2048 certificate valid for 10 years and saves it to `/aimeter/conf/` inside the container:

```
/aimeter/conf/server.crt
/aimeter/conf/server.key
```

Your browser will show a security warning — this is expected. Proceed past the warning for local/development use.

### Custom certificates

1. Uncomment the volume in `docker-compose.yml`:
   ```yaml
   volumes:
     - /opt/aimeter/conf:/aimeter/conf
   ```
2. Place your certificate files at the host path:
   ```
   /opt/aimeter/conf/server.crt
   /opt/aimeter/conf/server.key
   ```
3. Restart the service: `./run.sh restart`

## Persistent Storage (Volumes)

All volumes in `docker-compose.yml` are commented out by default. Uncomment any you want to persist across container restarts:

| Host Path (default) | Container Path | Stores |
|---------------------|---------------|--------|
| `/opt/aimeter/conf` | `/aimeter/conf` | TLS certificates (`server.crt`, `server.key`) |
| `/opt/aimeter/db` | `/aimeter/db` | SQLite database (`aimeter.db`) |
| `/opt/aimeter/log` | `/aimeter/log` | Application and nginx access/error logs |

Without volumes, all data is lost when the container is removed.

## Configuration (Environment Variables)

Configured in `docker-compose.yml` under `environment:`.

### Required — must replace before production use

| Variable | Default | Description |
|----------|---------|-------------|
| `AIMETER_ENCRYPTION_KEY` | `6f23ba97...` | Key for encrypting sensitive data at rest |
| `AIMETER_AUTH_SESSION_SECRET` | `2b747641...` | Secret for signing session tokens |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `AIMETER_BACKEND_PORT` | `3001` | Internal Node.js listening port |
| `AIMETER_DATABASE_ENGINE` | `sqlite` | Database engine (`sqlite`) |
| `AIMETER_DATABASE_CONNECTION` | `/aimeter/db/aimeter.db` | SQLite database file path |
| `AIMETER_RUNTIME_MODE` | `node` | Timer mode: `node` (built-in) or `serverless` (external trigger) |
| `AIMETER_SECURE_COOKIE` | `true` | Require HTTPS for session cookies |
| `AIMETER_TRUST_PROXY` | `true` | Trust `X-Forwarded-*` headers from nginx |
| `AIMETER_ADMIN_ROUTE_SECRET` | _(unset)_ | Secret to protect the admin route (recommended) |

## Security Notes

- **Replace all default secret values** (`AIMETER_ENCRYPTION_KEY`, `AIMETER_AUTH_SESSION_SECRET`) with strong random strings before any production deployment.
- Self-signed certificates are suitable for local use only. Use a CA-signed certificate for production.
- Set `AIMETER_ADMIN_ROUTE_SECRET` to a strong secret to restrict access to the admin route.

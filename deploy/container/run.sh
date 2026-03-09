#!/usr/bin/env bash
set -euo pipefail

# Resolve script directory (deploy/docker/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Detect compose command: prefer 'docker compose' (v2), fall back to 'docker-compose' (v1)
if docker compose version > /dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose > /dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  echo "Error: neither 'docker compose' nor 'docker-compose' found in PATH" >&2
  exit 1
fi

# Parse optional subcommand (default: up)
SUBCMD="${1:-up}"

case "${SUBCMD}" in
  up)
    echo "Starting AIMeter service..."
    ${COMPOSE} -f "${SCRIPT_DIR}/docker-compose.yml" up -d
    echo "Service started."
    echo "  HTTPS: https://localhost:3000"
    ;;
  down)
    echo "Stopping AIMeter service..."
    ${COMPOSE} -f "${SCRIPT_DIR}/docker-compose.yml" down
    ;;
  restart)
    echo "Restarting AIMeter service..."
    ${COMPOSE} -f "${SCRIPT_DIR}/docker-compose.yml" up -d --force-recreate
    ;;
  logs)
    ${COMPOSE} -f "${SCRIPT_DIR}/docker-compose.yml" logs -f
    ;;
  status)
    ${COMPOSE} -f "${SCRIPT_DIR}/docker-compose.yml" ps
    ;;
  *)
    echo "Usage: $0 [up|down|restart|logs|status]" >&2
    echo ""
    echo "  up       Start the service in detached mode (default)"
    echo "  down     Stop and remove the service containers"
    echo "  restart  Recreate and restart the service"
    echo "  logs     Follow service logs"
    echo "  status   Show service status"
    exit 1
    ;;
esac

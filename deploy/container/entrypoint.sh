#!/bin/sh
set -e

CERT_DIR="/aimeter/conf"
CERT_FILE="${CERT_DIR}/server.crt"
KEY_FILE="${CERT_DIR}/server.key"

# Generate self-signed certificate if not provided
mkdir -p "${CERT_DIR}"
if [ ! -f "${CERT_FILE}" ] || [ ! -f "${KEY_FILE}" ]; then
  echo "[entrypoint] No TLS certificate found, generating self-signed certificate..."
  openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout "${KEY_FILE}" \
    -out    "${CERT_FILE}" \
    -subj   "/CN=localhost" \
    -addext "subjectAltName=IP:127.0.0.1,DNS:localhost" \
    2>/dev/null
  echo "[entrypoint] Certificate generated at ${CERT_DIR}/"
else
  echo "[entrypoint] Using existing TLS certificate from ${CERT_DIR}/"
fi

# Start nginx in background (SSL reverse proxy on :3000 → Node.js on :3001)
nginx -g "daemon off;" &

# Start Node.js app in foreground
exec node --import tsx server/index.ts

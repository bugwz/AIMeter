#!/bin/sh
set -e


PROTOCOL="${AIMETER_SERVER_PROTOCOL:-http}"
SERVER_PORT="${AIMETER_SERVER_PORT:-3000}"
CERT_DIR="/aimeter/conf"
CERT_FILE="${CERT_DIR}/server.crt"
KEY_FILE="${CERT_DIR}/server.key"
NGINX_CONF="/tmp/nginx-active.conf"

if [ "${PROTOCOL}" = "https" ]; then
  # HTTPS mode: use existing certificates or generate self-signed
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
  sed "s/listen [0-9]* ssl/listen ${SERVER_PORT} ssl/" /etc/nginx/nginx-https.conf > "${NGINX_CONF}"
  echo "[entrypoint] Starting nginx in HTTPS mode (port ${SERVER_PORT})..."
else
  # HTTP mode (default): plain HTTP, suitable for use behind a reverse proxy
  sed "s/listen [0-9]*;/listen ${SERVER_PORT};/" /etc/nginx/nginx-http.conf > "${NGINX_CONF}"
  echo "[entrypoint] Starting nginx in HTTP mode (port ${SERVER_PORT})..."
fi

# Start nginx in background using the selected config
nginx -c "${NGINX_CONF}" -g "daemon off;" &

# Start Node.js app in foreground
exec node --import tsx server/index.ts

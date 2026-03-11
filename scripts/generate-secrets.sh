#!/usr/bin/env bash
# Generate random secret values for AIMeter configuration.
# Usage: ./scripts/generate-secrets.sh
#
# Compatibility: macOS, Linux, and Unix systems.
# Requires one of: openssl, python3, python, or od + /dev/urandom.

set -eu

# Generate N random bytes and print as lowercase hex.
# Tries multiple backends in order of preference.
rand_hex() {
  local bytes="$1"

  if command -v openssl > /dev/null 2>&1; then
    openssl rand -hex "$bytes"
    return
  fi

  if command -v python3 > /dev/null 2>&1; then
    python3 -c "import os, sys; sys.stdout.write(os.urandom(${bytes}).hex() + '\n')"
    return
  fi

  if command -v python > /dev/null 2>&1; then
    python -c "import os, sys; sys.stdout.write(os.urandom(${bytes}).hex() + '\n')"
    return
  fi

  # POSIX fallback: od reads exactly N bytes from /dev/urandom, no pipe truncation issues
  if [ -r /dev/urandom ]; then
    od -An -tx1 -N "${bytes}" /dev/urandom | tr -d ' \t\n'
    printf '\n'
    return
  fi

  printf 'Error: no random source found. Install openssl or python3.\n' >&2
  exit 1
}

# Timestamp — both BSD (macOS) and GNU date support this format
TIMESTAMP="$(date -u '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date)"

ENCRYPTION_KEY="$(rand_hex 32)"        # 64 hex chars
SESSION_SECRET="$(rand_hex 32)"        # 64 hex chars
ADMIN_ROUTE_PATH="$(rand_hex 16)"    # 32 hex chars (exactly 32 required)

printf '# AIMeter secrets — generated %s\n' "$TIMESTAMP"
printf '# Copy the values you need into your config file or environment.\n'
printf '\n'
printf '# Required only when not using database mode (auto-managed otherwise):\n'
printf 'AIMETER_ENCRYPTION_KEY=%s\n' "$ENCRYPTION_KEY"
printf 'AIMETER_AUTH_SESSION_SECRET=%s\n' "$SESSION_SECRET"
printf '\n'
printf '# Optional — protects the admin route (must be exactly 32 characters):\n'
printf 'AIMETER_ADMIN_ROUTE_PATH=%s\n' "$ADMIN_ROUTE_PATH"

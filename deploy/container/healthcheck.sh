#!/bin/sh
if [ "${AIMETER_SERVER_PROTOCOL:-http}" = "https" ]; then
  wget -qO- --no-check-certificate https://localhost:3000/api/health || exit 1
else
  wget -qO- http://localhost:3000/api/health || exit 1
fi

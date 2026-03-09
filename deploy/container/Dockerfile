# Stage 1: builder — build frontend static assets
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: runner — production runtime image
FROM node:22-alpine AS runner
WORKDIR /app

# Install build tools for native modules (better-sqlite3), nginx, and openssl
RUN apk add --no-cache python3 make g++ nginx openssl

COPY package*.json ./
RUN npm ci

# Copy runtime-required files
COPY server/ ./server/
COPY src/ ./src/
COPY public/ ./public/
COPY --from=builder /app/dist ./dist

# Copy nginx config and startup entrypoint
COPY deploy/container/nginx/nginx.conf /etc/nginx/nginx.conf
COPY deploy/container/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create runtime directories
RUN mkdir -p /aimeter/conf /aimeter/db /aimeter/log

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- --no-check-certificate https://localhost:3000/api/health || exit 1

CMD ["/entrypoint.sh"]

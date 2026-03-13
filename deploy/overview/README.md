# Deployment Guide Index

AIMeter currently supports the following deployment modes:

- [Container (single container with nginx + Node.js)](../container/README.md)
- [Cloudflare Workers](../cloudflare/README.md)
- [Vercel](../vercel/README.md)

## How to Choose

- Choose **Container** when you want full control and persistent local storage (SQLite by default).
- Choose **Cloudflare Workers** when you run in Cloudflare serverless runtime (supports `d1`, `mysql`, `postgres`).
- Choose **Vercel** when you deploy as serverless functions with external MySQL/PostgreSQL.

## Notes

- Database configuration is mandatory in all modes.
- In serverless modes, use `AIMETER_RUNTIME_MODE=serverless`.
- Container mode defaults to `AIMETER_RUNTIME_MODE=node` and can use in-process scheduler.

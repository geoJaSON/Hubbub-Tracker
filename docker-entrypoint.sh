#!/bin/sh
set -e

echo "[entrypoint] Applying database schema (drizzle-kit push)..."
# Idempotent: creates all tables on a fresh DB, applies additive changes after.
# Production hardening: replace with generated migrations once the schema settles.
pnpm --filter @workspace/db run push-force

echo "[entrypoint] Starting Hubbub API on port ${PORT:-8080}..."
# Run from the api-server dir so the bundled pino transport workers resolve.
cd /app/artifacts/api-server
exec node --enable-source-maps dist/index.mjs

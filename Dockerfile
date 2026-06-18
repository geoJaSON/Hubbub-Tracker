# syntax=docker/dockerfile:1

# ── Build stage ───────────────────────────────────────────────────────────────
# Installs the whole pnpm workspace and builds both the API (esbuild bundle) and
# the SPA (Vite). esbuild bundles the workspace libs from source, so no separate
# lib build step is needed.
FROM node:24-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile

RUN pnpm --filter @workspace/api-server run build
# BASE_PATH=/ → the SPA is served from the API origin root in production.
RUN BASE_PATH=/ PORT=8080 pnpm --filter @workspace/hubbub run build

# ── Runtime stage ─────────────────────────────────────────────────────────────
# Carries the full workspace (incl. node_modules + drizzle-kit) so the entrypoint
# can apply the schema with `drizzle-kit push` before the server starts.
FROM node:24-slim AS runtime
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

COPY --from=build /app /app
RUN chmod +x /app/docker-entrypoint.sh

ENV NODE_ENV=production
ENV PORT=8080
ENV BASE_PATH=/
ENV WEB_DIST=/app/artifacts/hubbub/dist/public
ENV UPLOADS_DIR=/data/uploads

EXPOSE 8080
ENTRYPOINT ["/app/docker-entrypoint.sh"]

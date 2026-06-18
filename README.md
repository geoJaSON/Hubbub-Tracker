# Hubbub Tracker

A self-hostable team command-center for consulting / project work: projects → scopes (SOW + budgets) → milestones → items (todos/bugs/requests/decisions), with time tracking, cost/budget tracking, GitHub commit linking, project chat, docs, flow diagrams, and an activity feed.

Originally built on Replit with Clerk auth; now runs **fully locally** with email+password auth and your own Postgres.

## Stack

- pnpm workspaces · Node.js 24 · TypeScript 5.9
- **API**: Express 5 (`artifacts/api-server`)
- **Web**: Vite + React + wouter + TanStack Query (`artifacts/hubbub`)
- **DB**: PostgreSQL + Drizzle ORM (`lib/db`)
- **Auth**: local email+password, bcrypt, JWT bearer tokens. The first account to register becomes `admin`.
- **API contract**: OpenAPI-first (`lib/api-spec/openapi.yaml`) → generated Zod (`lib/api-zod`) + React Query hooks (`lib/api-client-react`) via Orval.

## Quick start (Docker Compose — recommended)

Brings up Postgres + the app (the API serves the built SPA) in one command.

```bash
cp .env.example .env
# Set strong values for JWT_SECRET and ENCRYPTION_KEY (see comments in the file).
docker compose up --build
```

Then open <http://localhost:3000> (override with `APP_PORT`). The first account you register becomes the admin. Data persists in the `pgdata` and `uploads` Docker volumes.

## Local development (bare metal)

Requires a running Postgres. Two processes — API and Vite dev server.

```bash
cp .env.example .env          # set DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY
pnpm install
pnpm --filter @workspace/db run push      # create the schema in your DB

# terminal 1 — API on :8080 (auto-loads the root .env)
pnpm --filter @workspace/api-server run dev

# terminal 2 — Vite dev server on :5173, proxies /api → :8080
pnpm --filter @workspace/hubbub run dev
```

Open <http://localhost:5173>.

## Configuration

All via env (`.env` for dev, Compose injects them in Docker). See `.env.example`.

| Var | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | Signs auth tokens (and the operator setup-password token) |
| `ENCRYPTION_KEY` | 32-byte hex; AES-256-GCM encryption of per-project GitHub tokens |
| `PORT` / `BASE_PATH` | API port / public base path |
| `ALLOW_OPEN_SIGNUP` | `false` disables open self-signup (admins invite via the Users admin page) |
| `ALLOWED_EMAIL_DOMAIN` | Restrict signups to one email domain (blank = any) |
| `UPLOADS_DIR` | Where file attachments are stored (local storage backend) |
| `GITHUB_TOKEN` | Fallback token for the commit poller when a project has none |

## Auth & user provisioning

- **Self-signup**: register at `/sign-up`. First user → admin.
- **Admin invite**: an admin creates a user (no password) in the Users admin page; that person later registers with the same email to **claim** the account, keeping the role/rate the admin assigned.
- **Migrated users without a password**: set one via `/setup-password` using the operator setup token (`JWT_SECRET`).

## Common tasks

- `pnpm run typecheck` — typecheck all packages
- `pnpm run build` — typecheck + build everything
- `pnpm --filter @workspace/db run push` — apply schema changes (dev)
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks + Zod from `openapi.yaml`

> **Schema**: applied with `drizzle-kit push` (no migration files yet). Fine for a single-tenant self-host; switch to generated migrations before this holds data you can't lose.

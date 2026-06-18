# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env (copy `.env.example` → `.env`): `DATABASE_URL` (Postgres), `JWT_SECRET` (signs auth tokens), `ENCRYPTION_KEY` (32-byte hex, encrypts project GitHub tokens), `PORT`, `BASE_PATH`. Optional: `ALLOW_OPEN_SIGNUP`, `ALLOWED_EMAIL_DOMAIN`, `UPLOADS_DIR`, `GITHUB_TOKEN`. The API auto-loads a root `.env` in dev (`src/lib/env.ts`); Docker/Replit inject env directly.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- Auth: local email+password, bcrypt hashes, JWT bearer tokens (`src/lib/auth.ts`, `src/routes/auth.ts`). First registered account becomes `admin`. No external auth provider.
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

- **GitHub token encryption**: Project-level GitHub tokens are encrypted at rest using AES-256-GCM before being written to `projects.github_token`. The key is read from the `ENCRYPTION_KEY` secret (never stored in source). If `ENCRYPTION_KEY` is rotated, existing encrypted tokens become unreadable — the poller will emit a `WARN` log and fall back to the global `GITHUB_TOKEN` env var. Affected project owners must re-enter their token in project settings after a key rotation.

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

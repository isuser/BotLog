# Botlog

@AGENTS.md

Kanban task manager where AI is a teammate. Humans (web app) and AI agents (MCP) work on the same projects and tasks through one REST API. MIT licensed, self-hostable.

## Current scope

MVP only. Do not build v1.1 or Future items unless asked: epics/labels screens, list view, My tasks, realtime, command menu, rate limits, export, Dockerfile.

## Stack

- Next.js (App Router, `src/`), TypeScript strict, Tailwind v4, 9ui (Base UI) components, dnd-kit for the board
- Supabase Postgres + Auth via `@supabase/supabase-js` / `@supabase/ssr`
- REST API in Next.js route handlers under `/api/v1`; MCP server at `/api/mcp` in the same app
- pnpm; Vitest for tests

## Rules

- **All reads and writes go through the API**, for humans and AI alike. The UI talks to Supabase directly only for sign-in and realtime signals (realtime events only trigger a refetch through the API).
- **RLS on every table.** A user sees only their workspace. API key requests act as the agent's owner, so the same RLS applies.
- **Secret key** (`SUPABASE_SECRET_KEY`, the service role) is server-only, never `NEXT_PUBLIC_`, and only used for API key lookup and admin tasks — never to read or write project data.
- **Never commit secrets.** `.env*` is gitignored; only `.env.example` with placeholders is committed.
- **Schema changes** are Supabase CLI migrations in `supabase/migrations`. Never edit an applied migration; add a new one.
- **Archive, don't delete** tasks and epics (`archived_at`).
- **Task writes** send the `version` last read: update with `.eq("version", v)`; the trigger bumps it. No row back means 409 conflict (or 404 if the task is gone).
- **Short IDs** (`BOT-42`) are accepted anywhere a task ID is; project key accepted anywhere a project ID is.
- **API errors** are always `{ "error": { "code", "message" } }` with a matching HTTP status. Lists use cursor pagination (`?cursor=&limit=50`, max 100, `next_cursor`).
- Markdown is rendered sanitized, no raw HTML.

## Commands

- `pnpm dev` — run the app
- `pnpm lint` / `pnpm typecheck` / `pnpm test` — must pass before committing (CI runs them plus a gitleaks secret scan)
- `pnpm test:api` — API tests against the Supabase project in `.env.local` (creates and deletes throwaway `botlog-test-*` users). Run after API changes
- `pnpm exec supabase gen types typescript --linked --schema public < /dev/null > src/lib/supabase/database.types.ts` — regenerate DB types after a migration is applied
- `pnpm exec supabase migration new <name> < /dev/null` — new migration (without `< /dev/null` it waits for SQL on stdin and hangs when not run in a terminal)

## Supabase

Development uses Supabase Cloud, not a local Docker stack. The project is linked with `pnpm exec supabase link --project-ref <ref>`, and migrations are applied with `pnpm exec supabase db push`. Pushing changes a live database: only push after the migration has been reviewed, and never from a subagent.

## API conventions

- Route handlers in `src/app/api/v1/**/route.ts` wrap their logic in `route()` from `src/lib/api/handler.ts`: it authenticates the caller (`src/lib/api/auth.ts`) and turns thrown `ApiError`s into the standard error JSON. Use the `db` it hands you (RLS as the caller), never the admin client.
- Callers: session cookie (web app; non-GET needs a same-origin `Origin`), `Bearer <Supabase access token>`, or `Bearer bl_...` agent API key. For an API key, `auth.ts` looks up the hash with the service role and signs a 120s token for the owner with `agent_id`/`api_key_id` claims (`SUPABASE_JWT_SIGNING_KEY`).
- Validate bodies and query params with zod schemas in `src/lib/api/schemas.ts` (`parseBody`, `parseWith`). Map database errors with `fromPostgrest`.
- Responses are `{ data }`, lists `{ data, next_cursor }`. Lists use keyset pagination (`keysetFilter` + `page` in `pagination.ts`).
- Tasks: look up with `getTaskRow` (UUID or short ID), return `serializeTask`. Status/position changes go through `POST /tasks/:id/move`, which computes a fractional position from `after_id`/`before_id` (`positionFor`).

## Database conventions

- **Agent identity:** for API key requests the API signs a short-lived token for the agent's owner (`sub`) with top-level `agent_id` and `api_key_id` claims. RLS uses the owner; `private.current_agent_id()` / `private.is_human()` read the claims. Agents cannot manage agents, API keys, profiles or the workspace.
- **Grants are explicit and column-level.** Default privileges for `anon`/`authenticated` are revoked, so every new table needs RLS enabled, policies and its own `grant` list. Server-set columns (ids, `workspace_id`, task `number`, `version`, comment authors, timestamps) are never granted.
- **Triggers do the bookkeeping:** short ID numbers, `version`, `updated_at`, comment authors and the whole `activity_log`. The API must not write these itself. Order activity by `seq`, not `created_at`.
- `api_key.hash` is not readable by `authenticated`, so never `select *` on `api_key` with a user client.
- Task `position` is a base62 fractional index string (`collate "C"`).
- `tests/db/` applies all migrations to in-memory Postgres (PGlite) with a Supabase stub (`tests/db/supabase-stub.sql`) and tests RLS as real users and agents. Every schema change needs tests there.

## Subagents (`.claude/agents/`)

- `security-reviewer` — run before commits touching auth, RLS, API keys or env handling
- `db-migrations` — writes migrations and RLS policies from the data model
- `test-writer` — writes tests for what changed

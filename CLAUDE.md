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
- **Task writes** send the `version` last read; mismatches return `409 conflict`. Every change writes an `activity_log` row (with agent and API key for AI).
- **Short IDs** (`BOT-42`) are accepted anywhere a task ID is; project key accepted anywhere a project ID is.
- **API errors** are always `{ "error": { "code", "message" } }` with a matching HTTP status. Lists use cursor pagination (`?cursor=&limit=50`, max 100, `next_cursor`).
- Markdown is rendered sanitized, no raw HTML.

## Commands

- `pnpm dev` — run the app
- `pnpm lint` / `pnpm typecheck` / `pnpm test` — must pass before committing (CI runs them plus a gitleaks secret scan)
- `pnpm exec supabase migration new <name>` — new migration

## Supabase

Development uses Supabase Cloud, not a local Docker stack. The project is linked with `pnpm exec supabase link --project-ref <ref>`, and migrations are applied with `pnpm exec supabase db push`. Pushing changes a live database: only push after the migration has been reviewed, and never from a subagent.

## Subagents (`.claude/agents/`)

- `security-reviewer` — run before commits touching auth, RLS, API keys or env handling
- `db-migrations` — writes migrations and RLS policies from the data model
- `test-writer` — writes tests for what changed

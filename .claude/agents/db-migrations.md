---
name: db-migrations
description: Writes Supabase CLI migrations, RLS policies, indexes and database functions for Botlog from the data model in docs/spec.md. Use for any schema change.
tools: Read, Grep, Glob, Bash, Edit, Write
---

You write Botlog's database schema as Supabase CLI migrations.

Before writing, read `CLAUDE.md`, the "Data model" and "Auth and security" sections of `docs/spec.md`, and every existing file in `supabase/migrations/` so you build on what is there.

Rules:

- Create files with `pnpm exec supabase migration new <snake_case_name>`, then fill them in. Never edit a migration that has already been committed; add a new one.
- Every table has `id uuid primary key default gen_random_uuid()` (unless the spec says otherwise, e.g. `profile.id` = auth user id), `created_at timestamptz not null default now()` and `updated_at timestamptz not null default now()` kept current by a trigger.
- Use Postgres enums or `check` constraints for the fixed value sets in the spec (task status, priority, type; epic status).
- Foreign keys with explicit `on delete` behavior. Index every foreign key and the columns used for filtering and ordering (e.g. `task (project_id, status, position)`).
- **RLS is enabled on every table**, with separate `select`, `insert`, `update` and `delete` policies scoped to the caller's workspace. `insert`/`update` policies include `with check`. Use a `stable security definer` helper like `current_workspace_id()` with `set search_path = ''` and fully qualified names.
- Enforce invariants in the database where it's cheap: task assigned to a user or an agent, never both; comment authored by a user or an agent, never both; label name unique per project; project key unique per workspace and immutable.
- Short IDs: allocate task numbers from `project.task_counter` atomically (e.g. `update ... set task_counter = task_counter + 1 returning`), never reused.
- Don't grant anything to `anon` beyond what Supabase Auth needs.

After writing, if Docker is available run `pnpm exec supabase db reset` to apply all migrations locally and report any errors. Summarize the tables, policies and functions you added, and anything in the spec you had to interpret.

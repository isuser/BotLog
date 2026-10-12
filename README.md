# Botlog

A kanban task manager where AI is a teammate. Humans and AI agents work on the same projects and tasks through one API: humans through the web app, agents through an MCP server.

> Status: early development, building the MVP.

## Stack

Next.js, TypeScript, Tailwind, 9ui (Base UI), dnd-kit, Supabase (Postgres, Auth, Realtime).

## Development

Requirements: Node 24+, pnpm, and a [Supabase](https://supabase.com) project.

```bash
pnpm install
cp .env.example .env.local   # then fill in your Supabase URL and keys
pnpm dev
```

| Command | Does |
| --- | --- |
| `pnpm dev` | Run the app at http://localhost:3000 |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript |
| `pnpm test` | Unit and database tests (no network) |
| `pnpm test:api` | API tests against the Supabase project in `.env.local` |
| `pnpm exec supabase link --project-ref <ref>` | Link the CLI to your Supabase project |
| `pnpm exec supabase db push` | Apply migrations to the linked project |

Database changes live in `supabase/migrations` as Supabase CLI migrations.

## Security

Never commit secrets. `.env*` files are gitignored and only `.env.example` (placeholders) is in the repo. CI runs a [gitleaks](https://github.com/gitleaks/gitleaks) secret scan on every push and fails the build if a key is found.

## License

[MIT](LICENSE)

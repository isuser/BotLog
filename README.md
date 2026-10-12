# Botlog

A kanban task manager where AI is a teammate. Humans and AI agents work on the same projects and tasks through one API: humans through the web app, agents through an MCP server.

> Status: early development, building the MVP. See [`docs/spec.md`](docs/spec.md) for the full spec and roadmap.

## Stack

Next.js, TypeScript, Tailwind, 9ui (Base UI), dnd-kit, Supabase (Postgres, Auth, Realtime).

## Development

Requirements: Node 24+, pnpm, and Docker if you want to run Supabase locally.

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
| `pnpm test` | Vitest |
| `pnpm exec supabase start` | Local Supabase (Docker) |

Database changes live in `supabase/migrations` as Supabase CLI migrations.

## Security

Never commit secrets. `.env*` files are gitignored and only `.env.example` (placeholders) is in the repo. CI runs a [gitleaks](https://github.com/gitleaks/gitleaks) secret scan on every push and fails the build if a key is found.

## License

[MIT](LICENSE)

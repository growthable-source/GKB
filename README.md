# GKB

A multi-tenant help-center platform: canonical articles and collections are authored once, placed into help centers with per-center overrides, and served on public pages with full-text search. Built with Next.js 16 and Supabase.

## Prerequisites

- Node.js 20+
- pnpm
- Docker (for the local Supabase stack)

## Setup

```bash
pnpm install
cp .env.local.example .env.local
pnpm db:start
```

`pnpm db:start` (which runs `supabase start`) prints the anon key and service role key — copy them into `.env.local`. Note that this project uses nonstandard local ports (see `supabase/config.toml`): API on 54721, Postgres on 54722, Mailpit on 54724.

Then apply migrations and seed data:

```bash
pnpm db:reset
```

Sign in once at [http://localhost:3000/login](http://localhost:3000/login) with `owner@example.com` (the magic-link email arrives in Mailpit at [http://127.0.0.1:54724](http://127.0.0.1:54724)) so the auth user exists, then grant it the owner membership:

```bash
pnpm supabase db query "insert into memberships (user_id, help_center_id, role) select id, null, 'owner' from auth.users where email='owner@example.com' on conflict do nothing" --local
```

## Development

```bash
pnpm dev
```

## Verification

```bash
pnpm test              # unit tests (vitest)
pnpm tsc --noEmit      # typecheck
pnpm lint
pnpm build
pnpm db:reset && pnpm test:e2e   # Playwright; starts its own dev server on port 3800
```

The e2e suite is not idempotent: it needs a fresh `pnpm db:reset` plus the owner membership grant above before each run.

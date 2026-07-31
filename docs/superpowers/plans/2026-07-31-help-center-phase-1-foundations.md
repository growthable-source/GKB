# Help Center Phase 1 — Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a single working help center — authors write and publish articles in an admin UI, readers browse and search them on public pages.

**Architecture:** Next.js App Router with Postgres via Supabase. Articles and collections are canonical rows; a help center publishes content through `help_center_articles` / `help_center_collections` placement rows carrying ordering, visibility, and overrides. One module (`lib/content`) owns the override merge rules so no page can forget to filter hidden content. Phase 1 creates the full schema but exercises it with one seeded base help center on the apex host; subdomains and cloning arrive in Phase 2.

**Tech Stack:** Next.js 15 (App Router, TypeScript), Supabase (Postgres + Auth + Storage), Tailwind CSS v4, shadcn/ui, TipTap, `sanitize-html`, Vitest, Playwright, pnpm.

**Spec:** `docs/superpowers/specs/2026-07-31-help-center-platform-design.md`

**Out of scope for this plan (later phases):** cloning, per-tenant branding, subdomain middleware, custom domains, imports, contributor portal, invites, gated centers, semantic search.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `supabase/migrations/0001_initial_schema.sql` | Every table from the spec |
| `supabase/migrations/0002_search_function.sql` | `search_help_center()` SQL function |
| `supabase/seed.sql` | The base help center row |
| `lib/db/client.ts` | Server-side Supabase clients (service role and user-scoped) |
| `lib/db/types.ts` | Generated database types (do not hand-edit) |
| `lib/content/types.ts` | `CanonicalArticle`, `ArticlePlacement`, `EffectiveArticle`, and collection equivalents |
| `lib/content/merge.ts` | Pure override-merge functions |
| `lib/content/queries.ts` | Effective read queries; the only module joining placement tables |
| `lib/content/mutations.ts` | Create, update, publish server-side operations |
| `lib/content/slug.ts` | Slug generation and uniqueness |
| `lib/content/html.ts` | HTML sanitizing and plain-text extraction |
| `lib/tenancy/active.ts` | `getActiveHelpCenter()` — returns the base center in Phase 1 |
| `lib/authz/authorize.ts` | The single authorization decision point |
| `lib/search/index-article.ts` | Writes `article_search` rows |
| `lib/search/search.ts` | Calls `search_help_center()` |
| `app/admin/layout.tsx` | Auth gate and admin navigation |
| `app/admin/collections/page.tsx` + `actions.ts` | Collection list and CRUD actions |
| `app/admin/articles/page.tsx` + `actions.ts` | Article list and CRUD actions |
| `app/admin/articles/[id]/page.tsx` | Editor page shell |
| `components/editor/article-editor.tsx` | TipTap client component |
| `app/(public)/page.tsx` | Home: search plus collection grid |
| `app/(public)/[collectionSlug]/page.tsx` | Collection article list |
| `app/(public)/[collectionSlug]/[articleSlug]/page.tsx` | Article reader |
| `app/(public)/search/page.tsx` | Full search results |
| `app/api/search/route.ts` | JSON endpoint for the header dropdown |

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `app/layout.tsx`, `app/globals.css`, `vitest.config.ts`, `.env.local.example`, `.gitignore` (modify)

- [x] **Step 1: Create the Next.js app in the existing directory**

`--src-dir false` is not a valid create-next-app flag; use `--no-src-dir` instead. Also, create-next-app refuses to scaffold into a directory whose package name (derived from the directory name) contains capital letters — `GKB` triggers this. What actually worked: move `README.md` and `.gitignore` aside, scaffold into a scratch directory with a lowercase name, then `rsync` the generated files (excluding `node_modules` and `.git`) into the repo root, rename `"name"` back to `"gkb"` in `package.json`, and restore/merge our `README.md` and `.gitignore`:

```bash
mkdir -p /tmp/scaffold-tmp
cd /tmp/scaffold-tmp
pnpm create next-app@latest gkb-app --ts --tailwind --app --eslint --no-src-dir --import-alias "@/*" --use-pnpm --yes --disable-git
rsync -a --exclude 'node_modules' --exclude '.git' /tmp/scaffold-tmp/gkb-app/ /Users/ryan/GKB/
# then: fix package.json "name" to "gkb", restore our README.md, merge .gitignore (dedup)
```

Additionally, `pnpm install` in this environment blocks on native postinstall scripts (`sharp`, `unrs-resolver`) unless approved/denied explicitly. Ran `pnpm approve-builds` and declined both (they're optional; not needed for this scaffold) — this also required regenerating `pnpm-lock.yaml`/`node_modules` inside the real repo directory via a plain `pnpm install` after the copy.

Also note: our `.gitignore`'s Next.js-generated `.env*` line ignores `.env.local.example` too. Added `!.env.local.example` at the end of the env-files block so the template stays trackable.

- [x] **Step 2: Install runtime dependencies**

```bash
pnpm add @supabase/supabase-js @supabase/ssr sanitize-html @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-link @tiptap/extension-image @tiptap/extension-placeholder lucide-react clsx tailwind-merge
```

- [x] **Step 3: Install dev dependencies**

```bash
pnpm add -D vitest @types/sanitize-html supabase
```

- [x] **Step 4: Create the Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
```

- [x] **Step 5: Add scripts to `package.json`**

Add these entries to the `scripts` object, keeping the existing `dev`, `build`, `start`, and `lint`:

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "db:start": "supabase start",
  "db:reset": "supabase db reset",
  "db:types": "supabase gen types typescript --local > lib/db/types.ts"
}
```

- [x] **Step 6: Create the environment template**

Create `.env.local.example`:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Correction (Task 2): this machine's `supabase/config.toml` was reassigned to non-default ports to avoid
colliding with other local Supabase projects, so the actual `.env.local`/`.env.local.example` API URL
is `http://127.0.0.1:54721`, not `54321`.

- [x] **Step 7: Ignore local Supabase state**

Append to `.gitignore`:

```
supabase/.temp
supabase/.branches
.env.local
```

- [x] **Step 8: Verify the app builds**

Run: `pnpm build`
Expected: build completes with no errors.

- [x] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Tailwind, Vitest, and Supabase tooling"
```

---

## Task 2: Database schema

**Files:**
- Create: `supabase/migrations/0001_initial_schema.sql`, `supabase/seed.sql`

- [ ] **Step 1: Initialize Supabase locally**

```bash
pnpm supabase init
pnpm supabase start
```

Expected: prints an API URL, anon key, and service role key. Copy them into `.env.local`.

Correction: if this machine already has other local Supabase projects running (check with
`docker ps --format '{{.Names}}\t{{.Ports}}'`), the default ports (54321-54329) will collide and
`pnpm supabase start` will fail with `port is already allocated`. Fix by editing the port numbers in
`supabase/config.toml` (`api.port`, `db.port`, `db.shadow_port`, `db.pooler.port`, `studio.port`,
`local_smtp.port`, and the analytics port near the bottom) to an unused range, then retry.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/0001_initial_schema.sql` with the complete schema. Copy it verbatim from the "Schema" section of `docs/superpowers/specs/2026-07-31-help-center-platform-design.md`, with these two changes:

Make `article_search.search_vector` a generated column instead of a plain `tsvector`:

```sql
  search_vector  tsvector generated always as (
                   setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
                   setweight(to_tsvector('english', coalesce(body_text, '')), 'B')
                 ) stored,
```

And add an `updated_at` trigger at the end of the file:

```sql
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger help_centers_updated_at before update on help_centers
  for each row execute function set_updated_at();
create trigger collections_updated_at before update on collections
  for each row execute function set_updated_at();
create trigger articles_updated_at before update on articles
  for each row execute function set_updated_at();
```

- [ ] **Step 3: Write the seed**

Create `supabase/seed.sql`:

```sql
insert into help_centers (slug, name, is_base, primary_hex, secondary_hex, settings)
values (
  'base',
  'Base Help Center',
  true,
  '#1f6feb',
  '#6e7781',
  '{"headline": "How can we help?", "subtitle": "Search our guides or browse by topic."}'
)
on conflict (slug) do nothing;
```

- [ ] **Step 4: Apply the migration and seed**

Run: `pnpm db:reset`
Expected: `Applying migration 0001_initial_schema.sql...` then `Seeding data supabase/seed.sql...` with no errors.

- [ ] **Step 5: Verify the base help center exists**

```bash
pnpm supabase db query "select slug, is_base from help_centers" --local
```

Correction: the installed CLI (supabase 2.110.0) has no `db execute` subcommand; the working
equivalent is `supabase db query <sql> --local`.

Expected: one row, `base | t`.

- [ ] **Step 6: Generate types**

Run: `mkdir -p lib/db && pnpm db:types`
Expected: `lib/db/types.ts` created containing `export type Database`.

Correction: the `lib/db` directory does not exist yet on a fresh checkout (Task 1 does not create
`lib/`), and shell output redirection (`> lib/db/types.ts`) does not create missing parent
directories, so the bare `pnpm db:types` command fails with `No such file or directory` until the
directory exists.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add initial database schema and base help center seed"
```

---

## Task 3: Database clients

**Files:**
- Create: `lib/db/client.ts`

- [ ] **Step 1: Write the clients**

Create `lib/db/client.ts`:

```ts
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './types'

/**
 * Full-access client for server-side reads and writes. Never import this into a
 * client component. Every mutation using it must call authorize() first.
 */
export function serviceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

/** User-scoped client that reads the session from cookies. Use for auth checks. */
export async function userClient() {
  const cookieStore = await cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Called from a Server Component render, where cookies are read-only.
            // Session refresh happens in middleware instead.
          }
        },
      },
    },
  )
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/db/client.ts
git commit -m "feat: add server-side Supabase clients"
```

---

## Task 4: Content types

**Files:**
- Create: `lib/content/types.ts`

- [ ] **Step 1: Write the types**

Create `lib/content/types.ts`:

```ts
export type ArticleStatus = 'draft' | 'in_review' | 'published' | 'archived'
export type Audience = 'public' | 'authenticated'

/** A ProseMirror document. Opaque to everything except the editor. */
export type BodyJson = Record<string, unknown>

export type CanonicalArticle = {
  id: string
  slug: string
  title: string
  excerpt: string | null
  bodyJson: BodyJson
  bodyHtml: string
  collectionId: string | null
  status: ArticleStatus
  publishedAt: string | null
}

export type ArticlePlacement = {
  helpCenterId: string
  articleId: string
  position: number
  isHidden: boolean
  titleOverride: string | null
  bodyJsonOverride: BodyJson | null
  bodyHtmlOverride: string | null
  collectionOverrideId: string | null
}

export type EffectiveArticle = CanonicalArticle & {
  position: number
  isHidden: boolean
  /** True when any field on this article is overridden in this help center. */
  isOverridden: boolean
}

export type CanonicalCollection = {
  id: string
  slug: string
  title: string
  description: string | null
  icon: string | null
}

export type CollectionPlacement = {
  helpCenterId: string
  collectionId: string
  position: number
  isHidden: boolean
  titleOverride: string | null
  descriptionOverride: string | null
  audience: Audience
}

export type EffectiveCollection = CanonicalCollection & {
  position: number
  isHidden: boolean
  audience: Audience
  isOverridden: boolean
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/content/types.ts
git commit -m "feat: add content model types"
```

---

## Task 5: Override merge — article title

**Files:**
- Create: `lib/content/merge.test.ts`, `lib/content/merge.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/content/merge.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mergeArticle } from './merge'
import type { ArticlePlacement, CanonicalArticle } from './types'

const canonical: CanonicalArticle = {
  id: 'a1',
  slug: 'cancel-subscription',
  title: 'Cancel your subscription',
  excerpt: 'How to cancel.',
  bodyJson: { type: 'doc', content: [] },
  bodyHtml: '<p>Canonical body</p>',
  collectionId: 'c1',
  status: 'published',
  publishedAt: '2026-07-01T00:00:00Z',
}

const placement: ArticlePlacement = {
  helpCenterId: 'h1',
  articleId: 'a1',
  position: 3,
  isHidden: false,
  titleOverride: null,
  bodyJsonOverride: null,
  bodyHtmlOverride: null,
  collectionOverrideId: null,
}

describe('mergeArticle title', () => {
  it('inherits the canonical title when no placement exists', () => {
    const result = mergeArticle(canonical, null)
    expect(result.title).toBe('Cancel your subscription')
    expect(result.isOverridden).toBe(false)
  })

  it('inherits the canonical title when the override is null', () => {
    expect(mergeArticle(canonical, placement).title).toBe('Cancel your subscription')
  })

  it('uses the override when one is set', () => {
    const result = mergeArticle(canonical, { ...placement, titleOverride: 'Stop billing' })
    expect(result.title).toBe('Stop billing')
    expect(result.isOverridden).toBe(true)
  })

  it('treats an empty or whitespace-only override as inherit', () => {
    expect(mergeArticle(canonical, { ...placement, titleOverride: '' }).title).toBe(
      'Cancel your subscription',
    )
    expect(mergeArticle(canonical, { ...placement, titleOverride: '   ' }).title).toBe(
      'Cancel your subscription',
    )
    expect(mergeArticle(canonical, { ...placement, titleOverride: '  ' }).isOverridden).toBe(
      false,
    )
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run lib/content/merge.test.ts`
Expected: FAIL — `Failed to resolve import "./merge"`.

- [ ] **Step 3: Write the minimal implementation**

Create `lib/content/merge.ts`:

```ts
import type { ArticlePlacement, CanonicalArticle, EffectiveArticle } from './types'

/** Null, empty, and whitespace-only override values all mean "inherit". */
function normalizeOverride(value: string | null | undefined): string | null {
  if (value == null) return null
  return value.trim() === '' ? null : value
}

export function mergeArticle(
  canonical: CanonicalArticle,
  placement: ArticlePlacement | null,
): EffectiveArticle {
  const title = normalizeOverride(placement?.titleOverride)

  return {
    ...canonical,
    title: title ?? canonical.title,
    position: placement?.position ?? 0,
    isHidden: placement?.isHidden ?? false,
    isOverridden: title !== null,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run lib/content/merge.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/content/merge.ts lib/content/merge.test.ts
git commit -m "feat: merge article title overrides"
```

---

## Task 6: Override merge — body and collection

**Files:**
- Modify: `lib/content/merge.test.ts`, `lib/content/merge.ts`

- [ ] **Step 1: Write the failing test**

Append to `lib/content/merge.test.ts`:

```ts
describe('mergeArticle body', () => {
  it('inherits the canonical body when no override is set', () => {
    const result = mergeArticle(canonical, placement)
    expect(result.bodyHtml).toBe('<p>Canonical body</p>')
  })

  it('replaces both body fields together when html is overridden', () => {
    const overrideJson = { type: 'doc', content: [{ type: 'paragraph' }] }
    const result = mergeArticle(canonical, {
      ...placement,
      bodyHtmlOverride: '<p>Local body</p>',
      bodyJsonOverride: overrideJson,
    })
    expect(result.bodyHtml).toBe('<p>Local body</p>')
    expect(result.bodyJson).toEqual(overrideJson)
    expect(result.isOverridden).toBe(true)
  })

  it('keeps the canonical json when only html is overridden', () => {
    const result = mergeArticle(canonical, {
      ...placement,
      bodyHtmlOverride: '<p>Local body</p>',
    })
    expect(result.bodyHtml).toBe('<p>Local body</p>')
    expect(result.bodyJson).toEqual(canonical.bodyJson)
  })

  it('ignores a json override with no html override, because html is what renders', () => {
    const result = mergeArticle(canonical, {
      ...placement,
      bodyJsonOverride: { type: 'doc', content: [{ type: 'paragraph' }] },
    })
    expect(result.bodyHtml).toBe('<p>Canonical body</p>')
    expect(result.bodyJson).toEqual(canonical.bodyJson)
    expect(result.isOverridden).toBe(false)
  })
})

describe('mergeArticle collection', () => {
  it('inherits the canonical collection', () => {
    expect(mergeArticle(canonical, placement).collectionId).toBe('c1')
  })

  it('files the article under the override collection when set', () => {
    const result = mergeArticle(canonical, { ...placement, collectionOverrideId: 'c2' })
    expect(result.collectionId).toBe('c2')
    expect(result.isOverridden).toBe(true)
  })

  it('does not count a collection override that matches the canonical value', () => {
    const result = mergeArticle(canonical, { ...placement, collectionOverrideId: 'c1' })
    expect(result.collectionId).toBe('c1')
    expect(result.isOverridden).toBe(false)
  })
})
```

This step also appends one more test to the `mergeArticle title` describe block from Task 5, closing the same gap for the title field:

```ts
  it('does not count a title override that matches the canonical value', () => {
    const result = mergeArticle(canonical, {
      ...placement,
      titleOverride: 'Cancel your subscription',
    })
    expect(result.title).toBe('Cancel your subscription')
    expect(result.isOverridden).toBe(false)
  })
```

```ts
describe('mergeArticle placement flags', () => {
  it('carries position and hidden through', () => {
    const result = mergeArticle(canonical, { ...placement, position: 7, isHidden: true })
    expect(result.position).toBe(7)
    expect(result.isHidden).toBe(true)
  })

  it('defaults position to 0 and hidden to false without a placement', () => {
    const result = mergeArticle(canonical, null)
    expect(result.position).toBe(0)
    expect(result.isHidden).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run lib/content/merge.test.ts`
Expected: FAIL — the body override tests fail because `mergeArticle` ignores body fields; the two
"does not count a ... override that matches the canonical value" tests fail because `isOverridden`
is set from mere presence of an override field rather than whether it changes the effective value.

- [ ] **Step 3: Write the implementation**

Replace the body of `mergeArticle` in `lib/content/merge.ts`:

```ts
export function mergeArticle(
  canonical: CanonicalArticle,
  placement: ArticlePlacement | null,
): EffectiveArticle {
  const title = normalizeOverride(placement?.titleOverride)
  const bodyHtml = normalizeOverride(placement?.bodyHtmlOverride)
  const collectionId = placement?.collectionOverrideId ?? null

  // Body json and html are a pair. Html is what renders, so an override only
  // counts when html is present; json follows it when supplied.
  const bodyJson = bodyHtml !== null ? (placement?.bodyJsonOverride ?? canonical.bodyJson) : canonical.bodyJson

  // An override only counts toward isOverridden when it actually changes the
  // effective value — a placement field equal to the canonical value is a
  // no-op, not a local edit.
  const titleChanged = title !== null && title !== canonical.title
  const bodyChanged = bodyHtml !== null && bodyHtml !== canonical.bodyHtml
  const collectionChanged = collectionId !== null && collectionId !== canonical.collectionId

  return {
    ...canonical,
    title: title ?? canonical.title,
    bodyHtml: bodyHtml ?? canonical.bodyHtml,
    bodyJson,
    collectionId: collectionId ?? canonical.collectionId,
    position: placement?.position ?? 0,
    isHidden: placement?.isHidden ?? false,
    isOverridden: titleChanged || bodyChanged || collectionChanged,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run lib/content/merge.test.ts`
Expected: PASS — 15 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/content/merge.ts lib/content/merge.test.ts
git commit -m "feat: merge article body and collection overrides"
```

---

## Task 7: Override merge — collections

**Files:**
- Modify: `lib/content/merge.test.ts`, `lib/content/merge.ts`

- [ ] **Step 1: Write the failing test**

Append to `lib/content/merge.test.ts`:

```ts
import { mergeCollection } from './merge'
import type { CanonicalCollection, CollectionPlacement } from './types'

const canonicalCollection: CanonicalCollection = {
  id: 'c1',
  slug: 'billing',
  title: 'Billing',
  description: 'Invoices and payments.',
  icon: 'credit-card',
}

const collectionPlacement: CollectionPlacement = {
  helpCenterId: 'h1',
  collectionId: 'c1',
  position: 2,
  isHidden: false,
  titleOverride: null,
  descriptionOverride: null,
  audience: 'public',
}

describe('mergeCollection', () => {
  it('inherits canonical fields when nothing is overridden', () => {
    const result = mergeCollection(canonicalCollection, collectionPlacement)
    expect(result.title).toBe('Billing')
    expect(result.description).toBe('Invoices and payments.')
    expect(result.position).toBe(2)
    expect(result.audience).toBe('public')
    expect(result.isOverridden).toBe(false)
  })

  it('applies title and description overrides', () => {
    const result = mergeCollection(canonicalCollection, {
      ...collectionPlacement,
      titleOverride: 'Payments',
      descriptionOverride: 'Cards and receipts.',
    })
    expect(result.title).toBe('Payments')
    expect(result.description).toBe('Cards and receipts.')
    expect(result.isOverridden).toBe(true)
  })

  it('carries hidden and authenticated audience through', () => {
    const result = mergeCollection(canonicalCollection, {
      ...collectionPlacement,
      isHidden: true,
      audience: 'authenticated',
    })
    expect(result.isHidden).toBe(true)
    expect(result.audience).toBe('authenticated')
  })

  it('defaults audience to authenticated to fail closed without a placement', () => {
    const result = mergeCollection(canonicalCollection, null)
    expect(result.audience).toBe('authenticated')
  })

  it('does not count title or description overrides that match the canonical values', () => {
    const result = mergeCollection(canonicalCollection, {
      ...collectionPlacement,
      titleOverride: 'Billing',
      descriptionOverride: 'Invoices and payments.',
    })
    expect(result.title).toBe('Billing')
    expect(result.description).toBe('Invoices and payments.')
    expect(result.isOverridden).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run lib/content/merge.test.ts`
Expected: FAIL — `mergeCollection is not a function`. Once `mergeCollection` exists, the
"defaults audience to authenticated" test still fails until the default below is changed from
`'public'` to `'authenticated'`, because audience must fail closed when there is no placement row.

- [ ] **Step 3: Write the implementation**

Append to `lib/content/merge.ts`:

```ts
import type {
  CanonicalCollection,
  CollectionPlacement,
  EffectiveCollection,
} from './types'

export function mergeCollection(
  canonical: CanonicalCollection,
  placement: CollectionPlacement | null,
): EffectiveCollection {
  const title = normalizeOverride(placement?.titleOverride)
  const description = normalizeOverride(placement?.descriptionOverride)

  // Same rule as mergeArticle: a placement value equal to the canonical value
  // is a no-op, not a local edit.
  const titleChanged = title !== null && title !== canonical.title
  const descriptionChanged = description !== null && description !== canonical.description

  return {
    ...canonical,
    title: title ?? canonical.title,
    description: description ?? canonical.description,
    position: placement?.position ?? 0,
    isHidden: placement?.isHidden ?? false,
    // Fail closed: without a placement row there is no record of who may see
    // this collection, so treat it as gated rather than defaulting to public
    // and risking a leak. Queries always join a real placement row; this
    // default only guards the case where one is missing.
    audience: placement?.audience ?? 'authenticated',
    isOverridden: title !== null || description !== null,
  }
}
```

Move the `import type` line to join the existing type import at the top of the file rather than leaving two import statements.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run lib/content/merge.test.ts`
Expected: PASS — 20 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/content/merge.ts lib/content/merge.test.ts
git commit -m "feat: merge collection overrides"
```

---

## Task 8: Slug generation

**Files:**
- Create: `lib/content/slug.test.ts`, `lib/content/slug.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/content/slug.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { slugify, uniqueSlug } from './slug'

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Cancel Your Subscription')).toBe('cancel-your-subscription')
  })

  it('strips punctuation and collapses separators', () => {
    expect(slugify("What's new -- in v2.0?")).toBe('what-s-new-in-v2-0')
  })

  it('trims leading and trailing hyphens', () => {
    expect(slugify('  --Billing--  ')).toBe('billing')
  })

  it('falls back for input with no usable characters', () => {
    expect(slugify('!!!')).toBe('untitled')
  })

  it('truncates to 80 characters without a trailing hyphen', () => {
    const result = slugify('a'.repeat(100))
    expect(result).toHaveLength(80)
    expect(result.endsWith('-')).toBe(false)
  })
})

describe('uniqueSlug', () => {
  it('returns the base slug when it is free', () => {
    expect(uniqueSlug('billing', [])).toBe('billing')
  })

  it('appends the first free numeric suffix', () => {
    expect(uniqueSlug('billing', ['billing'])).toBe('billing-2')
    expect(uniqueSlug('billing', ['billing', 'billing-2'])).toBe('billing-3')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run lib/content/slug.test.ts`
Expected: FAIL — `Failed to resolve import "./slug"`.

- [ ] **Step 3: Write the implementation**

Create `lib/content/slug.ts`:

```ts
const MAX_LENGTH = 80

export function slugify(input: string): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_LENGTH)
    .replace(/-+$/g, '')

  return slug || 'untitled'
}

/** Appends -2, -3, ... until the slug does not collide with `taken`. */
export function uniqueSlug(base: string, taken: string[]): string {
  const used = new Set(taken)
  if (!used.has(base)) return base

  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`
    if (!used.has(candidate)) return candidate
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run lib/content/slug.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/content/slug.ts lib/content/slug.test.ts
git commit -m "feat: add slug generation"
```

---

## Task 9: HTML sanitizing and text extraction

**Files:**
- Create: `lib/content/html.test.ts`, `lib/content/html.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/content/html.test.ts`:

```ts
import sanitizeHtml from 'sanitize-html'
import { describe, expect, it } from 'vitest'
import { htmlToText, sanitizeArticleHtml } from './html'

describe('sanitizeArticleHtml', () => {
  it('keeps prose markup', () => {
    const html = '<h2>Steps</h2><p>Click <strong>Save</strong>.</p><ul><li>One</li></ul>'
    expect(sanitizeArticleHtml(html)).toBe(html)
  })

  it('removes script tags and their contents', () => {
    expect(sanitizeArticleHtml('<p>Hi</p><script>alert(1)</script>')).toBe('<p>Hi</p>')
  })

  it('strips event handler attributes', () => {
    expect(sanitizeArticleHtml('<p onclick="steal()">Hi</p>')).toBe('<p>Hi</p>')
  })

  it('rejects javascript: urls on links', () => {
    expect(sanitizeArticleHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>')
  })

  it('keeps images with src and alt', () => {
    const html = '<img src="https://cdn.example.com/a.png" alt="Screenshot" />'
    expect(sanitizeArticleHtml(html)).toContain('src="https://cdn.example.com/a.png"')
    expect(sanitizeArticleHtml(html)).toContain('alt="Screenshot"')
  })
})

describe('render-boundary defense for search headlines', () => {
  // htmlToText's output (body_text) is not guaranteed free of "<" — see the
  // comment on htmlToText. The XSS defense for its one HTML-rendered
  // consumer lives here instead: Postgres ts_headline wraps matches in
  // body_text with <mark> and does not escape the rest of the string, so
  // lib/search/search.ts re-sanitizes ts_headline's output down to
  // allowedTags: ['mark'] before it is ever rendered. This test documents
  // and locks in that guarantee.
  it('strips everything except <mark> from ts_headline-shaped input', () => {
    const headline = sanitizeHtml('<script>alert(1)</script> and <mark>hit</mark>', {
      allowedTags: ['mark'],
      allowedAttributes: {},
    })
    expect(headline).toBe(' and <mark>hit</mark>')
  })
})

describe('htmlToText', () => {
  it('returns readable text with words separated', () => {
    expect(htmlToText('<h2>Billing</h2><p>Cancel <em>anytime</em>.</p>')).toBe(
      'Billing Cancel anytime .',
    )
  })

  it('drops script contents', () => {
    expect(htmlToText('<p>Hi</p><script>secret</script>')).toBe('Hi')
  })

  it('returns an empty string for empty input', () => {
    expect(htmlToText('')).toBe('')
  })

  it('never lets an unclosed tag survive as markup', () => {
    const result = htmlToText('<p>hi<img src=x onerror=alert(1)')
    expect(result).not.toContain('<')
    expect(result).not.toContain('onerror')
  })

  it('preserves prose that merely contains angle brackets', () => {
    expect(htmlToText('a < b and c > d')).toBe('a < b and c > d')
  })

  it('decodes named entities', () => {
    expect(htmlToText('<p>Tom &amp; Jerry said &quot;hi&quot;</p>')).toBe(
      'Tom & Jerry said "hi"',
    )
  })

  it('decodes an escaped angle bracket back to prose', () => {
    expect(htmlToText('<p>5 &lt; 10</p>')).toBe('5 < 10')
  })

  it('decodes numeric entities into inert text, not markup', () => {
    const result = htmlToText('&#106;avascript:alert(1)')
    expect(result).toBe('javascript:alert(1)')
    expect(result).not.toContain('<')
  })

  it('strips a nested/malformed script attempt entirely', () => {
    const result = htmlToText('<scr<script>ipt>alert(1)</script>')
    expect(result).not.toContain('<')
    expect(result.toLowerCase()).not.toContain('script')
  })

  // SECURITY: decoding entities more than once is a bug, not an improvement.
  // Double-encoded input like "&amp;lt;script&amp;gt;" must decode to the
  // single-decoded literal text "&lt;script&gt;" — what a reader actually
  // typed — and go no further. A second decode pass would turn that inert
  // text into live-looking "<script>" markup. Do not add one.
  it('decodes double-encoded input exactly once, not into live markup', () => {
    expect(htmlToText('&amp;lt;script&amp;gt;')).toBe('&lt;script&gt;')
  })

  it('decodes a double-encoded ampersand exactly once', () => {
    expect(htmlToText('&amp;amp;')).toBe('&amp;')
  })

  it('decodes a double-encoded numeric reference exactly once', () => {
    expect(htmlToText('&amp;#60;')).toBe('&#60;')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run lib/content/html.test.ts`
Expected: FAIL — `Failed to resolve import "./html"`.

- [ ] **Step 3: Write the implementation**

Create `lib/content/html.ts`:

```ts
import sanitizeHtml from 'sanitize-html'

const ARTICLE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'h2', 'h3', 'h4', 'p', 'strong', 'em', 'u', 's', 'code', 'pre', 'blockquote',
    'ul', 'ol', 'li', 'a', 'img', 'hr', 'br', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    '*': ['class'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }, true),
  },
}

/** Sanitizes editor or imported HTML before it is stored or rendered. */
export function sanitizeArticleHtml(html: string): string {
  return sanitizeHtml(html, ARTICLE_OPTIONS)
}

/**
 * Decodes the handful of HTML entities that can appear in sanitizer output
 * (named entities plus numeric character references) so callers get genuine
 * plain text rather than escaped markup. `&amp;` is decoded last so an
 * entity like `&amp;lt;` does not double-decode into `<`.
 *
 * SECURITY: callers must invoke this exactly once per input. Decoding twice
 * (or looping until a fixed point) can turn inert escaped text such as
 * `&amp;lt;script&amp;gt;` — which decodes once to the harmless literal
 * string `&lt;script&gt;` — into live-looking markup `<script>` on a second
 * pass. `htmlToText` below relies on single-decode semantics for safety; do
 * not add a second call to "helpfully" catch more entities.
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

/**
 * Plain text for search indexing and excerpts.
 *
 * Hand-rolled tag stripping (a regex like `/<[^>]+>/g`) is unsafe here: it
 * cannot see across an unclosed tag, so a fragment like `<img src=x
 * onerror=alert(1)` (no closing `>`) survives verbatim, and a naive "delete
 * everything between < and >" approach also destroys legitimate prose like
 * "a < b and c > d". Instead this parses the input with the real HTML parser
 * first — which normalizes and closes malformed markup and escapes bare `<`
 * in prose to `&lt;` — before tag boundaries are turned into spaces and any
 * remaining tags are stripped. Entities are decoded exactly once at the end
 * so the result is genuine plain text.
 *
 * This function does NOT guarantee its output is free of `<` — plain text
 * can legitimately contain it (e.g. "if x < y"), and there is no safe way to
 * strip it without also destroying real prose or reopening the double-decode
 * bug described on `decodeHtmlEntities`. XSS safety for the two consumers of
 * this text is enforced elsewhere: `body_text` is only ever rendered through
 * `ts_headline`, whose output is re-sanitized down to `allowedTags: ['mark']`
 * before it reaches the page (see `searchHelpCenter` in
 * `lib/search/search.ts`), and `excerpt` is rendered through JSX, which
 * escapes text nodes automatically. Do not add tag-stripping here to
 * compensate for a render site that fails to sanitize or escape — fix that
 * render site instead.
 */
export function htmlToText(html: string): string {
  const wellFormed = sanitizeHtml(html, ARTICLE_OPTIONS)
  const spaced = wellFormed.replace(/<[^>]+>/g, ' ')
  const stripped = sanitizeHtml(spaced, { allowedTags: [], allowedAttributes: {} })
  return decodeHtmlEntities(stripped).replace(/\s+/g, ' ').trim()
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run lib/content/html.test.ts`
Expected: PASS — 18 tests. If the link test fails because `rel` is added to the bare `<a>`, change that assertion to `expect(...).not.toContain('javascript:')` — never weaken the sanitizer to satisfy the test.

Correction: the plan's original `htmlToText` implementation (a single `sanitizeHtml({allowedTags: []})`
call) has two real bugs found in adversarial review: it only matches tags with a closing `>`, so an
unclosed tag like `<img src=x onerror=alert(1)` (no `>`) survives verbatim in the output, and stripping
tag boundaries without first parsing malformed markup destroys legitimate prose like `"a < b and c > d"`.
The fix is to parse first with the real parser (`sanitizeHtml` with `ARTICLE_OPTIONS`, which normalizes
and closes malformed tags and escapes bare `<` in prose to `&lt;`), then space out tag boundaries, strip
what remains, and decode HTML entities exactly once.

An earlier attempted fix added a second parse-and-decode pass to catch tag-like text reconstituted by
decoding (e.g. an orphaned `&lt;/script&gt;`). That was itself a bug: double-encoded input such as
`&amp;lt;script&amp;gt;` decodes once to the inert literal text `&lt;script&gt;`, but a second decode
pass turns that same text into live `<script>` markup — the "fix" reopened the exact hole it was meant
to close, and no amount of further passes would end the arms race. The correct model is that
`htmlToText` returns honest plain text, which can legitimately contain `<` (e.g. "if x < y"), and that
XSS safety belongs at the render boundary, not in the text extractor: `body_text` is only ever rendered
through `ts_headline`, whose output is re-sanitized down to `allowedTags: ['mark']` in Task 14's
`searchHelpCenter` before reaching the page, and `excerpt` is rendered through JSX, which escapes text
automatically. The implementation above reflects the final, single-decode design; the test count grew
from the original 8 to 18, covering the malformed-markup, prose-preservation, entity-decoding, and
single-decode-safety cases, and adding one test (in the `render-boundary defense` describe block) that
locks in the `allowedTags: ['mark']` guarantee Task 14 depends on.

- [ ] **Step 5: Commit**

```bash
git add lib/content/html.ts lib/content/html.test.ts
git commit -m "feat: add article HTML sanitizing and text extraction"
```

---

## Task 10: Active help center

**Files:**
- Create: `lib/tenancy/active.ts`

- [ ] **Step 1: Write the implementation**

Phase 1 has exactly one help center, so resolution reads the base row. Phase 2 replaces the body of this function with host-based lookup; every caller keeps working.

Create `lib/tenancy/active.ts`:

```ts
import { cache } from 'react'
import { serviceClient } from '@/lib/db/client'

export type ActiveHelpCenter = {
  id: string
  slug: string
  name: string
  primaryHex: string
  secondaryHex: string
  logoUrl: string | null
  visibility: 'public' | 'authenticated'
  settings: { headline?: string; subtitle?: string }
}

const VALID_VISIBILITIES = ['public', 'authenticated'] as const

/**
 * Narrows the raw `visibility` column to the known union, throwing rather
 * than letting an unexpected value silently flow into access-gating logic —
 * this field decides whether the whole help center is publicly readable.
 */
function parseVisibility(value: string): ActiveHelpCenter['visibility'] {
  if ((VALID_VISIBILITIES as readonly string[]).includes(value)) {
    return value as ActiveHelpCenter['visibility']
  }
  throw new Error(`Unexpected help_centers.visibility value: ${value}`)
}

/**
 * The help center serving the current request. Phase 1 always returns the base
 * center; Phase 2 resolves it from the Host header.
 */
export const getActiveHelpCenter = cache(async (): Promise<ActiveHelpCenter> => {
  const { data, error } = await serviceClient()
    .from('help_centers')
    .select('id, slug, name, primary_hex, secondary_hex, logo_url, visibility, settings')
    .eq('is_base', true)
    .single()

  if (error || !data) {
    throw new Error(`No base help center found: ${error?.message ?? 'missing row'}`)
  }

  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    primaryHex: data.primary_hex,
    secondaryHex: data.secondary_hex,
    logoUrl: data.logo_url,
    visibility: parseVisibility(data.visibility),
    settings: (data.settings ?? {}) as ActiveHelpCenter['settings'],
  }
})
```

Correction: `data.visibility as ActiveHelpCenter['visibility']` is an unchecked cast on a field that
gates access to the whole help center. `parseVisibility` validates it at runtime against the known
union and throws a clear error otherwise, rather than letting an unexpected column value flow into
gating logic unchecked. The `settings` cast is left as-is.

- [ ] **Step 2: Verify it type-checks**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/tenancy/active.ts
git commit -m "feat: resolve the active help center"
```

---

## Task 11: Authorization

**Files:**
- Create: `lib/authz/authorize.test.ts`, `lib/authz/authorize.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/authz/authorize.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { can, type Actor } from './authorize'

const owner: Actor = { userId: 'u1', memberships: [{ helpCenterId: null, role: 'owner' }] }
const staff: Actor = { userId: 'u2', memberships: [{ helpCenterId: null, role: 'staff' }] }
const editor: Actor = { userId: 'u3', memberships: [{ helpCenterId: 'h1', role: 'editor' }] }
const contributor: Actor = {
  userId: 'u4',
  memberships: [{ helpCenterId: 'h1', role: 'contributor' }],
}
const anonymous: Actor = { userId: null, memberships: [] }

describe('can', () => {
  it('lets staff manage content anywhere', () => {
    expect(can(staff, 'article.publish', { helpCenterId: 'h2' })).toBe(true)
    expect(can(staff, 'collection.create', {})).toBe(true)
  })

  it('lets owners delete help centers but not staff', () => {
    expect(can(owner, 'helpCenter.delete', { helpCenterId: 'h1' })).toBe(true)
    expect(can(staff, 'helpCenter.delete', { helpCenterId: 'h1' })).toBe(false)
  })

  it('scopes editors to their own help center', () => {
    expect(can(editor, 'article.publish', { helpCenterId: 'h1' })).toBe(true)
    expect(can(editor, 'article.publish', { helpCenterId: 'h2' })).toBe(false)
  })

  it('lets contributors write but never publish', () => {
    expect(can(contributor, 'article.create', { helpCenterId: 'h1' })).toBe(true)
    expect(can(contributor, 'article.publish', { helpCenterId: 'h1' })).toBe(false)
  })

  it('denies everything to anonymous actors', () => {
    expect(can(anonymous, 'article.create', { helpCenterId: 'h1' })).toBe(false)
    expect(can(anonymous, 'collection.create', {})).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run lib/authz/authorize.test.ts`
Expected: FAIL — `Failed to resolve import "./authorize"`.

- [ ] **Step 3: Write the implementation**

Create `lib/authz/authorize.ts`:

```ts
import { userClient, serviceClient } from '@/lib/db/client'

export type Role = 'owner' | 'staff' | 'editor' | 'contributor'

/** help_center_id null means the membership is global (owner and staff only). */
export type Membership = { helpCenterId: string | null; role: Role }

export type Actor = { userId: string | null; memberships: Membership[] }

export type Action =
  | 'article.create'
  | 'article.update'
  | 'article.publish'
  | 'article.delete'
  | 'collection.create'
  | 'collection.update'
  | 'collection.delete'
  | 'helpCenter.update'
  | 'helpCenter.delete'

type Resource = { helpCenterId?: string }

const GLOBAL_ROLES: Role[] = ['owner', 'staff']

/** Actions a role may take within its scope. */
const ALLOWED: Record<Role, Action[]> = {
  owner: [
    'article.create', 'article.update', 'article.publish', 'article.delete',
    'collection.create', 'collection.update', 'collection.delete',
    'helpCenter.update', 'helpCenter.delete',
  ],
  staff: [
    'article.create', 'article.update', 'article.publish', 'article.delete',
    'collection.create', 'collection.update', 'collection.delete',
    'helpCenter.update',
  ],
  editor: ['article.create', 'article.update', 'article.publish', 'helpCenter.update'],
  contributor: ['article.create', 'article.update'],
}

export function can(actor: Actor, action: Action, resource: Resource): boolean {
  if (!actor.userId) return false

  return actor.memberships.some((membership) => {
    if (!ALLOWED[membership.role].includes(action)) return false

    const isGlobal = membership.helpCenterId === null && GLOBAL_ROLES.includes(membership.role)
    if (isGlobal) return true

    return resource.helpCenterId !== undefined && membership.helpCenterId === resource.helpCenterId
  })
}

/** Loads the signed-in actor, or an anonymous actor when there is no session. */
export async function currentActor(): Promise<Actor> {
  const { data } = await (await userClient()).auth.getUser()
  if (!data.user) return { userId: null, memberships: [] }

  const { data: rows } = await serviceClient()
    .from('memberships')
    .select('help_center_id, role')
    .eq('user_id', data.user.id)

  return {
    userId: data.user.id,
    memberships: (rows ?? []).map((r) => ({
      helpCenterId: r.help_center_id,
      role: r.role as Role,
    })),
  }
}

export class ForbiddenError extends Error {
  constructor(action: Action) {
    super(`Not allowed to perform ${action}`)
    this.name = 'ForbiddenError'
  }
}

/** Throws unless the current actor may perform `action`. Call first in every mutation. */
export async function authorize(action: Action, resource: Resource = {}): Promise<Actor> {
  const actor = await currentActor()
  if (!can(actor, action, resource)) throw new ForbiddenError(action)
  return actor
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run lib/authz/authorize.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/authz
git commit -m "feat: add authorization decision point"
```

---

## Task 12: Effective read queries

**Files:**
- Create: `lib/content/queries.ts`

- [ ] **Step 1: Write the implementation**

Hidden and unpublished filtering lives here so no page can forget it.

Create `lib/content/queries.ts`:

```ts
import { serviceClient } from '@/lib/db/client'
import { mergeArticle, mergeCollection } from './merge'
import type {
  ArticlePlacement,
  BodyJson,
  CanonicalArticle,
  CanonicalCollection,
  CollectionPlacement,
  EffectiveArticle,
  EffectiveCollection,
} from './types'

const ARTICLE_FIELDS =
  'id, slug, title, excerpt, body_json, body_html, collection_id, status, published_at'
const COLLECTION_FIELDS = 'id, slug, title, description, icon'

type ArticleRow = {
  id: string
  slug: string
  title: string
  excerpt: string | null
  body_json: unknown
  body_html: string
  collection_id: string | null
  status: string
  published_at: string | null
}

function toCanonicalArticle(row: ArticleRow): CanonicalArticle {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    bodyJson: (row.body_json ?? {}) as BodyJson,
    bodyHtml: row.body_html,
    collectionId: row.collection_id,
    status: row.status as CanonicalArticle['status'],
    publishedAt: row.published_at,
  }
}

type PlacementRow = {
  help_center_id: string
  article_id: string
  position: number
  is_hidden: boolean
  title_override: string | null
  body_json_override: unknown
  body_html_override: string | null
  collection_override_id: string | null
}

function toArticlePlacement(row: PlacementRow): ArticlePlacement {
  return {
    helpCenterId: row.help_center_id,
    articleId: row.article_id,
    position: row.position,
    isHidden: row.is_hidden,
    titleOverride: row.title_override,
    bodyJsonOverride: (row.body_json_override ?? null) as BodyJson | null,
    bodyHtmlOverride: row.body_html_override,
    collectionOverrideId: row.collection_override_id,
  }
}

type CollectionPlacementRow = {
  help_center_id: string
  collection_id: string
  position: number
  is_hidden: boolean
  title_override: string | null
  description_override: string | null
  audience: string
}

function toCollectionPlacement(row: CollectionPlacementRow): CollectionPlacement {
  return {
    helpCenterId: row.help_center_id,
    collectionId: row.collection_id,
    position: row.position,
    isHidden: row.is_hidden,
    titleOverride: row.title_override,
    descriptionOverride: row.description_override,
    audience: row.audience as CollectionPlacement['audience'],
  }
}

/** Visible, published collections for a help center, in display order. */
export async function listEffectiveCollections(
  helpCenterId: string,
): Promise<EffectiveCollection[]> {
  const { data, error } = await serviceClient()
    .from('help_center_collections')
    .select(
      `help_center_id, collection_id, position, is_hidden, title_override,
       description_override, audience,
       collections!inner (${COLLECTION_FIELDS})`,
    )
    .eq('help_center_id', helpCenterId)
    .eq('is_hidden', false)
    .order('position', { ascending: true })

  if (error) throw new Error(`listEffectiveCollections failed: ${error.message}`)

  return (data ?? []).map((row) => {
    const canonical = row.collections as unknown as CanonicalCollection
    return mergeCollection(canonical, toCollectionPlacement(row as CollectionPlacementRow))
  })
}

/** Visible, published articles in a collection, in display order. */
export async function listEffectiveArticles(
  helpCenterId: string,
  collectionId: string,
): Promise<EffectiveArticle[]> {
  const { data, error } = await serviceClient()
    .from('help_center_articles')
    .select(
      `help_center_id, article_id, position, is_hidden, title_override,
       body_json_override, body_html_override, collection_override_id,
       articles!inner (${ARTICLE_FIELDS})`,
    )
    .eq('help_center_id', helpCenterId)
    .eq('is_hidden', false)
    .eq('articles.status', 'published')
    .order('position', { ascending: true })

  if (error) throw new Error(`listEffectiveArticles failed: ${error.message}`)

  return (data ?? [])
    .map((row) =>
      mergeArticle(
        toCanonicalArticle(row.articles as unknown as ArticleRow),
        toArticlePlacement(row as PlacementRow),
      ),
    )
    // The collection can be overridden per help center, so filter after merging.
    .filter((article) => article.collectionId === collectionId)
}

/** One published, visible article by slug, or null. */
export async function getEffectiveArticle(
  helpCenterId: string,
  articleSlug: string,
): Promise<EffectiveArticle | null> {
  const { data, error } = await serviceClient()
    .from('help_center_articles')
    .select(
      `help_center_id, article_id, position, is_hidden, title_override,
       body_json_override, body_html_override, collection_override_id,
       articles!inner (${ARTICLE_FIELDS})`,
    )
    .eq('help_center_id', helpCenterId)
    .eq('is_hidden', false)
    .eq('articles.slug', articleSlug)
    .eq('articles.status', 'published')
    .maybeSingle()

  if (error) throw new Error(`getEffectiveArticle failed: ${error.message}`)
  if (!data) return null

  return mergeArticle(
    toCanonicalArticle(data.articles as unknown as ArticleRow),
    toArticlePlacement(data as PlacementRow),
  )
}

/** Article counts per collection, for the home page grid. */
export async function countArticlesPerCollection(
  helpCenterId: string,
): Promise<Map<string, number>> {
  const collections = await listEffectiveCollections(helpCenterId)
  const counts = new Map<string, number>()

  for (const collection of collections) {
    const articles = await listEffectiveArticles(helpCenterId, collection.id)
    counts.set(collection.id, articles.length)
  }

  return counts
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `pnpm tsc --noEmit`
Expected: no errors. If Supabase's inferred embedded-relation type conflicts with a cast, keep the `as unknown as` casts already shown rather than widening the row types.

- [ ] **Step 3: Commit**

```bash
git add lib/content/queries.ts
git commit -m "feat: add effective content read queries"
```

---

## Task 13: Search indexing

**Files:**
- Create: `lib/search/index-article.ts`

- [ ] **Step 1: Write the implementation**

Create `lib/search/index-article.ts`:

```ts
import { serviceClient } from '@/lib/db/client'
import { htmlToText } from '@/lib/content/html'
import { getEffectiveArticleForIndexing } from './effective'

/**
 * Writes the effective title and body text for one article in one help center.
 * `search_vector` is a generated column, so no vector is written here.
 */
export async function indexArticle(helpCenterId: string, articleId: string): Promise<void> {
  const effective = await getEffectiveArticleForIndexing(helpCenterId, articleId)

  if (!effective) {
    await serviceClient()
      .from('article_search')
      .delete()
      .eq('help_center_id', helpCenterId)
      .eq('article_id', articleId)
    return
  }

  const { error } = await serviceClient().from('article_search').upsert(
    {
      help_center_id: helpCenterId,
      article_id: articleId,
      title: effective.title,
      body_text: htmlToText(effective.bodyHtml),
      indexed_at: new Date().toISOString(),
    },
    { onConflict: 'help_center_id,article_id' },
  )

  if (error) throw new Error(`indexArticle failed: ${error.message}`)
}

/** Reindexes an article in every help center that publishes it. */
export async function reindexArticleEverywhere(articleId: string): Promise<void> {
  const { data, error } = await serviceClient()
    .from('help_center_articles')
    .select('help_center_id')
    .eq('article_id', articleId)

  if (error) throw new Error(`reindexArticleEverywhere failed: ${error.message}`)

  for (const row of data ?? []) {
    await indexArticle(row.help_center_id, articleId)
  }
}
```

- [ ] **Step 2: Write the indexing helper**

`getEffectiveArticle` looks up by slug and excludes hidden rows, which is wrong for indexing — hidden articles are removed from the index, and lookups happen by id. Create `lib/search/effective.ts`:

```ts
import { serviceClient } from '@/lib/db/client'
import { mergeArticle } from '@/lib/content/merge'
import type { BodyJson, CanonicalArticle, EffectiveArticle } from '@/lib/content/types'

/**
 * The effective article for indexing: looked up by id, returning null when the
 * placement is hidden or the article is not published, so callers delete the row.
 */
export async function getEffectiveArticleForIndexing(
  helpCenterId: string,
  articleId: string,
): Promise<EffectiveArticle | null> {
  const { data, error } = await serviceClient()
    .from('help_center_articles')
    .select(
      `help_center_id, article_id, position, is_hidden, title_override,
       body_json_override, body_html_override, collection_override_id,
       articles!inner (id, slug, title, excerpt, body_json, body_html,
                       collection_id, status, published_at)`,
    )
    .eq('help_center_id', helpCenterId)
    .eq('article_id', articleId)
    .maybeSingle()

  if (error) throw new Error(`getEffectiveArticleForIndexing failed: ${error.message}`)
  if (!data) return null

  const row = data.articles as unknown as {
    id: string
    slug: string
    title: string
    excerpt: string | null
    body_json: unknown
    body_html: string
    collection_id: string | null
    status: string
    published_at: string | null
  }

  if (row.status !== 'published' || data.is_hidden) return null

  const canonical: CanonicalArticle = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    bodyJson: (row.body_json ?? {}) as BodyJson,
    bodyHtml: row.body_html,
    collectionId: row.collection_id,
    status: 'published',
    publishedAt: row.published_at,
  }

  return mergeArticle(canonical, {
    helpCenterId: data.help_center_id,
    articleId: data.article_id,
    position: data.position,
    isHidden: data.is_hidden,
    titleOverride: data.title_override,
    bodyJsonOverride: (data.body_json_override ?? null) as BodyJson | null,
    bodyHtmlOverride: data.body_html_override,
    collectionOverrideId: data.collection_override_id,
  })
}
```

- [ ] **Step 3: Verify it type-checks**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/search
git commit -m "feat: index effective article text for search"
```

---

## Task 14: Search query

**Files:**
- Create: `supabase/migrations/0002_search_function.sql`, `lib/search/search.ts`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0002_search_function.sql`:

```sql
-- Keyword search within one help center. Phase 3 adds a vector CTE and fuses the
-- two rankings; the signature stays the same.
create or replace function search_help_center(
  p_help_center_id uuid,
  p_query          text,
  p_limit          integer default 20
)
returns table (
  article_id uuid,
  slug       text,
  title      text,
  headline   text,
  rank       real
)
language sql
stable
as $$
  select
    s.article_id,
    a.slug,
    s.title,
    ts_headline(
      'english',
      s.body_text,
      websearch_to_tsquery('english', p_query),
      'MaxFragments=1, MaxWords=32, MinWords=12, StartSel=<mark>, StopSel=</mark>'
    ) as headline,
    ts_rank(s.search_vector, websearch_to_tsquery('english', p_query)) as rank
  from article_search s
  join articles a on a.id = s.article_id
  where s.help_center_id = p_help_center_id
    and p_query <> ''
    and s.search_vector @@ websearch_to_tsquery('english', p_query)
  order by rank desc, s.title asc
  limit least(p_limit, 50);
$$;
```

Indexing already excludes hidden and unpublished articles, so this function needs no visibility filter.

- [ ] **Step 2: Apply the migration**

Run: `pnpm db:reset`
Expected: both migrations apply with no errors.

- [ ] **Step 3: Regenerate types**

Run: `pnpm db:types`
Expected: `lib/db/types.ts` now includes `search_help_center` under `Functions`.

- [ ] **Step 4: Write the client wrapper**

Create `lib/search/search.ts`:

```ts
import sanitizeHtml from 'sanitize-html'
import { serviceClient } from '@/lib/db/client'

export type SearchHit = {
  articleId: string
  slug: string
  title: string
  /** Body excerpt with <mark> around matches. Safe: derived from sanitized text. */
  headline: string
}

export async function searchHelpCenter(
  helpCenterId: string,
  query: string,
  limit = 20,
): Promise<SearchHit[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const { data, error } = await serviceClient().rpc('search_help_center', {
    p_help_center_id: helpCenterId,
    p_query: trimmed,
    p_limit: limit,
  })

  if (error) throw new Error(`searchHelpCenter failed: ${error.message}`)

  return (data ?? []).map((row) => ({
    articleId: row.article_id,
    slug: row.slug,
    title: row.title,
    // ts_headline does not escape its input, so body_text is re-parsed as HTML
    // here and only the <mark> tags it introduced are allowed to survive —
    // this is the last line of defense before the headline is ever rendered
    // with dangerouslySetInnerHTML.
    headline: sanitizeHtml(row.headline ?? '', { allowedTags: ['mark'], allowedAttributes: {} }),
  }))
}
```

- [ ] **Step 5: Verify it type-checks**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0002_search_function.sql lib/search/search.ts lib/db/types.ts
git commit -m "feat: add keyword search within a help center"
```

---

## Task 14b: Database grants (added during execution)

**Files:**
- Create: `supabase/migrations/0003_grants.sql`

This task was not in the original plan. Review of Tasks 12-14 found that no Supabase API
role had DML privileges on the tables created by migration 0001 — `service_role` held only
`REFERENCES`, `TRIGGER`, and `TRUNCATE`, so every server-side query failed with
`permission denied for table ...`. Nothing above Task 14 would have worked.

- [ ] **Step 1: Grant privileges to the server role only**

Create `supabase/migrations/0003_grants.sql` granting `usage` on schema `public` and all
table, sequence, and function privileges to `service_role`, plus matching
`alter default privileges` so future objects inherit them.

Grant `anon` and `authenticated` NOTHING on public tables. RLS does not arrive until
Phase 3, so any SELECT granted to those browser-reachable roles today would expose every
draft and hidden article to anyone holding the public anon key. Grant them read access in
the same change that enables RLS, never before.

- [ ] **Step 2: Verify both halves of the posture**

```bash
pnpm db:reset
```

Then confirm with the real PostgREST path — not just `information_schema` — that
`service_role` can select from a table and call `search_help_center`, and that `anon`
receives `permission denied for table articles`. Both outcomes are required: the first
proves the app works, the second proves nothing leaks.

Because this migration takes the number `0003`, Task 18's storage migration is `0004`.

---

## Task 15: Auth pages and admin gate

**Files:**
- Create: `app/login/page.tsx`, `app/login/actions.ts`, `app/auth/confirm/route.ts`, `app/admin/layout.tsx`, `middleware.ts`

- [ ] **Step 1: Write the session-refresh middleware**

Create `middleware.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          toSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Refreshes an expired session so Server Components see a valid user.
  await supabase.auth.getUser()

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|webp)$).*)'],
}
```

Next 16 still runs `middleware.ts` and honours `export const config`, but prints
"The \"middleware\" file convention is deprecated. Please use \"proxy\" instead."
Renaming to `proxy.ts` is a separate, later change.

- [ ] **Step 2: Write the login action**

Create `app/login/actions.ts`:

```ts
'use server'

import { userClient } from '@/lib/db/client'

export async function sendMagicLink(
  _prev: { error?: string; sent?: boolean } | null,
  formData: FormData,
): Promise<{ error?: string; sent?: boolean }> {
  const email = String(formData.get('email') ?? '').trim()
  if (!email) return { error: 'Enter your email address.' }

  const supabase = await userClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/auth/confirm`,
    },
  })

  if (error) return { error: error.message }
  return { sent: true }
}
```

Add `NEXT_PUBLIC_SITE_URL=http://localhost:3000` to `.env.local.example` and `.env.local`.

- [ ] **Step 3: Write the login page**

Create `app/login/page.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import { sendMagicLink } from './actions'

export default function LoginPage() {
  const [state, action, pending] = useActionState(sendMagicLink, null)

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <h1 className="text-2xl font-semibold">Sign in</h1>

      {state?.sent ? (
        <p className="text-sm text-neutral-600">
          Check your email for a sign-in link.
        </p>
      ) : (
        <form action={action} className="flex flex-col gap-3">
          <input
            name="email"
            type="email"
            required
            placeholder="you@company.com"
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-neutral-900 px-3 py-2 text-white disabled:opacity-50"
          >
            {pending ? 'Sending…' : 'Email me a link'}
          </button>
          {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        </form>
      )}
    </main>
  )
}
```

- [ ] **Step 4: Write the confirm route**

Create `app/auth/confirm/route.ts`:

```ts
import { type EmailOtpType } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { userClient } from '@/lib/db/client'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const token_hash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type') as EmailOtpType | null
  const next = url.searchParams.get('next') ?? '/admin/articles'

  if (!token_hash || !type) redirect('/login?error=invalid-link')

  const supabase = await userClient()
  const { error } = await supabase.auth.verifyOtp({ type, token_hash })
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`)

  redirect(next)
}
```

- [ ] **Step 5: Write the admin layout gate**

Create `app/admin/layout.tsx`:

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentActor } from '@/lib/authz/authorize'

const NAV = [
  { href: '/admin/articles', label: 'Articles' },
  { href: '/admin/collections', label: 'Collections' },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor()
  if (!actor.userId) redirect('/login')
  if (actor.memberships.length === 0) {
    return (
      <main className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="text-xl font-semibold">No access</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Your account is not a member of any help center yet.
        </p>
      </main>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <nav className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4">
          <span className="font-semibold">Help Center Admin</span>
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="text-sm text-neutral-600 hover:text-neutral-900">
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  )
}
```

- [ ] **Step 5b: Point the magic-link email at `/auth/confirm`**

The route above verifies the OTP server-side from a `token_hash`. GoTrue's default
`{{ .ConfirmationURL }}` instead sends the browser to its own `/verify` endpoint,
which returns the session in a URL *fragment* the server can never read — the
confirm route is never reached and no cookies are set. Override the template.

Create `supabase/templates/magic_link.html`:

```html
<h2>Sign in to the help center</h2>
<p>
  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Sign in</a>
</p>
<p>If you did not request this link you can ignore this email.</p>
```

In `supabase/config.toml`, under `[auth]`, align the URLs with `NEXT_PUBLIC_SITE_URL`
(GoTrue silently falls back to `site_url` when `redirect_to` is not allow-listed):

```toml
site_url = "http://localhost:3000"
additional_redirect_urls = ["http://localhost:3000/**", "http://127.0.0.1:3000/**"]
```

and register the template:

```toml
[auth.email.template.magic_link]
subject = "Sign in to the help center"
content_path = "./supabase/templates/magic_link.html"
```

Restart for the config to take effect: `pnpm supabase stop && pnpm supabase start`.

- [ ] **Step 6: Create an owner membership for yourself**

Sign in once at `http://localhost:3000/login` (local Supabase captures mail at
`http://127.0.0.1:54724`, Mailpit), then run:

```bash
pnpm supabase db query "insert into memberships (user_id, help_center_id, role) select id, null, 'owner' from auth.users where email='owner@example.com' on conflict do nothing" --local
```

`memberships_scope_matches_role` only permits a NULL `help_center_id` for
`owner` and `staff`.

- [ ] **Step 7: Verify the gate works**

Run `pnpm dev`, visit `/admin/articles` in a private window.
Expected: redirect to `/login`. After signing in, the admin shell renders.

- [ ] **Step 8: Commit**

```bash
git add middleware.ts app/login app/auth app/admin/layout.tsx .env.local.example \
  supabase/config.toml supabase/templates/magic_link.html
git commit -m "feat: add magic-link auth and admin gate"
```

---

## Task 16: Collection CRUD

**Files:**
- Create: `app/admin/collections/actions.ts`, `app/admin/collections/page.tsx`

- [ ] **Step 1: Write the actions**

Create `app/admin/collections/actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { serviceClient } from '@/lib/db/client'
import { authorize } from '@/lib/authz/authorize'
import { slugify, uniqueSlug } from '@/lib/content/slug'
import { getActiveHelpCenter } from '@/lib/tenancy/active'

export async function createCollection(formData: FormData): Promise<void> {
  const helpCenter = await getActiveHelpCenter()
  await authorize('collection.create', { helpCenterId: helpCenter.id })

  const title = String(formData.get('title') ?? '').trim()
  if (!title) throw new Error('Title is required.')

  const description = String(formData.get('description') ?? '').trim() || null
  const db = serviceClient()

  const { data: existing } = await db.from('collections').select('slug')
  const slug = uniqueSlug(slugify(title), (existing ?? []).map((r) => r.slug))

  const { data: collection, error } = await db
    .from('collections')
    .insert({ title, slug, description })
    .select('id')
    .single()

  if (error || !collection) throw new Error(`Could not create collection: ${error?.message}`)

  // Place it in the active help center at the end of the list.
  const { count } = await db
    .from('help_center_collections')
    .select('*', { count: 'exact', head: true })
    .eq('help_center_id', helpCenter.id)

  const { error: placementError } = await db.from('help_center_collections').insert({
    help_center_id: helpCenter.id,
    collection_id: collection.id,
    position: count ?? 0,
  })

  if (placementError) throw new Error(`Could not place collection: ${placementError.message}`)

  revalidatePath('/admin/collections')
  revalidatePath('/')
}

export async function deleteCollection(formData: FormData): Promise<void> {
  const helpCenter = await getActiveHelpCenter()
  await authorize('collection.delete', { helpCenterId: helpCenter.id })

  const id = String(formData.get('id') ?? '')
  const { error } = await serviceClient().from('collections').delete().eq('id', id)
  if (error) throw new Error(`Could not delete collection: ${error.message}`)

  revalidatePath('/admin/collections')
  revalidatePath('/')
}
```

- [ ] **Step 2: Write the page**

Create `app/admin/collections/page.tsx`:

```tsx
import { listEffectiveCollections } from '@/lib/content/queries'
import { getActiveHelpCenter } from '@/lib/tenancy/active'
import { createCollection, deleteCollection } from './actions'

export default async function CollectionsPage() {
  const helpCenter = await getActiveHelpCenter()
  const collections = await listEffectiveCollections(helpCenter.id)

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Collections</h1>

      <form action={createCollection} className="flex flex-wrap gap-3 rounded-lg border border-neutral-200 bg-white p-4">
        <input
          name="title"
          required
          placeholder="Collection title"
          className="min-w-48 flex-1 rounded-md border border-neutral-300 px-3 py-2"
        />
        <input
          name="description"
          placeholder="Short description"
          className="min-w-48 flex-1 rounded-md border border-neutral-300 px-3 py-2"
        />
        <button type="submit" className="rounded-md bg-neutral-900 px-4 py-2 text-white">
          Add collection
        </button>
      </form>

      <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
        {collections.length === 0 && (
          <li className="px-4 py-6 text-sm text-neutral-500">No collections yet.</li>
        )}
        {collections.map((collection) => (
          <li key={collection.id} className="flex items-center justify-between gap-4 px-4 py-3">
            <div>
              <p className="font-medium">{collection.title}</p>
              <p className="text-sm text-neutral-500">/{collection.slug}</p>
            </div>
            <form action={deleteCollection}>
              <input type="hidden" name="id" value={collection.id} />
              <button type="submit" className="text-sm text-red-600 hover:underline">
                Delete
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 3: Verify manually**

Run `pnpm dev`, visit `/admin/collections`, add "Billing".
Expected: it appears in the list with slug `billing`.

- [ ] **Step 4: Commit**

```bash
git add app/admin/collections
git commit -m "feat: add collection management"
```

---

## Task 17: Article editor

**Files:**
- Create: `components/editor/article-editor.tsx`, `app/admin/articles/actions.ts`, `app/admin/articles/page.tsx`, `app/admin/articles/[id]/page.tsx`

- [ ] **Step 1: Write the editor component**

The editor produces both ProseMirror JSON and HTML in the browser, so the server never needs a DOM. The server sanitizes the HTML before storing it.

Create `components/editor/article-editor.tsx`:

```tsx
'use client'

import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import { useState, useTransition } from 'react'

type Props = {
  articleId: string
  initialTitle: string
  initialBodyJson: Record<string, unknown> | null
  collections: { id: string; title: string }[]
  initialCollectionId: string | null
  onSave: (input: {
    articleId: string
    title: string
    collectionId: string | null
    bodyJson: Record<string, unknown>
    bodyHtml: string
  }) => Promise<void>
  onPublish: (articleId: string) => Promise<void>
}

export function ArticleEditor({
  articleId,
  initialTitle,
  initialBodyJson,
  collections,
  initialCollectionId,
  onSave,
  onPublish,
}: Props) {
  const [title, setTitle] = useState(initialTitle)
  const [collectionId, setCollectionId] = useState(initialCollectionId ?? '')
  const [status, setStatus] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      // The article title is a separate field, so the body starts at h2.
      StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
      Link.configure({ openOnClick: false }),
      Image,
      Placeholder.configure({ placeholder: 'Write the article…' }),
    ],
    content: initialBodyJson ?? '',
    editorProps: {
      attributes: { class: 'prose max-w-none min-h-80 focus:outline-none' },
    },
  })

  function save(then?: () => Promise<void>) {
    if (!editor) return
    setStatus(null)
    startTransition(async () => {
      try {
        await onSave({
          articleId,
          title,
          collectionId: collectionId || null,
          bodyJson: editor.getJSON() as Record<string, unknown>,
          bodyHtml: editor.getHTML(),
        })
        if (then) await then()
        setStatus('Saved')
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Save failed')
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Article title"
        className="w-full border-0 border-b border-neutral-200 pb-2 text-2xl font-semibold focus:outline-none"
      />

      <select
        value={collectionId}
        onChange={(event) => setCollectionId(event.target.value)}
        className="w-fit rounded-md border border-neutral-300 px-3 py-2 text-sm"
      >
        <option value="">No collection</option>
        {collections.map((collection) => (
          <option key={collection.id} value={collection.id}>
            {collection.title}
          </option>
        ))}
      </select>

      <div className="rounded-lg border border-neutral-200 bg-white p-6">
        <EditorContent editor={editor} />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => save()}
          disabled={pending}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm disabled:opacity-50"
        >
          Save draft
        </button>
        <button
          onClick={() => save(() => onPublish(articleId))}
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          Save and publish
        </button>
        {status && <span className="text-sm text-neutral-500">{status}</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write the article actions**

Create `app/admin/articles/actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { serviceClient } from '@/lib/db/client'
import { authorize } from '@/lib/authz/authorize'
import { sanitizeArticleHtml, htmlToText } from '@/lib/content/html'
import { slugify, uniqueSlug } from '@/lib/content/slug'
import { getActiveHelpCenter } from '@/lib/tenancy/active'
import { indexArticle } from '@/lib/search/index-article'

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] }

export async function createArticle(): Promise<void> {
  const helpCenter = await getActiveHelpCenter()
  const actor = await authorize('article.create', { helpCenterId: helpCenter.id })
  const db = serviceClient()

  const { data: existing } = await db.from('articles').select('slug')
  const slug = uniqueSlug('untitled', (existing ?? []).map((r) => r.slug))

  const { data: article, error } = await db
    .from('articles')
    .insert({
      title: 'Untitled',
      slug,
      body_json: EMPTY_DOC,
      body_html: '',
      status: 'draft',
      author_id: actor.userId,
    })
    .select('id')
    .single()

  if (error || !article) throw new Error(`Could not create article: ${error?.message}`)

  revalidatePath('/admin/articles')
  redirect(`/admin/articles/${article.id}`)
}

export async function saveArticle(input: {
  articleId: string
  title: string
  collectionId: string | null
  bodyJson: Record<string, unknown>
  bodyHtml: string
}): Promise<void> {
  const helpCenter = await getActiveHelpCenter()
  await authorize('article.update', { helpCenterId: helpCenter.id })

  const title = input.title.trim() || 'Untitled'
  const bodyHtml = sanitizeArticleHtml(input.bodyHtml)
  const excerpt = htmlToText(bodyHtml).slice(0, 200) || null

  const { error } = await serviceClient()
    .from('articles')
    .update({
      title,
      collection_id: input.collectionId,
      body_json: input.bodyJson,
      body_html: bodyHtml,
      excerpt,
    })
    .eq('id', input.articleId)

  if (error) throw new Error(`Could not save article: ${error.message}`)

  await indexArticle(helpCenter.id, input.articleId)
  revalidatePath('/admin/articles')
}

export async function publishArticle(articleId: string): Promise<void> {
  const helpCenter = await getActiveHelpCenter()
  await authorize('article.publish', { helpCenterId: helpCenter.id })
  const db = serviceClient()

  const { data: article, error: readError } = await db
    .from('articles')
    .select('title, slug')
    .eq('id', articleId)
    .single()

  if (readError || !article) throw new Error(`Article not found: ${readError?.message}`)

  // Replace the placeholder slug with one derived from the final title.
  let slug = article.slug
  if (slug.startsWith('untitled')) {
    const { data: existing } = await db.from('articles').select('slug').neq('id', articleId)
    slug = uniqueSlug(slugify(article.title), (existing ?? []).map((r) => r.slug))
  }

  const { error } = await db
    .from('articles')
    .update({ status: 'published', published_at: new Date().toISOString(), slug })
    .eq('id', articleId)

  if (error) throw new Error(`Could not publish article: ${error.message}`)

  // Phase 1 publishes into the active help center. Phase 2 replaces this with
  // the distribution picker from lib/distribution.
  const { count } = await db
    .from('help_center_articles')
    .select('*', { count: 'exact', head: true })
    .eq('help_center_id', helpCenter.id)

  const { error: placementError } = await db.from('help_center_articles').upsert(
    { help_center_id: helpCenter.id, article_id: articleId, position: count ?? 0 },
    { onConflict: 'help_center_id,article_id', ignoreDuplicates: true },
  )

  if (placementError) throw new Error(`Could not place article: ${placementError.message}`)

  await indexArticle(helpCenter.id, articleId)
  revalidatePath('/admin/articles')
  revalidatePath('/', 'layout')
}
```

- [ ] **Step 3: Write the article list page**

Create `app/admin/articles/page.tsx`:

```tsx
import Link from 'next/link'
import { serviceClient } from '@/lib/db/client'
import { createArticle } from './actions'

export default async function ArticlesPage() {
  const { data: articles } = await serviceClient()
    .from('articles')
    .select('id, title, slug, status, updated_at')
    .order('updated_at', { ascending: false })

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Articles</h1>
        <form action={createArticle}>
          <button type="submit" className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white">
            New article
          </button>
        </form>
      </div>

      <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
        {(articles ?? []).length === 0 && (
          <li className="px-4 py-6 text-sm text-neutral-500">No articles yet.</li>
        )}
        {(articles ?? []).map((article) => (
          <li key={article.id} className="flex items-center justify-between px-4 py-3">
            <Link href={`/admin/articles/${article.id}`} className="font-medium hover:underline">
              {article.title}
            </Link>
            <span className="text-xs uppercase tracking-wide text-neutral-500">
              {article.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Write the editor page**

Create `app/admin/articles/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { ArticleEditor } from '@/components/editor/article-editor'
import { serviceClient } from '@/lib/db/client'
import { getActiveHelpCenter } from '@/lib/tenancy/active'
import { listEffectiveCollections } from '@/lib/content/queries'
import { publishArticle, saveArticle } from '../actions'

export default async function ArticleEditorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const helpCenter = await getActiveHelpCenter()

  const { data: article } = await serviceClient()
    .from('articles')
    .select('id, title, body_json, collection_id, status')
    .eq('id', id)
    .maybeSingle()

  if (!article) notFound()

  const collections = await listEffectiveCollections(helpCenter.id)

  return (
    <ArticleEditor
      articleId={article.id}
      initialTitle={article.title}
      initialBodyJson={article.body_json as Record<string, unknown> | null}
      initialCollectionId={article.collection_id}
      collections={collections.map((c) => ({ id: c.id, title: c.title }))}
      onSave={saveArticle}
      onPublish={publishArticle}
    />
  )
}
```

- [ ] **Step 5: Verify manually**

Run `pnpm dev`. Create an article, give it a title, assign it to Billing, write two paragraphs with an `h2`, then Save and publish.
Expected: status shows `published` in the list, and the slug is derived from the title.

- [ ] **Step 6: Commit**

```bash
git add components/editor app/admin/articles
git commit -m "feat: add article editor with publish"
```

---

## Task 18: Article image upload

**Files:**
- Create: `supabase/migrations/0004_storage_bucket.sql`, `app/api/uploads/route.ts`
- Modify: `components/editor/article-editor.tsx`

- [ ] **Step 1: Create the storage bucket**

Create `supabase/migrations/0004_storage_bucket.sql`:

```sql
insert into storage.buckets (id, name, public)
values ('article-media', 'article-media', true)
on conflict (id) do nothing;

create policy "Public read of article media"
  on storage.objects for select
  using (bucket_id = 'article-media');
```

Apply it: `pnpm db:reset`

- [ ] **Step 2: Write the upload route**

Create `app/api/uploads/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { serviceClient } from '@/lib/db/client'
import { authorize, ForbiddenError } from '@/lib/authz/authorize'
import { getActiveHelpCenter } from '@/lib/tenancy/active'

const ALLOWED = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']
const MAX_BYTES = 10 * 1024 * 1024

export async function POST(request: Request) {
  try {
    const helpCenter = await getActiveHelpCenter()
    await authorize('article.update', { helpCenterId: helpCenter.id })
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
    }
    throw error
  }

  const form = await request.formData()
  const file = form.get('file')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: `Unsupported type ${file.type}` }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File is larger than 10MB' }, { status: 400 })
  }

  const extension = file.name.split('.').pop() ?? 'bin'
  const path = `${crypto.randomUUID()}.${extension}`

  const db = serviceClient()
  const { error } = await db.storage
    .from('article-media')
    .upload(path, file, { contentType: file.type, upsert: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data } = db.storage.from('article-media').getPublicUrl(path)
  return NextResponse.json({ url: data.publicUrl })
}
```

- [ ] **Step 3: Add the upload control to the editor**

In `components/editor/article-editor.tsx`, add this function inside the component, above the `return`:

```tsx
  async function insertImage(file: File) {
    setStatus('Uploading image…')
    const body = new FormData()
    body.append('file', file)

    const response = await fetch('/api/uploads', { method: 'POST', body })
    const result = (await response.json()) as { url?: string; error?: string }

    if (!response.ok || !result.url) {
      setStatus(result.error ?? 'Upload failed')
      return
    }

    editor?.chain().focus().setImage({ src: result.url }).run()
    setStatus(null)
  }
```

Then add this control just above the `<div className="rounded-lg border border-neutral-200 bg-white p-6">` block:

```tsx
      <label className="w-fit cursor-pointer rounded-md border border-neutral-300 px-3 py-2 text-sm">
        Insert image
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void insertImage(file)
            event.target.value = ''
          }}
        />
      </label>
```

- [ ] **Step 4: Verify manually**

In the editor, insert a PNG.
Expected: the image renders in the editor, and after Save and publish it renders on the public article page (built in Task 21).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0004_storage_bucket.sql app/api/uploads components/editor
git commit -m "feat: upload article images to storage"
```

---

## Task 19: Public layout and home page

**Files:**
- Create: `app/(public)/layout.tsx`, `app/(public)/page.tsx`, `components/public/search-box.tsx`, `app/api/search/route.ts`
- Modify: `app/page.tsx` (delete it)

- [ ] **Step 1: Remove the scaffold home page**

```bash
rm app/page.tsx
```

`app/(public)/page.tsx` takes over `/`.

- [ ] **Step 2: Write the search API route**

Create `app/api/search/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { getActiveHelpCenter } from '@/lib/tenancy/active'
import { searchHelpCenter } from '@/lib/search/search'

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q') ?? ''
  if (!query.trim()) return NextResponse.json({ hits: [] })

  const helpCenter = await getActiveHelpCenter()
  const hits = await searchHelpCenter(helpCenter.id, query, 8)

  return NextResponse.json({ hits })
}
```

- [ ] **Step 3: Write the search box**

Create `components/public/search-box.tsx`:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type Hit = { articleId: string; slug: string; title: string; headline: string }

export function SearchBox({ autoFocus = false }: { autoFocus?: boolean }) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([])
      return
    }

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        })
        const data = (await response.json()) as { hits: Hit[] }
        setHits(data.hits)
        setActive(0)
        setOpen(true)
      } catch {
        // Aborted by the next keystroke; nothing to show.
      }
    }, 180)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((i) => Math.min(i + 1, hits.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const hit = hits[active]
      router.push(hit ? `/a/${hit.slug}` : `/search?q=${encodeURIComponent(query)}`)
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        value={query}
        autoFocus={autoFocus}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => hits.length > 0 && setOpen(true)}
        placeholder="Search for answers…"
        aria-label="Search articles"
        className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base shadow-sm focus:border-neutral-900 focus:outline-none"
      />

      {open && hits.length > 0 && (
        <ul className="absolute z-10 mt-2 w-full overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg">
          {hits.map((hit, index) => (
            <li key={hit.articleId}>
              <a
                href={`/a/${hit.slug}`}
                className={`block px-4 py-3 ${index === active ? 'bg-neutral-100' : ''}`}
              >
                <span className="block text-sm font-medium">{hit.title}</span>
                <span
                  className="mt-1 block text-xs text-neutral-500"
                  // Headline comes from ts_headline over sanitized text; only <mark> is added.
                  dangerouslySetInnerHTML={{ __html: hit.headline }}
                />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Write the public layout**

Create `app/(public)/layout.tsx`:

```tsx
import Link from 'next/link'
import { getActiveHelpCenter } from '@/lib/tenancy/active'

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const helpCenter = await getActiveHelpCenter()

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <header className="border-b border-neutral-200">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-5 py-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            {helpCenter.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={helpCenter.logoUrl} alt={helpCenter.name} className="h-7 w-auto" />
            ) : (
              helpCenter.name
            )}
          </Link>
        </div>
      </header>

      {children}

      <footer className="mt-16 border-t border-neutral-200 py-8">
        <p className="mx-auto max-w-4xl px-5 text-sm text-neutral-500">
          {helpCenter.name}
        </p>
      </footer>
    </div>
  )
}
```

- [ ] **Step 5: Write the home page**

Create `app/(public)/page.tsx`:

```tsx
import Link from 'next/link'
import { getActiveHelpCenter } from '@/lib/tenancy/active'
import { countArticlesPerCollection, listEffectiveCollections } from '@/lib/content/queries'
import { SearchBox } from '@/components/public/search-box'

export default async function HomePage() {
  const helpCenter = await getActiveHelpCenter()
  const collections = await listEffectiveCollections(helpCenter.id)
  const counts = await countArticlesPerCollection(helpCenter.id)

  return (
    <>
      <section className="border-b border-neutral-200 bg-neutral-50 px-5 py-16">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 text-center">
          <h1 className="text-3xl font-semibold sm:text-4xl">
            {helpCenter.settings.headline ?? 'How can we help?'}
          </h1>
          {helpCenter.settings.subtitle && (
            <p className="text-neutral-600">{helpCenter.settings.subtitle}</p>
          )}
          <SearchBox />
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 py-12">
        <ul className="grid gap-4 sm:grid-cols-2">
          {collections.map((collection) => (
            <li key={collection.id}>
              <Link
                href={`/${collection.slug}`}
                className="block h-full rounded-xl border border-neutral-200 p-5 transition hover:border-neutral-400 hover:shadow-sm"
              >
                <h2 className="font-medium">{collection.title}</h2>
                {collection.description && (
                  <p className="mt-1 text-sm text-neutral-600">{collection.description}</p>
                )}
                <p className="mt-3 text-xs text-neutral-500">
                  {counts.get(collection.id) ?? 0} articles
                </p>
              </Link>
            </li>
          ))}
        </ul>
        {collections.length === 0 && (
          <p className="text-sm text-neutral-500">No collections published yet.</p>
        )}
      </section>
    </>
  )
}
```

- [ ] **Step 6: Verify manually**

Visit `/`.
Expected: headline from seed settings, a search box, and a Billing card showing the article count.

- [ ] **Step 7: Commit**

```bash
git add app/\(public\) app/api/search components/public
git commit -m "feat: add public layout, home page, and search box"
```

---

## Task 20: Collection page

**Files:**
- Create: `app/(public)/[collectionSlug]/page.tsx`

- [ ] **Step 1: Write the page**

Create `app/(public)/[collectionSlug]/page.tsx`:

```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getActiveHelpCenter } from '@/lib/tenancy/active'
import { listEffectiveArticles, listEffectiveCollections } from '@/lib/content/queries'

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ collectionSlug: string }>
}) {
  const { collectionSlug } = await params
  const helpCenter = await getActiveHelpCenter()

  const collections = await listEffectiveCollections(helpCenter.id)
  const collection = collections.find((c) => c.slug === collectionSlug)
  if (!collection) notFound()

  const articles = await listEffectiveArticles(helpCenter.id, collection.id)

  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <nav className="mb-6 text-sm text-neutral-500">
        <Link href="/" className="hover:underline">
          All collections
        </Link>
        <span className="mx-2">/</span>
        <span>{collection.title}</span>
      </nav>

      <h1 className="text-3xl font-semibold">{collection.title}</h1>
      {collection.description && (
        <p className="mt-2 text-neutral-600">{collection.description}</p>
      )}

      <ul className="mt-8 divide-y divide-neutral-200 border-t border-neutral-200">
        {articles.length === 0 && (
          <li className="py-6 text-sm text-neutral-500">No articles in this collection yet.</li>
        )}
        {articles.map((article) => (
          <li key={article.id} className="py-4">
            <Link href={`/${collection.slug}/${article.slug}`} className="group block">
              <h2 className="font-medium group-hover:underline">{article.title}</h2>
              {article.excerpt && (
                <p className="mt-1 line-clamp-2 text-sm text-neutral-600">{article.excerpt}</p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: Verify manually**

Visit `/billing`.
Expected: the collection title, description, and the published article with its excerpt.

- [ ] **Step 3: Commit**

```bash
git add "app/(public)/[collectionSlug]/page.tsx"
git commit -m "feat: add public collection page"
```

---

## Task 21: Article page

**Files:**
- Create: `app/(public)/[collectionSlug]/[articleSlug]/page.tsx`, `lib/content/toc.test.ts`, `lib/content/toc.ts`, `app/(public)/a/[articleSlug]/route.ts`

- [ ] **Step 1: Write the failing table-of-contents test**

Create `lib/content/toc.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { extractHeadings } from './toc'

describe('extractHeadings', () => {
  it('returns h2 and h3 headings with slugged ids', () => {
    const html = '<h2>Getting started</h2><p>x</p><h3>Step one</h3><h2>Billing</h2>'
    expect(extractHeadings(html)).toEqual([
      { id: 'getting-started', text: 'Getting started', level: 2 },
      { id: 'step-one', text: 'Step one', level: 3 },
      { id: 'billing', text: 'Billing', level: 2 },
    ])
  })

  it('strips inline markup from heading text', () => {
    expect(extractHeadings('<h2>Cancel <em>now</em></h2>')).toEqual([
      { id: 'cancel-now', text: 'Cancel now', level: 2 },
    ])
  })

  it('deduplicates repeated heading ids', () => {
    const result = extractHeadings('<h2>Notes</h2><h2>Notes</h2>')
    expect(result.map((h) => h.id)).toEqual(['notes', 'notes-2'])
  })

  it('returns an empty array when there are no headings', () => {
    expect(extractHeadings('<p>Just text</p>')).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run lib/content/toc.test.ts`
Expected: FAIL — `Failed to resolve import "./toc"`.

- [ ] **Step 3: Write the implementation**

Create `lib/content/toc.ts`:

```ts
import { htmlToText } from './html'
import { slugify, uniqueSlug } from './slug'

export type Heading = { id: string; text: string; level: 2 | 3 }

const HEADING_PATTERN = /<h([23])\b[^>]*>([\s\S]*?)<\/h\1>/gi

/** Headings for the article table of contents, with stable unique ids. */
export function extractHeadings(html: string): Heading[] {
  const headings: Heading[] = []
  const taken: string[] = []

  for (const match of html.matchAll(HEADING_PATTERN)) {
    const text = htmlToText(match[2])
    if (!text) continue

    const id = uniqueSlug(slugify(text), taken)
    taken.push(id)
    headings.push({ id, text, level: Number(match[1]) as 2 | 3 })
  }

  return headings
}

/** Adds matching ids to h2 and h3 tags so anchors resolve. */
export function addHeadingIds(html: string, headings: Heading[]): string {
  let index = 0
  return html.replace(HEADING_PATTERN, (full, level: string, inner: string) => {
    const heading = headings[index]
    if (!heading || htmlToText(inner) !== heading.text) return full
    index++
    return `<h${level} id="${heading.id}">${inner}</h${level}>`
  })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run lib/content/toc.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Write the article page**

Create `app/(public)/[collectionSlug]/[articleSlug]/page.tsx`:

```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getActiveHelpCenter } from '@/lib/tenancy/active'
import {
  getEffectiveArticle,
  listEffectiveArticles,
  listEffectiveCollections,
} from '@/lib/content/queries'
import { addHeadingIds, extractHeadings } from '@/lib/content/toc'

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ collectionSlug: string; articleSlug: string }>
}) {
  const { collectionSlug, articleSlug } = await params
  const helpCenter = await getActiveHelpCenter()

  const article = await getEffectiveArticle(helpCenter.id, articleSlug)
  if (!article) notFound()

  const collections = await listEffectiveCollections(helpCenter.id)
  const collection = collections.find((c) => c.id === article.collectionId)
  if (!collection || collection.slug !== collectionSlug) notFound()

  const siblings = await listEffectiveArticles(helpCenter.id, collection.id)
  const index = siblings.findIndex((s) => s.id === article.id)
  const previous = index > 0 ? siblings[index - 1] : null
  const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null

  const headings = extractHeadings(article.bodyHtml)
  const bodyHtml = addHeadingIds(article.bodyHtml, headings)

  return (
    <div className="mx-auto flex max-w-5xl gap-12 px-5 py-12">
      <article className="min-w-0 flex-1">
        <nav className="mb-6 text-sm text-neutral-500">
          <Link href="/" className="hover:underline">
            All collections
          </Link>
          <span className="mx-2">/</span>
          <Link href={`/${collection.slug}`} className="hover:underline">
            {collection.title}
          </Link>
        </nav>

        <h1 className="text-3xl font-semibold">{article.title}</h1>

        {/* Sanitized on save by sanitizeArticleHtml. */}
        <div
          className="prose prose-neutral mt-8 max-w-none"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />

        <div className="mt-16 flex justify-between gap-4 border-t border-neutral-200 pt-6 text-sm">
          {previous ? (
            <Link href={`/${collection.slug}/${previous.slug}`} className="hover:underline">
              ← {previous.title}
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link href={`/${collection.slug}/${next.slug}`} className="text-right hover:underline">
              {next.title} →
            </Link>
          )}
        </div>
      </article>

      {headings.length > 1 && (
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-8">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              On this page
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              {headings.map((heading) => (
                <li key={heading.id} className={heading.level === 3 ? 'pl-3' : ''}>
                  <a href={`#${heading.id}`} className="text-neutral-600 hover:text-neutral-900">
                    {heading.text}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Add the short-link redirect**

Search results link to `/a/<slug>` because a hit does not know its collection. Static segments win
over dynamic ones in Next.js, so `/a/x` reaches this handler rather than the article page — which
reserves `a` as a collection slug. Add a validation rule in Phase 2 when collection slugs become
editable. Create `app/(public)/a/[articleSlug]/route.ts`:

```ts
import { redirect } from 'next/navigation'
import { getActiveHelpCenter } from '@/lib/tenancy/active'
import { getEffectiveArticle, listEffectiveCollections } from '@/lib/content/queries'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ articleSlug: string }> },
) {
  const { articleSlug } = await params
  const helpCenter = await getActiveHelpCenter()

  const article = await getEffectiveArticle(helpCenter.id, articleSlug)
  if (!article) redirect('/')

  const collections = await listEffectiveCollections(helpCenter.id)
  const collection = collections.find((c) => c.id === article.collectionId)

  redirect(collection ? `/${collection.slug}/${article.slug}` : '/')
}
```

- [ ] **Step 7: Install the prose plugin**

```bash
pnpm add -D @tailwindcss/typography
```

Add to `app/globals.css`, directly after `@import "tailwindcss";`:

```css
@plugin "@tailwindcss/typography";
```

- [ ] **Step 8: Verify manually**

Visit the published article via `/billing/<slug>`.
Expected: prose body, a table of contents on a wide window, working anchor links, and previous/next links when the collection has more than one article.

- [ ] **Step 9: Commit**

```bash
git add lib/content/toc.ts lib/content/toc.test.ts "app/(public)" app/globals.css package.json pnpm-lock.yaml
git commit -m "feat: add public article page with table of contents"
```

---

## Task 22: Search results page

**Files:**
- Create: `app/(public)/search/page.tsx`

- [ ] **Step 1: Write the page**

Create `app/(public)/search/page.tsx`:

```tsx
import Link from 'next/link'
import { getActiveHelpCenter } from '@/lib/tenancy/active'
import { searchHelpCenter } from '@/lib/search/search'
import { SearchBox } from '@/components/public/search-box'

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q = '' } = await searchParams
  const helpCenter = await getActiveHelpCenter()
  const hits = q.trim() ? await searchHelpCenter(helpCenter.id, q, 30) : []

  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <SearchBox autoFocus />

      {q.trim() && (
        <p className="mt-6 text-sm text-neutral-500">
          {hits.length} {hits.length === 1 ? 'result' : 'results'} for “{q}”
        </p>
      )}

      <ul className="mt-4 divide-y divide-neutral-200 border-t border-neutral-200">
        {hits.map((hit) => (
          <li key={hit.articleId} className="py-4">
            <Link href={`/a/${hit.slug}`} className="group block">
              <h2 className="font-medium group-hover:underline">{hit.title}</h2>
              <p
                className="mt-1 text-sm text-neutral-600"
                // ts_headline over sanitized text; only <mark> is added.
                dangerouslySetInnerHTML={{ __html: hit.headline }}
              />
            </Link>
          </li>
        ))}
      </ul>

      {q.trim() && hits.length === 0 && (
        <p className="mt-4 text-sm text-neutral-500">
          Nothing matched. Try different words.
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify manually**

Search for a word from your published article body.
Expected: the article appears with a highlighted excerpt; clicking through lands on the article.

- [ ] **Step 3: Commit**

```bash
git add "app/(public)/search"
git commit -m "feat: add public search results page"
```

---

## Task 23: End-to-end test

**Files:**
- Create: `playwright.config.ts`, `e2e/publish-and-read.spec.ts`
- Modify: `package.json`, `.gitignore`

- [ ] **Step 1: Install Playwright**

```bash
pnpm add -D @playwright/test
pnpm exec playwright install chromium
```

- [ ] **Step 2: Write the config**

Create `playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
```

- [ ] **Step 3: Add the script and ignores**

Add to `package.json` scripts:

```json
{
  "test:e2e": "playwright test"
}
```

Append to `.gitignore`:

```
/test-results
/playwright-report
```

- [ ] **Step 4: Write the test**

This test signs in by requesting a magic link and reading it from the local mail API that
`supabase start` runs on port 54724.

Correction (Task 2): CLI 2.110.0 ships **Mailpit**, not Inbucket, on this port (confirmed via
`pnpm supabase status`, which reports `MAILPIT_URL`/`INBUCKET_URL` both pointing at
`http://127.0.0.1:54724`, and empirically: `curl http://127.0.0.1:54724/api/v1/mailbox` returns
`File not found`, while `curl http://127.0.0.1:54724/api/v1/messages` returns Mailpit's JSON list
shape). Mailpit's API is list-then-fetch, not mailbox-by-address:

- `GET /api/v1/messages` — lists all messages across all mailboxes (no per-recipient path segment).
  Shape: `{"messages":[{"ID":"2turEJXP1fKpceKDxu32Jr","To":[{"Name":"","Address":"..."}],"Created":"2026-07-31T03:08:57.519Z", ...}], ...}`.
  Filter client-side by `To[].Address` and take the most recent by `Created`.
- `GET /api/v1/message/{ID}` — fetches one message by its `ID` (from the list above). The rendered
  HTML body is in the `HTML` field (there is also a plaintext `Text` field), e.g.
  `{"ID":"...","HTML":"<h2>Your sign-in link</h2>...<a href=\"http://127.0.0.1:54721/auth/v1/verify?token=...&amp;type=magiclink&amp;redirect_to=...\">Sign in</a>...","Text":"..."}`.

Verified empirically by triggering a real OTP email via `POST /auth/v1/otp` against the local GoTrue
instance and reading it back through both endpoints above.

Create `e2e/publish-and-read.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

const MAIL_API = 'http://127.0.0.1:54724/api/v1'
const EMAIL = 'owner@example.com'

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.getByPlaceholder('you@company.com').fill(EMAIL)
  await page.getByRole('button', { name: /email me a link/i }).click()
  await expect(page.getByText(/check your email/i)).toBeVisible()

  const { messages } = await (await fetch(`${MAIL_API}/messages`)).json()
  const latest = messages
    .filter((m: { To: { Address: string }[] }) => m.To.some((to) => to.Address === EMAIL))
    .sort((a: { Created: string }, b: { Created: string }) => (a.Created < b.Created ? 1 : -1))[0]
  expect(latest, 'magic link email received').toBeTruthy()
  const message = await (await fetch(`${MAIL_API}/message/${latest.ID}`)).json()

  const link = /href="([^"]*\/auth\/confirm[^"]*)"/.exec(message.HTML)?.[1]
  expect(link, 'magic link in email').toBeTruthy()

  await page.goto(link!.replace(/&amp;/g, '&'))
}

test('an author publishes an article and a reader finds it', async ({ page }) => {
  await signIn(page)

  // Create a collection.
  await page.goto('/admin/collections')
  await page.getByPlaceholder('Collection title').fill('Billing')
  await page.getByPlaceholder('Short description').fill('Invoices and payments.')
  await page.getByRole('button', { name: 'Add collection' }).click()
  await expect(page.getByText('/billing')).toBeVisible()

  // Write and publish an article.
  await page.goto('/admin/articles')
  await page.getByRole('button', { name: 'New article' }).click()
  await page.getByPlaceholder('Article title').fill('Cancel your subscription')
  await page.getByRole('combobox').selectOption({ label: 'Billing' })
  await page.locator('.ProseMirror').click()
  await page.keyboard.type('Open settings and choose cancel plan to stop billing.')
  await page.getByRole('button', { name: 'Save and publish' }).click()
  await expect(page.getByText('Saved')).toBeVisible()

  // Read it publicly.
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Billing' })).toBeVisible()
  await page.getByRole('link', { name: /Billing/ }).click()
  await page.getByRole('link', { name: 'Cancel your subscription' }).click()
  await expect(page.getByRole('heading', { name: 'Cancel your subscription' })).toBeVisible()
  await expect(page.getByText(/stop billing/i)).toBeVisible()

  // Find it by search.
  await page.goto('/search?q=cancel+plan')
  await expect(page.getByRole('heading', { name: 'Cancel your subscription' })).toBeVisible()
})

test('a draft article is not publicly readable', async ({ page }) => {
  await signIn(page)

  await page.goto('/admin/articles')
  await page.getByRole('button', { name: 'New article' }).click()
  await page.getByPlaceholder('Article title').fill('Internal runbook')
  await page.locator('.ProseMirror').click()
  await page.keyboard.type('Secret internal steps.')
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page.getByText('Saved')).toBeVisible()

  await page.goto('/search?q=secret')
  await expect(page.getByText(/nothing matched/i)).toBeVisible()
})
```

- [ ] **Step 5: Reset the database and run**

```bash
pnpm db:reset
pnpm test:e2e
```

Expected: both tests pass. If the first sign-in has no membership, the admin shell shows "No access" — grant the owner role once with the SQL from Task 15 Step 6 and rerun.

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts e2e package.json pnpm-lock.yaml .gitignore
git commit -m "test: add end-to-end publish and read flow"
```

---

## Task 24: Full verification

**Files:** none

- [ ] **Step 1: Run the unit tests**

Run: `pnpm test`
Expected: PASS — all suites (`merge`, `slug`, `html`, `toc`, `authorize`).

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 5: Run the end-to-end tests against a clean database**

```bash
pnpm db:reset
pnpm test:e2e
```

Expected: PASS — 2 tests.

- [ ] **Step 6: Commit and push**

```bash
git add -A
git commit -m "chore: phase 1 verification" --allow-empty
git push origin main
```

---

## Phase 1 Done When

- An author signs in with a magic link and reaches the admin.
- Collections can be created and deleted.
- Articles can be written in TipTap with images, saved as drafts, and published.
- Published articles appear on the home page, collection pages, and article pages, with a table of contents and previous/next navigation.
- Keyword search returns published articles with highlighted excerpts, in a dropdown and on a results page.
- Draft and hidden content never appears publicly.
- `pnpm test`, `pnpm test:e2e`, `pnpm tsc --noEmit`, `pnpm lint`, and `pnpm build` all pass.

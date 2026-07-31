# Help Center Platform — Design

**Date:** 2026-07-31
**Status:** Approved

## Purpose

A multi-tenant, Intercom-style knowledge base platform. One canonical content library feeds many
branded help centers. Authors write an article once and choose which help centers publish it. Each
help center controls its own branding, ordering, and visibility without forking content.

## Goals

1. A **base help center** that new help centers are cloned from.
2. **Clone and rebrand**: same articles, different primary/secondary colors, logo, and slug/subdomain.
3. **Distribute one article** to all help centers, to a default set, or to an individual selection.
4. **Hide** any article or collection within a single help center.
5. **Bulk import** from Google Docs and uploaded files, plus writing from scratch.
6. A **contributor portal** where invited users write articles scoped to one help center.
7. Responsive, fast public reading experience with keyword and semantic search.

## Non-Goals

- Sitemap/URL scraping for migration (deferred; revisit after phase 3).
- Multi-organization tenancy. One organization owns all help centers.
- In-app chat, ticketing, or AI answer generation.
- Article translation and localization.
- Public comments or ratings beyond a single article-helpfulness vote.

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js (App Router), TypeScript, React Server Components |
| Database | Postgres via Supabase, `pgvector` extension |
| Auth | Supabase Auth, email magic link |
| Storage | Supabase Storage (logos, article images, import uploads) |
| Styling | Tailwind CSS, shadcn/ui, CSS custom properties for per-tenant theming |
| Editor | TipTap (ProseMirror), storing JSON as source of truth plus rendered HTML |
| Search | Postgres full-text search + `pgvector`, fused with reciprocal rank fusion |
| Embeddings | Provider interface; default Voyage `voyage-3.5-lite` (1024 dims) |
| Hosting | Vercel, wildcard subdomain, custom domains via the Vercel Domains API |
| Tests | Vitest (unit), Playwright (end-to-end) |

## Core Model

Articles and collections are canonical, global entities. A help center does not own content — it owns
a **placement** row per piece of content it publishes. Placements carry ordering, visibility, and
optional overrides.

The effective article inside a help center is the canonical row with `COALESCE(override, canonical)`
applied field by field. Every requirement above reduces to an operation on placements:

| Requirement | Operation |
| --- | --- |
| Clone a help center | Insert a `help_centers` row, copy every placement row from the source |
| Hide an article in one center | Set `help_center_articles.is_hidden` |
| Hide a collection in one center | Set `help_center_collections.is_hidden` |
| Distribute an article | Insert placement rows for the selected help centers |
| Edit once, propagate | Update the canonical article; centers without overrides follow |
| Contributor-only article | `articles.origin_help_center_id` set, with exactly one placement |

### Schema

```sql
create extension if not exists vector;

-- Tenants ------------------------------------------------------------------

create table help_centers (
  id                        uuid primary key default gen_random_uuid(),
  slug                      text not null unique,          -- subdomain label
  name                      text not null,
  is_base                   boolean not null default false,
  cloned_from_id            uuid references help_centers(id) on delete set null,

  -- branding
  primary_hex               text not null default '#1f6feb',
  secondary_hex             text not null default '#6e7781',
  logo_url                  text,
  favicon_url               text,
  font_family               text,

  -- behaviour
  visibility                text not null default 'public'   -- 'public' | 'authenticated'
                              check (visibility in ('public','authenticated')),
  auto_include_new_articles boolean not null default true,

  settings                  jsonb not null default '{}',     -- headline, subtitle, footer links
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- Only one base help center.
create unique index help_centers_single_base on help_centers (is_base) where is_base;

create table custom_domains (
  id             uuid primary key default gen_random_uuid(),
  help_center_id uuid not null references help_centers(id) on delete cascade,
  hostname       text not null unique,
  status         text not null default 'pending'
                   check (status in ('pending','verifying','active','failed')),
  verified_at    timestamptz,
  created_at     timestamptz not null default now()
);

-- Canonical content --------------------------------------------------------

create table collections (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  title       text not null,
  description text,
  icon        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table articles (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique,
  title                 text not null,
  excerpt               text,
  body_json             jsonb not null,                    -- ProseMirror doc
  body_html             text not null,                     -- rendered, sanitized
  collection_id         uuid references collections(id) on delete set null,
  author_id             uuid references auth.users(id) on delete set null,
  status                text not null default 'draft'
                          check (status in ('draft','in_review','published','archived')),

  -- Non-null means the article belongs to one help center only (contributor content).
  origin_help_center_id uuid references help_centers(id) on delete cascade,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  published_at          timestamptz
);

create table article_revisions (
  id         uuid primary key default gen_random_uuid(),
  article_id uuid not null references articles(id) on delete cascade,
  body_json  jsonb not null,
  title      text not null,
  author_id  uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Placements ---------------------------------------------------------------

create table help_center_collections (
  help_center_id       uuid not null references help_centers(id) on delete cascade,
  collection_id        uuid not null references collections(id) on delete cascade,
  position             integer not null default 0,
  is_hidden            boolean not null default false,
  title_override       text,
  description_override text,
  audience             text not null default 'public'
                         check (audience in ('public','authenticated')),
  primary key (help_center_id, collection_id)
);

create table help_center_articles (
  help_center_id         uuid not null references help_centers(id) on delete cascade,
  article_id             uuid not null references articles(id) on delete cascade,
  position               integer not null default 0,
  is_hidden              boolean not null default false,
  title_override         text,
  body_json_override     jsonb,
  body_html_override     text,
  collection_override_id uuid references collections(id) on delete set null,
  created_at             timestamptz not null default now(),
  primary key (help_center_id, article_id)
);

create index on help_center_articles (help_center_id) where not is_hidden;

-- Search -------------------------------------------------------------------

create table article_search (
  help_center_id uuid not null references help_centers(id) on delete cascade,
  article_id     uuid not null references articles(id) on delete cascade,
  title          text not null,
  body_text      text not null,
  search_vector  tsvector,
  embedding      vector(1024),
  indexed_at     timestamptz not null default now(),
  primary key (help_center_id, article_id)
);

create index on article_search using gin (search_vector);
create index on article_search using hnsw (embedding vector_cosine_ops);

-- People -------------------------------------------------------------------

create table memberships (
  user_id        uuid not null references auth.users(id) on delete cascade,
  help_center_id uuid references help_centers(id) on delete cascade, -- null = all centers
  role           text not null check (role in ('owner','staff','editor','contributor')),
  created_at     timestamptz not null default now(),

  -- Only owner and staff may hold a global (null-scoped) membership.
  constraint memberships_scope_matches_role check (
    (help_center_id is null and role in ('owner','staff')) or
    (help_center_id is not null and role in ('editor','contributor'))
  )
);

create unique index memberships_unique
  on memberships (user_id, coalesce(help_center_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table invites (
  id             uuid primary key default gen_random_uuid(),
  email          text not null,
  help_center_id uuid references help_centers(id) on delete cascade,
  role           text not null check (role in ('staff','editor','contributor')),
  token          text not null unique,
  invited_by     uuid references auth.users(id) on delete set null,
  expires_at     timestamptz not null,
  accepted_at    timestamptz,
  created_at     timestamptz not null default now()
);

create table help_center_audience_members (
  id             uuid primary key default gen_random_uuid(),
  help_center_id uuid not null references help_centers(id) on delete cascade,
  email          text not null,
  user_id        uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (help_center_id, email)
);

-- Import -------------------------------------------------------------------

create table imports (
  id             uuid primary key default gen_random_uuid(),
  source         text not null check (source in ('upload','google_docs')),
  status         text not null default 'pending'
                   check (status in ('pending','running','completed','failed')),
  created_by     uuid references auth.users(id) on delete set null,
  help_center_id uuid references help_centers(id) on delete set null, -- contributor imports
  created_at     timestamptz not null default now(),
  completed_at   timestamptz
);

create table import_items (
  id          uuid primary key default gen_random_uuid(),
  import_id   uuid not null references imports(id) on delete cascade,
  source_ref  text not null,        -- filename or Google Doc id
  title       text,
  status      text not null default 'pending'
                check (status in ('pending','converted','failed','discarded')),
  error       text,
  article_id  uuid references articles(id) on delete set null,
  created_at  timestamptz not null default now()
);
```

### Roles

| Role | Scope | Can do |
| --- | --- | --- |
| `owner` | Global | Everything, including billing-level settings and deleting help centers |
| `staff` | Global | All content, all help centers, invites, imports, branding |
| `editor` | One help center | Manage that center's placements, branding, and its own articles |
| `contributor` | One help center | Create and submit articles scoped to that center; no publishing |

`memberships.help_center_id IS NULL` means the membership is global, valid only for `owner` and
`staff`. The `memberships_scope_matches_role` constraint enforces this at the database level;
`authorize()` enforces the matching read of it at the application level.

## Modules

Each module is a directory with a single responsibility and a narrow exported surface.

### `lib/tenancy`

Resolves a request to a help center and exposes the active tenant.

- `resolveHelpCenter(host: string): Promise<HelpCenter | null>` — subdomain label match, then
  `custom_domains` lookup on `status = 'active'`. Cached per request.
- `middleware.ts` calls this and sets `x-help-center-id` on the forwarded request. Server components
  read it through `getActiveHelpCenter()`. Unknown hosts render a 404 shell, not an error page.
- The admin app is served from the apex host and is exempt from tenant resolution.

### `lib/content`

The only module that knows the override rules. Nothing else may join placement tables directly.

- `getEffectiveArticle(helpCenterId, articleSlug)` — canonical row merged with its placement.
- `listEffectiveCollections(helpCenterId)` — ordered, hidden rows excluded, audience applied.
- `listEffectiveArticles(helpCenterId, collectionId)` — same rules.
- `mergeArticle(canonical, placement)` — pure function, exhaustively unit tested.

Hidden and audience filtering happen inside these functions. A caller cannot forget them.

### `lib/distribution`

- `distributeArticle(articleId, target)` where target is `{ kind: 'all' }`,
  `{ kind: 'default' }` (every center with `auto_include_new_articles`), or
  `{ kind: 'selected', helpCenterIds }`.
- `undistributeArticle(articleId, helpCenterIds)` — removes placements, keeps the canonical article.
- Refuses to distribute an article whose `origin_help_center_id` is set, unless the caller passes an
  explicit `promote: true` flag, which clears `origin_help_center_id` first.

### `lib/cloning`

- `cloneHelpCenter(sourceId, { name, slug, primaryHex, secondaryHex })` — one transaction: insert the
  new help center, bulk-copy `help_center_collections` and `help_center_articles` including
  overrides, set `cloned_from_id`, then enqueue search indexing for the new center.
- Clone copies overrides so the clone renders identically to its source on day one.
- Contributor-scoped articles (`origin_help_center_id` set) are **not** copied.

### `lib/branding`

- `buildTheme({ primaryHex, secondaryHex })` — converts each hex to OKLCH and emits an 11-step
  lightness ramp (`50`–`950`) per color, plus a foreground color chosen for contrast against each
  step at WCAG AA.
- Emitted as CSS custom properties on the tenant root element. Tailwind's theme references the
  variables, so there is no per-tenant CSS build.
- Pure and synchronous, so it is unit tested against known hex inputs.

### `lib/search`

- `indexArticle(helpCenterId, articleId)` — computes effective text, writes `article_search`,
  requests an embedding.
- `reindexArticleEverywhere(articleId)` — fans out across that article's placements.
- `searchHelpCenter(helpCenterId, query)` — one SQL function running keyword and vector searches as
  CTEs and fusing them with reciprocal rank fusion (`1 / (60 + rank)` per list, summed).
- `EmbeddingProvider` interface with a Voyage implementation. If embedding is unavailable, rows keep a
  null embedding and the fusion query degrades to keyword-only.

### `lib/import`

- `createImport(source, files | docIds)` → `imports` row plus one `import_items` row per document.
- Converters: `docxToHtml` (mammoth), `googleDocToHtml` (Docs API HTML export), `mdToHtml`.
- Shared `normalizeHtml(html)` pipeline: sanitize against an allowlist, demote headings so the
  article body starts at `h2`, download and re-host inline images to Supabase Storage, then convert
  to TipTap JSON.
- Every item resolves independently. One malformed document fails its own row with an error message
  and the batch continues.
- Output is always `status = 'draft'`. Publishing and distribution are separate, explicit steps.

### `lib/authz`

- `authorize(user, action, resource)` — the single decision point for every mutation. Server actions
  call it first and are otherwise free of role logic.
- RLS policies mirror the read rules as defense-in-depth: `anon` may read only published, non-hidden,
  public-audience content. All writes go through server actions using the service role.

## Routes

```
app/
  (public)/                       # tenant-resolved from Host
    page.tsx                      # hero search, collection grid
    search/page.tsx
    [collectionSlug]/page.tsx
    [collectionSlug]/[articleSlug]/page.tsx
    login/page.tsx                # gated centers only
  admin/
    help-centers/                 # list, create, clone, branding, domains
    articles/                     # list, editor, distribution panel
    collections/
    imports/                      # new import, review queue
    people/                       # invites, roles, audience members
  contribute/                     # contributor portal, scoped to one center
  api/
    imports/[id]/route.ts
    search/route.ts
    google/oauth/callback/route.ts
middleware.ts
```

## Public Reading Experience

Intercom-inspired and responsive from 320px up.

- **Home**: centered logo, headline, prominent search input, collection cards showing icon, title,
  description, and article count.
- **Collection**: breadcrumb, title, article list with excerpts.
- **Article**: max-width prose column, sticky table of contents from `h2`/`h3` on desktop,
  breadcrumb, previous/next within the collection, "Was this helpful?" vote.
- **Search**: instant dropdown from the header input with keyboard navigation, and a full results
  page with highlighted excerpts.
- Public pages are server-rendered and cached per tenant, invalidated by tag on publish.

## Error Handling

| Failure | Behavior |
| --- | --- |
| Unknown host | 404 shell with neutral branding; no stack trace, no redirect loop |
| Clone partially fails | Whole clone rolls back in one transaction; nothing half-created |
| Embedding provider down | Row keeps a null embedding, search degrades to keyword-only, retried by job |
| Import item fails | That item is marked `failed` with a message; siblings continue |
| Google OAuth token expired | Re-consent prompt on the import screen, no silent empty import |
| Custom domain unverified | Stays `pending`, admin shows required DNS records, subdomain keeps working |
| Contributor submits to a center they left | Rejected by `authorize()` with a clear message |

## Testing

**Unit (Vitest)**

- `mergeArticle` — every field, override present and absent, empty-string versus null.
- `buildTheme` — known hex inputs produce expected ramps; contrast pairs meet AA.
- `normalizeHtml` — heading demotion, script and style stripping, image rewriting.
- `distributeArticle` target resolution, including the contributor-article refusal.
- Reciprocal rank fusion ordering given synthetic keyword and vector rankings.

**End-to-end (Playwright)**

1. Clone the base help center, then assert the clone's published article set matches exactly.
2. Hide an article in one center; assert it is absent there and still present in the base.
3. Import a `.docx`, review the draft, publish to a selected pair of centers.
4. Invite a contributor, submit an article, staff reviews and publishes it to that center only.
5. Gated center: anonymous visitor is redirected to login; allowlisted email gets in.

Seeded test database per run. Policy tests assert `anon` cannot read draft or hidden content.

## Build Order

**Phase 1 — Foundations**
Schema and migrations, base help center seed, collections and articles CRUD, TipTap editor with
image upload, public rendering (home, collection, article), keyword search, admin shell and auth.

**Phase 2 — Multi-tenancy**
`cloneHelpCenter`, branding system and theme editor, subdomain middleware, placement overrides,
hide controls for articles and collections, drag ordering, distribution UI.

**Phase 3 — Ingest and people**
File upload import, Google Docs OAuth and import, review queue, invites and roles, contributor
portal, gated centers and audience members, semantic search, custom domains.

## Open Questions

None blocking. Revisit after phase 3: sitemap migration import, article analytics, redirects for
changed slugs.

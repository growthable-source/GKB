# Owner Content Management — Design

**Date:** 2026-08-06
**Status:** Approved

## Purpose

Let the owner of a help centre write and manage their own articles, and choose which of the shared
2,739 they show. Today a customer gets a branded skin they cannot change the contents of, which is
enough to sign up for and not enough to stay for.

This is the MVP for end users. Branded domains, teammate invites, and billing are a separate project
and are deliberately not here.

## Goals

1. An owner can create collections and articles that belong only to their help centre.
2. A rich editor: formatting, images, and pasted HTML from Google Docs, Notion, or a competitor.
3. An owner can hide any shared article that does not apply to them.
4. Their articles are searchable on their own help centre.
5. Nothing an owner writes can appear on the base centre or on another tenant's.

## Non-Goals

- **Editing shared articles.** Owners hide them or leave them. The override columns on
  `help_center_articles` stay unused.
- **Teammate invites** — a Pro feature, in the next project.
- **Branded domains and Stripe billing** — the next project.
- Approval workflows, scheduled publishing, article analytics, comments.

## Recorded Decisions

| Decision | Choice |
| --- | --- |
| Where tenant content lives | Their own collections, and articles added into shared collections |
| Shared articles | Hide only. No overrides, no appending. |
| Team access | Owner only. Invites become a Pro feature. |
| Slug uniqueness | Per owner, not global |
| Draft states | Reuse `articles.status`; nothing is live until published |

Hide-only is what keeps the landing page's claim true. "Maintained and expanded by us, new articles
appear as they are published" holds only while nobody has forked them — an overridden article
silently stops receiving updates, and a year later some agencies are serving instructions for a
feature that changed, with nobody watching.

## Schema

Migration `0010_tenant_content.sql`.

```sql
-- Collections gain an owner, matching the shape articles already has.
-- Null means base-owned and shared with every centre.
alter table collections
  add column origin_help_center_id uuid references help_centers(id) on delete cascade;

-- Slug uniqueness becomes per-owner, so two agencies can both have
-- "onboarding-checklist". The coalesce-to-sentinel trick is the one
-- memberships_unique already uses for its nullable scope column.
alter table articles drop constraint articles_slug_key;
create unique index articles_slug_per_owner on articles
  (coalesce(origin_help_center_id, '00000000-0000-0000-0000-000000000000'::uuid), slug);

alter table collections drop constraint collections_slug_key;
create unique index collections_slug_per_owner on collections
  (coalesce(origin_help_center_id, '00000000-0000-0000-0000-000000000000'::uuid), slug);

create index articles_origin on articles (origin_help_center_id)
  where origin_help_center_id is not null;
create index collections_origin on collections (origin_help_center_id)
  where origin_help_center_id is not null;

-- Tier gating needs somewhere to live before billing exists, so the Pro
-- project wires Stripe to a flag rather than migrating live tenants.
alter table help_centers
  add column plan text not null default 'free' check (plan in ('free','pro'));
```

Both constraint names are confirmed against the database (`pg_constraint`), not assumed.

**Tenant articles have no placement rows.** They are resolved directly by
`origin_help_center_id = <centre>`, not through `help_center_articles`. This is deliberate: per-centre
placement copying is what broke the original clone design, because PostgREST silently truncates a
select at 1,000 rows once a catalogue passes it. Nothing in this project may reintroduce it.

## Reads

Every public read becomes a merge of two sources: base-owned content minus this centre's exclusions,
plus content this centre owns.

| Read | Becomes |
| --- | --- |
| Collections index | base collections (minus hidden) + `origin_help_center_id = centre` |
| Articles in a collection | base articles (minus excluded) + centre-owned in that collection |
| Article by slug | centre-owned first, then base |
| Article counts | counted across both sources |

Article-by-slug precedence matters: slugs are unique per owner, so a centre may hold a slug that
also exists in the base library. Theirs wins on their own centre. Anything else means an owner
publishes an article and cannot reach it.

Within a collection, base articles keep their existing `help_center_articles.position` order and
tenant articles follow them alphabetically by title. Tenant articles have no placement row and
therefore no position of their own; drag-to-reorder is a deliberate omission, not an oversight, and
adding it later means a `position` column on `articles` rather than a rethink.

Caching follows the existing pattern in `lib/content/cached.ts`, with the centre id as part of the
cache key for the owned reads. The `CONTENT_ARTICLES_TAG` bust already in place covers both.

## Search

`article_search` is keyed `(help_center_id, article_id)`. Tenant articles get rows under their own
centre id, written by `reindexArticleEverywhere`'s owner-aware sibling. `searchHelpCenter` takes a
list of centre ids — the base and, when serving a tenant, theirs — instead of one.

Without this an owner's articles are invisible in their own search box, which reads as the feature
being broken rather than absent.

## Authorization

Today every article action authorizes against `getBaseHelpCenterId()`, which is exactly what refuses
customers, and that stays.

Owners get parallel actions in `app/dashboard/` that authorize against their own centre and then
assert ownership of the row:

```
await authorize('article.update', { helpCenterId: centre.id })
await assertOwnsArticle(centre.id, articleId)   // origin_help_center_id must match
```

The resource check alone is not sufficient. An owner legitimately holds `article.update` on their
own centre, so without the second assertion they could pass their own centre id while editing a
base-owned article — and `can()` would allow it. The two checks answer different questions: may this
person write articles here, and is this article theirs.

`editor` remains the role. The `memberships_scope_matches_role` constraint permits only `editor` or
`contributor` for a centre-scoped membership, and `editor` is the one that can publish.

## The Admin Area

`/dashboard` grows from one screen into four.

| Route | Holds |
| --- | --- |
| `/dashboard` | Live URL, article and collection counts, recent edits |
| `/dashboard/articles` | Their articles, and the shared library with hide/show toggles |
| `/dashboard/articles/[id]` | The editor |
| `/dashboard/collections` | Their collections: create, rename, reorder, delete |
| `/dashboard/appearance` | Branding, moved off the overview |

The shared library list is 2,739 rows, so it is paginated and searchable rather than rendered whole.
Hiding writes to `help_center_article_exclusions` from `0007` — the mechanism already exists and is
already respected by every public read.

Deleting a collection that still holds articles moves them to no collection rather than deleting
them. Losing an article because a category was tidied up is not recoverable from the UI.

## The Editor

`components/editor/article-editor.tsx` is reused as-is where possible. Three additions:

1. **An HTML source view** — a toggle between the rich editor and the underlying HTML, so an owner
   can paste markup wholesale or fix something the editor will not express.
2. **Image upload**, through a new dashboard-scoped route mirroring
   `app/api/dashboard/branding/route.ts` — same MIME allowlist, larger cap for article images.
   Pasted HTML drags in images hosted elsewhere; uploading them means they do not rot or hotlink.
3. **Sanitisation on every path.** `sanitizeArticleHtml` already exists and must run on save
   regardless of whether the content was typed, pasted, or written in the source view. Pasted HTML
   is the most likely way a script reaches a page their clients read, and the source view is an
   explicit invitation to hand-write markup.

`status` gates visibility: `draft` is invisible to readers, `published` is live. Nothing an owner
types is public until they say so.

## Error Handling

| Failure | Behaviour |
| --- | --- |
| Slug collides within their own centre | `nextAvailableSlug` scoped to the owner suffixes it, and the editor shows the final slug |
| Owner opens an article that is not theirs | 404, not 403 — a tenant should not learn another tenant's article ids exist |
| Pasted HTML contains scripts or unknown tags | Stripped by `sanitizeArticleHtml` on save, silently; the editor shows the sanitised result back |
| Image upload too large or wrong type | Rejected with the reason, editor keeps the draft |
| Collection deleted with articles in it | Articles survive with no collection, and the dashboard shows them under "Uncategorised" |
| Search index write fails after a save | The save stands; the article is missing from search until the next save. Logged, not raised. |

## Testing

**Unit (Vitest)**

- Per-owner slug scoping: the same slug for two different owners is allowed; twice for one owner is not.
- The merge: base + owned, with exclusions applied to the base half only.
- Article-by-slug precedence when a tenant slug shadows a base one.
- `assertOwnsArticle` rejects a base-owned article and another tenant's.
- Sanitisation of pasted HTML: script tags, event handlers, `javascript:` URLs.

**End-to-end (Playwright)**

1. **Cross-tenant isolation** — the one that matters most. Agency A publishes a collection and an
   article; they appear on A's centre, and are absent from the base centre and from B's, including
   in search results and collection counts.
2. An owner hides a shared article and it disappears from their centre only.
3. Draft articles are invisible to readers and visible in the dashboard.

## Build Order

1. Migration, plus per-owner slug helpers and their unit tests.
2. Read merge and search, with the cross-tenant e2e test. This is the risky half and it is
   independently testable before any UI exists.
3. Owner authorization and `assertOwnsArticle`.
4. The dashboard: articles list, collections, appearance move.
5. The editor: source view, uploads, sanitisation.
6. Shared-library hide/show.

Steps 1–3 carry all the tenant-isolation risk and should land and be verified before any editor
work starts.

## Deferred to the Pro Project

- Branded custom domains: Vercel Domains API, DNS verification UI.
- Teammate invites: the `invites` table exists and is unused.
- Stripe: products, checkout, subscription state, and gating on `help_centers.plan`.

# Article editing toolbar, delete, and per-centre exclusions

Date: 2026-08-04

## Problem

Three gaps in article authoring:

1. **The editor has no toolbar.** TipTap is fully wired up in
   `components/editor/article-editor.tsx`, but the only visible control is
   "Insert image". Bold, headings, lists and links work solely through markdown
   input rules or keyboard shortcuts, which is invisible to anyone who does not
   already know them.

2. **Delete does not exist.** Create, read and update all do. `article.delete`
   has been a defined permission since `0001` with nothing implementing it.

3. **Every article appears on every help centre, unconditionally.** Centres are
   brand skins over one shared pool, so there is no way to keep an article off
   one tenant's site.

## Decisions

| Question | Decision |
| --- | --- |
| Exclusion storage | A dedicated `help_center_article_exclusions` table |
| Exclusion UI | On the article editor: all centres by default, tick to exclude |
| Search | Excluded articles filtered at query time from the shared index |
| Direct URL to an excluded article | 404 on that centre |
| Toolbar | Bold, italic, H2/H3/H4, lists, link, quote, code, undo/redo |
| Extra CRUD | Delete only — no unpublish, archive or duplicate |

### Why a separate table, and why exclusions rather than inclusions

Storing *inclusions* would mean a row per article per centre: 2,739 × 5 today,
growing with both. That is precisely the shape that broke before — a per-centre
copy silently truncated at PostgREST's 1,000-row cap and left a centre showing
1,000 of 2,738 articles.

Exclusions are sparse. A centre showing everything has zero rows. The table
starts empty, so nothing changes on deploy and there is no backfill.

A dedicated table rather than `help_center_articles.is_hidden` on non-base rows:
the invariant "non-base centres have no placement rows" is load-bearing and
documented in several places, and a cleanup script has already been written once
against it. An exclusion row must not be mistakable for content.

### The base centre is not excludable

Excluding an article from `base` removes it from the pool every centre reads
through — a different and far more destructive operation than hiding it from one
tenant. `base` is omitted from the checkbox list and rejected in the server
action. Use draft/unpublish to take an article off every site.

## Read-path design

Content queries currently take one id: the base centre that owns the content.
Exclusions belong to the *active* centre, so both are now needed.

The naive approach — passing the active centre into every cached content query —
would multiply every cache entry by the number of centres, for data that is
identical across them. Instead:

- **Content stays cached once**, keyed by base id, exactly as now.
- **The exclusion set is cached separately**, keyed by active centre id, under a
  new `EXCLUSIONS_TAG`. It is one small query returning ids.
- **Filtering happens after the cached read**, as a `Set.has` per row.

`countArticlesPerCollection` cannot subtract exclusions from a pre-aggregated
count, so it is split: a cached `listArticleCollectionIndex(baseId)` returns
`{ id, collectionId }` for every visible published article, and counting becomes
a pure function over that index minus the exclusion set. The index is one shared
cache entry, not one per centre.

The exclusion set crosses the data cache, so it is stored and returned as an
**array**, not a `Set` — `unstable_cache` round-trips through JSON, which turns a
`Set` into `{}`. (The same trap already cost a silent "0 articles" bug on
`countArticlesPerCollection`.)

### Search

`searchHelpCenter` reads base's index and filters excluded ids from the results.
Because filtering happens after the limit is applied, a centre with exclusions
over-fetches by the size of its exclusion set (capped) and then slices back to
the requested limit, so a search does not silently return fewer hits than asked
for.

Reindexing per centre was rejected: it multiplies 2,739 search rows by the centre
count, which is the duplication this design exists to avoid, and it goes stale
whenever an exclusion changes.

## Components

- `supabase/migrations/0007_article_exclusions.sql` — the table.
- `lib/tenancy/exclusions.ts` — `getExcludedArticleIds(helpCenterId)`, cached
  cross-request under `EXCLUSIONS_TAG` and per-request with React `cache()`.
- `lib/content/queries.ts` — `listArticleCollectionIndex` replaces the
  aggregation inside `countArticlesPerCollection`, which becomes pure.
- `components/editor/editor-toolbar.tsx` — buttons over the already-configured
  StarterKit extensions. No new TipTap extensions, so no sanitizer change.
- `components/editor/center-visibility.tsx` — the exclusion checkboxes.
- `deleteArticle` in `app/admin/articles/actions.ts` — `article.delete`, then
  `redirect('/admin/articles')`.

## Cache invalidation

- `setArticleExclusions` → `updateTag(EXCLUSIONS_TAG)`
- `deleteArticle` → `updateTag(CONTENT_ARTICLES_TAG)`

## Testing

- Exclusion filtering: an excluded article is absent from the collection
  listing, absent from counts, absent from search, and 404s by direct URL — all
  on the excluded centre only, while remaining visible on every other centre.
- The base centre cannot be excluded, via the action, not just the UI.
- Delete removes the article and leaves no orphaned placement, search or
  exclusion rows.
- Existing suites stay green; the content query signatures change, so
  `merge.test.ts` and the tenancy tests are the ones to watch.

## Out of scope

- Bulk exclusion management from the help centre page. With five centres the
  article-side checkboxes are enough; at fifty this wants rethinking.
- Unpublish, archive and duplicate.
- Tables in the editor.

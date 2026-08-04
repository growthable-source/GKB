# Help center theming and category emojis

Date: 2026-08-04

## Problem

A help center's brand is currently three fields: two accent hexes, a logo and a
favicon. Colour is applied only as low-strength tints — `globals.css` deliberately
never uses a tenant hex as a full-strength background, because an arbitrary hex on
a white page is a readability risk.

That is too little to make a center feel like the tenant's own. Three things are
missing, and two of the columns for them already exist and sit unused:

- a real background treatment (solid or gradient) for the homepage hero
- a font choice, chosen by the person configuring the center
- category tiles that are recognisable at a glance

Separately, a help center cannot be edited at all after creation. There is a create
form and nothing else, so the live site's appearance cannot be changed.

## Decisions

| Question | Decision |
| --- | --- |
| Where do the controls live? | A full edit page at `/admin/centers/[id]`, plus the new fields on the create form |
| How far does brand colour spread? | Gradient (or solid) fills the **hero band only**. Body and article text stay on white |
| Tiles per row | A 2 / 3 / 4 setting, default 3, stepping down responsively |
| Renaming a subdomain | Allowed. The old URL stops working immediately, with a warning in the UI |
| Category emojis | Backfilled for all 26 existing collections, each editable afterwards |
| Font list | ~18 curated by archetype, self-hosted |
| Heading vs body font | Separate pickers |

### Why hero-only

Confining colour to the hero keeps the existing `globals.css` invariant intact: a
tenant can pick any hex and article body text is still black on white. It also
means the risky case — a long-form article page rendered on a dark gradient — never
arises. A full-page gradient was considered and rejected for that reason.

### Why a curated font list

`next/font/google` resolves at build time. A tenant cannot type a font name and have
it work; the set must be fixed when the app is built. The alternative — injecting a
`<link>` to Google Fonts per tenant — supports any font but adds a render-blocking
third-party request to every page and puts tenant-supplied text into a URL. The site
was just taken from 7.6s to ~0.1s TTFB; that is not a trade worth making.

The list being fixed does not make it short. Only the font a center actually uses is
downloaded, so length costs build time and the admin's ability to choose well, not
page weight. Eighteen covers each archetype — neutral, geometric, rounded,
grotesque, serif, mono — without near-duplicates.

## Data model

One migration. Typed columns with CHECK constraints rather than loose `settings`
keys, so an invalid value cannot reach the renderer.

Already present, currently unused:

- `help_centers.font_family` — becomes the **body** font key
- `collections.icon` — becomes the category emoji

Added to `help_centers`:

| Column | Type | Default | Notes |
| --- | --- | --- | --- |
| `hero_style` | text | `'gradient'` | CHECK in (`'solid'`, `'gradient'`) |
| `hero_from_hex` | text null | null | Falls back to `primary_hex` |
| `hero_to_hex` | text null | null | Falls back to `secondary_hex` |
| `hero_angle` | int | 135 | CHECK between 0 and 360 |
| `heading_font` | text null | null | Font key; null falls back to the body font |
| `tiles_per_row` | int | 3 | CHECK in (2, 3, 4) |

`hero_from_hex` / `hero_to_hex` are nullable on purpose: most centers will want the
gradient to be their brand colours, and null means exactly that. They exist so a
center can set a background independent of its accent colours without being forced
to distort `primary_hex` to do it.

## Components

**`lib/tenancy/theme.ts`** — pure, no I/O, unit-tested beside `safeHex`.

- `heroBackground(center)` → the CSS `background` value for the hero
- `heroForeground(center)` → `'light' | 'dark'`, from the relative luminance of the
  resolved hero colours

Contrast is the one real correctness risk in this change. The hero carries text, so
a pale brand colour would otherwise render white-on-white. Deriving the foreground
rather than storing it means a tenant cannot configure an unreadable hero.

**`lib/fonts/catalog.ts`** — all 18 families instantiated at module scope, which
`next/font` requires. Every family except the default gets `preload: false`. Exports
an ordered catalog (key, label, CSS variable, category) for the picker, and a
`fontVariable(key)` lookup.

The root layout applies every family's `.variable` class to `<html>`. That only
*declares* 18 CSS custom properties; a family is fetched when a rule references it.
The public layout then sets `--hc-font-heading` and `--hc-font-body` inline from the
active center, mirroring how `--hc-primary` already works.

**`app/admin/centers/[id]/page.tsx`** and `updateHelpCenter` — the edit page. Slug
changes validate format and uniqueness and reject conflicts rather than silently
appending a suffix.

**`updateCollection`** — new. Collections have create and delete but no update, so
the emoji override needs one.

**`scripts/backfill-collection-emojis.mts`** — idempotent, keyed by slug, only fills
rows where `icon is null`. Re-running never overwrites a manual edit.

## Cache invalidation

The reader paths added in `a85239f` are cached, so every new mutation must bust its
tag or changes will not appear for up to five minutes:

- `updateHelpCenter` → `updateTag(BRAND_TAG)`
- `updateCollection` → `updateTag(CONTENT_COLLECTIONS_TAG)`

The backfill script writes out of band and cannot call `updateTag`; the 300s TTL is
the backstop there.

## Testing

- `theme.ts` unit tests: gradient string for both styles, hex fallback when
  `hero_from_hex` is null, and foreground selection across light, dark and
  mid-luminance colours including the existing defaults.
- Slug rename: uniqueness conflict rejected, format validated, unchanged slug is a
  no-op rather than a self-conflict.
- Existing suites must stay green; `merge.test.ts` and the tenancy tests are the
  ones that touch these types.
- Manual verification against the local stack: gradient renders, font switches,
  tile density changes, emoji shows, and a publish still invalidates.

## Out of scope

- Per-article or per-collection theming
- Uploading a custom font file (`next/font/local`) — the escape hatch if the curated
  list proves insufficient
- Redirects from a previous subdomain; renaming breaks the old URL by decision
- Dark mode, which no page in this app has ever had

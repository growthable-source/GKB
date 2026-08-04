-- Articles a given help center must NOT show.
--
-- Deliberately an EXCLUSION list, not an inclusion list. Help centers are brand
-- skins over one shared content pool (see lib/tenancy/active.ts), so the default
-- is "every center shows everything" and only the exceptions are stored. A
-- center showing the whole catalog has zero rows here.
--
-- Storing inclusions instead would mean a row per article per center — the same
-- shape that previously truncated at PostgREST's 1,000-row select cap and left a
-- center rendering 1,000 of 2,738 articles.
--
-- This is NOT help_center_articles. That table holds the base center's content
-- placements, and the invariant that non-base centers have no rows in it is
-- load-bearing; an exclusion must never be mistakable for a placement.
-- IF NOT EXISTS throughout: this migration partially applied once (the table
-- landed, the index did not), so it has to be safe to re-run to completion.
create table if not exists help_center_article_exclusions (
  help_center_id uuid not null references help_centers(id) on delete cascade,
  article_id     uuid not null references articles(id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (help_center_id, article_id)
);

-- Every read is "the exclusions for one center", which the PK's leading column
-- already serves. The reverse lookup — "which centers exclude this article" —
-- is what the editor loads per article, and needs its own index.
create index if not exists help_center_article_exclusions_article
  on help_center_article_exclusions (article_id);

comment on table help_center_article_exclusions is
  'Sparse: only articles a center must hide. No row means visible.';

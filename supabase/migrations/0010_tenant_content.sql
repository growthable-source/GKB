-- Tenant-authored content.
--
-- Help centre owners get collections and articles of their own, alongside the
-- shared library the base centre owns. Ownership is a column, not a copy:
-- tenant content is resolved by origin_help_center_id, never through
-- help_center_articles placement rows. Per-centre placement copying is what
-- broke the original clone design — PostgREST silently truncates a select at
-- 1,000 rows once a catalogue passes it, and the base catalogue is at 2,739.

-- Collections gain the owner column articles already had. Null means
-- base-owned, and therefore shared with every centre.
alter table collections
  add column origin_help_center_id uuid references help_centers(id) on delete cascade;

-- Slug uniqueness becomes per-owner so two agencies can each have an
-- "onboarding-checklist". The coalesce-to-sentinel trick is the one
-- memberships_unique already uses for its nullable scope column: null is not
-- distinct-comparable in a unique index, so it is mapped to a fixed uuid that
-- no help center can hold.
alter table articles drop constraint articles_slug_key;
create unique index articles_slug_per_owner on articles
  (coalesce(origin_help_center_id, '00000000-0000-0000-0000-000000000000'::uuid), slug);

alter table collections drop constraint collections_slug_key;
create unique index collections_slug_per_owner on collections
  (coalesce(origin_help_center_id, '00000000-0000-0000-0000-000000000000'::uuid), slug);

-- Every tenant read filters on the owner, and the partial form keeps the index
-- small: the overwhelming majority of rows are base-owned and stay out of it.
create index articles_origin on articles (origin_help_center_id)
  where origin_help_center_id is not null;
create index collections_origin on collections (origin_help_center_id)
  where origin_help_center_id is not null;

-- Tier gating needs somewhere to live before billing exists, so the Pro
-- project wires Stripe to a flag that is already here rather than migrating
-- live tenants. Nothing reads this yet.
alter table help_centers
  add column plan text not null default 'free' check (plan in ('free','pro'));

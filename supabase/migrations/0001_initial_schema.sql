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
  search_vector  tsvector generated always as (
                   setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
                   setweight(to_tsvector('english', coalesce(body_text, '')), 'B')
                 ) stored,
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

-- Triggers -------------------------------------------------------------------

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

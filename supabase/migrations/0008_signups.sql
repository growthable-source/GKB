-- Self-serve signup funnel.
--
-- One row per person who starts at /get, written at every step so an abandoned
-- signup is still a lead and a refresh resumes where it left off. The row is
-- the funnel's only state: there is no session until the very last step, when
-- the magic link claims it.

create table signups (
  id                uuid primary key default gen_random_uuid(),
  token             text not null unique,        -- httpOnly cookie value
  email             text not null,               -- lowercased, work-email verified
  full_name         text not null,

  -- Survey. Deliberately text, not enums or check constraints: these are
  -- marketing taxonomy, and rewording an option should not need a migration.
  role              text,
  company_size      text,
  agency_name       text,
  subaccount_count  text,
  marketing_opt_in  boolean not null default true,
  consented_at      timestamptz,

  -- Builder draft. branding is JSONB rather than mirrored appearance columns
  -- because toAppearanceColumns() (lib/tenancy/appearance.ts) already validates
  -- a partial appearance input, and that schema has changed once already
  -- (0006_theming.sql). A blob validated at claim time keeps this table out of
  -- every future appearance migration.
  center_name       text,
  center_slug       text,
  branding          jsonb not null default '{}',

  step              text not null default 'details'
                      check (step in ('details','role','company_size','agency_name',
                                      'subaccount_count','opt_in','build','claim','done')),

  help_center_id    uuid references help_centers(id) on delete set null,
  claimed_at        timestamptz,
  delivered_at      timestamptz,                 -- stamped by the CRM seam

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Reservations, held only while a signup is pending: one email cannot start two
-- signups, and two people cannot race for the same address.
create unique index signups_pending_email
  on signups (lower(email)) where claimed_at is null;

create unique index signups_pending_slug
  on signups (lower(center_slug)) where claimed_at is null and center_slug is not null;

create index signups_claimed_at on signups (claimed_at);

create trigger signups_updated_at before update on signups
  for each row execute function set_updated_at();

-- Writes all go through server code holding the service role. No anon access.
alter table signups enable row level security;

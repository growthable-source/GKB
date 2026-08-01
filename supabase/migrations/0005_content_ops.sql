-- Content-ops snapshots: results from scripts/content-ops/{audit,gap,rewrite}.mts,
-- pushed to the DB so the deployed app (which cannot read local import/ops/*.json
-- files) can render them in app/admin/ops.

create table ops_snapshots (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('audit','gaps','rewrites')),
  payload    jsonb not null,
  created_at timestamptz not null default now()
);

create index on ops_snapshots (kind, created_at desc);

-- Same posture as 0003_grants.sql: service_role only, since the default
-- privileges set up there only cover tables created by `postgres` going
-- forward — this table already exists by the time this grant runs, so it
-- needs its own explicit grant rather than relying on ALTER DEFAULT PRIVILEGES.
grant all privileges on table ops_snapshots to service_role;

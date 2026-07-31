-- Migration 0001 created every table as `postgres`, and this project's default
-- privileges do not extend DML to the Supabase API roles, so `service_role` was
-- left with only REFERENCES/TRIGGER/TRUNCATE. Without the grants below every
-- server-side query fails with "permission denied for table ...".
--
-- Deliberately asymmetric: `service_role` is the key the Next.js server uses and
-- it gets full access, because all authorization is enforced in application code
-- by lib/authz/authorize.ts. `anon` and `authenticated` get NOTHING on public
-- tables. Row Level Security is not enabled until Phase 3, so granting those
-- browser-reachable roles any SELECT today would expose every draft and hidden
-- article to anyone holding the public anon key. They need no public-table access
-- in Phase 1 — the anon key is used only for GoTrue auth calls against the auth
-- schema. Grant them read access in the same change that turns RLS on, never before.

grant usage on schema public to service_role;

grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Future tables, sequences, and functions created by `postgres` in this schema.
alter default privileges in schema public
  grant all privileges on tables to service_role;
alter default privileges in schema public
  grant all privileges on sequences to service_role;
alter default privileges in schema public
  grant execute on functions to service_role;

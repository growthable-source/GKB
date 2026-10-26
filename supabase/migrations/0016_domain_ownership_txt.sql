-- Custom-domain ownership proof.
--
-- A pending hostname must not lock the name globally or attach to the
-- shared Vercel project. Only an active row is exclusive. Each centre
-- keeps one domain row; ownership_token is the TXT we asked them to
-- publish before we attach.

alter table custom_domains
  add column if not exists ownership_token text;

alter table custom_domains
  drop constraint if exists custom_domains_hostname_key;

create unique index if not exists custom_domains_active_hostname
  on custom_domains (hostname)
  where status = 'active';

create unique index if not exists custom_domains_one_per_center
  on custom_domains (help_center_id);

-- The AI chat widget upsell.
--
-- Xovera provisions and owns the agent, the workspace, and the billing. This
-- table is only our end of the association: which help centre has an install,
-- and enough of the last known response to render the embed without a network
-- call on every public page view.
--
-- Deliberately thin. Xovera's provisioning is idempotent on external_id and
-- every field below can be re-read from GET /installs/{externalId}, so this is
-- a cache, not a source of truth. The one thing that is genuinely ours is the
-- association itself — and even that is derivable, since external_id is a pure
-- function of help_center_id (see lib/ai-widget/external-id.ts).

create table ai_widget_installs (
  -- One install per centre, so the help centre id IS the key. A second row for
  -- the same centre would mean a second Xovera workspace billed to the same
  -- customer, which is the exact failure the brief warns about.
  help_center_id  uuid primary key references help_centers(id) on delete cascade,

  -- What we send Xovera as externalId. Stored rather than only derived so that
  -- a support query can go from a Xovera install back to a centre without
  -- knowing the derivation, and so a future change to the derivation cannot
  -- orphan existing installs.
  external_id     text not null unique,

  -- Xovera's identifiers. Nullable because a row exists from the moment we
  -- start provisioning, which is before we know any of them.
  install_id      text,
  workspace_id    text,
  widget_id       text,
  widget_public_key text,

  -- The embed, split. script_src is parsed out of Xovera's embedSnippet and
  -- validated as an https URL at write time (lib/ai-widget/snippet.ts) so the
  -- public layout can render a real <script> element instead of injecting a
  -- third-party HTML string into every tenant's pages. embed_snippet keeps the
  -- raw response for support.
  script_src      text,
  embed_snippet   text,

  -- Mirrors Xovera's install status. 'disabled' is set by our own cancel, and
  -- is what stops the script being injected.
  status          text not null default 'provisioning'
                    check (status in ('provisioning','ready','failed','disabled')),
  failure_reason  text,

  trial_ends_at   timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table ai_widget_installs is
  'Local half of a Xovera AI chat widget install. A cache of Xovera state, not a source of truth.';
comment on column ai_widget_installs.external_id is
  'The stable join key sent to Xovera as externalId. Never regenerate it for an existing centre.';

-- No secondary index: every read is `where help_center_id = $1`, which the
-- primary key already serves.

create trigger ai_widget_installs_updated_at before update on ai_widget_installs
  for each row execute function set_updated_at();

-- Writes and reads all go through server code holding the service role, behind
-- authorize(). No anon access and no policies, same as signups —
-- widget_public_key is public by design, but install_id and workspace_id are
-- not, and nothing in a browser needs to query this table directly.
alter table ai_widget_installs enable row level security;

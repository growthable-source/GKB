# AI chat widget — design

A paid upsell in the customer dashboard. One click provisions a Xovera AI chat
widget and puts it live on that customer's help centre, with no snippet to copy
and no second app to visit. Xovera owns the agent, the workspace, and the
billing; we own the button, the embed, and the association.

Contract: `docs/api/v1-partner-provisioning.md` in the `ghl-agent` repo.

## Shape

```
dashboard click ──▶ addWidget() ──▶ POST /api/v1/partner/installs
                        │                     │
                        │                     └─▶ installId, widget, embedSnippet
                        ▼
              ai_widget_installs row ──▶ public layout renders <script>
```

Four calls, all server-to-server: provision, mint builder link, read status,
cancel. `lib/ai-widget/client.ts` is the only thing that speaks to Xovera.

## Decisions

**`externalId` is derived, not generated.** `hc_{help_center_id}`
(`lib/ai-widget/external-id.ts`). Xovera is idempotent on this key, so a value
that varies per click would provision a second workspace and bill the customer
twice — the most expensive bug available in this integration. Deriving it means
there is no window where a row was written but the key was not, and a lost row
is recoverable by calling Xovera with the same key. It is still persisted so
support can walk the association backwards.

**The row is a cache, not a source of truth.** Everything in
`ai_widget_installs` can be re-read from `GET /installs/{externalId}`. It exists
so a public page view does not pay a third-party round trip to discover that
the overwhelming majority of centres have no widget.

**We parse the snippet rather than inject it.** Xovera returns `embedSnippet` as
a ready-to-paste `<script>` string. Injecting it would mean
`dangerouslySetInnerHTML` on every page of every tenant's help centre — a
third-party string in the worst possible place. Instead `lib/ai-widget/snippet.ts`
extracts exactly one value, the `src`, and validates it as an https URL; the
widget id and public key come from the typed `widget` object in the same
response. The public layout then renders a real `<script>` element.

**Status is claimed before the call, not after.** `markProvisioning` writes the
row (and the external id) before `POST /installs`. A timeout mid-provision then
leaves a row that knows its own key, so the retry resumes rather than starting
over. The provisioning screen carries a retry button for exactly this reason —
without it, a crash between the two writes strands that screen forever.

**The builder URL is minted per mount, never stored.** The token is single-use
and lives 10 minutes, so caching it breaks the second open *and* a plain page
refresh. `POST /api/dashboard/ai-widget/builder-link` takes no parameters — the
centre comes from the session, so nobody can mint a link into a workspace that
is not theirs.

**Injection is keyed on the brand centre**, `getActiveHelpCenter().id`, not
`getBaseHelpCenterId()`. The latter owns the shared content and would put one
agency's widget on every help centre we serve.

**The snippet is shown, but only for placements we do not own.** The brief says
not to show the snippet and ask the customer to paste it — that is right for the
help centre, which we render and inject ourselves. It does not cover the second
placement customers want: their own HighLevel agency, where we have no pages to
inject into. So the dashboard renders the embed code under a heading that says
plainly that the help centre is already handled. The live snippet from
`GET /installs` wins over the stored one, falling back when Xovera is
unreachable. **This placement depends on open item 3 below.**

**The paused toggle is not mirrored.** Xovera's builder has a live/paused
switch. Mirroring it would mean polling their API on public page renders;
their own script decides whether to draw anything, so we let it.

## Copy

The corpus every provisioned agent reads is the **public GoHighLevel help
centre** (~24k passages) — not the customer's own articles. Per-customer content
is a planned follow-up on Xovera's side.

So the dashboard promises GoHighLevel answers and nothing else. "Answers your
clients' GoHighLevel questions instantly" is true; "an AI trained on your
business" is not, and the customer would find out in their first conversation.
When per-customer content lands, `PITCH` in `app/dashboard/ai-agent/page.tsx` is
the one place to change.

## Open items for Ryan

1. **`XOVERA_API_KEY`** — org-scope (`vox_live_…`), needs setting in Vercel.
   Unset is a supported state: the dashboard shows the feature as unavailable
   rather than failing on click.
2. **`PARTNER_FRAME_ANCESTORS`** — Xovera must list our admin origins or the
   browser refuses to render the builder iframe. Send them the production
   dashboard origin plus any preview origins that need it.
3. **The origin allowlist blocks the HighLevel placement, and the API has no
   field to fix it.** `helpCenterUrl` is the only origin input the provisioning
   payload accepts, and per the brief it exists precisely so "the embed can't be
   lifted onto an unrelated site". A customer's HighLevel agency IS an unrelated
   site by that rule, so the pasted snippet will be refused unless one of these
   happens on Xovera's side:
   - the allowlist gains the HighLevel domains (including white-labelled ones,
     which vary per agency, so this may need to be per-install); or
   - provisioning accepts an `origins` array, and we send it; or
   - the widget authenticates on its public key alone and the origin check is
     advisory.

   The dashboard UI for this placement is built and ready. Until one of the
   above lands it will hand customers a snippet that does not run.

4. **Origin allowlist is also coarse for path-addressed centres.** A
   path-addressed centre's URL is `https://app.growthable.io/hc/{slug}` — an
   origin shared with every other centre on the deployment. Isolation between
   those tenants rests on the widget's public key, not the origin.
   Custom-domain centres get real per-tenant isolation.
5. **Write budget is 60 per 10 minutes for the whole integration**, not per
   customer. Fine for click-driven provisioning; it would not survive a
   backfill. If we ever bulk-provision existing centres, it needs throttling.

## Verification

`pnpm test`, `pnpm tsc --noEmit`, `pnpm lint`, and `pnpm build` all pass. The
brief's end-to-end checklist (widget appears, answers, no duplicate on second
click, colour change propagates, refresh re-mints, blocked-cookie fallback,
DELETE stops the script) needs a real `XOVERA_API_KEY` and has not been run.

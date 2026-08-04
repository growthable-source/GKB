# Self-Serve Signup and Customer Dashboard — Design

**Date:** 2026-08-05
**Status:** Approved

## Purpose

Let a GoHighLevel agency claim its own branded help center without talking to anyone. A visitor
lands on a marketing page, gives a work email, answers five qualifying questions, brands the center,
and confirms the email. The center goes live immediately, populated with the entire shared library.

The product is free. The agency pays in survey answers and a marketing opt-in.

## Goals

1. A marketing landing page with one call to action.
2. A typeform-style survey capturing role, company size, agency name, sub-account count, and a
   marketing opt-in.
3. Work-email-only signup. Free providers are turned away.
4. A branding form with a live preview, ending in a live help center.
5. A customer dashboard scoped to the one center the customer owns.
6. Partial-lead capture: every abandoned signup is a row you can market to.

## Non-Goals

- Billing. Signup is free, with no plan picker, trial clock, or card capture.
- Customer custom domains. Every center gets a path today; `custom_domains` resolution already
  exists and stays untouched.
- Customer-authored articles. Signups read the shared library and hide what does not apply.
- More than one help center per user.

## Recorded Decisions

| Decision | Choice |
| --- | --- |
| What a signup gets | A branded skin over the shared library. No change to the content model. |
| Auth timing | Magic link last. The link claims the center and makes it live. |
| Funnel state | A server-side `signups` row, written at every step. |
| Survey destination | Postgres, with delivery behind a one-function seam. |
| Post-signup surface | A new customer dashboard. `/admin` stays internal. |
| Center addressing | Path-based at `/hc/{slug}`, with host resolution preserved. |
| Marketing opt-in | Required and pre-ticked. |

The opt-in decision carries a known risk, recorded here rather than argued again: consent that is a
condition of the service is the bundled-consent pattern GDPR Article 7(4) treats as not freely
given, and a pre-ticked box is invalid consent under the same regime. This binds any EU or UK
agency that signs up. Australian Spam Act consent is more permissive. The design stamps
`consented_at` so the record exists whatever the regime.

## URL Model

| URL | Serves |
| --- | --- |
| `whitelabelghl.growthable.io/get` | Marketing page and the whole signup funnel |
| `whitelabelghl.growthable.io/` | The base help center |
| `whitelabelghl.growthable.io/hc/acme` | A customer help center |
| `whitelabelghl.growthable.io/dashboard` | The customer dashboard |

`get`, `hc`, and `dashboard` join `RESERVED_SLUGS` (`lib/tenancy/reserved-slugs.ts`), so no
collection or center can ever claim those paths.

## Schema

One new table. Nothing in the content model changes.

```sql
create table signups (
  id                uuid primary key default gen_random_uuid(),
  token             text not null unique,        -- httpOnly cookie value
  email             text not null,               -- lowercased, work-email verified
  full_name         text not null,
  role              text,
  company_size      text,
  agency_name       text,
  subaccount_count  text,
  marketing_opt_in  boolean not null default true,
  consented_at      timestamptz,
  center_name       text,
  center_slug       text,
  branding          jsonb not null default '{}',
  step              text not null default 'details'
                      check (step in ('details','role','company_size','agency_name',
                                      'subaccount_count','opt_in','build','claim','done')),
  help_center_id    uuid references help_centers(id) on delete set null,
  claimed_at        timestamptz,
  delivered_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index signups_pending_email
  on signups (lower(email)) where claimed_at is null;

create unique index signups_pending_slug
  on signups (lower(center_slug)) where claimed_at is null and center_slug is not null;

create trigger signups_updated_at before update on signups
  for each row execute function set_updated_at();
```

Two choices deserve their reasons.

**Survey answers are `text`, not enums or check constraints.** They are marketing taxonomy. You will
reword "21–50 staff" without wanting a migration.

**Branding is JSONB, not mirrored columns.** `toAppearanceColumns()` (`lib/tenancy/appearance.ts`)
already validates a partial appearance input, and the appearance schema has changed once already in
`0006_theming.sql`. A blob validated through the existing helper at claim time keeps the funnel out
of every future appearance migration.

The two partial unique indexes hold reservations while a signup is pending: one email cannot start
two signups, and two people cannot race for one slug.

## Tenancy: a Path Channel

Middleware rewrites `/hc/acme/billing/refunds` to `/billing/refunds` and sets two request headers:

- `x-help-center-slug: acme`
- `x-help-center-base-path: /hc/acme`

The existing `(public)` routes then serve customer centers unchanged. This reuses the mechanism
`?preview=` already relies on — middleware is the only layer holding both the URL and the ability to
inject headers for downstream Server Components.

`getActiveHelpCenter()` (`lib/tenancy/active.ts`) gains one lookup inside its existing
`Promise.all`. Precedence, decided by the order of the checks and not by which query resolves first:

1. `?preview=<slug>`
2. Path slug, from `x-help-center-slug`
3. Custom domain, matched on Host
4. Host subdomain label
5. The base center

Host resolution is untouched. Moving a customer to `help.theiragency.com` later is a DNS change plus
a redirect, not a rebuild.

The path slug lookup is cached like the host lookups. It is safe to cache for the same reason: the
slug reaches it only through a path this deployment serves, and an unknown slug falls through to the
base center rather than erroring.

**Link prefixing is the cost.** A new `basePath()` helper reads `x-help-center-base-path` and
returns `''` for the base center. Every public link passes through it:
`app/(public)/layout.tsx`, `app/(public)/page.tsx`, `app/(public)/[collectionSlug]/page.tsx`,
`app/(public)/[collectionSlug]/[articleSlug]/page.tsx`, `app/(public)/a/[articleSlug]/route.ts`,
and `components/public/search-box.tsx`. Missing one sends a customer's visitor to the base center,
which is why an end-to-end test pins it.

## Admin Isolation Fix

`app/admin/layout.tsx` admits anyone holding any membership. A self-serve customer holds an `editor`
membership scoped to their own center, so today's layout would seat them inside the internal admin
shell, reading the shared article list. The mutations would fail — the article actions authorize
against `getBaseHelpCenterId()` — but the page reads are not authorized at all.

The layout must require a global membership, meaning `help_center_id is null`. This is a live
tenant-isolation hole the moment self-serve ships.

## The Funnel

### Landing — `/get`

One call to action, repeated: an email field in the hero that starts the funnel on submit. The
strongest claim available is that the library is already written, so the hero shows the table of
contents with live article counts read from the base center, not hardcoded numbers.

### Details — `/get/details`

Full name and work email, the email carried over from the hero as a query parameter and prefilled
here. The hero itself writes nothing: submitting this screen is what creates the `signups` row and
sets the httpOnly token cookie. One screen owns the write.

The work-email rule is a domain blocklist in `lib/signup/free-email-domains.ts`, enforced
server-side with a client-side hint for speed. It is a qualification measure, not a security
control: a blocklist never catches every free provider, and anyone determined can register a domain.
It stops Gmail and Hotmail signups, which is the whole intent.

### Survey — `/get/survey/[step]`

One question per screen, with a progress bar and keyboard advance. Each answer writes to the row
before routing to the next step, so a refresh or a back button resumes exactly where it left off.

| Step | Question | Options |
| --- | --- | --- |
| `role` | Your role | Agency owner · Marketing lead · Support lead · Developer · Other |
| `company_size` | Company size | 1–5 · 6–20 · 21–50 · 51–200 · 200+ |
| `agency_name` | Agency name | Free text. Prefills the center name. |
| `subaccount_count` | Sub-accounts you run | 1–10 · 11–50 · 51–200 · 201–500 · 500+ |
| `opt_in` | Marketing emails | Checkbox, pre-ticked and required to continue |

The `opt_in` step stamps `consented_at` alongside the boolean.

### Builder — `/get/build`

One screen, not a wizard, with a live preview of the real help center beside the controls. Center
name prefilled from the agency name; address checked for availability as they type; logo, favicon,
colors, fonts, and hero style. It reuses `components/admin/appearance-fields.tsx` and
`/api/uploads/branding` rather than growing a parallel set of controls.

Slug availability checks three sources: `RESERVED_SLUGS`, existing `help_centers` rows, and other
pending signups.

Article visibility is deliberately absent. The list is long, and it would stall the momentum
immediately before the payoff. It lives in the dashboard.

### Claim — `/get/claim`

Submitting the builder sends the magic link. `app/auth/confirm/route.ts` gains a `next` pointing
here. The route then, in order:

1. Reads the verified email from the session.
2. Finds the unclaimed `signups` row by `lower(email)`.
3. Validates `branding` through `toAppearanceColumns()`.
4. Creates the center with `createBrandedHelpCenter()` (`lib/tenancy/create-center.ts`).
5. Inserts a membership: `(user_id, help_center_id, 'editor')`. The
   `memberships_scope_matches_role` constraint permits only `editor` or `contributor` for a
   center-scoped membership, and `editor` is the one that can update its own center.
6. Stamps `claimed_at` and `help_center_id`.
7. Calls `updateTag(BRAND_TAG)`, then redirects to the dashboard.

Step 7 is not optional. Brand lookups are cached across requests with a TTL, so skipping the tag
bust leaves a brand-new center returning 404 to its own owner for minutes. `createHelpCenter`
(`app/admin/centers/actions.ts`) already does this; the claim route matches it.

## The Dashboard

`/dashboard` resolves the single center from the user's center-scoped membership. It holds four
things: the live URL, branding, content visibility, and the address.

Content visibility is built on the per-centre exclusions already shipped in
`0007_article_exclusions.sql` and `lib/tenancy/exclusions.ts`. No new mechanism.

The dashboard gets its own server actions rather than reusing `app/admin/centers/actions.ts`. That
admin action calls `authorize('helpCenter.update', {})` with an empty resource, which is correct for
global staff. A scoped action beside it is safer than loosening the one the internal tools depend
on. Every dashboard action passes `{ helpCenterId }`.

A user holding a global membership and no scoped one is redirected from `/dashboard` to `/admin`,
and the reverse. Two audiences, two surfaces, no overlap.

## Modules

| Path | Responsibility |
| --- | --- |
| `lib/signup/work-email.ts` | `isWorkEmail(email)`, backed by the blocklist |
| `lib/signup/free-email-domains.ts` | The blocklist itself, data only |
| `lib/signup/session.ts` | Reads and writes the signup token cookie |
| `lib/signup/repository.ts` | Creates, finds, and updates the pending row |
| `lib/signup/survey.ts` | Question definitions and their order |
| `lib/signup/claim.ts` | The seven claim steps, as one function |
| `lib/signup/deliver.ts` | The CRM seam. Stamps `delivered_at` |
| `lib/signup/slug-availability.ts` | Checks reserved, existing, and pending slugs |
| `lib/tenancy/path.ts` | Parses `/hc/{slug}`; exports `basePath()` |

## Error Handling

| Failure | Behavior |
| --- | --- |
| Free-mail address | Rejected server-side, naming the domain: "Gmail addresses aren't accepted — use your agency's domain." |
| Email has a pending signup | Resume that row at its saved step. No second row. |
| Email already owns a center | The link still sends; the claim route redirects to the dashboard and creates nothing. |
| Slug taken between builder and claim | `nextAvailableSlug()` assigns `acme-2`; the dashboard opens on the address panel with a notice. |
| Magic link clicked twice | `claimed_at` short-circuits to the dashboard. |
| Magic link expired | The token cookie still identifies the row, so `/get` resumes at the claim step and resends. If the cookie is gone too, they re-enter their email at `/get/details`, which matches the pending row and resends rather than starting over. The survey is never refilled. |
| CRM delivery fails | `delivered_at` stays null. The signup succeeds. Delivery never sits in the request path. |
| Branding fails validation at claim | The center is created with schema defaults; the dashboard opens on branding with a notice. |
| Abandoned signups | Rows older than 30 days with `claimed_at` null are purged, releasing both reservations. |

One rule governs the table: after the survey is submitted, nothing may lose their work. Every
failure past that point degrades into "you are in, fix this one thing in the dashboard."

## Testing

**Unit (Vitest)**

- `isWorkEmail` — free providers, subdomains, mixed case, plus-addressing.
- Slug availability against all three sources, including a pending signup holding the slug.
- Path parsing: `/hc/acme/billing/refunds` yields the slug and the rewrite target. A bad pattern
  here leaks one tenant into another, so this is exhaustive.
- `basePath()` returns `''` for the base center and `/hc/{slug}` for a path-resolved one.
- Survey step ordering and the resume-at-saved-step calculation.

**End-to-end (Playwright)**

1. The whole funnel: `/get` through to a live center at `/hc/{slug}` showing the shared library.
2. Tenant isolation: every link inside a customer center stays under `/hc/{slug}`, and search
   results, breadcrumbs, and the `/a/{slug}` shortcut all respect it.
3. Claim edge cases: a link clicked twice, and a slug taken mid-funnel.

`pnpm test:e2e` is not idempotent today and expects a fresh `pnpm db:reset` (see the README). These
specs create `signups` rows, so they clean up after themselves rather than deepening that
constraint.

## Build Order

1. Migration, `lib/signup/*`, and the work-email rule, with unit tests.
2. Path channel: middleware rewrite, resolution precedence, `basePath()` across the six public
   files, plus the tenant-isolation e2e test.
3. The admin isolation fix.
4. Funnel screens: landing, details, survey, builder.
5. Claim route and its edge cases.
6. The dashboard.

Steps 2 and 3 are worth shipping before any of the funnel exists. They are the parts that carry
tenant-isolation risk, and they are independently testable.

## Deferred

- Customer custom domains, including the Vercel Domains API and DNS verification.
- Billing.
- Customer-authored articles scoped to one center. `articles.origin_help_center_id` and the
  `contributor` role already exist for this.
- More than one help center per user.
- A CRM implementation behind `lib/signup/deliver.ts`.

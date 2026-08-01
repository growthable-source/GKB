# content-ops

Token-efficient, automatable content-ops pipeline for the GKB help center. Four
stages, run in order:

1. **`pnpm ops:audit`** — loads every published article, computes a free
   deterministic layer (word count, brand-name leaks, image counts, heading
   counts) and a DeepSeek classification layer (deprecated-risk, YouTube
   candidacy, quality score, notes). Writes `import/ops/audit.json`, the input
   to every later stage.
2. **`pnpm ops:gap`** — fetches GoHighLevel's public help center sitemap and
   asks DeepSeek which topics they cover that we don't. Writes
   `import/ops/gap.json`.
3. **`pnpm ops:rewrite [--apply]`** — rewrites the audit's rewrite queue
   (short articles, low-quality articles, articles with a brand-name leak in
   their text) as original content. Without `--apply`, writes proposals to
   `import/ops/rewrites/`. With `--apply`, sanitizes and applies them to the
   database and reindexes search.
4. **`pnpm ops:report`** — renders `import/ops/REPORT.md` from the outputs
   above. No API calls.

Each of `audit`, `gap`, and `rewrite --apply` also pushes its result to the
`ops_snapshots` table (see `snapshot.ts`) as soon as it finishes, so the
deployed app — which can't read these local JSON files — can render them at
`/admin/ops`. **`pnpm ops:push`** reads the three JSON files already on disk
and pushes all three snapshot kinds without recomputing or calling any API;
use it to backfill the DB from results computed before this existed, or to
seed a fresh environment.

Every stage takes `--dry-run` (does everything except call the LLM API;
`rewrite`/`report` also skip writing files that would depend on a call that
didn't happen).

## Requirements

- `OPENROUTER_API_KEY` — create one at https://openrouter.ai/keys, or add it
  to `.env.cloud`. Scripts fail fast with a clear message if it's missing
  (only checked on non-dry-run invocations that actually need to call the
  API).
- Supabase cloud credentials in `.env.cloud` (`NEXT_PUBLIC_SUPABASE_URL` +
  `SUPABASE_SERVICE_ROLE_KEY`), same as `scripts/import-drive.mts`.

## Model

Defaults to `deepseek/deepseek-chat-v3.1` — verified live by Ryan on
2026-08-01 against `https://openrouter.ai/api/v1/chat/completions`, and
confirmed again with a one-off smoke call through this module's own `chat()`
helper. Override with `OPS_MODEL` if you want to try a different one; all four
stages share the same model, there's no cheap/expensive tier split like the
Anthropic-based design this replaced.

## Cost

DeepSeek v4 Flash is roughly $0.14 / $0.28 per million input/output tokens on
OpenRouter. The audit's classification pass (~550 short requests) and the gap
comparison (~8 requests) should both cost single-digit cents. The rewrite
stage is the most token-heavy (full article bodies in, full article bodies
out) but at this model's pricing a full run over the entire rewrite queue is
still well under a dollar. Nothing here needs a paid tier upgrade.

## How it stays cheap and resumable without a Batches API

OpenRouter doesn't have an async batch endpoint, so bulk stages use a
concurrency-limited loop (`runPool` in `llm.mts`, concurrency 8 for
classification / 3 for gap chunks / 5 for rewrites — hand-rolled, no
dependency) instead of submit-then-poll. Every completed item is checkpointed
to `import/ops/state/<stage>.json` immediately, so an interrupted run — killed
process, network blip, rate limit — resumes from where it left off on the next
invocation instead of re-paying for work already done. `rewrite.mts --apply`
has its own resumability: `import/ops/rewrites/applied.json` tracks which
article ids have already been written to the database, and a re-run skips
them.

## Automation

The scripts are idempotent and safe to run unattended: `pnpm ops:audit &&
pnpm ops:gap && pnpm ops:rewrite && pnpm ops:report` in a weekly cron job (or
CI schedule) will pick up new/changed articles, re-checkpoint anything
interrupted, and regenerate the report. `rewrite.mts` without `--apply` never
touches the database, so it's safe to run unattended too — only add `--apply`
once you're ready to publish proposals.

## Editorial stance

Content is written originally against the white-label platform's observed
behavior, in our own words — never copied verbatim from GoHighLevel's public
documentation or any other source. The product is always "CRM" in article
text; the underlying platform is never named.

/**
 * Seeds the DB from already-computed local results, without recomputing
 * anything (no LLM calls, no Supabase article reads). Reads
 * import/ops/audit.json, import/ops/gap.json, and
 * import/ops/rewrites/applied.json — whichever exist — and pushes one
 * ops_snapshots row per kind. Use this to backfill the DB after a pipeline
 * stage ran before the DB push existed, or to re-seed a fresh environment.
 *
 * Run: pnpm ops:push
 * Env: reads .env.cloud (falls back to .env.local) for Supabase.
 */
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { ROOT } from './llm'
import { pushSnapshot } from './snapshot'
import { summarizeAudit } from './summarize'
import type { AuditArticle, GapItem, GapStub, RewriteApplications } from './types'

function readJson<T>(relativePath: string): T | null {
  const p = path.join(ROOT, relativePath)
  if (!existsSync(p)) return null
  return JSON.parse(readFileSync(p, 'utf8')) as T
}

async function main() {
  const audit = readJson<AuditArticle[]>('import/ops/audit.json')
  if (audit) {
    const summary = summarizeAudit(audit)
    await pushSnapshot('audit', { summary, articles: audit })
  } else {
    console.log('import/ops/audit.json not found — skipping audit snapshot')
  }

  const gaps = readJson<GapItem[] | GapStub>('import/ops/gap.json')
  if (Array.isArray(gaps)) {
    await pushSnapshot('gaps', gaps)
  } else if (gaps) {
    console.log(`import/ops/gap.json is an error stub (${gaps.error}) — skipping gaps snapshot`)
  } else {
    console.log('import/ops/gap.json not found — skipping gaps snapshot')
  }

  const applied = readJson<RewriteApplications>('import/ops/rewrites/applied.json')
  if (applied) {
    await pushSnapshot('rewrites', applied)
  } else {
    console.log('import/ops/rewrites/applied.json not found — skipping rewrites snapshot')
  }
}

await main()

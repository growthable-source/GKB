/**
 * Stage 3: rewrites the audit's rewrite queue (short articles, low-quality
 * articles, and any article with a brand-name leak in its text) as original
 * content via DeepSeek.
 *
 * Without --apply: proposals only, written to import/ops/rewrites/<slug>.html
 * plus an index.json. With --apply: sanitizes the output, updates
 * articles.body_html/body_json, reindexes, and records applied ids in
 * import/ops/rewrites/applied.json so a re-run skips them.
 *
 * Resumable: generated drafts are checkpointed to
 * import/ops/state/rewrite-drafts.json after every article.
 *
 * Run: pnpm ops:rewrite [--apply] [--dry-run]
 * Env: reads .env.cloud (falls back to .env.local) for Supabase + OpenRouter.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { ROOT, chat, runPool, loadCheckpoint, saveCheckpoint } from './llm'
import { pushSnapshot } from './snapshot'
import type { AuditArticle, RewriteIndexEntry } from './types'

const DRY = process.argv.includes('--dry-run')
const APPLY = process.argv.includes('--apply')
const CHECKPOINT_STAGE = 'rewrite-drafts'
const CONCURRENCY = 5
const SOURCE_HTML_CAP = 8000

const SYSTEM_PROMPT = `You are a technical writer rewriting help center articles for a white-label CRM support product built on a licensed platform. The underlying platform must never be named — use "CRM" instead of GoHighLevel, HighLevel, GHL, or LeadConnector, every time.
Write an ORIGINAL article in your own words that covers the same procedure as the source. Do not reproduce the source's phrasing, sentence structure, or wording — write it fresh.
Output ONLY a clean semantic HTML fragment (no <html>/<body> wrapper): h2/h3 for headings, p for paragraphs, ul/ol/li for lists, strong/em for emphasis, a for links. Re-insert the exact <img> tags supplied to you, verbatim, at the point in the article where each is contextually appropriate — do not invent new image tags or alter the ones given.
Where a step in the source is thin, expand it with the obvious missing detail a support author would include: prerequisites, where in the product the setting lives, and the expected outcome after completing the step.
Do not invent specific UI facts (exact button labels, menu paths, field names) that aren't evidenced by the source — if the source is too thin to know a detail, describe it generically rather than fabricating specifics.
Reply with ONLY the HTML fragment. No markdown fences, no commentary.`

function extractImgTags(html: string): string[] {
  return [...html.matchAll(/<img\b[^>]*\/?>/gi)].map((m) => m[0])
}

function slugFilename(slug: string): string {
  return `${slug}.html`
}

async function main() {
  const auditPath = path.join(ROOT, 'import/ops/audit.json')
  if (!existsSync(auditPath)) {
    throw new Error('import/ops/audit.json not found — run `pnpm ops:audit` first')
  }
  const audit = JSON.parse(readFileSync(auditPath, 'utf8')) as AuditArticle[]

  const queue = audit.filter(
    (a) => a.shortArticle || a.brandLeaks.length > 0 || (a.quality !== null && a.quality <= 2),
  )
  console.log(`rewrite queue: ${queue.length} of ${audit.length} articles`)
  console.log(
    `  short: ${queue.filter((a) => a.shortArticle).length}, brand leaks: ${queue.filter((a) => a.brandLeaks.length > 0).length}, low quality: ${queue.filter((a) => a.quality !== null && a.quality <= 2).length}`,
  )

  if (queue.length === 0) {
    console.log('nothing to rewrite')
    return
  }

  if (!DRY && !process.env.OPENROUTER_API_KEY) {
    throw new Error('Set OPENROUTER_API_KEY (create one at https://openrouter.ai/keys) or add it to .env.cloud')
  }

  const { serviceClient } = await import('../../lib/db/client')
  const db = serviceClient()
  const { data: rows, error } = await db
    .from('articles')
    .select('id, slug, title, body_html, body_json, collection_id')
    .in(
      'id',
      queue.map((a) => a.id),
    )
  if (error) throw new Error(`articles query failed: ${error.message}`)
  const bySourceId = new Map((rows ?? []).map((r) => [r.id, r]))

  if (DRY) {
    console.log(`[dry-run] would send ${queue.length} rewrite requests to DeepSeek`)
    const sample = queue[0]
    const source = sample ? bySourceId.get(sample.id) : undefined
    if (sample && source) {
      const imgTags = extractImgTags(source.body_html)
      console.log('[dry-run] sample request:')
      console.log(`  title: ${sample.title}`)
      console.log(`  image tags to preserve: ${imgTags.length}`)
      console.log(`  source length: ${source.body_html.length} chars`)
    }
    console.log('[dry-run] no requests sent, no files written')
    return
  }

  const checkpoint = loadCheckpoint<{ html: string } | { error: string }>(CHECKPOINT_STAGE)

  let done = Object.keys(checkpoint).filter((id) => queue.some((a) => a.id === id)).length
  await runPool(queue, CONCURRENCY, async (a) => {
    if (checkpoint[a.id]) return
    const source = bySourceId.get(a.id)
    if (!source) {
      checkpoint[a.id] = { error: 'source article not found (deleted since audit?)' }
      saveCheckpoint(CHECKPOINT_STAGE, checkpoint)
      return
    }

    const imgTags = extractImgTags(source.body_html)
    const sourceHtml = source.body_html.slice(0, SOURCE_HTML_CAP)
    const user = `Title: ${a.title}\nCollection: ${a.collectionTitle ?? 'Uncategorized'}\n\nExisting image tags to preserve exactly (re-insert each one where contextually appropriate; do not add others):\n${imgTags.length ? imgTags.join('\n') : '(none)'}\n\nSource article HTML (for reference only — do not copy its phrasing):\n${sourceHtml}`

    try {
      const html = await chat(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: user },
        ],
        { maxTokens: 4000, temperature: 0.7 },
      )
      checkpoint[a.id] = { html: html.trim() }
    } catch (err) {
      checkpoint[a.id] = { error: err instanceof Error ? err.message : String(err) }
    }
    saveCheckpoint(CHECKPOINT_STAGE, checkpoint)
    done++
    if (done % 10 === 0) console.log(`...rewritten ${done}/${queue.length}`)
  })

  if (APPLY) {
    const { sanitizeArticleHtml } = await import('../../lib/content/html')
    const { generateJSON } = await import('@tiptap/html')
    const StarterKit = (await import('@tiptap/starter-kit')).default
    const Image = (await import('@tiptap/extension-image')).default
    const { reindexArticleEverywhere } = await import('../../lib/search/index-article')

    const appliedPath = path.join(ROOT, 'import/ops/rewrites/applied.json')
    const applied: Record<string, { slug: string; appliedAt: string }> = existsSync(appliedPath)
      ? JSON.parse(readFileSync(appliedPath, 'utf8'))
      : {}

    let applyCount = 0
    let skipCount = 0
    let failCount = 0
    for (const a of queue) {
      if (applied[a.id]) {
        skipCount++
        continue
      }
      const draft = checkpoint[a.id]
      if (!draft || 'error' in draft) {
        failCount++
        continue
      }
      const bodyHtml = sanitizeArticleHtml(draft.html)
      const bodyJson = generateJSON(bodyHtml, [StarterKit, Image])
      // Snapshot the pre-rewrite body so an applied rewrite can be rolled back.
      const original = bySourceId.get(a.id)
      if (!original) {
        failCount++
        continue
      }
      const { error: revisionError } = await db.from('article_revisions').insert({
        article_id: a.id,
        title: original.title,
        body_json: original.body_json,
      })
      if (revisionError) {
        console.log(`  FAILED to snapshot ${a.slug}: ${revisionError.message}`)
        failCount++
        continue
      }
      const { error: updateError } = await db
        .from('articles')
        .update({ body_html: bodyHtml, body_json: bodyJson })
        .eq('id', a.id)
      if (updateError) {
        console.log(`  FAILED to apply ${a.slug}: ${updateError.message}`)
        failCount++
        continue
      }
      await reindexArticleEverywhere(a.id)
      applied[a.id] = { slug: a.slug, appliedAt: new Date().toISOString() }
      applyCount++
    }

    mkdirSync(path.dirname(appliedPath), { recursive: true })
    writeFileSync(appliedPath, JSON.stringify(applied, null, 1))
    console.log(`applied ${applyCount}, skipped ${skipCount} (already applied), failed ${failCount}`)
    await pushSnapshot('rewrites', applied)
  } else {
    const rewritesDir = path.join(ROOT, 'import/ops/rewrites')
    mkdirSync(rewritesDir, { recursive: true })
    const index: RewriteIndexEntry[] = []
    for (const a of queue) {
      const draft = checkpoint[a.id]
      if (!draft || 'error' in draft) {
        index.push({ id: a.id, slug: a.slug, title: a.title, status: 'failed', reason: draft && 'error' in draft ? draft.error : 'no result' })
        continue
      }
      writeFileSync(path.join(rewritesDir, slugFilename(a.slug)), draft.html)
      index.push({ id: a.id, slug: a.slug, title: a.title, status: 'proposed' })
    }
    writeFileSync(path.join(rewritesDir, 'index.json'), JSON.stringify(index, null, 1))
    console.log(
      `wrote ${index.filter((i) => i.status === 'proposed').length} proposals to import/ops/rewrites/ (${index.filter((i) => i.status === 'failed').length} failed)`,
    )
  }
}

await main()

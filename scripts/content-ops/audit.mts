/**
 * Stage 1: audits every published article with two layers.
 *
 *  A) Deterministic (free, no API): word count, brand-name leaks, image
 *     count / external-image count, heading count.
 *  B) DeepSeek classification (one call per article, concurrency-limited):
 *     deprecated_risk, youtube_candidate, quality, notes.
 *
 * Output: import/ops/audit.json — the input to gap.mts, rewrite.mts, report.mts.
 *
 * Resumable: classification results are checkpointed to
 * import/ops/state/audit-classify.json after every article, so an
 * interrupted run skips articles already classified on the next invocation.
 *
 * Run: pnpm ops:audit [--dry-run]
 * Env: reads .env.cloud (falls back to .env.local) for Supabase + OpenRouter.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { ROOT, chat, parseJsonLoose, runPool, loadCheckpoint, saveCheckpoint } from './llm'
import type { AuditArticle, BrandLeak, Classification } from './types'

const { serviceClient } = await import('../../lib/db/client')
const { htmlToText } = await import('../../lib/content/html')

const DRY = process.argv.includes('--dry-run')
const CONCURRENCY = 8
const CHECKPOINT_STAGE = 'audit-classify'
const SHORT_ARTICLE_WORDS = 120
const BODY_TRUNCATE_CHARS = 2500

// gohighlevel|highlevel|GHL|leadconnector, case-insensitive, run against title + body_html.
const BRAND_LEAK_RE = /gohighlevel|highlevel|\bGHL\b|leadconnector/gi

const SYSTEM_PROMPT = `You audit help center articles for a white-label CRM support product built on a licensed platform. The underlying platform must never be named — articles say "CRM" instead.
For each article, reply with ONLY a JSON object, no markdown fences, no commentary:
{"deprecated_risk":"low|medium|high","youtube_candidate":true|false,"quality":1-5,"notes":"<one line>"}
- deprecated_risk: judge from internal evidence only (old dates, "beta", "labs", legacy UI names, features that sound renamed or removed) whether the content likely describes outdated UI/features.
- youtube_candidate: true if this is a step-by-step visual task with several screenshots that would demo well on video.
- quality: 1-5 rating of the article's structure, completeness, and clarity.
- notes: one concise line of observation.`

function snippetAround(text: string, index: number, matchLength: number): string {
  const start = Math.max(0, index - 40)
  const end = Math.min(text.length, index + matchLength + 40)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''
  return `${prefix}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${suffix}`
}

function findBrandLeaks(title: string, bodyHtml: string): BrandLeak[] {
  const leaks: BrandLeak[] = []
  for (const m of title.matchAll(BRAND_LEAK_RE)) {
    leaks.push({ location: 'title', snippet: snippetAround(title, m.index, m[0].length) })
  }
  for (const m of bodyHtml.matchAll(BRAND_LEAK_RE)) {
    leaks.push({ location: 'body', snippet: snippetAround(bodyHtml, m.index, m[0].length) })
  }
  return leaks
}

function countMatches(text: string, re: RegExp): number {
  return [...text.matchAll(re)].length
}

function analyzeImages(bodyHtml: string, storagePrefix: string): { count: number; external: number } {
  const srcs = [...bodyHtml.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi)].map((m) => m[1])
  const external = srcs.filter((src) => !src.startsWith(storagePrefix)).length
  return { count: srcs.length, external }
}

async function main() {
  if (!DRY && !process.env.OPENROUTER_API_KEY) {
    throw new Error('Set OPENROUTER_API_KEY (create one at https://openrouter.ai/keys) or add it to .env.cloud')
  }

  const db = serviceClient()
  const storagePrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/`

  const { data: collections, error: collectionsError } = await db.from('collections').select('id, title')
  if (collectionsError) throw new Error(`collections query failed: ${collectionsError.message}`)
  const collectionTitleById = new Map((collections ?? []).map((c) => [c.id, c.title]))

  const { data: articles, error: articlesError } = await db
    .from('articles')
    .select('id, slug, title, body_html, collection_id, updated_at')
    .eq('status', 'published')
  if (articlesError) throw new Error(`articles query failed: ${articlesError.message}`)

  console.log(`${articles?.length ?? 0} published articles loaded`)

  const deterministic = (articles ?? []).map((a) => {
    const wordCount = htmlToText(a.body_html).split(/\s+/).filter(Boolean).length
    const { count: imageCount, external: externalImageCount } = analyzeImages(a.body_html, storagePrefix)
    return {
      id: a.id,
      slug: a.slug,
      title: a.title,
      collectionId: a.collection_id,
      collectionTitle: a.collection_id ? (collectionTitleById.get(a.collection_id) ?? null) : null,
      updatedAt: a.updated_at,
      wordCount,
      shortArticle: wordCount < SHORT_ARTICLE_WORDS,
      brandLeaks: findBrandLeaks(a.title, a.body_html),
      imageCount,
      externalImageCount,
      headingCount: countMatches(a.body_html, /<h[234]\b/gi),
      bodyHtml: a.body_html,
    }
  })

  const shortCount = deterministic.filter((a) => a.shortArticle).length
  const leakCount = deterministic.filter((a) => a.brandLeaks.length > 0).length
  const externalImageArticles = deterministic.filter((a) => a.externalImageCount > 0).length
  console.log(
    `deterministic layer: ${shortCount} short (<${SHORT_ARTICLE_WORDS}w), ${leakCount} with brand leaks, ${externalImageArticles} with external images`,
  )

  const checkpoint = loadCheckpoint<Classification>(CHECKPOINT_STAGE)
  const alreadyClassified = deterministic.filter((a) => checkpoint[a.id]).length
  const toClassify = deterministic.length - alreadyClassified

  if (DRY) {
    console.log(`[dry-run] would classify ${toClassify} articles via DeepSeek (${alreadyClassified} already checkpointed)`)
    const sample = deterministic[0]
    if (sample) {
      const bodyText = htmlToText(sample.bodyHtml).slice(0, BODY_TRUNCATE_CHARS)
      console.log('[dry-run] sample request:')
      console.log(`  system: ${SYSTEM_PROMPT.slice(0, 120)}...`)
      console.log(
        `  user: Title: ${sample.title}\\nCollection: ${sample.collectionTitle ?? 'Uncategorized'}\\nImage count: ${sample.imageCount}\\n\\nBody text (truncated):\\n${bodyText.slice(0, 200)}...`,
      )
    }
    console.log('[dry-run] no requests sent, audit.json not written')
    return
  }

  let done = alreadyClassified
  await runPool(deterministic, CONCURRENCY, async (a) => {
    if (checkpoint[a.id]) return checkpoint[a.id]

    const bodyText = htmlToText(a.bodyHtml).slice(0, BODY_TRUNCATE_CHARS)
    const user = `Title: ${a.title}\nCollection: ${a.collectionTitle ?? 'Uncategorized'}\nImage count: ${a.imageCount}\n\nBody text (truncated):\n${bodyText}`

    let result: Classification
    try {
      const raw = await chat(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: user },
        ],
        { maxTokens: 400, json: true, temperature: 0.2 },
      )
      const parsed = parseJsonLoose<{
        deprecated_risk?: unknown
        youtube_candidate?: unknown
        quality?: unknown
        notes?: unknown
      }>(raw)
      const risk = parsed?.deprecated_risk
      const quality = parsed?.quality
      result = {
        deprecatedRisk: risk === 'low' || risk === 'medium' || risk === 'high' ? risk : null,
        youtubeCandidate: typeof parsed?.youtube_candidate === 'boolean' ? parsed.youtube_candidate : null,
        quality: typeof quality === 'number' && quality >= 1 && quality <= 5 ? quality : null,
        notes: typeof parsed?.notes === 'string' ? parsed.notes : (parsed ? '' : 'classification parse failed'),
      }
    } catch (error) {
      result = {
        deprecatedRisk: null,
        youtubeCandidate: null,
        quality: null,
        notes: `classification failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }

    checkpoint[a.id] = result
    saveCheckpoint(CHECKPOINT_STAGE, checkpoint)
    done++
    if (done % 25 === 0) console.log(`...classified ${done}/${deterministic.length}`)
    return result
  })

  const finalArticles: AuditArticle[] = deterministic.map((a) => {
    const c = checkpoint[a.id] ?? {
      deprecatedRisk: null,
      youtubeCandidate: null,
      quality: null,
      notes: 'not classified',
    }
    return {
      id: a.id,
      slug: a.slug,
      title: a.title,
      collectionId: a.collectionId,
      collectionTitle: a.collectionTitle,
      updatedAt: a.updatedAt,
      wordCount: a.wordCount,
      shortArticle: a.shortArticle,
      brandLeaks: a.brandLeaks,
      imageCount: a.imageCount,
      externalImageCount: a.externalImageCount,
      headingCount: a.headingCount,
      ...c,
    }
  })

  const outDir = path.join(ROOT, 'import/ops')
  mkdirSync(outDir, { recursive: true })
  writeFileSync(path.join(outDir, 'audit.json'), JSON.stringify(finalArticles, null, 1))
  console.log(`wrote import/ops/audit.json (${finalArticles.length} articles)`)
}

await main()

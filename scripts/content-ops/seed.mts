/**
 * Standalone stage: brings the help center to article-level parity with
 * GoHighLevel's public help center by generating original articles for
 * every topic they cover that we don't.
 *
 * Three phases, each independently checkpointed and resumable:
 *
 *  1. Coverage match — fetches their sitemap (./ghl.ts, shared with
 *     gap.mts), then asks DeepSeek, per ~100-url chunk, which of their
 *     articles one of OUR published articles substantively covers. Unlike
 *     gap.mts's topic-level pass (title strings only), this is
 *     article-level: every chunk call gets our full catalog (titles +
 *     slugs, grouped by collection) and returns a specific our-slug or null
 *     per their-url. Output: import/ops/seed-coverage.json.
 *
 *  2. Fetch missing sources — for every uncovered URL, fetches the page and
 *     extracts title + body text (extractArticleContent in ./ghl.ts),
 *     caching each page to import/ops/ghl-cache/<url-hash>.txt so a re-run
 *     never re-fetches. Concurrency 4 with a politeness delay between
 *     requests.
 *
 *  3. Generate + insert — one DeepSeek call per missing article writes an
 *     ORIGINAL article grounded in the fetched source (never GoHighLevel's
 *     wording — see the system prompt), then inserts it the way
 *     scripts/import-drive.mts does: sanitize, generate TipTap body_json, a
 *     unique slug, publish, and place in every help center that is the base
 *     center or has auto_include_new_articles = true. Provenance is
 *     recorded in import/ops/seed-manifest.json.
 *
 * --limit N caps how many missing articles phases 2-3 fetch/generate/insert
 * in one run (phase 1's match always covers the whole gap, since it's the
 * cheap part). Already-seeded URLs (tracked in the phase-3 checkpoint) are
 * never re-processed, so re-running with a higher --limit (or none) picks
 * up where the last run left off.
 *
 * Run: pnpm ops:seed [--dry-run] [--limit N]
 * Env: reads .env.cloud (falls back to .env.local) for Supabase + OpenRouter.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
import path from 'node:path'
import { ROOT, chat, parseJsonLoose, runPool, loadCheckpoint, saveCheckpoint } from './llm'
import {
  KNOWN_SITEMAP_URL,
  ROBOTS_URL,
  USER_AGENT,
  fetchTheirArticleUrls,
  titleFromSlug,
  extractArticleContent,
} from './ghl'
import type { SeedCoverageItem, SeedManifest } from './types'

const { serviceClient } = await import('../../lib/db/client')

const DRY = process.argv.includes('--dry-run')
const limitArgIndex = process.argv.indexOf('--limit')
const LIMIT = limitArgIndex > -1 ? Number(process.argv[limitArgIndex + 1]) : Infinity

const COVERAGE_CHUNK_SIZE = 100
const COVERAGE_CONCURRENCY = 5
const COVERAGE_CHECKPOINT_STAGE = 'seed-coverage-chunks'

const FETCH_CONCURRENCY = 4
const FETCH_DELAY_MS = 300
const FETCH_CHECKPOINT_STAGE = 'seed-fetch'
const MIN_EXTRACTED_TEXT_LENGTH = 80

const GENERATE_CONCURRENCY = 4
const SOURCE_TEXT_CAP = 6000
const ARTICLE_CHECKPOINT_STAGE = 'seed-articles'
const FALLBACK_COLLECTION_TITLE = 'Miscellaneous'

const PROGRESS_EVERY = 25

const CACHE_DIR = path.join(ROOT, 'import/ops/ghl-cache')
const COVERAGE_OUT = path.join(ROOT, 'import/ops/seed-coverage.json')
const MANIFEST_OUT = path.join(ROOT, 'import/ops/seed-manifest.json')

const COVERAGE_SYSTEM_PROMPT = `You compare a competitor help center's articles against our own article catalog to judge, one competitor article at a time, whether we already substantively cover the same topic.
"Covered" means one of OUR articles substantively documents the same specific task or feature the competitor's article covers — not that some broader article of ours merely mentions the topic in passing. A rephrasing or synonym of a topic we substantively cover IS covered; a topic only tangentially touched by a broader article is NOT covered.
When you are unsure, judge it as NOT covered — we would rather have a redundant article than leave a real gap.
Reply with ONLY a JSON object, no markdown fences, no commentary, with exactly one entry for every competitor URL supplied:
{"coverage":{"<their_url>":{"covered":"<our-slug>"},"<their_url2>":{"covered":null}}}`

function generateSystemPrompt(collectionNames: string[]): string {
  return `You are a technical writer writing an ORIGINAL help center article for a white-label CRM support product built on a licensed platform. The underlying platform must never be named — use "CRM" instead of GoHighLevel, HighLevel, GHL, or LeadConnector, every time.
Write fresh, original prose that covers the same task or feature as the source material below. Do not copy the source's phrasing, sentence structure, or wording — write it in your own words.
Ground every specific claim (menu paths, button labels, field names, exact behavior) in the supplied source text. Where the source is unclear or doesn't specify an exact detail, describe it generically rather than inventing a specific UI fact.
Do not include any <img> tags or references to screenshots/images. The source's screenshots are not available to you, so write the article so it reads completely on its own without them.
Reply with ONLY a JSON object, no markdown fences, no commentary:
{"title":"<article title>","collection":"<one of the collection names below, exactly as given>","html":"<semantic HTML fragment using only h2, h3, p, ul, ol, li, strong, em, a tags>"}
Collection names to choose from:
${collectionNames.map((n) => `- ${n}`).join('\n')}`
}

// Hosts whose links are GHL-branded and must not appear in an unbranded KB. Mirrors
// scripts/import-drive.mts's stripBranding, adapted for HTML anchors instead of markdown links.
const BRANDED_HOST = /(^|\.)((go)?highlevel|leadconnectorhq|gohighlevel)\.(com|io)/i

/** Deterministic belt-and-braces brand scrub, on top of the system prompt's instruction never to name the platform. */
function stripBrandingHtml(html: string): string {
  let out = html
  // Unlink anchors pointing at branded hosts, keeping the visible text.
  out = out.replace(/<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (full, href: string, inner: string) => {
    try {
      return BRANDED_HOST.test(new URL(href).hostname) ? inner : full
    } catch {
      return full
    }
  })
  // Drop bare branded URLs left in prose.
  out = out.replace(/https?:\/\/[^\s"'<>)]+/g, (url) => {
    try {
      return BRANDED_HOST.test(new URL(url).hostname) ? '' : url
    } catch {
      return url
    }
  })
  // No images in seeded articles, regardless of what the model returned.
  out = out.replace(/<img\b[^>]*\/?>/gi, '')
  // Brand names -> CRM. Word-boundary so e.g. "higher-level thinking" survives.
  out = out.replace(/\bgo\s?high\s?level\b/gi, 'CRM')
  out = out.replace(/\bhighlevel\b/gi, 'CRM')
  out = out.replace(/\bGHL\b/g, 'CRM')
  out = out.replace(/\bleadconnector(hq)?\b/gi, 'CRM')
  // Collapse artifacts like "the CRM CRM" from "the HighLevel GHL".
  out = out.replace(/\b(CRM)(\s+CRM)+\b/g, 'CRM')
  return out
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function cacheFileFor(url: string): string {
  const hash = createHash('sha1').update(url).digest('hex')
  return path.join(CACHE_DIR, `${hash}.txt`)
}

type OurArticle = { slug: string; title: string; collectionId: string | null }

function buildCatalogText(collections: { id: string; title: string }[], articles: OurArticle[]): string {
  const collectionTitleById = new Map(collections.map((c) => [c.id, c.title]))
  const byCollection = new Map<string, OurArticle[]>()
  for (const a of articles) {
    const name = a.collectionId ? (collectionTitleById.get(a.collectionId) ?? 'Uncategorized') : 'Uncategorized'
    if (!byCollection.has(name)) byCollection.set(name, [])
    byCollection.get(name)!.push(a)
  }
  return [...byCollection.entries()]
    .map(([name, items]) => `## ${name}\n${items.map((a) => `- ${a.title} (slug: ${a.slug})`).join('\n')}`)
    .join('\n\n')
}

// ---------------------------------------------------------------------------
// Phase 1: coverage match
// ---------------------------------------------------------------------------

async function phase1CoverageMatch(db: ReturnType<typeof serviceClient>): Promise<SeedCoverageItem[]> {
  const { data: collections, error: collectionsError } = await db.from('collections').select('id, title')
  if (collectionsError) throw new Error(`collections query failed: ${collectionsError.message}`)
  const { data: articleRows, error: articlesError } = await db
    .from('articles')
    .select('slug, title, collection_id')
    .eq('status', 'published')
  if (articlesError) throw new Error(`articles query failed: ${articlesError.message}`)

  const articles: OurArticle[] = (articleRows ?? []).map((a) => ({
    slug: a.slug,
    title: a.title,
    collectionId: a.collection_id,
  }))
  const ourSlugs = new Set(articles.map((a) => a.slug))
  const catalogText = buildCatalogText(collections ?? [], articles)

  console.log(`fetching GoHighLevel's public sitemap...`)
  const sitemap = await fetchTheirArticleUrls()
  if (!sitemap) {
    throw new Error(
      `could not fetch a usable sitemap from ${KNOWN_SITEMAP_URL} or via the Sitemap: line in ${ROBOTS_URL}`,
    )
  }
  const { urls, sourceUrl } = sitemap
  console.log(`found ${urls.length} article URLs via ${sourceUrl}`)
  if (urls.length === 0) throw new Error(`sitemap at ${sourceUrl} returned no article URLs`)

  const theirArticles = urls.map((url) => ({ url, titleish: titleFromSlug(url) }))
  const chunks = chunk(theirArticles, COVERAGE_CHUNK_SIZE)
  console.log(
    `phase 1: matching ${theirArticles.length} of their articles against our ${articles.length} published articles, in ${chunks.length} chunk(s)`,
  )

  if (DRY) {
    console.log(`[dry-run] would send ${chunks.length} coverage-match chat requests (${COVERAGE_CHUNK_SIZE} of their URLs per chunk)`)
    console.log('[dry-run] sample of their URLs:')
    for (const item of theirArticles.slice(0, 5)) console.log(`  - ${item.titleish} (${item.url})`)
    return []
  }

  const checkpoint = loadCheckpoint<SeedCoverageItem[] | { error: string }>(COVERAGE_CHECKPOINT_STAGE)

  await runPool(chunks, COVERAGE_CONCURRENCY, async (chunkItems, i) => {
    const key = String(i)
    // Skip only successful chunks; error entries are retried on the next run.
    if (Array.isArray(checkpoint[key])) return

    const theirChunkText = chunkItems.map((item) => `- ${item.url} — ${item.titleish}`).join('\n')
    const user = `Our article catalog, grouped by collection:\n${catalogText}\n\nCompetitor's articles to judge, chunk ${i + 1}/${chunks.length}:\n${theirChunkText}`

    try {
      const raw = await chat(
        [
          { role: 'system', content: COVERAGE_SYSTEM_PROMPT },
          { role: 'user', content: user },
        ],
        { maxTokens: 8000, json: true, temperature: 0.2 },
      )
      const parsed = parseJsonLoose<{ coverage?: Record<string, { covered?: string | null } | null> }>(raw)
      const coverage = parsed?.coverage && typeof parsed.coverage === 'object' ? parsed.coverage : {}
      const items: SeedCoverageItem[] = chunkItems.map((item) => {
        const entry = coverage[item.url]
        const covered = entry && typeof entry === 'object' ? entry.covered : undefined
        const coveredBy = typeof covered === 'string' && ourSlugs.has(covered) ? covered : null
        return { url: item.url, titleish: item.titleish, coveredBy }
      })
      checkpoint[key] = items
    } catch (error) {
      checkpoint[key] = { error: error instanceof Error ? error.message : String(error) }
    }
    saveCheckpoint(COVERAGE_CHECKPOINT_STAGE, checkpoint)
    console.log(`...coverage chunk ${i + 1}/${chunks.length} done`)
  })

  const results: SeedCoverageItem[] = []
  const errors: string[] = []
  for (let i = 0; i < chunks.length; i++) {
    const result = checkpoint[String(i)]
    if (Array.isArray(result)) results.push(...result)
    else if (result) errors.push(`chunk ${i + 1}: ${result.error}`)
  }
  if (errors.length > 0) {
    console.log(`${errors.length} coverage chunk(s) failed and were skipped (retryable on rerun):`)
    for (const e of errors) console.log(`  ${e}`)
  }

  mkdirSync(path.dirname(COVERAGE_OUT), { recursive: true })
  writeFileSync(COVERAGE_OUT, JSON.stringify(results, null, 1))
  console.log(`wrote import/ops/seed-coverage.json (${results.length} entries)`)
  return results
}

// ---------------------------------------------------------------------------
// Phase 2: fetch missing sources
// ---------------------------------------------------------------------------

type FetchedSource = { url: string; titleish: string; title: string | null; text: string }

async function phase2FetchSources(missing: SeedCoverageItem[]): Promise<FetchedSource[]> {
  if (missing.length === 0) return []
  mkdirSync(CACHE_DIR, { recursive: true })

  const checkpoint = loadCheckpoint<{ title: string | null } | { error: string }>(FETCH_CHECKPOINT_STAGE)

  const isCached = (url: string) => {
    const entry = checkpoint[url]
    return !!entry && !('error' in entry) && existsSync(cacheFileFor(url))
  }

  let done = missing.filter((item) => isCached(item.url)).length
  console.log(`phase 2: fetching ${missing.length - done} of ${missing.length} missing sources (${done} already cached)`)

  await runPool(missing, FETCH_CONCURRENCY, async (item) => {
    if (isCached(item.url)) return

    try {
      const res = await fetch(item.url, { headers: { 'User-Agent': USER_AGENT } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const html = await res.text()
      const { title, text } = extractArticleContent(html)
      if (text.length < MIN_EXTRACTED_TEXT_LENGTH) {
        throw new Error(
          `extracted body text too short (${text.length} chars) — GHL's page structure may have changed; check extractArticleContent() in ghl.ts`,
        )
      }
      writeFileSync(cacheFileFor(item.url), JSON.stringify({ url: item.url, title, text }))
      checkpoint[item.url] = { title }
    } catch (error) {
      checkpoint[item.url] = { error: error instanceof Error ? error.message : String(error) }
    } finally {
      await sleep(FETCH_DELAY_MS)
    }
    saveCheckpoint(FETCH_CHECKPOINT_STAGE, checkpoint)
    done++
    if (done % PROGRESS_EVERY === 0) console.log(`...fetched ${done}/${missing.length}`)
  })

  const fetched: FetchedSource[] = []
  let failures = 0
  for (const item of missing) {
    if (isCached(item.url)) {
      const cached = JSON.parse(readFileSync(cacheFileFor(item.url), 'utf8')) as {
        url: string
        title: string | null
        text: string
      }
      fetched.push({ url: item.url, titleish: item.titleish, title: cached.title, text: cached.text })
    } else {
      failures++
    }
  }
  console.log(`phase 2 done: ${fetched.length}/${missing.length} sources fetched (${failures} failure(s), retryable on rerun)`)
  return fetched
}

// ---------------------------------------------------------------------------
// Phase 3: generate + insert
// ---------------------------------------------------------------------------

type GenerateResult = { title: string; collection: string; html: string }
type ArticleCheckpointEntry = { id: string; slug: string; sourceUrl: string } | { error: string }

async function phase3GenerateAndInsert(
  fetched: FetchedSource[],
  db: ReturnType<typeof serviceClient>,
): Promise<{ seeded: number; failed: number; seededSlugs: string[] }> {
  if (fetched.length === 0) return { seeded: 0, failed: 0, seededSlugs: [] }

  const { data: collections, error: collectionsError } = await db.from('collections').select('id, title')
  if (collectionsError) throw new Error(`collections query failed: ${collectionsError.message}`)
  const collectionIdByTitle = new Map((collections ?? []).map((c) => [c.title, c.id]))
  const collectionIdByTitleLower = new Map((collections ?? []).map((c) => [c.title.toLowerCase(), c.id]))
  const collectionNames = (collections ?? []).map((c) => c.title)
  const fallbackCollectionId = collectionIdByTitle.get(FALLBACK_COLLECTION_TITLE)
  if (!fallbackCollectionId) {
    throw new Error(`no "${FALLBACK_COLLECTION_TITLE}" collection found to use as the unknown-collection fallback`)
  }

  const { data: existingArticles, error: articlesError } = await db.from('articles').select('slug')
  if (articlesError) throw new Error(`articles query failed: ${articlesError.message}`)
  const articleSlugs = (existingArticles ?? []).map((a) => a.slug)

  const { data: centerRows, error: centersError } = await db
    .from('help_centers')
    .select('id, slug, is_base, auto_include_new_articles')
  if (centersError) throw new Error(`help_centers query failed: ${centersError.message}`)
  const seedCenters = (centerRows ?? []).filter((c) => c.is_base || c.auto_include_new_articles)
  const baseCenter = seedCenters.find((c) => c.is_base)
  if (!baseCenter) throw new Error('no base help center (is_base = true) found')

  const positionByCenter = new Map<string, number>()
  for (const center of seedCenters) {
    const { count } = await db
      .from('help_center_articles')
      .select('*', { count: 'exact', head: true })
      .eq('help_center_id', center.id)
    positionByCenter.set(center.id, count ?? 0)
  }

  const { sanitizeArticleHtml, htmlToText } = await import('../../lib/content/html')
  const { slugify, uniqueSlug } = await import('../../lib/content/slug')
  const { generateJSON } = await import('@tiptap/html')
  const StarterKit = (await import('@tiptap/starter-kit')).default
  const Image = (await import('@tiptap/extension-image')).default
  const { indexArticle } = await import('../../lib/search/index-article')

  const genCheckpoint = loadCheckpoint<ArticleCheckpointEntry>(ARTICLE_CHECKPOINT_STAGE)
  const manifest: SeedManifest = existsSync(MANIFEST_OUT)
    ? (JSON.parse(readFileSync(MANIFEST_OUT, 'utf8')) as SeedManifest)
    : {}

  const isDone = (url: string) => {
    const entry = genCheckpoint[url]
    return !!entry && !('error' in entry)
  }

  let done = fetched.filter((f) => isDone(f.url)).length
  let seeded = 0
  let failed = 0
  const seededSlugs: string[] = []
  const systemPrompt = generateSystemPrompt(collectionNames)

  await runPool(fetched, GENERATE_CONCURRENCY, async (source) => {
    const existing = genCheckpoint[source.url]
    if (existing && !('error' in existing)) {
      seeded++
      seededSlugs.push(existing.slug)
      return
    }

    try {
      const sourceText = source.text.slice(0, SOURCE_TEXT_CAP)
      const user = `Source article title: ${source.title ?? source.titleish}\n\nSource article text (grounding only — write fresh prose, do not copy its phrasing):\n${sourceText}`

      const raw = await chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: user },
        ],
        { maxTokens: 4000, temperature: 0.6 },
      )
      const parsed = parseJsonLoose<Partial<GenerateResult>>(raw)
      if (!parsed || typeof parsed.title !== 'string' || typeof parsed.html !== 'string') {
        throw new Error(`unparseable generation response: ${raw.slice(0, 200)}`)
      }

      const title = parsed.title.trim().slice(0, 200) || source.title || source.titleish
      const requestedCollection = typeof parsed.collection === 'string' ? parsed.collection.trim() : ''
      const collectionId =
        collectionIdByTitle.get(requestedCollection) ??
        collectionIdByTitleLower.get(requestedCollection.toLowerCase()) ??
        fallbackCollectionId

      let bodyHtml = stripBrandingHtml(parsed.html)
      // The article page renders the title as its own h1 — drop a leading
      // heading that just repeats it.
      bodyHtml = bodyHtml.replace(/^\s*<h[123][^>]*>([\s\S]*?)<\/h[123]>/i, (full, inner) =>
        htmlToText(inner).trim().toLowerCase() === title.toLowerCase() ? '' : full,
      )
      bodyHtml = sanitizeArticleHtml(bodyHtml)
      const bodyJson = generateJSON(bodyHtml, [StarterKit, Image])
      const excerpt = htmlToText(bodyHtml).slice(0, 200) || null

      const slug = uniqueSlug(slugify(title), articleSlugs)
      articleSlugs.push(slug)

      const { data: article, error: insertError } = await db
        .from('articles')
        .insert({
          slug,
          title,
          excerpt,
          body_json: bodyJson,
          body_html: bodyHtml,
          collection_id: collectionId,
          status: 'published',
          published_at: new Date().toISOString(),
          origin_help_center_id: baseCenter.id,
        })
        .select('id')
        .single()
      if (insertError || !article) throw new Error(`article insert failed: ${insertError?.message}`)

      for (const center of seedCenters) {
        const position = positionByCenter.get(center.id) ?? 0
        positionByCenter.set(center.id, position + 1)
        const { error: placementError } = await db
          .from('help_center_articles')
          .insert({ help_center_id: center.id, article_id: article.id, position })
        if (placementError) throw new Error(`placement into ${center.slug} failed: ${placementError.message}`)
        await indexArticle(center.id, article.id)
      }

      genCheckpoint[source.url] = { id: article.id, slug, sourceUrl: source.url }
      manifest[slug] = { sourceUrl: source.url, seededAt: new Date().toISOString() }
      writeFileSync(MANIFEST_OUT, JSON.stringify(manifest, null, 1))
      seeded++
      seededSlugs.push(slug)
    } catch (error) {
      genCheckpoint[source.url] = { error: error instanceof Error ? error.message : String(error) }
      failed++
    }
    saveCheckpoint(ARTICLE_CHECKPOINT_STAGE, genCheckpoint)
    done++
    if (done % PROGRESS_EVERY === 0) console.log(`...seeded ${done}/${fetched.length}`)
  })

  return { seeded, failed, seededSlugs }
}

// ---------------------------------------------------------------------------

async function main() {
  if (!DRY && !process.env.OPENROUTER_API_KEY) {
    throw new Error('Set OPENROUTER_API_KEY (create one at https://openrouter.ai/keys) or add it to .env.cloud')
  }

  const db = serviceClient()

  const coverage = await phase1CoverageMatch(db)
  if (DRY) {
    console.log('[dry-run] stopping after the phase 1 preview — no requests sent, no files written')
    return
  }

  const covered = coverage.filter((c) => c.coveredBy !== null)
  const missing = coverage.filter((c) => c.coveredBy === null)
  console.log(`phase 1 done: ${covered.length} covered, ${missing.length} missing (of ${coverage.length} total)`)

  // A prior run may have already seeded some of today's "missing" list — never re-fetch/re-generate/re-insert those.
  const articleCheckpoint = loadCheckpoint<ArticleCheckpointEntry>(ARTICLE_CHECKPOINT_STAGE)
  const alreadySeededUrls = new Set(
    Object.entries(articleCheckpoint)
      .filter(([, v]) => v && !('error' in v))
      .map(([url]) => url),
  )
  const notYetSeeded = missing.filter((m) => !alreadySeededUrls.has(m.url))
  if (alreadySeededUrls.size > 0) {
    console.log(`${missing.length - notYetSeeded.length} of the missing articles were already seeded in a prior run — skipping`)
  }

  const toSeed = notYetSeeded.slice(0, LIMIT)
  if (toSeed.length < notYetSeeded.length) {
    console.log(`--limit ${LIMIT}: processing ${toSeed.length} of ${notYetSeeded.length} remaining missing articles this run`)
  }

  const fetched = await phase2FetchSources(toSeed)
  const result = await phase3GenerateAndInsert(fetched, db)

  console.log('')
  console.log('=== seed.mts summary ===')
  console.log(`matched covered: ${covered.length}`)
  console.log(`missing (uncovered): ${missing.length}`)
  console.log(`seeded this run: ${result.seeded}`)
  console.log(`fetch failures: ${toSeed.length - fetched.length}`)
  console.log(`generation/insert failures: ${result.failed}`)
  if (result.seededSlugs.length > 0) {
    console.log(`seeded slugs: ${result.seededSlugs.join(', ')}`)
  }
}

await main()

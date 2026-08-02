/**
 * Stage 2: finds topics GoHighLevel's public help center covers that ours
 * doesn't, so they can be seeded as new articles.
 *
 * Source: https://help.gohighlevel.com/support/sitemap.xml (found via the
 * `Sitemap:` line in their robots.txt — the bare /sitemap.xml at the domain
 * root 404s; the portal's sitemap lives under /support/). It lists ~2,800
 * article URLs whose slugs are descriptive enough to use as title-ish text
 * without visiting each page (e.g. .../articles/48000979915-where-do-survey-
 * answers-show-up -> "Where Do Survey Answers Show Up"). The fetch + slug-to-
 * title helpers live in ./ghl.ts, shared with seed.mts's article-level match.
 *
 * This stage is topic-level and coarse (title strings only) — for an
 * article-level coverage match with per-article judgment and original-article
 * generation for real gaps, see seed.mts / `pnpm ops:seed`.
 *
 * Their list is chunked to keep each DeepSeek call to a sensible size; our
 * ~550 titles (grouped by collection) go in full on every chunk so the model
 * always judges against our whole catalog, not just one slice of it.
 *
 * Output: import/ops/gap.json. If the GHL site can't be reached, degrades
 * gracefully: writes a stub with instructions and exits 1.
 *
 * Run: pnpm ops:gap [--dry-run]
 * Env: reads .env.cloud (falls back to .env.local) for Supabase + OpenRouter.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { ROOT, chat, parseJsonLoose, runPool, loadCheckpoint, saveCheckpoint } from './llm'
import { selectAll } from './db'
import { pushSnapshot } from './snapshot'
import { KNOWN_SITEMAP_URL, ROBOTS_URL, fetchTheirArticleUrls, titleFromSlug } from './ghl'
import type { GapItem } from './types'

const { serviceClient } = await import('../../lib/db/client')

const DRY = process.argv.includes('--dry-run')
const CHECKPOINT_STAGE = 'gap-chunks'
const CHUNK_SIZE = 350
const CONCURRENCY = 3

const SYSTEM_PROMPT = `You compare a help center's article catalog against a competitor knowledge base's article list to find topics the competitor covers that we lack.
Judge by whether a genuinely distinct topic is absent from our catalog, not by title-string matching — a rephrasing or synonym of something we already cover is NOT a gap.
Reply with ONLY a JSON object, no markdown fences, no commentary:
{"gaps":[{"topic":"<short topic name>","their_url":"<url>","suggested_collection":"<one of our collection names, or \\"Uncategorized\\">","priority":"high|medium|low"}]}
Only include genuine gaps. If nothing in this chunk is a gap, reply {"gaps":[]}.`

function writeStubAndExit(reason: string): never {
  const outDir = path.join(ROOT, 'import/ops')
  mkdirSync(outDir, { recursive: true })
  const stub = {
    error: reason,
    instructions:
      'Retry later, or check whether https://help.gohighlevel.com/support/sitemap.xml (see robots.txt for the current Sitemap: line if the URL moved) still resolves from this network. ' +
      'If the portal structure changed entirely, adapt fetchTheirArticleUrls() in gap.mts to the new format before re-running.',
  }
  writeFileSync(path.join(outDir, 'gap.json'), JSON.stringify(stub, null, 1))
  console.error(`gap.mts: ${reason}`)
  console.error('wrote stub import/ops/gap.json')
  process.exit(1)
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

async function main() {
  if (!DRY && !process.env.OPENROUTER_API_KEY) {
    throw new Error('Set OPENROUTER_API_KEY (create one at https://openrouter.ai/keys) or add it to .env.cloud')
  }

  const db = serviceClient()
  const { data: collections, error: collectionsError } = await db.from('collections').select('id, title')
  if (collectionsError) throw new Error(`collections query failed: ${collectionsError.message}`)
  const articles = await selectAll(
    () => db.from('articles').select('title, collection_id').eq('status', 'published').order('id'),
    'articles',
  )

  const collectionTitleById = new Map((collections ?? []).map((c) => [c.id, c.title]))
  const ourCollectionNames = [...(collections ?? []).map((c) => c.title), 'Uncategorized']
  const byCollection = new Map<string, string[]>()
  for (const a of articles ?? []) {
    const name = a.collection_id ? (collectionTitleById.get(a.collection_id) ?? 'Uncategorized') : 'Uncategorized'
    if (!byCollection.has(name)) byCollection.set(name, [])
    byCollection.get(name)!.push(a.title)
  }
  const ourTitlesText = [...byCollection.entries()]
    .map(([name, titles]) => `## ${name}\n${titles.map((t) => `- ${t}`).join('\n')}`)
    .join('\n\n')

  console.log(`fetching GoHighLevel's public sitemap...`)
  const sitemap = await fetchTheirArticleUrls()
  if (!sitemap) {
    writeStubAndExit(
      `could not fetch a usable sitemap from ${KNOWN_SITEMAP_URL} or via the Sitemap: line in ${ROBOTS_URL}`,
    )
  }
  const { urls, sourceUrl } = sitemap
  console.log(`found ${urls.length} article URLs via ${sourceUrl}`)
  if (urls.length === 0) {
    writeStubAndExit(`sitemap at ${sourceUrl} returned no /support/solutions/articles/ URLs`)
  }

  const theirArticles = urls.map((url) => ({ titleish: titleFromSlug(url), url }))
  const chunks = chunk(theirArticles, CHUNK_SIZE)
  console.log(`comparing against our ${articles?.length ?? 0} published titles across ${ourCollectionNames.length - 1} collections, in ${chunks.length} chunk(s)`)

  if (DRY) {
    console.log(`[dry-run] would send ${chunks.length} chat requests (${CHUNK_SIZE} of their titles per chunk)`)
    console.log(`[dry-run] sample of their title-ish text:`)
    for (const item of theirArticles.slice(0, 5)) console.log(`  - ${item.titleish} (${item.url})`)
    console.log('[dry-run] no requests sent, gap.json not written')
    return
  }

  const checkpoint = loadCheckpoint<GapItem[] | { error: string }>(CHECKPOINT_STAGE)

  await runPool(chunks, CONCURRENCY, async (chunkItems, i) => {
    const key = String(i)
    // Skip only successful chunks; error entries are retried on the next run.
    if (Array.isArray(checkpoint[key])) return

    const theirChunkText = chunkItems.map((item) => `- ${item.titleish} (${item.url})`).join('\n')
    const user = `Our collections and article titles:\n${ourTitlesText}\n\nCompetitor's article titles (derived from URL slugs) and URLs, chunk ${i + 1}/${chunks.length}:\n${theirChunkText}`

    try {
      const raw = await chat(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: user },
        ],
        { maxTokens: 8000, json: true, temperature: 0.2 },
      )
      const parsed = parseJsonLoose<{ gaps?: unknown }>(raw)
      const gaps = Array.isArray(parsed?.gaps) ? parsed.gaps : []
      const items: GapItem[] = gaps
        .filter(
          (g): g is { topic: string; their_url: string; suggested_collection?: string; priority?: string } =>
            !!g && typeof g === 'object' && typeof (g as Record<string, unknown>).topic === 'string',
        )
        .map((g) => ({
          topic: g.topic,
          theirUrl: typeof g.their_url === 'string' ? g.their_url : '',
          suggestedCollection: typeof g.suggested_collection === 'string' ? g.suggested_collection : 'Uncategorized',
          priority: g.priority === 'high' || g.priority === 'medium' || g.priority === 'low' ? g.priority : 'medium',
        }))
      checkpoint[key] = items
    } catch (error) {
      checkpoint[key] = { error: error instanceof Error ? error.message : String(error) }
    }
    saveCheckpoint(CHECKPOINT_STAGE, checkpoint)
    console.log(`...chunk ${i + 1}/${chunks.length} done`)
  })

  const allGaps: GapItem[] = []
  const chunkErrors: string[] = []
  for (let i = 0; i < chunks.length; i++) {
    const result = checkpoint[String(i)]
    if (Array.isArray(result)) allGaps.push(...result)
    else if (result) chunkErrors.push(`chunk ${i + 1}: ${result.error}`)
  }

  const seen = new Set<string>()
  const deduped = allGaps.filter((g) => {
    const key = `${g.topic.toLowerCase()}|${g.theirUrl}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const outDir = path.join(ROOT, 'import/ops')
  mkdirSync(outDir, { recursive: true })
  writeFileSync(path.join(outDir, 'gap.json'), JSON.stringify(deduped, null, 1))
  console.log(`wrote import/ops/gap.json (${deduped.length} gaps found)`)
  await pushSnapshot('gaps', deduped)
  if (chunkErrors.length > 0) {
    console.log(`${chunkErrors.length} chunk(s) failed and were skipped:`)
    for (const e of chunkErrors) console.log(`  ${e}`)
  }
}

await main()

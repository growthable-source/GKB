/**
 * One-off importer: Google Drive markdown exports -> published help center articles.
 *
 * Reads import/manifest.json (collections + docs) and import/md/<docId>.md files
 * produced by the fetch stage, then for each doc:
 *   - resolves inlined data-URI images to Supabase storage uploads
 *   - converts markdown to HTML, strips GoHighLevel branding ("CRM" instead)
 *   - sanitizes with the app's own sanitizeArticleHtml, generates TipTap body_json
 *   - inserts the canonical article + base-help-center placement as published
 *   - indexes it for search via the app's indexArticle
 *
 * Idempotent: collections are get-or-create by slug; docs already imported
 * (tracked in import/imported.json) are skipped, so the script can resume.
 *
 * Run: pnpm tsx scripts/import-drive.ts [--dry-run] [--limit N]
 * Env: reads .env.cloud (falls back to .env.local) for Supabase URL + service key.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { marked } from 'marked'
import { generateJSON } from '@tiptap/html'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'

const ROOT = path.resolve(import.meta.dirname, '..')

function loadEnv(file: string) {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim())
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}
loadEnv(path.join(ROOT, '.env.cloud'))
loadEnv(path.join(ROOT, '.env.local'))

// Import lib code after env is set; serviceClient reads env at call time.
const { serviceClient } = await import('../lib/db/client')
const { sanitizeArticleHtml } = await import('../lib/content/html')
const { slugify, uniqueSlug } = await import('../lib/content/slug')
const { indexArticle } = await import('../lib/search/index-article')

const DRY = process.argv.includes('--dry-run')
const limitArg = process.argv.indexOf('--limit')
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
}
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

// Hosts whose links are GHL-branded and must not appear in an unbranded KB.
const BRANDED_HOST = /(^|\.)((go)?highlevel|leadconnectorhq|gohighlevel)\.(com|io)/i

type ManifestDoc = { id: string; title: string; modified?: string }
type ManifestCollection = { name: string; docs: ManifestDoc[] }

const manifest = JSON.parse(
  readFileSync(path.join(ROOT, 'import/manifest.json'), 'utf8'),
) as { collections: ManifestCollection[] }

const importedPath = path.join(ROOT, 'import/imported.json')
const imported: Record<string, string> = existsSync(importedPath)
  ? JSON.parse(readFileSync(importedPath, 'utf8'))
  : {}
function saveImported() {
  writeFileSync(importedPath, JSON.stringify(imported, null, 1))
}

/** Replace GHL brand names with "CRM" and unlink branded URLs, in markdown. */
function stripBranding(md: string): string {
  let out = md
  // Unlink markdown links pointing at branded hosts, keeping the visible text.
  out = out.replace(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, (full, text: string, url: string) => {
    try {
      return BRANDED_HOST.test(new URL(url).hostname) ? text : full
    } catch {
      return full
    }
  })
  // Drop bare branded URLs left in prose.
  out = out.replace(/https?:\/\/[^\s)>\]]+/g, (url) => {
    try {
      return BRANDED_HOST.test(new URL(url).hostname) ? '' : url
    } catch {
      return url
    }
  })
  // Brand names -> CRM. Word-boundary so e.g. "higher-level thinking" survives.
  out = out.replace(/\bgo\s?high\s?level\b/gi, 'CRM')
  out = out.replace(/\bhighlevel\b/gi, 'CRM')
  out = out.replace(/\bGHL\b/g, 'CRM')
  // Collapse artifacts like "the CRM CRM" from "the HighLevel GHL".
  out = out.replace(/\b(CRM)(\s+CRM)+\b/g, 'CRM')
  return out
}

/** Extract `[imageN]: <data:...>` definitions; return defs and md without them. */
function extractImageDefs(md: string): { body: string; defs: Map<string, string> } {
  const defs = new Map<string, string>()
  const body = md.replace(
    /^\[([^\]]+)\]:\s*<(data:[^>]+)>\s*$/gm,
    (_full, name: string, uri: string) => {
      defs.set(name.toLowerCase(), uri)
      return ''
    },
  )
  return { body, defs }
}

async function uploadDataUri(uri: string): Promise<string | null> {
  const m = /^data:([^;,]+);base64,([\s\S]*)$/.exec(uri)
  if (!m) return null
  const extension = IMAGE_EXTENSIONS[m[1]]
  if (!extension) return null
  const bytes = Buffer.from(m[2], 'base64')
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return null

  const key = `${randomUUID()}.${extension}`
  if (DRY) return `dry-run://${key}`
  const db = serviceClient()
  const { error } = await db.storage
    .from('article-media')
    .upload(key, bytes, { contentType: m[1], upsert: false })
  if (error) throw new Error(`storage upload failed: ${error.message}`)
  return db.storage.from('article-media').getPublicUrl(key).data.publicUrl
}

/** First markdown H1/H2 text, used when the Drive title is "Untitled document". */
function firstHeading(md: string): string | null {
  const m = /^#{1,2}\s+(.+)$/m.exec(md)
  if (!m) return null
  return m[1]
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`\\]/g, '')
    .trim() || null
}

async function main() {
  const db = serviceClient()
  const { data: hc, error: hcError } = await db
    .from('help_centers')
    .select('id')
    .eq('is_base', true)
    .single()
  if (hcError || !hc) throw new Error(`no base help center: ${hcError?.message}`)

  const { data: existingCollections } = await db.from('collections').select('id, slug, title')
  const collectionSlugs = (existingCollections ?? []).map((c) => c.slug)
  const collectionIdByTitle = new Map(
    (existingCollections ?? []).map((c) => [c.title, c.id]),
  )
  const { data: existingArticles } = await db.from('articles').select('slug')
  const articleSlugs = (existingArticles ?? []).map((a) => a.slug)

  let done = 0
  let skipped = 0
  const failures: { id: string; title: string; reason: string }[] = []

  for (const [collectionIndex, collection] of manifest.collections.entries()) {
    let collectionId = collectionIdByTitle.get(collection.name)
    if (!collectionId) {
      const slug = uniqueSlug(slugify(collection.name), collectionSlugs)
      collectionSlugs.push(slug)
      if (DRY) {
        collectionId = `dry-${slug}`
      } else {
        const { data, error } = await db
          .from('collections')
          .insert({ slug, title: collection.name })
          .select('id')
          .single()
        if (error) throw new Error(`collection insert failed: ${error.message}`)
        collectionId = data.id
        const { error: placementError } = await db.from('help_center_collections').insert({
          help_center_id: hc.id,
          collection_id: collectionId,
          position: collectionIndex,
        })
        if (placementError) {
          throw new Error(`collection placement failed: ${placementError.message}`)
        }
      }
      collectionIdByTitle.set(collection.name, collectionId)
    }

    for (const [docIndex, doc] of collection.docs.entries()) {
      if (done + skipped + failures.length >= LIMIT) break
      if (imported[doc.id]) {
        skipped++
        continue
      }
      const mdPath = path.join(ROOT, 'import/md', `${doc.id}.md`)
      if (!existsSync(mdPath)) {
        failures.push({ id: doc.id, title: doc.title, reason: 'markdown file missing' })
        continue
      }

      try {
        // NUL bytes in a few Drive exports make Postgres reject the jsonb body.
        const raw = readFileSync(mdPath, 'utf8').replace(/\u0000/g, '')
        const { body, defs } = extractImageDefs(raw)
        let md = stripBranding(body)

        let title = doc.title
        if (/^untitled document$/i.test(title.trim())) {
          title = firstHeading(md) ?? title
        }
        title = stripBranding(title).slice(0, 200)
        // The page renders the title as its own h1; drop a leading duplicate.
        md = md.replace(/^\s*#\s+.+\n/, '')

        if (md.replace(/!\[[^\]]*\]\[[^\]]*\]/g, '').trim().length < 40) {
          failures.push({ id: doc.id, title, reason: 'empty or near-empty body' })
          continue
        }

        // Resolve reference-style images to hosted URLs before conversion.
        const uploaded = new Map<string, string>()
        for (const [name, uri] of defs) {
          const url = await uploadDataUri(uri)
          if (url) uploaded.set(name, url)
        }
        md = md.replace(/!\[([^\]]*)\]\[([^\]]+)\]/g, (_full, alt: string, name: string) => {
          const url = uploaded.get(name.toLowerCase())
          return url ? `![${alt}](${url})` : ''
        })

        const html = await marked.parse(md, { gfm: true, async: false })
        const bodyHtml = sanitizeArticleHtml(html)
        const bodyJson = generateJSON(bodyHtml, [StarterKit, Image])

        const slug = uniqueSlug(slugify(title), articleSlugs)
        articleSlugs.push(slug)

        if (!DRY) {
          const { data: article, error } = await db
            .from('articles')
            .insert({
              slug,
              title,
              body_json: bodyJson,
              body_html: bodyHtml,
              collection_id: collectionId,
              status: 'published',
              origin_help_center_id: hc.id,
            })
            .select('id')
            .single()
          if (error) throw new Error(`article insert failed: ${error.message}`)

          const { error: placementError } = await db.from('help_center_articles').insert({
            help_center_id: hc.id,
            article_id: article.id,
            position: docIndex,
          })
          if (placementError) {
            throw new Error(`article placement failed: ${placementError.message}`)
          }
          await indexArticle(hc.id, article.id)
          imported[doc.id] = article.id
          saveImported()
        }
        done++
        if (done % 25 === 0) console.log(`...${done} imported`)
      } catch (error) {
        failures.push({
          id: doc.id,
          title: doc.title,
          reason: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  const report = { done, skipped, failures }
  writeFileSync(path.join(ROOT, 'import/report.json'), JSON.stringify(report, null, 1))
  console.log(
    `${DRY ? '[dry-run] ' : ''}imported ${done}, skipped ${skipped}, failed ${failures.length}`,
  )
  for (const f of failures.slice(0, 20)) console.log(`  FAIL ${f.title}: ${f.reason}`)
}

await main()

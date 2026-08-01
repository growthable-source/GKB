/**
 * Restore articles to their latest article_revisions snapshot (rollback for
 * applied content-ops rewrites). Regenerates body_html from the snapshot's
 * body_json via the same TipTap extensions the editor uses.
 *
 * Run: pnpm tsx scripts/restore-revisions.mts <slug> [<slug> ...]
 */
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { generateHTML } from '@tiptap/html'
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

const { serviceClient } = await import('../lib/db/client')
const { sanitizeArticleHtml } = await import('../lib/content/html')
const { reindexArticleEverywhere } = await import('../lib/search/index-article')

const slugs = process.argv.slice(2)
if (slugs.length === 0) throw new Error('pass at least one article slug')

const db = serviceClient()
for (const slug of slugs) {
  const { data: article, error } = await db
    .from('articles')
    .select('id')
    .eq('slug', slug)
    .single()
  if (error || !article) {
    console.log(`SKIP ${slug}: not found`)
    continue
  }
  const { data: revision } = await db
    .from('article_revisions')
    .select('body_json, title, created_at')
    .eq('article_id', article.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  if (!revision) {
    console.log(`SKIP ${slug}: no revision to restore`)
    continue
  }
  const bodyHtml = sanitizeArticleHtml(
    generateHTML(revision.body_json as object, [StarterKit, Image]),
  )
  const { error: updateError } = await db
    .from('articles')
    .update({ body_html: bodyHtml, body_json: revision.body_json })
    .eq('id', article.id)
  if (updateError) {
    console.log(`FAIL ${slug}: ${updateError.message}`)
    continue
  }
  await reindexArticleEverywhere(article.id)
  console.log(`restored ${slug} from revision ${revision.created_at}`)
}

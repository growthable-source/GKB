'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { serviceClient } from '@/lib/db/client'
import { authorize } from '@/lib/authz/authorize'
import { sanitizeArticleHtml, htmlToText } from '@/lib/content/html'
import { slugify, uniqueSlug } from '@/lib/content/slug'
import { getActiveHelpCenter } from '@/lib/tenancy/active'
import { reindexArticleEverywhere } from '@/lib/search/index-article'
import type { Json } from '@/lib/db/types'

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] }

export async function createArticle(): Promise<void> {
  const helpCenter = await getActiveHelpCenter()
  const actor = await authorize('article.create', { helpCenterId: helpCenter.id })
  const db = serviceClient()

  const { data: existing } = await db.from('articles').select('slug')
  const slug = uniqueSlug('untitled', (existing ?? []).map((r) => r.slug))

  const { data: article, error } = await db
    .from('articles')
    .insert({
      title: 'Untitled',
      slug,
      body_json: EMPTY_DOC,
      body_html: '',
      status: 'draft',
      author_id: actor.userId,
    })
    .select('id')
    .single()

  if (error || !article) throw new Error(`Could not create article: ${error?.message}`)

  revalidatePath('/admin/articles')
  redirect(`/admin/articles/${article.id}`)
}

export async function saveArticle(input: {
  articleId: string
  title: string
  collectionId: string | null
  bodyJson: Record<string, unknown>
  bodyHtml: string
}): Promise<void> {
  const helpCenter = await getActiveHelpCenter()
  await authorize('article.update', { helpCenterId: helpCenter.id })

  const title = input.title.trim() || 'Untitled'
  const bodyHtml = sanitizeArticleHtml(input.bodyHtml)
  const excerpt = htmlToText(bodyHtml).slice(0, 200) || null

  const { error } = await serviceClient()
    .from('articles')
    .update({
      title,
      collection_id: input.collectionId,
      // The editor's ProseMirror document is structurally JSON; TypeScript
      // cannot see that through `Record<string, unknown>`.
      body_json: input.bodyJson as Json,
      body_html: bodyHtml,
      excerpt,
    })
    .eq('id', input.articleId)

  if (error) throw new Error(`Could not save article: ${error.message}`)

  // A save changes canonical content, which every help center that places the
  // article inherits, so reindex all of them — not just the active one.
  await reindexArticleEverywhere(input.articleId)
  revalidatePath('/admin/articles')
}

export async function publishArticle(articleId: string): Promise<void> {
  const helpCenter = await getActiveHelpCenter()
  await authorize('article.publish', { helpCenterId: helpCenter.id })
  const db = serviceClient()

  const { data: article, error: readError } = await db
    .from('articles')
    .select('title, slug')
    .eq('id', articleId)
    .single()

  if (readError || !article) throw new Error(`Article not found: ${readError?.message}`)

  // Replace the placeholder slug with one derived from the final title.
  let slug = article.slug
  if (slug.startsWith('untitled')) {
    const { data: existing } = await db.from('articles').select('slug').neq('id', articleId)
    slug = uniqueSlug(slugify(article.title), (existing ?? []).map((r) => r.slug))
  }

  const { error } = await db
    .from('articles')
    .update({ status: 'published', published_at: new Date().toISOString(), slug })
    .eq('id', articleId)

  if (error) throw new Error(`Could not publish article: ${error.message}`)

  // Phase 1 publishes into the active help center. Phase 2 replaces this with
  // the distribution picker from lib/distribution.
  const { count } = await db
    .from('help_center_articles')
    .select('*', { count: 'exact', head: true })
    .eq('help_center_id', helpCenter.id)

  const { error: placementError } = await db.from('help_center_articles').upsert(
    { help_center_id: helpCenter.id, article_id: articleId, position: count ?? 0 },
    { onConflict: 'help_center_id,article_id', ignoreDuplicates: true },
  )

  if (placementError) throw new Error(`Could not place article: ${placementError.message}`)

  // New articles auto-propagate to every other center that opted in, so a
  // clone stays current without an editor visiting each admin separately.
  const { data: autoIncludeCenters, error: autoIncludeError } = await db
    .from('help_centers')
    .select('id')
    .eq('auto_include_new_articles', true)
    .neq('id', helpCenter.id)
  if (autoIncludeError) {
    throw new Error(`Could not read auto-include help centers: ${autoIncludeError.message}`)
  }

  for (const center of autoIncludeCenters ?? []) {
    // The primary center's publish already committed above — a hiccup
    // placing this article in one auto-include center must not surface as a
    // failure of the publish the editor just asked for, and must not stop
    // the remaining centers (or the reindex/revalidate below) from running.
    try {
      const { count: centerCount } = await db
        .from('help_center_articles')
        .select('*', { count: 'exact', head: true })
        .eq('help_center_id', center.id)

      const { error: autoPlacementError } = await db.from('help_center_articles').upsert(
        { help_center_id: center.id, article_id: articleId, position: centerCount ?? 0 },
        { onConflict: 'help_center_id,article_id', ignoreDuplicates: true },
      )
      if (autoPlacementError) {
        throw new Error(`Could not place article in ${center.id}: ${autoPlacementError.message}`)
      }
    } catch (error) {
      console.error(`publishArticle: auto-include propagation to ${center.id} failed`, error)
    }
  }

  // Publishing flips the status every placement reads, so reindex every help
  // center that places the article — this also covers the placements just
  // added above, since reindexArticleEverywhere re-reads them from the db.
  await reindexArticleEverywhere(articleId)
  revalidatePath('/admin/articles')
  revalidatePath('/', 'layout')
}

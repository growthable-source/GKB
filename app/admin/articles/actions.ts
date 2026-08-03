'use server'

import { revalidatePath, updateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { CONTENT_ARTICLES_TAG } from '@/lib/cache/tags'
import { serviceClient } from '@/lib/db/client'
import { authorize } from '@/lib/authz/authorize'
import { sanitizeArticleHtml, htmlToText } from '@/lib/content/html'
import { slugify } from '@/lib/content/slug'
import { nextAvailableSlug } from '@/lib/content/unique-slug'
import { getBaseHelpCenterId } from '@/lib/tenancy/active'
import { reindexArticleEverywhere } from '@/lib/search/index-article'
import type { Json } from '@/lib/db/types'

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] }

export async function createArticle(): Promise<void> {
  const actor = await authorize('article.create', { helpCenterId: await getBaseHelpCenterId() })
  const db = serviceClient()

  const slug = await nextAvailableSlug('articles', 'untitled')

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
  await authorize('article.update', { helpCenterId: await getBaseHelpCenterId() })

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
  // Public reads are cached under this tag (lib/content/cached.ts). updateTag,
  // not revalidateTag: only updateTag guarantees the editor sees their own
  // change on the very next request rather than after the TTL.
  updateTag(CONTENT_ARTICLES_TAG)
  revalidatePath('/admin/articles')
}

export async function publishArticle(articleId: string): Promise<void> {
  const baseId = await getBaseHelpCenterId()
  await authorize('article.publish', { helpCenterId: baseId })
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
    slug = await nextAvailableSlug('articles', slugify(article.title), articleId)
  }

  const { error } = await db
    .from('articles')
    .update({ status: 'published', published_at: new Date().toISOString(), slug })
    .eq('id', articleId)

  if (error) throw new Error(`Could not publish article: ${error.message}`)

  // Content is shared across every branded help center — publishing places
  // the article once, into the base center's structure, which every brand
  // reads through (see lib/tenancy/active.ts's getBaseHelpCenterId). There is
  // no per-center propagation: a non-base center never has placement rows of
  // its own.
  const { count } = await db
    .from('help_center_articles')
    .select('*', { count: 'exact', head: true })
    .eq('help_center_id', baseId)

  const { error: placementError } = await db.from('help_center_articles').upsert(
    { help_center_id: baseId, article_id: articleId, position: count ?? 0 },
    { onConflict: 'help_center_id,article_id', ignoreDuplicates: true },
  )

  if (placementError) throw new Error(`Could not place article: ${placementError.message}`)

  // Publishing flips the status every brand reads through this placement, so
  // reindex it.
  await reindexArticleEverywhere(articleId)
  updateTag(CONTENT_ARTICLES_TAG)
  revalidatePath('/admin/articles')
  revalidatePath('/', 'layout')
}

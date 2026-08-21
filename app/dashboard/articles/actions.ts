'use server'

import { revalidatePath, updateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { CONTENT_ARTICLES_TAG, CONTENT_COLLECTIONS_TAG, EXCLUSIONS_TAG } from '@/lib/cache/tags'
import { serviceClient } from '@/lib/db/client'
import { authorize } from '@/lib/authz/authorize'
import { sanitizeArticleHtml, htmlToText } from '@/lib/content/html'
import { slugify } from '@/lib/content/slug'
import { nextAvailableSlug } from '@/lib/content/unique-slug'
import { indexOwnedArticle } from '@/lib/search/index-article'
import { getOwnedCenter } from '@/lib/dashboard/owned-center'
import { assertOwnsArticle } from '@/lib/dashboard/owned-content'
import { pushKnowledgeRefresh } from '@/lib/ai-widget/knowledge-push'
import type { Json } from '@/lib/db/types'

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] }

/** The signed-in owner's centre, or a thrown error. Every action starts here. */
async function ownedCenter() {
  const center = await getOwnedCenter()
  if (!center) throw new Error('You do not have a help centre yet.')
  await authorize('article.update', { helpCenterId: center.id })
  return center
}

function bustContent() {
  updateTag(CONTENT_ARTICLES_TAG)
  updateTag(CONTENT_COLLECTIONS_TAG)
}

export async function createOwnerArticle(): Promise<void> {
  const center = await ownedCenter()

  const slug = await nextAvailableSlug('articles', 'untitled', { ownerId: center.id })

  const { data, error } = await serviceClient()
    .from('articles')
    .insert({
      title: 'Untitled',
      slug,
      body_json: EMPTY_DOC,
      body_html: '',
      status: 'draft',
      origin_help_center_id: center.id,
    })
    .select('id')
    .single()

  if (error || !data) throw new Error(`Could not create the article: ${error?.message}`)

  revalidatePath('/dashboard/articles')
  redirect(`/dashboard/articles/${data.id}`)
}

export async function saveOwnerArticle(input: {
  articleId: string
  title: string
  collectionId: string | null
  bodyJson: Record<string, unknown>
  bodyHtml: string
}): Promise<void> {
  const center = await ownedCenter()
  await assertOwnsArticle(center.id, input.articleId)

  const title = input.title.trim() || 'Untitled'
  // Every path into this — typed, pasted, or hand-written in the source view —
  // lands here, so this is the one place sanitising has to happen.
  const bodyHtml = sanitizeArticleHtml(input.bodyHtml)
  const excerpt = htmlToText(bodyHtml).slice(0, 200) || null

  const { error } = await serviceClient()
    .from('articles')
    .update({
      title,
      collection_id: input.collectionId,
      body_json: input.bodyJson as Json,
      body_html: bodyHtml,
      excerpt,
    })
    .eq('id', input.articleId)

  if (error) throw new Error(`Could not save the article: ${error.message}`)

  await indexOwnedArticle(input.articleId)
  bustContent()
  // Content changed for this centre — refresh the AI widget's knowledge.
  await pushKnowledgeRefresh(center.id)
  revalidatePath('/dashboard/articles')
}

export async function publishOwnerArticle(articleId: string): Promise<void> {
  const center = await ownedCenter()
  await assertOwnsArticle(center.id, articleId)

  const { data: article, error: readError } = await serviceClient()
    .from('articles')
    .select('title, status')
    .eq('id', articleId)
    .single()
  if (readError || !article) throw new Error(`Could not publish: ${readError?.message}`)

  // Slug is derived at publish time, not on every keystroke: a draft's URL
  // should settle when it goes live rather than moving under anyone reading it.
  const slug = await nextAvailableSlug('articles', slugify(article.title), {
    ownerId: center.id,
    excludeId: articleId,
  })

  const { error } = await serviceClient()
    .from('articles')
    .update({ status: 'published', published_at: new Date().toISOString(), slug })
    .eq('id', articleId)

  if (error) throw new Error(`Could not publish the article: ${error.message}`)

  await indexOwnedArticle(articleId)
  bustContent()
  // Content changed for this centre — refresh the AI widget's knowledge.
  await pushKnowledgeRefresh(center.id)
  revalidatePath('/dashboard/articles')
}

export async function unpublishOwnerArticle(articleId: string): Promise<void> {
  const center = await ownedCenter()
  await assertOwnsArticle(center.id, articleId)

  const { error } = await serviceClient()
    .from('articles')
    .update({ status: 'draft' })
    .eq('id', articleId)

  if (error) throw new Error(`Could not unpublish the article: ${error.message}`)

  // Drops it from the index too, so search cannot lead to a 404.
  await indexOwnedArticle(articleId)
  bustContent()
  // Content changed for this centre — refresh the AI widget's knowledge.
  await pushKnowledgeRefresh(center.id)
  revalidatePath('/dashboard/articles')
}

export async function deleteOwnerArticle(articleId: string): Promise<void> {
  const center = await ownedCenter()
  await assertOwnsArticle(center.id, articleId)

  const { error } = await serviceClient().from('articles').delete().eq('id', articleId)
  if (error) throw new Error(`Could not delete the article: ${error.message}`)

  bustContent()
  // Content changed for this centre — refresh the AI widget's knowledge.
  await pushKnowledgeRefresh(center.id)
  revalidatePath('/dashboard/articles')
  redirect('/dashboard/articles')
}

/**
 * Hides or shows one of the SHARED articles on this centre.
 *
 * Owners cannot edit shared articles, only choose whether they appear — see the
 * design spec. This writes the exclusion rows from 0007, which every public
 * read already respects.
 */
export async function setSharedArticleHidden(
  articleId: string,
  hidden: boolean,
): Promise<void> {
  const center = await ownedCenter()
  const db = serviceClient()

  const { error } = hidden
    ? await db
        .from('help_center_article_exclusions')
        .upsert(
          { help_center_id: center.id, article_id: articleId },
          { onConflict: 'help_center_id,article_id' },
        )
    : await db
        .from('help_center_article_exclusions')
        .delete()
        .eq('help_center_id', center.id)
        .eq('article_id', articleId)

  if (error) throw new Error(`Could not change that article's visibility: ${error.message}`)

  updateTag(EXCLUSIONS_TAG)
  // Showing/hiding a shared article changes what the public centre — and
  // therefore the crawl — sees.
  await pushKnowledgeRefresh(center.id)
  revalidatePath('/dashboard/articles')
}

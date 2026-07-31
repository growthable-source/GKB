import { serviceClient } from '@/lib/db/client'
import { mergeArticle } from '@/lib/content/merge'
import type { BodyJson, CanonicalArticle, EffectiveArticle } from '@/lib/content/types'

/**
 * The effective article for indexing: looked up by id, returning null when the
 * placement is hidden or the article is not published, so callers delete the row.
 */
export async function getEffectiveArticleForIndexing(
  helpCenterId: string,
  articleId: string,
): Promise<EffectiveArticle | null> {
  const { data, error } = await serviceClient()
    .from('help_center_articles')
    .select(
      `help_center_id, article_id, position, is_hidden, title_override,
       body_json_override, body_html_override, collection_override_id,
       articles!inner (id, slug, title, excerpt, body_json, body_html,
                       collection_id, status, published_at)`,
    )
    .eq('help_center_id', helpCenterId)
    .eq('article_id', articleId)
    .maybeSingle()

  if (error) throw new Error(`getEffectiveArticleForIndexing failed: ${error.message}`)
  if (!data) return null

  const row = data.articles as unknown as {
    id: string
    slug: string
    title: string
    excerpt: string | null
    body_json: unknown
    body_html: string
    collection_id: string | null
    status: string
    published_at: string | null
  }

  if (row.status !== 'published' || data.is_hidden) return null

  const canonical: CanonicalArticle = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    bodyJson: (row.body_json ?? {}) as BodyJson,
    bodyHtml: row.body_html,
    collectionId: row.collection_id,
    status: 'published',
    publishedAt: row.published_at,
  }

  return mergeArticle(canonical, {
    helpCenterId: data.help_center_id,
    articleId: data.article_id,
    position: data.position,
    isHidden: data.is_hidden,
    titleOverride: data.title_override,
    bodyJsonOverride: (data.body_json_override ?? null) as BodyJson | null,
    bodyHtmlOverride: data.body_html_override,
    collectionOverrideId: data.collection_override_id,
  })
}

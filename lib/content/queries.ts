import { serviceClient } from '@/lib/db/client'
import { mergeArticle, mergeCollection } from './merge'
import type {
  ArticlePlacement,
  BodyJson,
  CanonicalArticle,
  CanonicalCollection,
  CollectionPlacement,
  EffectiveArticle,
  EffectiveCollection,
} from './types'

const ARTICLE_FIELDS =
  'id, slug, title, excerpt, body_json, body_html, collection_id, status, published_at'
const COLLECTION_FIELDS = 'id, slug, title, description, icon'

type ArticleRow = {
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

function toCanonicalArticle(row: ArticleRow): CanonicalArticle {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    bodyJson: (row.body_json ?? {}) as BodyJson,
    bodyHtml: row.body_html,
    collectionId: row.collection_id,
    status: row.status as CanonicalArticle['status'],
    publishedAt: row.published_at,
  }
}

type PlacementRow = {
  help_center_id: string
  article_id: string
  position: number
  is_hidden: boolean
  title_override: string | null
  body_json_override: unknown
  body_html_override: string | null
  collection_override_id: string | null
}

function toArticlePlacement(row: PlacementRow): ArticlePlacement {
  return {
    helpCenterId: row.help_center_id,
    articleId: row.article_id,
    position: row.position,
    isHidden: row.is_hidden,
    titleOverride: row.title_override,
    bodyJsonOverride: (row.body_json_override ?? null) as BodyJson | null,
    bodyHtmlOverride: row.body_html_override,
    collectionOverrideId: row.collection_override_id,
  }
}

type CollectionPlacementRow = {
  help_center_id: string
  collection_id: string
  position: number
  is_hidden: boolean
  title_override: string | null
  description_override: string | null
  audience: string
}

function toCollectionPlacement(row: CollectionPlacementRow): CollectionPlacement {
  return {
    helpCenterId: row.help_center_id,
    collectionId: row.collection_id,
    position: row.position,
    isHidden: row.is_hidden,
    titleOverride: row.title_override,
    descriptionOverride: row.description_override,
    audience: row.audience as CollectionPlacement['audience'],
  }
}

/** Visible, published collections for a help center, in display order. */
export async function listEffectiveCollections(
  helpCenterId: string,
): Promise<EffectiveCollection[]> {
  const { data, error } = await serviceClient()
    .from('help_center_collections')
    .select(
      `help_center_id, collection_id, position, is_hidden, title_override,
       description_override, audience,
       collections!inner (${COLLECTION_FIELDS})`,
    )
    .eq('help_center_id', helpCenterId)
    .eq('is_hidden', false)
    .order('position', { ascending: true })

  if (error) throw new Error(`listEffectiveCollections failed: ${error.message}`)

  return (data ?? []).map((row) => {
    const canonical = row.collections as unknown as CanonicalCollection
    return mergeCollection(canonical, toCollectionPlacement(row as CollectionPlacementRow))
  })
}

/** Visible, published articles in a collection, in display order. */
export async function listEffectiveArticles(
  helpCenterId: string,
  collectionId: string,
): Promise<EffectiveArticle[]> {
  const { data, error } = await serviceClient()
    .from('help_center_articles')
    .select(
      `help_center_id, article_id, position, is_hidden, title_override,
       body_json_override, body_html_override, collection_override_id,
       articles!inner (${ARTICLE_FIELDS})`,
    )
    .eq('help_center_id', helpCenterId)
    .eq('is_hidden', false)
    .eq('articles.status', 'published')
    .order('position', { ascending: true })

  if (error) throw new Error(`listEffectiveArticles failed: ${error.message}`)

  return (data ?? [])
    .map((row) =>
      mergeArticle(
        toCanonicalArticle(row.articles as unknown as ArticleRow),
        toArticlePlacement(row as PlacementRow),
      ),
    )
    // The collection can be overridden per help center, so filter after merging.
    .filter((article) => article.collectionId === collectionId)
}

/** One published, visible article by slug, or null. */
export async function getEffectiveArticle(
  helpCenterId: string,
  articleSlug: string,
): Promise<EffectiveArticle | null> {
  const { data, error } = await serviceClient()
    .from('help_center_articles')
    .select(
      `help_center_id, article_id, position, is_hidden, title_override,
       body_json_override, body_html_override, collection_override_id,
       articles!inner (${ARTICLE_FIELDS})`,
    )
    .eq('help_center_id', helpCenterId)
    .eq('is_hidden', false)
    .eq('articles.slug', articleSlug)
    .eq('articles.status', 'published')
    .maybeSingle()

  if (error) throw new Error(`getEffectiveArticle failed: ${error.message}`)
  if (!data) return null

  return mergeArticle(
    toCanonicalArticle(data.articles as unknown as ArticleRow),
    toArticlePlacement(data as PlacementRow),
  )
}

/** Article counts per collection, for the home page grid. */
export async function countArticlesPerCollection(
  helpCenterId: string,
): Promise<Map<string, number>> {
  const collections = await listEffectiveCollections(helpCenterId)
  const counts = new Map<string, number>()

  for (const collection of collections) {
    const articles = await listEffectiveArticles(helpCenterId, collection.id)
    counts.set(collection.id, articles.length)
  }

  return counts
}

import { serviceClient } from '@/lib/db/client'
import { selectAll } from '@/lib/db/select-all'
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

/** Visible, public-audience collections for a help center, in display order. */
export async function listEffectiveCollections(
  baseHelpCenterId: string,
): Promise<EffectiveCollection[]> {
  const data = await selectAll(
    () =>
      serviceClient()
        .from('help_center_collections')
        .select(
          `help_center_id, collection_id, position, is_hidden, title_override,
           description_override, audience,
           collections!inner (${COLLECTION_FIELDS})`,
        )
        .eq('help_center_id', baseHelpCenterId)
        .eq('is_hidden', false)
        // Audience is a placement-level column with no canonical counterpart, so
        // filtering the raw column here IS filtering the effective value. Article
        // pages resolve their collection through this list, so gating collections
        // gates articles too.
        .eq('audience', 'public')
        // Pagination via .range() needs a stable, fully-unique order — ties on
        // position alone would let consecutive page reads skip or duplicate
        // rows. collection_id is unique per help_center_id (composite PK).
        .order('position', { ascending: true })
        .order('collection_id', { ascending: true }),
    'listEffectiveCollections',
  )

  return data.map((row) => {
    const canonical = row.collections as unknown as CanonicalCollection
    return mergeCollection(canonical, toCollectionPlacement(row as CollectionPlacementRow))
  })
}

/** Visible, published articles in a collection, in display order. */
export async function listEffectiveArticles(
  baseHelpCenterId: string,
  collectionId: string,
): Promise<EffectiveArticle[]> {
  const data = await selectAll(
    () =>
      serviceClient()
        .from('help_center_articles')
        .select(
          `help_center_id, article_id, position, is_hidden, title_override,
           body_json_override, body_html_override, collection_override_id,
           articles!inner (${ARTICLE_FIELDS})`,
        )
        .eq('help_center_id', baseHelpCenterId)
        .eq('is_hidden', false)
        .eq('articles.status', 'published')
        // See the ordering note in listEffectiveCollections above. article_id
        // is unique per help_center_id (composite PK).
        .order('position', { ascending: true })
        .order('article_id', { ascending: true }),
    'listEffectiveArticles',
  )

  return data
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
  baseHelpCenterId: string,
  articleSlug: string,
): Promise<EffectiveArticle | null> {
  const { data, error } = await serviceClient()
    .from('help_center_articles')
    .select(
      `help_center_id, article_id, position, is_hidden, title_override,
       body_json_override, body_html_override, collection_override_id,
       articles!inner (${ARTICLE_FIELDS})`,
    )
    .eq('help_center_id', baseHelpCenterId)
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

type ArticleCountRow = {
  collection_override_id: string | null
  articles: { collection_id: string | null } | { collection_id: string | null }[] | null
}

/**
 * Article counts per collection, for the home page grid. Fetches only the id
 * fields needed to determine each visible, published article's effective
 * collection (see mergeArticle) and counts in JS, rather than fetching every
 * article's full body once per collection.
 */
export async function countArticlesPerCollection(
  baseHelpCenterId: string,
): Promise<Map<string, number>> {
  const data = await selectAll(
    () =>
      serviceClient()
        .from('help_center_articles')
        .select('collection_override_id, articles!inner (collection_id)')
        .eq('help_center_id', baseHelpCenterId)
        .eq('is_hidden', false)
        .eq('articles.status', 'published')
        // Order needed for stable .range() pagination (see the note in
        // listEffectiveCollections); display order doesn't matter here since
        // rows are only counted, not shown.
        .order('article_id', { ascending: true }),
    'countArticlesPerCollection',
  )

  const counts = new Map<string, number>()

  for (const row of data as ArticleCountRow[]) {
    const canonical = Array.isArray(row.articles) ? row.articles[0] : row.articles
    const collectionId = row.collection_override_id ?? canonical?.collection_id ?? null
    if (!collectionId) continue
    counts.set(collectionId, (counts.get(collectionId) ?? 0) + 1)
  }

  return counts
}

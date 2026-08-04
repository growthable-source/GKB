import { serviceClient } from '@/lib/db/client'
import { selectAll } from '@/lib/db/select-all'
import { mergeArticle, mergeArticleSummary, mergeCollection } from './merge'
import type {
  ArticlePlacement,
  BodyJson,
  CanonicalArticle,
  CanonicalArticleSummary,
  CanonicalCollection,
  CollectionPlacement,
  EffectiveArticle,
  EffectiveArticleSummary,
  EffectiveCollection,
} from './types'

const ARTICLE_FIELDS =
  'id, slug, title, excerpt, body_json, body_html, collection_id, status, published_at'
/** ARTICLE_FIELDS minus the bodies, which are ~99% of a row's bytes. */
const ARTICLE_SUMMARY_FIELDS = 'id, slug, title, excerpt, collection_id, status, published_at'
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

type ArticleSummaryRow = Omit<ArticleRow, 'body_json' | 'body_html'>

function toCanonicalArticleSummary(row: ArticleSummaryRow): CanonicalArticleSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    collectionId: row.collection_id,
    status: row.status as CanonicalArticleSummary['status'],
    publishedAt: row.published_at,
  }
}

type SummaryRow = {
  article_id: string
  position: number
  is_hidden: boolean
  title_override: string | null
  collection_override_id: string | null
  articles: unknown
}

/**
 * Visible, published articles in a collection, in display order.
 *
 * An article's effective collection is `collection_override_id ?? articles
 * .collection_id`, which spans a placement column and a joined column. PostgREST
 * rejects a top-level `or=()` that references an embedded table's column, so the
 * two branches have to be two queries — run in parallel and merged here. The
 * alternative, fetching the whole catalog and filtering in JS, moved every
 * article body over the wire on every collection view.
 */
export async function listEffectiveArticles(
  baseHelpCenterId: string,
  collectionId: string,
): Promise<EffectiveArticleSummary[]> {
  const visiblePublished = () =>
    serviceClient()
      .from('help_center_articles')
      .select(
        `article_id, position, is_hidden, title_override, collection_override_id,
         articles!inner (${ARTICLE_SUMMARY_FIELDS})`,
      )
      .eq('help_center_id', baseHelpCenterId)
      .eq('is_hidden', false)
      .eq('articles.status', 'published')
      // See the ordering note in listEffectiveCollections above. article_id
      // is unique per help_center_id (composite PK).
      .order('position', { ascending: true })
      .order('article_id', { ascending: true })

  const [overridden, canonical] = await Promise.all([
    selectAll<SummaryRow>(
      () => visiblePublished().eq('collection_override_id', collectionId),
      'listEffectiveArticles (overridden)',
    ),
    selectAll<SummaryRow>(
      () =>
        visiblePublished()
          .is('collection_override_id', null)
          .eq('articles.collection_id', collectionId),
      'listEffectiveArticles (canonical)',
    ),
  ])

  return [...overridden, ...canonical]
    .map((row) =>
      mergeArticleSummary(toCanonicalArticleSummary(row.articles as ArticleSummaryRow), {
        position: row.position,
        isHidden: row.is_hidden,
        titleOverride: row.title_override,
        collectionOverrideId: row.collection_override_id,
      }),
    )
    // Each query is ordered, but their concatenation is not. Re-sort on the same
    // (position, article_id) key the database used so display order is unchanged.
    .sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
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
  article_id: string
  collection_override_id: string | null
  articles: { collection_id: string | null } | { collection_id: string | null }[] | null
}

/** An article and the collection it effectively belongs to. */
export type ArticleCollectionEntry = { id: string; collectionId: string }

/**
 * Every visible, published article paired with its effective collection.
 *
 * Returns the pairs rather than counts so a caller can subtract a help center's
 * exclusions before counting — a pre-aggregated number cannot be adjusted. It
 * fetches only the two id fields, so the whole catalog is a small payload, and
 * it is cached once for the platform because the mapping is identical for every
 * center.
 */
export async function listArticleCollectionIndex(
  baseHelpCenterId: string,
): Promise<ArticleCollectionEntry[]> {
  const data = await selectAll(
    () =>
      serviceClient()
        .from('help_center_articles')
        .select('article_id, collection_override_id, articles!inner (collection_id)')
        .eq('help_center_id', baseHelpCenterId)
        .eq('is_hidden', false)
        .eq('articles.status', 'published')
        // Order needed for stable .range() pagination (see the note in
        // listEffectiveCollections); display order doesn't matter here since
        // these rows are only counted, not shown.
        .order('article_id', { ascending: true }),
    'listArticleCollectionIndex',
  )

  const entries: ArticleCollectionEntry[] = []

  for (const row of data as ArticleCountRow[]) {
    const canonical = Array.isArray(row.articles) ? row.articles[0] : row.articles
    const collectionId = row.collection_override_id ?? canonical?.collection_id ?? null
    // An article with no effective collection has no public URL, so it belongs
    // to no tile and is not counted anywhere.
    if (!collectionId) continue
    entries.push({ id: row.article_id, collectionId })
  }

  return entries
}

/**
 * Article counts per collection for the home page grid, with one center's
 * excluded articles left out.
 *
 * Pure, so it is not cached: the index it reads is, and the exclusion set is,
 * but their combination is per-center and cheap to recompute.
 *
 * A plain record, not a Map — anything that might cross the data cache has to
 * survive JSON, and a Map does not.
 */
export function countArticlesPerCollection(
  index: ArticleCollectionEntry[],
  excludedArticleIds: Set<string>,
): Record<string, number> {
  const counts: Record<string, number> = {}

  for (const entry of index) {
    if (excludedArticleIds.has(entry.id)) continue
    counts[entry.collectionId] = (counts[entry.collectionId] ?? 0) + 1
  }

  return counts
}

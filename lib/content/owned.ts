import { serviceClient } from '@/lib/db/client'
import { selectAll } from '@/lib/db/select-all'
import type {
  BodyJson,
  EffectiveArticle,
  EffectiveArticleSummary,
  EffectiveCollection,
} from './types'
import type { ArticleCollectionEntry } from './queries'

/**
 * Content a single help center owns, as opposed to the shared library the base
 * center owns.
 *
 * Deliberately much simpler than ./queries.ts: tenant content has no placement
 * rows, so there is nothing to merge, nothing to override, and nothing to hide.
 * Ownership is the column `origin_help_center_id`, and that is the whole model.
 *
 * The absence of placement rows is load-bearing, not laziness. Per-center
 * placement copying is what broke the original clone design — PostgREST
 * silently truncates a select at 1,000 rows, and the shared catalogue is past
 * 2,700. Nothing here may reintroduce it.
 */

const ARTICLE_FIELDS =
  'id, slug, title, excerpt, body_json, body_html, collection_id, status, published_at'
const ARTICLE_SUMMARY_FIELDS = 'id, slug, title, excerpt, collection_id, status, published_at'
const COLLECTION_FIELDS = 'id, slug, title, description, icon'

type OwnedCollectionRow = {
  id: string
  slug: string
  title: string
  description: string | null
  icon: string | null
}

type OwnedArticleRow = {
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

/**
 * A center's own collections, alphabetically.
 *
 * `position` counts from zero within this list only. Callers concatenate these
 * after the shared collections rather than interleaving, so shared ordering is
 * untouched — see the ordering note in the design spec.
 */
export async function listOwnedCollections(
  helpCenterId: string,
): Promise<EffectiveCollection[]> {
  const rows = await selectAll<OwnedCollectionRow>(
    () =>
      serviceClient()
        .from('collections')
        .select(COLLECTION_FIELDS)
        .eq('origin_help_center_id', helpCenterId)
        // id is the PK, so this is the stable unique order .range() paging needs.
        .order('title', { ascending: true })
        .order('id', { ascending: true }),
    'listOwnedCollections',
  )

  return rows.map((row, index) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    icon: row.icon,
    position: index,
    isHidden: false,
    audience: 'public' as const,
    isOverridden: false,
  }))
}

/** A center's own published articles in one collection, alphabetically. */
export async function listOwnedArticles(
  helpCenterId: string,
  collectionId: string,
): Promise<EffectiveArticleSummary[]> {
  const rows = await selectAll<Omit<OwnedArticleRow, 'body_json' | 'body_html'>>(
    () =>
      serviceClient()
        .from('articles')
        .select(ARTICLE_SUMMARY_FIELDS)
        .eq('origin_help_center_id', helpCenterId)
        .eq('collection_id', collectionId)
        .eq('status', 'published')
        .order('title', { ascending: true })
        .order('id', { ascending: true }),
    'listOwnedArticles',
  )

  return rows.map((row, index) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    collectionId: row.collection_id,
    status: row.status as EffectiveArticleSummary['status'],
    publishedAt: row.published_at,
    position: index,
    isHidden: false,
  }))
}

/**
 * One of a center's own published articles by slug, or null.
 *
 * Scoped to the owner, so asking for another tenant's slug returns nothing even
 * when that slug exists — slugs are unique per owner, and this is the query
 * that makes that safe rather than merely permitted.
 */
export async function getOwnedArticle(
  helpCenterId: string,
  articleSlug: string,
): Promise<EffectiveArticle | null> {
  const { data, error } = await serviceClient()
    .from('articles')
    .select(ARTICLE_FIELDS)
    .eq('origin_help_center_id', helpCenterId)
    .eq('slug', articleSlug)
    .eq('status', 'published')
    .maybeSingle()

  if (error) throw new Error(`getOwnedArticle failed: ${error.message}`)
  if (!data) return null

  const row = data as OwnedArticleRow
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    bodyJson: (row.body_json ?? {}) as BodyJson,
    bodyHtml: row.body_html,
    collectionId: row.collection_id,
    status: row.status as EffectiveArticle['status'],
    publishedAt: row.published_at,
    position: 0,
    isHidden: false,
    isOverridden: false,
  }
}

/** A center's own published articles paired with their collection, for counts. */
export async function listOwnedArticleCollectionIndex(
  helpCenterId: string,
): Promise<ArticleCollectionEntry[]> {
  const rows = await selectAll<{ id: string; collection_id: string | null }>(
    () =>
      serviceClient()
        .from('articles')
        .select('id, collection_id')
        .eq('origin_help_center_id', helpCenterId)
        .eq('status', 'published')
        .order('id', { ascending: true }),
    'listOwnedArticleCollectionIndex',
  )

  // An article with no collection has no public URL, so it belongs to no tile
  // and is counted nowhere — same rule the shared index applies.
  return rows
    .filter((row): row is { id: string; collection_id: string } => Boolean(row.collection_id))
    .map((row) => ({ id: row.id, collectionId: row.collection_id }))
}

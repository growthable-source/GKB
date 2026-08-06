import { serviceClient } from '@/lib/db/client'

export type OwnerArticleRow = {
  id: string
  slug: string
  title: string
  status: string
  collectionId: string | null
  updatedAt: string
}

export type OwnerCollectionRow = {
  id: string
  slug: string
  title: string
  description: string | null
  icon: string | null
  articleCount: number
}

/**
 * Throws unless this article belongs to this help center.
 *
 * The authorize() check answers "may this person write articles in this
 * centre", which an owner legitimately passes for their own centre. It does not
 * answer "is this article theirs" — without this second check an owner could
 * pass their own centre id while editing a base-owned article, and can() would
 * allow it. Two questions, two checks.
 */
export async function assertOwnsArticle(helpCenterId: string, articleId: string): Promise<void> {
  const { data, error } = await serviceClient()
    .from('articles')
    .select('id, origin_help_center_id')
    .eq('id', articleId)
    .maybeSingle()

  if (error) throw new Error(`Could not check that article: ${error.message}`)
  // Same message for missing and not-yours: a tenant should not be able to
  // discover that another tenant's article id exists.
  if (!data || data.origin_help_center_id !== helpCenterId) {
    throw new Error('That article does not exist.')
  }
}

export async function assertOwnsCollection(
  helpCenterId: string,
  collectionId: string,
): Promise<void> {
  const { data, error } = await serviceClient()
    .from('collections')
    .select('id, origin_help_center_id')
    .eq('id', collectionId)
    .maybeSingle()

  if (error) throw new Error(`Could not check that collection: ${error.message}`)
  if (!data || data.origin_help_center_id !== helpCenterId) {
    throw new Error('That collection does not exist.')
  }
}

/** Every article this centre owns, drafts included. */
export async function listOwnerArticles(helpCenterId: string): Promise<OwnerArticleRow[]> {
  const { data, error } = await serviceClient()
    .from('articles')
    .select('id, slug, title, status, collection_id, updated_at')
    .eq('origin_help_center_id', helpCenterId)
    .order('updated_at', { ascending: false })

  if (error) throw new Error(`Could not load your articles: ${error.message}`)

  return (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    collectionId: row.collection_id,
    updatedAt: row.updated_at,
  }))
}

/** Every collection this centre owns, with how many of its articles sit in each. */
export async function listOwnerCollections(helpCenterId: string): Promise<OwnerCollectionRow[]> {
  const [collections, articles] = await Promise.all([
    serviceClient()
      .from('collections')
      .select('id, slug, title, description, icon')
      .eq('origin_help_center_id', helpCenterId)
      .order('title'),
    serviceClient()
      .from('articles')
      .select('collection_id')
      .eq('origin_help_center_id', helpCenterId),
  ])

  if (collections.error) throw new Error(`Could not load your collections: ${collections.error.message}`)
  if (articles.error) throw new Error(`Could not count your articles: ${articles.error.message}`)

  const counts = new Map<string, number>()
  for (const row of articles.data ?? []) {
    if (!row.collection_id) continue
    counts.set(row.collection_id, (counts.get(row.collection_id) ?? 0) + 1)
  }

  return (collections.data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    icon: row.icon,
    articleCount: counts.get(row.id) ?? 0,
  }))
}

/** One of this centre's articles for editing, drafts included. */
export async function getOwnerArticle(helpCenterId: string, articleId: string) {
  const { data, error } = await serviceClient()
    .from('articles')
    .select('id, slug, title, body_json, body_html, collection_id, status')
    .eq('id', articleId)
    .eq('origin_help_center_id', helpCenterId)
    .maybeSingle()

  if (error) throw new Error(`Could not load that article: ${error.message}`)
  return data
}

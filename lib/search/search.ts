import sanitizeHtml from 'sanitize-html'
import { serviceClient } from '@/lib/db/client'

export type SearchHit = {
  articleId: string
  slug: string
  title: string
  /** Body excerpt with <mark> around matches. Safe: derived from sanitized text. */
  headline: string
}

/** Ceiling on the over-fetch below, so a center with a huge exclusion list
 *  cannot turn one search into an unbounded scan. */
const MAX_OVERFETCH = 200

/**
 * Full-text search over the shared index, minus the articles this center hides.
 *
 * There is one index, owned by the base center, and exclusions are applied to
 * its results rather than reindexed per center — a per-center index would
 * multiply every article row by the tenant count and go stale on every
 * exclusion change.
 *
 * Because the filter runs after the database applies its limit, an excluding
 * center asks for extra rows up front; otherwise hiding three articles would
 * quietly return 17 results for a limit of 20.
 */
export async function searchHelpCenter(
  baseHelpCenterId: string,
  query: string,
  limit = 20,
  excludedArticleIds: Set<string> = new Set(),
  /**
   * A center's own id, when it is a tenant with articles of its own. Its index
   * rows live under this id, so they are invisible to a search of the base
   * index — which reads as the search box being broken rather than the feature
   * being absent.
   */
  ownedHelpCenterId?: string | null,
): Promise<SearchHit[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const fetchLimit =
    excludedArticleIds.size === 0
      ? limit
      : Math.min(limit + excludedArticleIds.size, limit + MAX_OVERFETCH)

  const search = (helpCenterId: string) =>
    serviceClient().rpc('search_help_center', {
      p_help_center_id: helpCenterId,
      p_query: trimmed,
      p_limit: fetchLimit,
    })

  // Two indexes, one ranking. The RPC returns ts_rank, so the halves can be
  // merged on the same scale rather than one being arbitrarily stapled after
  // the other — a tenant's own article should outrank a weak shared match, and
  // vice versa.
  const [shared, owned] = await Promise.all([
    search(baseHelpCenterId),
    ownedHelpCenterId ? search(ownedHelpCenterId) : Promise.resolve({ data: [], error: null }),
  ])

  if (shared.error) throw new Error(`searchHelpCenter failed: ${shared.error.message}`)
  if (owned.error) throw new Error(`searchHelpCenter (owned) failed: ${owned.error.message}`)

  return [...(shared.data ?? []), ...(owned.data ?? [])]
    .sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))
    .filter((row) => !excludedArticleIds.has(row.article_id))
    .slice(0, limit)
    .map((row) => ({
      articleId: row.article_id,
      slug: row.slug,
      title: row.title,
      // ts_headline does not escape its input, so body_text is re-parsed as HTML
      // here and only the <mark> tags it introduced are allowed to survive —
      // this is the last line of defense before the headline is ever rendered
      // with dangerouslySetInnerHTML.
      headline: sanitizeHtml(row.headline ?? '', { allowedTags: ['mark'], allowedAttributes: {} }),
    }))
}

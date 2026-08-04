import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { serviceClient } from '@/lib/db/client'
import { selectAll } from '@/lib/db/select-all'
import { EXCLUSIONS_TAG, CONTENT_TTL_SECONDS } from '@/lib/cache/tags'

/**
 * Article ids a help center must not show.
 *
 * Returned as an ARRAY, not a Set: this crosses the data cache, which
 * round-trips through JSON, and `JSON.stringify(new Set([1]))` is `{}`. Callers
 * use getExcludedArticleIds below, which rebuilds the Set per request.
 */
const cachedExclusions = unstable_cache(
  async (helpCenterId: string): Promise<string[]> => {
    const rows = await selectAll<{ article_id: string }>(
      () =>
        serviceClient()
          .from('help_center_article_exclusions')
          .select('article_id')
          .eq('help_center_id', helpCenterId)
          // article_id is unique per help_center_id (composite PK), which
          // .range() paging requires — see lib/db/select-all.ts.
          .order('article_id'),
      'help center exclusions',
    )
    return rows.map((row) => row.article_id)
  },
  ['help-center-exclusions'],
  { tags: [EXCLUSIONS_TAG], revalidate: CONTENT_TTL_SECONDS },
)

/**
 * The exclusion set for one help center, as a Set for O(1) membership.
 *
 * Content itself is cached once for the whole platform (keyed by the base
 * center) because it is identical everywhere; only this filter differs per
 * center. Keeping them separate means adding a tenant does not duplicate a
 * single cached article.
 */
export const getExcludedArticleIds = cache(
  async (helpCenterId: string): Promise<Set<string>> =>
    new Set(await cachedExclusions(helpCenterId)),
)

/** The centers that currently exclude a given article, for the editor. */
export async function getExcludingCenterIds(articleId: string): Promise<string[]> {
  const { data, error } = await serviceClient()
    .from('help_center_article_exclusions')
    .select('help_center_id')
    .eq('article_id', articleId)

  if (error) throw new Error(`Could not read article exclusions: ${error.message}`)
  return (data ?? []).map((row) => row.help_center_id)
}

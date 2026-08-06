import { serviceClient } from '@/lib/db/client'
import { selectAll } from '@/lib/db/select-all'
import { uniqueSlug } from './slug'

export type SlugScope = {
  /**
   * Which owner's namespace to search. Omit or pass null for the shared,
   * base-owned catalogue; pass a help center id for that tenant's own content.
   */
  ownerId?: string | null
  excludeId?: string
}

/**
 * A free slug for `table`, within one owner's namespace.
 *
 * Slugs are unique per owner (see 0010_tenant_content.sql), so the search has
 * to be scoped the same way — otherwise an agency is told "onboarding" is taken
 * because a different agency has it, and the suffix walks up forever.
 *
 * uniqueSlug only ever returns `base` or `base-<n>`, so the only rows that can
 * collide are the ones whose slug starts with `base` — a prefix match answers
 * the question in one page instead of paging the whole table. `base` always
 * comes from slugify(), which emits only [a-z0-9-], so it carries no LIKE
 * wildcards.
 */
export async function nextAvailableSlug(
  table: 'articles' | 'collections',
  base: string,
  scope: SlugScope = {},
): Promise<string> {
  const taken = await selectAll(
    () => {
      let query = serviceClient()
        .from(table)
        .select('slug')
        .like('slug', `${base}%`)
        // id is the PK — a unique key, which .range() paging requires.
        .order('id')

      query = scope.ownerId
        ? query.eq('origin_help_center_id', scope.ownerId)
        : query.is('origin_help_center_id', null)

      return scope.excludeId ? query.neq('id', scope.excludeId) : query
    },
    `${table} slugs matching ${base}`,
  )

  return uniqueSlug(base, taken.map((row) => row.slug))
}

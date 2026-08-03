import { serviceClient } from '@/lib/db/client'
import { selectAll } from '@/lib/db/select-all'
import { uniqueSlug } from './slug'

/**
 * A free slug for `table`, without reading every slug in the catalog.
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
  excludeId?: string,
): Promise<string> {
  const taken = await selectAll(
    () => {
      const query = serviceClient()
        .from(table)
        .select('slug')
        .like('slug', `${base}%`)
        // id is the PK — a unique key, which .range() paging requires.
        .order('id')
      return excludeId ? query.neq('id', excludeId) : query
    },
    `${table} slugs matching ${base}`,
  )

  return uniqueSlug(base, taken.map((row) => row.slug))
}

import type { ArticleCollectionEntry } from '@/lib/content/queries'

export type SharedSectionSummary = {
  id: string
  title: string
  slug: string
  icon: string | null
  /** Published shared articles filed in this section. */
  total: number
  /** How many of those this centre has hidden. */
  hidden: number
}

/**
 * One row per shared section for the owner's Sections page: how many articles
 * it holds and how many of them this centre hides.
 *
 * Pure, so it is unit-tested; the caller supplies the cached collection list,
 * the cached article-to-collection index and the centre's exclusion set — the
 * same three inputs the public home page counts from, so the numbers agree.
 * Sections with no published articles are left out: there is nothing in them
 * to show or hide.
 */
export function summariseSharedSections(
  collections: { id: string; title: string; slug: string; icon: string | null }[],
  index: ArticleCollectionEntry[],
  excluded: Set<string>,
): SharedSectionSummary[] {
  const totals = new Map<string, { total: number; hidden: number }>()
  for (const entry of index) {
    const tally = totals.get(entry.collectionId) ?? { total: 0, hidden: 0 }
    tally.total += 1
    if (excluded.has(entry.id)) tally.hidden += 1
    totals.set(entry.collectionId, tally)
  }

  return collections.flatMap((collection) => {
    const tally = totals.get(collection.id)
    if (!tally) return []
    return [
      {
        id: collection.id,
        title: collection.title,
        slug: collection.slug,
        icon: collection.icon,
        total: tally.total,
        hidden: tally.hidden,
      },
    ]
  })
}

/** The article ids filed in one section, from the article-to-collection index. */
export function articleIdsInSection(index: ArticleCollectionEntry[], sectionId: string): string[] {
  return index.filter((entry) => entry.collectionId === sectionId).map((entry) => entry.id)
}

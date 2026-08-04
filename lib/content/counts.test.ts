import { describe, expect, it } from 'vitest'
import { countArticlesPerCollection, type ArticleCollectionEntry } from './queries'

const index: ArticleCollectionEntry[] = [
  { id: 'a1', collectionId: 'billing' },
  { id: 'a2', collectionId: 'billing' },
  { id: 'a3', collectionId: 'billing' },
  { id: 'a4', collectionId: 'calendar' },
]

describe('countArticlesPerCollection', () => {
  it('counts every article when nothing is excluded', () => {
    expect(countArticlesPerCollection(index, new Set())).toEqual({ billing: 3, calendar: 1 })
  })

  it('subtracts a center excluded article from its collection only', () => {
    expect(countArticlesPerCollection(index, new Set(['a2']))).toEqual({ billing: 2, calendar: 1 })
  })

  it('drops a collection entirely once all of its articles are excluded', () => {
    // The tile must read 0, not stay at its unfiltered count — the home page
    // renders `counts[id] ?? 0`, so an absent key is the correct zero.
    const counts = countArticlesPerCollection(index, new Set(['a1', 'a2', 'a3']))
    expect(counts.billing).toBeUndefined()
    expect(counts).toEqual({ calendar: 1 })
  })

  it('ignores exclusions for articles that are not in the index', () => {
    // An article excluded on a center but since unpublished is no longer in the
    // index; its stale exclusion row must not corrupt any count.
    expect(countArticlesPerCollection(index, new Set(['gone']))).toEqual({
      billing: 3,
      calendar: 1,
    })
  })

  it('returns an empty record for an empty index', () => {
    expect(countArticlesPerCollection([], new Set(['a1']))).toEqual({})
  })
})

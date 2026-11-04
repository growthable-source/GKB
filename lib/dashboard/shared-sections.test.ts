import { describe, expect, it } from 'vitest'
import type { ArticleCollectionEntry } from '@/lib/content/queries'
import { articleIdsInSection, summariseSharedSections } from './shared-sections'

const collections = [
  { id: 'billing', title: 'Billing', slug: 'billing', icon: null },
  { id: 'calendar', title: 'Calendars', slug: 'calendars', icon: '📅' },
  { id: 'empty', title: 'Empty', slug: 'empty', icon: null },
]

const index: ArticleCollectionEntry[] = [
  { id: 'a1', collectionId: 'billing' },
  { id: 'a2', collectionId: 'billing' },
  { id: 'a3', collectionId: 'calendar' },
]

describe('summariseSharedSections', () => {
  it('counts articles per section, in the curated section order', () => {
    expect(summariseSharedSections(collections, index, new Set())).toEqual([
      { id: 'billing', title: 'Billing', slug: 'billing', icon: null, total: 2, hidden: 0 },
      { id: 'calendar', title: 'Calendars', slug: 'calendars', icon: '📅', total: 1, hidden: 0 },
    ])
  })

  it('counts hidden articles against their own section only', () => {
    const [billing, calendar] = summariseSharedSections(collections, index, new Set(['a2']))
    expect(billing).toMatchObject({ total: 2, hidden: 1 })
    expect(calendar).toMatchObject({ total: 1, hidden: 0 })
  })

  it('leaves out sections with no published articles', () => {
    const ids = summariseSharedSections(collections, index, new Set()).map((s) => s.id)
    expect(ids).not.toContain('empty')
  })
})

describe('articleIdsInSection', () => {
  it('returns only the articles filed in that section', () => {
    expect(articleIdsInSection(index, 'billing')).toEqual(['a1', 'a2'])
    expect(articleIdsInSection(index, 'nope')).toEqual([])
  })
})

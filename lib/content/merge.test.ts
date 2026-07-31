import { describe, expect, it } from 'vitest'
import { mergeArticle } from './merge'
import type { ArticlePlacement, CanonicalArticle } from './types'

const canonical: CanonicalArticle = {
  id: 'a1',
  slug: 'cancel-subscription',
  title: 'Cancel your subscription',
  excerpt: 'How to cancel.',
  bodyJson: { type: 'doc', content: [] },
  bodyHtml: '<p>Canonical body</p>',
  collectionId: 'c1',
  status: 'published',
  publishedAt: '2026-07-01T00:00:00Z',
}

const placement: ArticlePlacement = {
  helpCenterId: 'h1',
  articleId: 'a1',
  position: 3,
  isHidden: false,
  titleOverride: null,
  bodyJsonOverride: null,
  bodyHtmlOverride: null,
  collectionOverrideId: null,
}

describe('mergeArticle title', () => {
  it('inherits the canonical title when no placement exists', () => {
    const result = mergeArticle(canonical, null)
    expect(result.title).toBe('Cancel your subscription')
    expect(result.isOverridden).toBe(false)
  })

  it('inherits the canonical title when the override is null', () => {
    expect(mergeArticle(canonical, placement).title).toBe('Cancel your subscription')
  })

  it('uses the override when one is set', () => {
    const result = mergeArticle(canonical, { ...placement, titleOverride: 'Stop billing' })
    expect(result.title).toBe('Stop billing')
    expect(result.isOverridden).toBe(true)
  })

  it('treats an empty or whitespace-only override as inherit', () => {
    expect(mergeArticle(canonical, { ...placement, titleOverride: '' }).title).toBe(
      'Cancel your subscription',
    )
    expect(mergeArticle(canonical, { ...placement, titleOverride: '   ' }).title).toBe(
      'Cancel your subscription',
    )
    expect(mergeArticle(canonical, { ...placement, titleOverride: '  ' }).isOverridden).toBe(
      false,
    )
  })
})

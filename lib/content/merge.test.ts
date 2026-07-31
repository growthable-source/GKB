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

describe('mergeArticle body', () => {
  it('inherits the canonical body when no override is set', () => {
    const result = mergeArticle(canonical, placement)
    expect(result.bodyHtml).toBe('<p>Canonical body</p>')
  })

  it('replaces both body fields together when html is overridden', () => {
    const overrideJson = { type: 'doc', content: [{ type: 'paragraph' }] }
    const result = mergeArticle(canonical, {
      ...placement,
      bodyHtmlOverride: '<p>Local body</p>',
      bodyJsonOverride: overrideJson,
    })
    expect(result.bodyHtml).toBe('<p>Local body</p>')
    expect(result.bodyJson).toEqual(overrideJson)
    expect(result.isOverridden).toBe(true)
  })

  it('keeps the canonical json when only html is overridden', () => {
    const result = mergeArticle(canonical, {
      ...placement,
      bodyHtmlOverride: '<p>Local body</p>',
    })
    expect(result.bodyHtml).toBe('<p>Local body</p>')
    expect(result.bodyJson).toEqual(canonical.bodyJson)
  })

  it('ignores a json override with no html override, because html is what renders', () => {
    const result = mergeArticle(canonical, {
      ...placement,
      bodyJsonOverride: { type: 'doc', content: [{ type: 'paragraph' }] },
    })
    expect(result.bodyHtml).toBe('<p>Canonical body</p>')
    expect(result.bodyJson).toEqual(canonical.bodyJson)
    expect(result.isOverridden).toBe(false)
  })
})

describe('mergeArticle collection', () => {
  it('inherits the canonical collection', () => {
    expect(mergeArticle(canonical, placement).collectionId).toBe('c1')
  })

  it('files the article under the override collection when set', () => {
    const result = mergeArticle(canonical, { ...placement, collectionOverrideId: 'c2' })
    expect(result.collectionId).toBe('c2')
    expect(result.isOverridden).toBe(true)
  })
})

describe('mergeArticle placement flags', () => {
  it('carries position and hidden through', () => {
    const result = mergeArticle(canonical, { ...placement, position: 7, isHidden: true })
    expect(result.position).toBe(7)
    expect(result.isHidden).toBe(true)
  })

  it('defaults position to 0 and hidden to false without a placement', () => {
    const result = mergeArticle(canonical, null)
    expect(result.position).toBe(0)
    expect(result.isHidden).toBe(false)
  })
})
